import { prisma } from "../prisma";
import {
  OpportunityType,
  OpportunityStatus,
  GrowthActionStatus,
  GrowthActionType,
  AuditActor,
} from "../generated/prisma/enums";
import {
  createGrowthActionsForCustomers,
  CreateGrowthActionsForCustomersResult,
  isCustomerEligible,
} from "../actions/growth-action";
import {
  getPrimaryModelConfig,
  getFallbackModelConfig,
} from "./orchestrator";
import { generateText } from "ai";

export interface GrowthPlanActionRecommendation {
  type: GrowthActionType | "CREATE_PAYMENT_LINK";
  targetProductId: string;
  targetProductName: string;
  targetProductPrice: number;
  amountInRupees: number;
  amountInPaise: number;
  currency: string;
}

export interface GrowthPlan {
  opportunityId: string;
  merchantId: string;
  strategy: OpportunityType | "CROSS_SELL" | "UPSELL" | "REACTIVATION";
  title: string;
  reason: string;
  sourceProductId?: string | null;
  sourceProductName?: string | null;
  targetProductId: string;
  targetProductName: string;
  targetProductPrice: number;
  eligibleCustomerCount: number;
  estimatedValue: number;
  confidence: number;
  recommendedAction: GrowthPlanActionRecommendation;
  requiresApproval: true;
  evidence: Record<string, unknown>;
  explanation: string;
  strategicInsight?: string;
  eligibleCustomerIds: string[];
  actionsPendingApproval: number;
  planCreatedAt: string;
  status: "PLANNED" | "PREPARED";
}

export interface PrepareGrowthPlanActionsResult {
  success: boolean;
  opportunityId: string;
  merchantId: string;
  strategy: OpportunityType;
  eligibleCustomerCount: number;
  estimatedValue: number;
  createdCount: number;
  duplicateCount: number;
  rejectedCount: number;
  actionIds: string[];
  actionsPendingApproval: number;
  status: "PREPARED";
  message: string;
  skippedCustomers?: Array<{ customerId: string; reason: string; type: string }>;
}

/**
 * Deterministically resolves the eligible customer population for a given Opportunity.
 * 
 * Rules:
 * 1. Customer must belong to the specified merchant.
 * 2. If sourceProductId exists, customer must have at least 1 PAID order containing sourceProductId.
 * 3. Customer must NOT have any PAID order containing targetProductId.
 * 4. Customer must NOT have an EXECUTED (paid) GrowthAction for this opportunity.
 */
export async function resolveEligibleCustomersForOpportunity(input: {
  merchantId: string;
  opportunityId: string;
}): Promise<{
  opportunity: {
    id: string;
    merchantId: string;
    type: OpportunityType;
    title: string;
    description: string;
    sourceProductId?: string | null;
    targetProductId?: string | null;
    confidence: number;
    estimatedRevenue: number;
    evidence: Record<string, unknown>;
    status: OpportunityStatus;
  };
  targetProduct: {
    id: string;
    name: string;
    price: number;
    active: boolean;
  };
  sourceProduct: {
    id: string;
    name: string;
    price: number;
  } | null;
  eligibleCustomerIds: string[];
  eligibleCustomers: Array<{ id: string; name: string; email: string }>;
  coPurchasersCount: number;
  sourceBuyersCount: number;
  observedAttachRate: number;
}> {
  const { merchantId, opportunityId } = input;

  if (!merchantId?.trim() || !opportunityId?.trim()) {
    throw new Error("merchantId and opportunityId parameters are required");
  }

  // 1. Authoritative verification of Opportunity belonging to authenticated merchant
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, merchantId },
    include: {
      sourceProduct: {
        select: { id: true, name: true, price: true },
      },
      targetProduct: {
        select: { id: true, name: true, price: true, active: true, merchantId: true },
      },
    },
  });

  if (!opportunity) {
    throw new Error(`Opportunity '${opportunityId}' not found or does not belong to authenticated merchant`);
  }

  if (!opportunity.targetProduct) {
    throw new Error(`Opportunity '${opportunityId}' does not have an associated target product`);
  }

  if (opportunity.targetProduct.merchantId !== merchantId) {
    throw new Error(`Target product does not belong to merchant: ${opportunity.targetProduct.id}`);
  }

  if (!opportunity.targetProduct.active) {
    throw new Error(`Target product '${opportunity.targetProduct.name}' is currently inactive`);
  }

  const targetProduct = {
    id: opportunity.targetProduct.id,
    name: opportunity.targetProduct.name,
    price: Number(opportunity.targetProduct.price),
    active: opportunity.targetProduct.active,
  };

  const sourceProduct = opportunity.sourceProduct
    ? {
        id: opportunity.sourceProduct.id,
        name: opportunity.sourceProduct.name,
        price: Number(opportunity.sourceProduct.price),
      }
    : null;

  const sourceProductId = opportunity.sourceProductId;
  const targetProductId = opportunity.targetProductId || targetProduct.id;

  // 2. Query candidate customers and historical orders deterministically
  let candidateCustomerIds: string[] = [];
  let sourceBuyersCount = 0;
  let coPurchasersCount = 0;

  if (sourceProductId) {
    const sourceOrders = await prisma.order.findMany({
      where: {
        merchantId,
        status: "PAID",
        items: {
          some: { productId: sourceProductId },
        },
      },
      select: { customerId: true },
      distinct: ["customerId"],
    });

    candidateCustomerIds = sourceOrders.map((o) => o.customerId);
    sourceBuyersCount = candidateCustomerIds.length;

    // Co-purchasers: customers who bought BOTH source and target product
    const coPurchaserOrders = await prisma.order.findMany({
      where: {
        merchantId,
        customerId: { in: candidateCustomerIds },
        status: "PAID",
        items: {
          some: { productId: targetProductId },
        },
      },
      select: { customerId: true },
      distinct: ["customerId"],
    });

    coPurchasersCount = coPurchaserOrders.map((o) => o.customerId).length;
  } else {
    // Upsell or Reactivation: candidate pool is store customers
    const allCustomers = await prisma.customer.findMany({
      where: { merchantId },
      select: { id: true },
    });
    candidateCustomerIds = allCustomers.map((c) => c.id);
    sourceBuyersCount = candidateCustomerIds.length;
  }

  // 3. Filter out customers who have already bought target product in any PAID order
  const targetOrders = await prisma.order.findMany({
    where: {
      merchantId,
      customerId: { in: candidateCustomerIds },
      status: "PAID",
      items: {
        some: { productId: targetProductId },
      },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const targetBuyerSet = new Set(targetOrders.map((o) => o.customerId));

  // 4. Filter out customers who already have an EXECUTED GrowthAction for this opportunity
  const executedActions = await prisma.growthAction.findMany({
    where: {
      merchantId,
      opportunityId,
      status: GrowthActionStatus.EXECUTED,
    },
    select: { parameters: true },
  });
  const executedCustomerSet = new Set<string>();
  for (const act of executedActions) {
    const params = act.parameters as Record<string, unknown> | null;
    const cid = params?.customerId as string | undefined;
    if (cid) executedCustomerSet.add(cid);
  }

  const eligibleIds = candidateCustomerIds.filter(
    (cid) => !targetBuyerSet.has(cid) && !executedCustomerSet.has(cid)
  );

  // 5. Fetch customer details
  const eligibleCustomers = await prisma.customer.findMany({
    where: {
      id: { in: eligibleIds },
      merchantId,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const observedAttachRate =
    sourceBuyersCount > 0 ? Number((coPurchasersCount / sourceBuyersCount).toFixed(4)) : 0;

  return {
    opportunity: {
      id: opportunity.id,
      merchantId: opportunity.merchantId,
      type: opportunity.type,
      title: opportunity.title,
      description: opportunity.description,
      sourceProductId: opportunity.sourceProductId,
      targetProductId: opportunity.targetProductId,
      confidence: Number(opportunity.confidence),
      estimatedRevenue: Number(opportunity.estimatedRevenue),
      evidence: (opportunity.evidence as Record<string, unknown>) || {},
      status: opportunity.status,
    },
    targetProduct,
    sourceProduct,
    eligibleCustomerIds: eligibleCustomers.map((c) => c.id),
    eligibleCustomers,
    coPurchasersCount,
    sourceBuyersCount,
    observedAttachRate,
  };
}

/**
 * Builds an evidence-grounded Growth Plan for a verified Opportunity.
 * 
 * Flow:
 * 1. Loads and verifies merchant ownership of Opportunity and Product.
 * 2. Deterministically resolves eligible customers using backend rules.
 * 3. Uses authoritative Product.price from Prisma database.
 * 4. Calculates server-side estimated value.
 * 5. Synthesizes an evidence-backed reason and structured recommendation.
 * 6. Checks currently existing PENDING_APPROVAL actions for this opportunity.
 * 7. Records AGENT_GROWTH_PLAN_CREATED AuditEvent.
 */
export async function generateGrowthPlan(input: {
  merchantId: string;
  opportunityId: string;
}): Promise<GrowthPlan> {
  const { merchantId, opportunityId } = input;

  if (!merchantId?.trim() || !opportunityId?.trim()) {
    throw new Error("merchantId and opportunityId are required parameters");
  }

  // 1. Authoritative Merchant Check
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });
  if (!merchant) {
    throw new Error(`Merchant not found with ID: ${merchantId}`);
  }

  // 2. Deterministically resolve eligible customers and product parameters
  const resolved = await resolveEligibleCustomersForOpportunity({
    merchantId,
    opportunityId,
  });

  const {
    opportunity,
    targetProduct,
    sourceProduct,
    eligibleCustomerIds,
    coPurchasersCount,
    sourceBuyersCount,
    observedAttachRate,
  } = resolved;

  const eligibleCustomerCount = eligibleCustomerIds.length;
  const targetProductPrice = targetProduct.price;
  const confidence = Math.min(Math.max(opportunity.confidence || observedAttachRate || 0.5, 0.05), 1.0);

  // Authoritative server-side financial calculation
  const estimatedValue = Number(
    (eligibleCustomerCount * targetProductPrice * confidence).toFixed(2)
  );

  // 3. Grounded, factual deterministic explanation
  let reason = "";
  if (opportunity.type === OpportunityType.CROSS_SELL && sourceProduct) {
    const attachPct = ((observedAttachRate || confidence) * 100).toFixed(1);
    reason = `${sourceBuyersCount} customers purchased ${sourceProduct.name}. Historical transactions show ${coPurchasersCount} also purchased ${targetProduct.name} (${attachPct}% observed attach rate). Recommending ${targetProduct.name} (₹${targetProductPrice.toLocaleString("en-IN")}) to the remaining ${eligibleCustomerCount} eligible buyers targets ₹${estimatedValue.toLocaleString("en-IN")}.`;
  } else if (opportunity.type === OpportunityType.UPSELL && sourceProduct) {
    const convPct = (confidence * 100).toFixed(1);
    reason = `${sourceBuyersCount} buyers purchased ${sourceProduct.name} (₹${sourceProduct.price.toLocaleString("en-IN")}). Premium upgrade ${targetProduct.name} (₹${targetProductPrice.toLocaleString("en-IN")}) has an observed ${convPct}% conversion propensity across ${eligibleCustomerCount} eligible buyers, targeting ₹${estimatedValue.toLocaleString("en-IN")}.`;
  } else {
    reason = `Identified ${eligibleCustomerCount} eligible customers for ${targetProduct.name} (₹${targetProductPrice.toLocaleString("en-IN")}) with ${(confidence * 100).toFixed(1)}% propensity, targeting an estimated opportunity value of ₹${estimatedValue.toLocaleString("en-IN")}.`;
  }

  // 4. Optional AI Enrichment (Grounds LLM commentary strictly in deterministic evidence)
  let strategicInsight: string | undefined = undefined;
  const primaryConfig = getPrimaryModelConfig();
  const fallbackConfig = getFallbackModelConfig();
  const activeConfig = primaryConfig || fallbackConfig;

  if (activeConfig && eligibleCustomerCount > 0) {
    try {
      const prompt = `You are RazorGrowth's Agentic Growth Planner.
Review this verified merchant growth plan:
- Opportunity: "${opportunity.title}" (${opportunity.type})
- Source Product: ${sourceProduct ? `${sourceProduct.name} (₹${sourceProduct.price})` : "N/A"}
- Target Product: ${targetProduct.name} (₹${targetProductPrice})
- Source Buyers: ${sourceBuyersCount}
- Co-Purchasers: ${coPurchasersCount}
- Eligible Customers Remaining: ${eligibleCustomerCount}
- Estimated Pipeline Value: ₹${estimatedValue}
- Confidence: ${(confidence * 100).toFixed(1)}%

TASK:
Write a concise 1-2 sentence executive justification for the merchant explaining why this action should be prepared.
Ground all reasoning in the factual attach rate and customer numbers. Do not invent any numbers.`;

      const aiRes = await generateText({
        model: activeConfig.model,
        prompt,
        maxRetries: 0,
      });

      if (aiRes.text?.trim()) {
        strategicInsight = aiRes.text.trim();
      }
    } catch {
      // Graceful fallback to deterministic reason
    }
  }

  // 5. Query currently existing PENDING_APPROVAL actions for this opportunity
  const pendingCount = await prisma.growthAction.count({
    where: {
      merchantId,
      opportunityId,
      status: GrowthActionStatus.PENDING_APPROVAL,
    },
  });

  const currency = merchant.currency || "INR";
  const amountInPaise = Math.round(targetProductPrice * 100);

  const plan: GrowthPlan = {
    opportunityId: opportunity.id,
    merchantId,
    strategy: opportunity.type,
    title: opportunity.title,
    reason,
    sourceProductId: sourceProduct?.id || null,
    sourceProductName: sourceProduct?.name || null,
    targetProductId: targetProduct.id,
    targetProductName: targetProduct.name,
    targetProductPrice,
    eligibleCustomerCount,
    estimatedValue,
    confidence,
    recommendedAction: {
      type: "CREATE_PAYMENT_LINK",
      targetProductId: targetProduct.id,
      targetProductName: targetProduct.name,
      targetProductPrice,
      amountInRupees: targetProductPrice,
      amountInPaise,
      currency,
    },
    requiresApproval: true,
    evidence: {
      sourceProductName: sourceProduct?.name,
      targetProductName: targetProduct.name,
      sourcePrice: sourceProduct?.price,
      targetPrice: targetProductPrice,
      sourceCustomers: sourceBuyersCount,
      customersTogether: coPurchasersCount,
      eligibleCustomerCount,
      attachRate: observedAttachRate,
      confidence,
      sampleSize: sourceBuyersCount,
      ...opportunity.evidence,
    },
    explanation: reason,
    strategicInsight,
    eligibleCustomerIds,
    actionsPendingApproval: pendingCount,
    planCreatedAt: new Date().toISOString(),
    status: pendingCount > 0 ? "PREPARED" : "PLANNED",
  };

  // 6. Record AGENT_GROWTH_PLAN_CREATED AuditEvent
  await prisma.auditEvent.create({
    data: {
      merchantId,
      eventType: "AGENT_GROWTH_PLAN_CREATED",
      actor: AuditActor.AGENT,
      metadata: {
        opportunityId: opportunity.id,
        strategy: opportunity.type,
        eligibleCustomerCount,
        estimatedValue,
        confidence,
        targetProductId: targetProduct.id,
        targetProductName: targetProduct.name,
        targetProductPrice,
        actionsPendingApproval: pendingCount,
        createdAt: plan.planCreatedAt,
      },
    },
  });

  return plan;
}

/**
 * Prepares GrowthActions in PENDING_APPROVAL status for all eligible customers of an opportunity.
 * 
 * STRICT SAFETY BOUNDARY:
 * - Creates ONLY GrowthActionStatus.PENDING_APPROVAL actions.
 * - NEVER creates APPROVED, EXECUTING, or EXECUTED actions.
 * - NEVER calls Razorpay Payment Link creation APIs.
 * - NEVER bypasses merchant authorization.
 * - Employs idempotent duplicate checking to prevent duplicate active actions.
 * - Records AGENT_GROWTH_ACTIONS_PREPARED AuditEvent.
 */
export async function prepareGrowthPlanActions(input: {
  merchantId: string;
  opportunityId: string;
}): Promise<PrepareGrowthPlanActionsResult> {
  const { merchantId, opportunityId } = input;

  if (!merchantId?.trim() || !opportunityId?.trim()) {
    throw new Error("merchantId and opportunityId are required parameters");
  }

  // 1. Generate / verify the growth plan
  const plan = await generateGrowthPlan({ merchantId, opportunityId });

  // 2. Invoke bulk creation logic using deterministic customer resolution
  const bulkResult: CreateGrowthActionsForCustomersResult =
    await createGrowthActionsForCustomers({
      merchantId,
      opportunityId,
      customerIds: plan.eligibleCustomerIds,
      sourceProductId: plan.sourceProductId || undefined,
      targetProductId: plan.targetProductId,
      type: GrowthActionType.CREATE_PAYMENT_LINK,
    });

  // Verify all created actions are in PENDING_APPROVAL status (Non-negotiable safety guardrail)
  for (const action of bulkResult.createdActions) {
    if (action.status !== GrowthActionStatus.PENDING_APPROVAL) {
      throw new Error(
        `Critical Safety Violation: GrowthAction was created with status '${action.status}'. Only PENDING_APPROVAL is permitted for AI Agent preparation.`
      );
    }
  }

  // Query updated count of pending actions
  const pendingCount = await prisma.growthAction.count({
    where: {
      merchantId,
      opportunityId,
      status: GrowthActionStatus.PENDING_APPROVAL,
    },
  });

  // 3. Record AGENT_GROWTH_ACTIONS_PREPARED AuditEvent
  await prisma.auditEvent.create({
    data: {
      merchantId,
      eventType: "AGENT_GROWTH_ACTIONS_PREPARED",
      actor: AuditActor.AGENT,
      metadata: {
        opportunityId: plan.opportunityId,
        strategy: plan.strategy,
        eligibleCustomerCount: plan.eligibleCustomerCount,
        estimatedValue: plan.estimatedValue,
        targetProductId: plan.targetProductId,
        createdCount: bulkResult.createdCount,
        duplicateCount: bulkResult.duplicateCount,
        rejectedCount: bulkResult.rejectedCount,
        actionIds: bulkResult.actionIds,
        actionsPendingApproval: pendingCount,
        preparedAt: new Date().toISOString(),
      },
    },
  });

  const message =
    bulkResult.createdCount > 0
      ? `${bulkResult.createdCount} GrowthActions prepared in 'PENDING_APPROVAL' status. Actions require merchant approval before payment links are sent.`
      : bulkResult.duplicateCount > 0
      ? `All ${plan.eligibleCustomerCount} eligible customers already have active GrowthActions awaiting approval or execution.`
      : `No eligible customers available for opportunity preparation.`;

  return {
    success: true,
    opportunityId: plan.opportunityId,
    merchantId,
    strategy: plan.strategy as OpportunityType,
    eligibleCustomerCount: plan.eligibleCustomerCount,
    estimatedValue: plan.estimatedValue,
    createdCount: bulkResult.createdCount,
    duplicateCount: bulkResult.duplicateCount,
    rejectedCount: bulkResult.rejectedCount,
    actionIds: bulkResult.actionIds,
    actionsPendingApproval: pendingCount,
    status: "PREPARED",
    message,
    skippedCustomers: bulkResult.skippedCustomers,
  };
}
