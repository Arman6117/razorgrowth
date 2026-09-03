import { prisma } from "../prisma";
import { analyzeCrossSell, CrossSellOpportunity } from "../analytics/cross-sell";
import {
  isCustomerEligible,
  createGrowthAction,
  createGrowthActionsForCustomers,
  approveGrowthAction,
  getGrowthAction,
  duplicateActionCheck,
} from "../actions/growth-action";
import {
  GrowthActionStatus,
  GrowthActionType,
  OpportunityType,
  OpportunityStatus,
} from "../generated/prisma/enums";
import {
  generateGrowthPlan,
  prepareGrowthPlanActions,
  resolveEligibleCustomersForOpportunity,
} from "./growth-planner";

export interface AgentToolResponse<T = unknown> {
  success: boolean;
  toolName: string;
  data?: T;
  error?: string;
  message?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
        items?: { type: string };
      }
    >;
    required: string[];
  };
}

export interface CompactCrossSellOpportunity {
  opportunityId: string;
  sourceProductId: string;
  sourceProductName: string;
  targetProductId: string;
  targetProductName: string;
  targetProductPrice: number;
  sourceCustomers: number;
  customersTogether: number;
  eligibleCustomerCount: number;
  crossSellRate: number;
  expectedRevenue: number;
}

/**
 * Tool 1: analyzeCrossSellTool
 *
 * Runs the deterministic cross-sell analytics engine on verified merchant transaction data.
 * Resolves product pairs, cross-sell conversion rates, eligible customer counts, and expected revenue.
 * Returns compact opportunity summaries without sending huge raw customer ID arrays to the LLM.
 */
export async function analyzeCrossSellTool(input: {
  merchantId: string;
}): Promise<AgentToolResponse<CompactCrossSellOpportunity[]>> {
  if (!input.merchantId?.trim()) {
    return {
      success: false,
      toolName: "analyzeCrossSell",
      error: "merchantId parameter is required",
    };
  }

  // Validate merchant exists in authoritative DB
  const merchant = await prisma.merchant.findUnique({
    where: { id: input.merchantId },
    select: { id: true, name: true },
  });

  if (!merchant) {
    return {
      success: false,
      toolName: "analyzeCrossSell",
      error: `Merchant not found with ID: ${input.merchantId}`,
    };
  }

  const rawOpportunities = await analyzeCrossSell(merchant.id);

  // Sync / resolve persisted Opportunity IDs from database
  const persistedOpps = await prisma.opportunity.findMany({
    where: { merchantId: merchant.id },
    select: { id: true, sourceProductId: true, targetProductId: true },
  });

  const oppMap = new Map<string, string>();
  for (const p of persistedOpps) {
    if (p.sourceProductId && p.targetProductId) {
      oppMap.set(`${p.sourceProductId}:${p.targetProductId}`, p.id);
    }
  }

  const compactOpportunities: CompactCrossSellOpportunity[] = [];

  for (const opp of rawOpportunities) {
    const key = `${opp.sourceProductId}:${opp.targetProductId}`;
    let opportunityId = oppMap.get(key);

    if (!opportunityId) {
      const created = await prisma.opportunity.create({
        data: {
          merchantId: merchant.id,
          type: OpportunityType.CROSS_SELL,
          title: `Cross-sell: ${opp.sourceProductName} → ${opp.targetProductName}`,
          description: `Identified ${opp.eligibleCustomerCount} eligible customers who purchased ${opp.sourceProductName} but not yet ${opp.targetProductName}.`,
          sourceProductId: opp.sourceProductId,
          targetProductId: opp.targetProductId,
          confidence: opp.crossSellRate,
          estimatedRevenue: opp.expectedRevenue,
          evidence: {
            sourceProductName: opp.sourceProductName,
            targetProductName: opp.targetProductName,
            sourceCustomers: opp.sourceCustomers,
            customersTogether: opp.customersTogether,
            eligibleCustomerCount: opp.eligibleCustomerCount,
            crossSellRate: opp.crossSellRate,
            expectedRevenue: opp.expectedRevenue,
          },
          status: OpportunityStatus.APPROVED,
        },
        select: { id: true },
      });
      opportunityId = created.id;
      oppMap.set(key, opportunityId);
    }

    compactOpportunities.push({
      opportunityId,
      sourceProductId: opp.sourceProductId,
      sourceProductName: opp.sourceProductName,
      targetProductId: opp.targetProductId,
      targetProductName: opp.targetProductName,
      targetProductPrice: opp.targetProductPrice,
      sourceCustomers: opp.sourceCustomers,
      customersTogether: opp.customersTogether,
      eligibleCustomerCount: opp.eligibleCustomerCount,
      crossSellRate: opp.crossSellRate,
      expectedRevenue: opp.expectedRevenue,
    });
  }

  return {
    success: true,
    toolName: "analyzeCrossSell",
    data: compactOpportunities,
    message: `Discovered ${compactOpportunities.length} revenue opportunities from transaction patterns.`,
  };
}

/**
 * Tool 2: isCustomerEligibleTool
 *
 * Deterministically checks whether a specific customer is eligible for a cross-sell opportunity.
 * Authoritative rules:
 * - Customer must have a PAID order containing sourceProductId.
 * - Customer must NOT have any PAID order containing targetProductId.
 */
export async function isCustomerEligibleTool(input: {
  merchantId: string;
  customerId: string;
  targetProductId: string;
  sourceProductId?: string;
  opportunityId?: string;
}): Promise<AgentToolResponse<{ eligible: boolean; customerId: string; targetProductId: string }>> {
  const { merchantId, customerId, targetProductId, sourceProductId, opportunityId } = input;

  if (!merchantId?.trim() || !customerId?.trim() || !targetProductId?.trim()) {
    return {
      success: false,
      toolName: "isCustomerEligible",
      error: "merchantId, customerId, and targetProductId are required parameters",
    };
  }

  // Authoritative validation of merchant & customer ownership
  const [merchant, customer, targetProduct] = await Promise.all([
    prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true } }),
    prisma.customer.findFirst({ where: { id: customerId, merchantId }, select: { id: true, name: true } }),
    prisma.product.findFirst({ where: { id: targetProductId, merchantId }, select: { id: true, name: true, active: true } }),
  ]);

  if (!merchant) {
    return {
      success: false,
      toolName: "isCustomerEligible",
      error: `Merchant not found with ID: ${merchantId}`,
    };
  }

  if (!customer) {
    return {
      success: false,
      toolName: "isCustomerEligible",
      error: `Customer not found with ID: ${customerId} for merchant: ${merchantId}`,
    };
  }

  if (!targetProduct) {
    return {
      success: false,
      toolName: "isCustomerEligible",
      error: `Target product not found with ID: ${targetProductId}`,
    };
  }

  if (!targetProduct.active) {
    return {
      success: false,
      toolName: "isCustomerEligible",
      error: `Target product '${targetProduct.name}' is inactive`,
    };
  }

  // Resolve sourceProductId from opportunity if not passed
  let resolvedSourceProductId = sourceProductId;
  if (!resolvedSourceProductId && opportunityId) {
    const opp = await prisma.opportunity.findFirst({
      where: { id: opportunityId, merchantId },
      select: { sourceProductId: true },
    });
    resolvedSourceProductId = opp?.sourceProductId || undefined;
  }

  // 1. If sourceProductId provided, verify customer bought source product in a PAID order
  if (resolvedSourceProductId) {
    const sourceOrder = await prisma.order.findFirst({
      where: {
        merchantId,
        customerId,
        status: "PAID",
        items: {
          some: {
            productId: resolvedSourceProductId,
          },
        },
      },
    });

    if (!sourceOrder) {
      return {
        success: true,
        toolName: "isCustomerEligible",
        data: {
          eligible: false,
          customerId,
          targetProductId,
        },
        message: `Customer ${customer.name} is not eligible: has not purchased source product.`,
      };
    }
  }

  // 2. Verify customer has NOT bought target product in any PAID order
  const targetOrder = await prisma.order.findFirst({
    where: {
      merchantId,
      customerId,
      status: "PAID",
      items: {
        some: {
          productId: targetProductId,
        },
      },
    },
  });

  if (targetOrder) {
    return {
      success: true,
      toolName: "isCustomerEligible",
      data: {
        eligible: false,
        customerId,
        targetProductId,
      },
      message: `Customer ${customer.name} is not eligible: already purchased target product.`,
    };
  }

  return {
    success: true,
    toolName: "isCustomerEligible",
    data: {
      eligible: true,
      customerId,
      targetProductId,
    },
    message: `Customer ${customer.name} is verified eligible for cross-sell to ${targetProduct.name}.`,
  };
}

/**
 * Tool 3: createGrowthActionTool
 *
 * Creates a GrowthAction in PENDING_APPROVAL status for an individual eligible customer.
 */
export async function createGrowthActionTool(input: {
  merchantId: string;
  opportunityId: string;
  customerId: string;
  sourceProductId?: string;
  targetProductId?: string;
}): Promise<AgentToolResponse> {
  const { merchantId, opportunityId, customerId, sourceProductId, targetProductId } = input;

  if (!merchantId?.trim() || !opportunityId?.trim() || !customerId?.trim()) {
    return {
      success: false,
      toolName: "createGrowthAction",
      error: "merchantId, opportunityId, and customerId are required parameters",
    };
  }

  try {
    const action = await createGrowthAction({
      merchantId,
      opportunityId,
      customerId,
      sourceProductId,
      targetProductId,
    });

    const params = action.parameters as Record<string, unknown>;

    return {
      success: true,
      toolName: "createGrowthAction",
      data: {
        actionId: action.id,
        opportunityId: action.opportunityId,
        status: action.status,
        type: action.type,
        targetProduct: params.targetProductName,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        amountInRupees: params.amountInRupees,
        amountInPaise: params.amountInPaise,
        linkUrl: params.linkUrl as string | undefined,
      },
      message: `GrowthAction ${action.id} created in 'PENDING_APPROVAL' status for customer ${params.customerName}. Action requires merchant approval before payment link is sent.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "createGrowthAction",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 3b: createGrowthActionsForCustomersTool
 *
 * Creates GrowthActions in bulk (CREATE_PAYMENT_LINK) in PENDING_APPROVAL status for eligible customers.
 * If customerIds is omitted, the deterministic backend automatically resolves all eligible customers.
 */
export async function createGrowthActionsForCustomersTool(input: {
  merchantId: string;
  opportunityId: string;
  customerIds?: string[];
  sourceProductId?: string;
  targetProductId?: string;
}): Promise<AgentToolResponse> {
  const { merchantId, opportunityId, customerIds, sourceProductId, targetProductId } = input;

  if (!merchantId?.trim() || !opportunityId?.trim()) {
    return {
      success: false,
      toolName: "createGrowthActionsForCustomers",
      error: "merchantId and opportunityId are required parameters",
    };
  }

  try {
    const result = await createGrowthActionsForCustomers({
      merchantId,
      opportunityId,
      customerIds,
      sourceProductId,
      targetProductId,
    });

    return {
      success: true,
      toolName: "createGrowthActionsForCustomers",
      data: {
        createdCount: result.createdCount,
        duplicateCount: result.duplicateCount,
        rejectedCount: result.rejectedCount,
        actionIds: result.actionIds,
        skippedCustomers: result.skippedCustomers,
        createdActions: result.createdActions.map((a) => {
          const params = a.parameters as Record<string, unknown>;
          return {
            actionId: a.id,
            opportunityId: a.opportunityId,
            status: a.status,
            type: a.type,
            targetProduct: params.targetProductName,
            customerName: params.customerName,
            customerEmail: params.customerEmail,
            amountInRupees: params.amountInRupees,
            amountInPaise: params.amountInPaise,
          };
        }),
      },
      message: `Bulk creation completed: ${result.createdCount} GrowthActions created in 'PENDING_APPROVAL' status, ${result.duplicateCount} duplicates skipped, ${result.rejectedCount} rejected/skipped. Actions require merchant approval before execution.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "createGrowthActionsForCustomers",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 4: approveGrowthActionTool
 *
 * Approves a PENDING_APPROVAL GrowthAction on behalf of the merchant.
 *
 * STRICT SAFETY BOUNDARIES:
 * - Enforces state transition guardrail: PENDING_APPROVAL → APPROVED.
 * - Records GROWTH_ACTION_APPROVED in AuditEvent with AuditActor.MERCHANT.
 * - Does NOT execute the payment action (execution remains separate).
 */
export async function approveGrowthActionTool(input: {
  merchantId: string;
  actionId: string;
}): Promise<AgentToolResponse> {
  const { merchantId, actionId } = input;

  if (!merchantId?.trim() || !actionId?.trim()) {
    return {
      success: false,
      toolName: "approveGrowthAction",
      error: "merchantId and actionId are required parameters",
    };
  }

  try {
    const action = await approveGrowthAction({
      merchantId,
      actionId,
    });

    return {
      success: true,
      toolName: "approveGrowthAction",
      data: {
        actionId: action.id,
        status: action.status,
        approvedAt: action.approvedAt,
      },
      message: `GrowthAction ${action.id} successfully approved. Status is now '${action.status}'.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "approveGrowthAction",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 5: getGrowthActionStatusTool
 *
 * Retrieves current status, payment link information, and audit timeline for an action.
 */
export async function getGrowthActionStatusTool(input: {
  merchantId: string;
  actionId: string;
}): Promise<AgentToolResponse> {
  const { merchantId, actionId } = input;

  if (!merchantId?.trim() || !actionId?.trim()) {
    return {
      success: false,
      toolName: "getGrowthActionStatus",
      error: "merchantId and actionId are required parameters",
    };
  }

  const action = await getGrowthAction({ merchantId, actionId });
  if (!action) {
    return {
      success: false,
      toolName: "getGrowthActionStatus",
      error: `GrowthAction '${actionId}' not found for merchant`,
    };
  }

  return {
    success: true,
    toolName: "getGrowthActionStatus",
    data: {
      actionId: action.id,
      status: action.status,
      type: action.type,
      opportunityTitle: action.opportunity.title,
      parameters: action.parameters,
      approvedAt: action.approvedAt,
      executedAt: action.executedAt,
      auditTrail: action.auditEvents.map((evt) => ({
        eventType: evt.eventType,
        actor: evt.actor,
        timestamp: evt.createdAt,
      })),
    },
    message: `GrowthAction ${action.id} status is '${action.status}'.`,
  };
}

/**
 * Tool 6: getGrowthOpportunitiesTool
 * Returns verified growth opportunities for the merchant.
 */
export async function getGrowthOpportunitiesTool(input: {
  merchantId: string;
}): Promise<AgentToolResponse> {
  if (!input.merchantId?.trim()) {
    return {
      success: false,
      toolName: "getGrowthOpportunities",
      error: "merchantId parameter is required",
    };
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: input.merchantId },
    select: { id: true, name: true },
  });

  if (!merchant) {
    return {
      success: false,
      toolName: "getGrowthOpportunities",
      error: `Merchant not found with ID: ${input.merchantId}`,
    };
  }

  let opps = await prisma.opportunity.findMany({
    where: { merchantId: merchant.id },
    include: {
      sourceProduct: { select: { id: true, name: true, price: true } },
      targetProduct: { select: { id: true, name: true, price: true, active: true } },
    },
    orderBy: { estimatedRevenue: "desc" },
  });

  if (opps.length === 0) {
    await analyzeCrossSellTool({ merchantId: merchant.id });
    opps = await prisma.opportunity.findMany({
      where: { merchantId: merchant.id },
      include: {
        sourceProduct: { select: { id: true, name: true, price: true } },
        targetProduct: { select: { id: true, name: true, price: true, active: true } },
      },
      orderBy: { estimatedRevenue: "desc" },
    });
  }

  const compact = opps.map((o) => ({
    opportunityId: o.id,
    strategy: o.type,
    title: o.title,
    sourceProduct: o.sourceProduct?.name || null,
    targetProduct: o.targetProduct?.name || "Target Product",
    targetProductPrice: Number(o.targetProduct?.price || 0),
    confidence: Number(o.confidence),
    estimatedRevenue: Number(o.estimatedRevenue),
    status: o.status,
  }));

  return {
    success: true,
    toolName: "getGrowthOpportunities",
    data: compact,
    message: `Retrieved ${compact.length} verified growth opportunities for merchant.`,
  };
}

/**
 * Tool 7: inspectOpportunityEvidenceTool
 * Returns deterministic evidence for a selected opportunity.
 */
export async function inspectOpportunityEvidenceTool(input: {
  merchantId: string;
  opportunityId: string;
}): Promise<AgentToolResponse> {
  const { merchantId, opportunityId } = input;
  if (!merchantId?.trim() || !opportunityId?.trim()) {
    return {
      success: false,
      toolName: "inspectOpportunityEvidence",
      error: "merchantId and opportunityId are required parameters",
    };
  }

  try {
    const resolved = await resolveEligibleCustomersForOpportunity({
      merchantId,
      opportunityId,
    });

    return {
      success: true,
      toolName: "inspectOpportunityEvidence",
      data: {
        opportunityId: resolved.opportunity.id,
        strategy: resolved.opportunity.type,
        title: resolved.opportunity.title,
        sourceProduct: resolved.sourceProduct,
        targetProduct: resolved.targetProduct,
        sourceBuyersCount: resolved.sourceBuyersCount,
        coPurchasersCount: resolved.coPurchasersCount,
        observedAttachRate: resolved.observedAttachRate,
        eligibleCustomerCount: resolved.eligibleCustomerIds.length,
        authoritativeTargetPrice: resolved.targetProduct.price,
        evidence: resolved.opportunity.evidence,
      },
      message: `Deterministic evidence inspected for ${resolved.opportunity.title}: ${resolved.sourceBuyersCount} buyers, ${resolved.coPurchasersCount} co-purchasers, ${resolved.eligibleCustomerIds.length} eligible remaining.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "inspectOpportunityEvidence",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 8: resolveEligibleCustomersTool
 * Resolves the real customer population using backend eligibility rules.
 */
export async function resolveEligibleCustomersTool(input: {
  merchantId: string;
  opportunityId: string;
}): Promise<AgentToolResponse> {
  const { merchantId, opportunityId } = input;
  if (!merchantId?.trim() || !opportunityId?.trim()) {
    return {
      success: false,
      toolName: "resolveEligibleCustomers",
      error: "merchantId and opportunityId are required parameters",
    };
  }

  try {
    const resolved = await resolveEligibleCustomersForOpportunity({
      merchantId,
      opportunityId,
    });

    return {
      success: true,
      toolName: "resolveEligibleCustomers",
      data: {
        opportunityId: resolved.opportunity.id,
        targetProductId: resolved.targetProduct.id,
        targetProductName: resolved.targetProduct.name,
        targetProductPrice: resolved.targetProduct.price,
        eligibleCustomerCount: resolved.eligibleCustomers.length,
        eligibleCustomers: resolved.eligibleCustomers,
      },
      message: `Resolved ${resolved.eligibleCustomers.length} backend-verified eligible customers for ${resolved.opportunity.title}.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "resolveEligibleCustomers",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 9: recommendGrowthActionTool
 * Produces a structured growth plan recommendation grounded in backend facts.
 */
export async function recommendGrowthActionTool(input: {
  merchantId: string;
  opportunityId: string;
}): Promise<AgentToolResponse> {
  const { merchantId, opportunityId } = input;
  if (!merchantId?.trim() || !opportunityId?.trim()) {
    return {
      success: false,
      toolName: "recommendGrowthAction",
      error: "merchantId and opportunityId are required parameters",
    };
  }

  try {
    const plan = await generateGrowthPlan({ merchantId, opportunityId });
    return {
      success: true,
      toolName: "recommendGrowthAction",
      data: plan,
      message: `Generated growth plan recommendation: '${plan.title}' targeting ${plan.eligibleCustomerCount} customers (Estimated Value: ₹${plan.estimatedValue}). Requires merchant approval.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "recommendGrowthAction",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 10: prepareGrowthActionsTool
 * Creates PENDING_APPROVAL GrowthActions using existing bulk creation logic.
 * The AI agent NEVER approves or executes actions.
 */
export async function prepareGrowthActionsTool(input: {
  merchantId: string;
  opportunityId: string;
}): Promise<AgentToolResponse> {
  const { merchantId, opportunityId } = input;
  if (!merchantId?.trim() || !opportunityId?.trim()) {
    return {
      success: false,
      toolName: "prepareGrowthActions",
      error: "merchantId and opportunityId are required parameters",
    };
  }

  try {
    const prepResult = await prepareGrowthPlanActions({ merchantId, opportunityId });
    return {
      success: true,
      toolName: "prepareGrowthActions",
      data: prepResult,
      message: prepResult.message,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "prepareGrowthActions",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Standard JSON Schema declarations for LLM Function / Tool Calling.
 */
export const agentToolDefinitions: ToolDefinition[] = [
  {
    name: "analyzeCrossSell",
    description:
      "Analyzes merchant transactions to discover cross-sell opportunities, calculate cross-sell rates, identify eligible customers, and estimate potential revenue.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier in RazorGrowth.",
        },
      },
      required: ["merchantId"],
    },
  },
  {
    name: "getGrowthOpportunities",
    description:
      "Returns verified merchant growth opportunities with authoritative estimated revenues, strategies, and confidence scores.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
      },
      required: ["merchantId"],
    },
  },
  {
    name: "inspectOpportunityEvidence",
    description:
      "Returns deterministic co-purchase facts, attach rates, sample sizes, and authoritative prices for a selected opportunity.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        opportunityId: {
          type: "string",
          description: "Opportunity identifier to inspect.",
        },
      },
      required: ["merchantId", "opportunityId"],
    },
  },
  {
    name: "resolveEligibleCustomers",
    description:
      "Uses backend deterministic eligibility rules to resolve the real target customer population for an opportunity.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        opportunityId: {
          type: "string",
          description: "Opportunity identifier.",
        },
      },
      required: ["merchantId", "opportunityId"],
    },
  },
  {
    name: "recommendGrowthAction",
    description:
      "Produces a structured, evidence-backed growth plan recommendation for an opportunity. Requires merchant approval before execution.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        opportunityId: {
          type: "string",
          description: "Opportunity identifier to formulate recommendation for.",
        },
      },
      required: ["merchantId", "opportunityId"],
    },
  },
  {
    name: "prepareGrowthActions",
    description:
      "Prepares GrowthActions in PENDING_APPROVAL status for all eligible customers of an opportunity. The AI agent CANNOT approve or execute financial actions.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        opportunityId: {
          type: "string",
          description: "Opportunity identifier to prepare actions for.",
        },
      },
      required: ["merchantId", "opportunityId"],
    },
  },
  {
    name: "isCustomerEligible",
    description:
      "Checks whether a specific customer is eligible for a cross-sell opportunity (customer bought source product, but has not bought target product).",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        customerId: {
          type: "string",
          description: "Authoritative customer identifier.",
        },
        targetProductId: {
          type: "string",
          description: "Target product to offer.",
        },
        sourceProductId: {
          type: "string",
          description: "Source product customer previously purchased (optional).",
        },
        opportunityId: {
          type: "string",
          description: "Opportunity identifier to resolve product relations (optional).",
        },
      },
      required: ["merchantId", "customerId", "targetProductId"],
    },
  },
  {
    name: "createGrowthAction",
    description:
      "Creates a GrowthAction (CREATE_PAYMENT_LINK) in PENDING_APPROVAL status for an eligible customer. Prices are resolved authoritatively from the database.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        opportunityId: {
          type: "string",
          description: "Discovered opportunity identifier.",
        },
        customerId: {
          type: "string",
          description: "Eligible customer identifier.",
        },
        targetProductId: {
          type: "string",
          description: "Target product identifier (optional if opportunity specified).",
        },
        sourceProductId: {
          type: "string",
          description: "Source product identifier (optional if opportunity specified).",
        },
      },
      required: ["merchantId", "opportunityId", "customerId"],
    },
  },
  {
    name: "createGrowthActionsForCustomers",
    description:
      "Creates GrowthActions in bulk (CREATE_PAYMENT_LINK) in PENDING_APPROVAL status for eligible customers of an opportunity. If customerIds is omitted, the deterministic backend automatically targets all eligible customers. Prices are resolved authoritatively from DB. The AI CANNOT approve or execute financial actions.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        opportunityId: {
          type: "string",
          description: "Discovered opportunity identifier.",
        },
        customerIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional explicit array of customer IDs. If omitted, all eligible customers for this opportunity are targeted automatically.",
        },
        targetProductId: {
          type: "string",
          description: "Target product identifier (optional if opportunity specified).",
        },
        sourceProductId: {
          type: "string",
          description: "Source product identifier (optional if opportunity specified).",
        },
      },
      required: ["merchantId", "opportunityId"],
    },
  },
  {
    name: "approveGrowthAction",
    description:
      "Records merchant approval for a PENDING_APPROVAL GrowthAction, transitioning it to APPROVED status.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        actionId: {
          type: "string",
          description: "GrowthAction identifier to approve.",
        },
      },
      required: ["merchantId", "actionId"],
    },
  },
  {
    name: "getGrowthActionStatus",
    description:
      "Retrieves the current status, payment link information, and audit timeline for a GrowthAction.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        actionId: {
          type: "string",
          description: "GrowthAction identifier.",
        },
      },
      required: ["merchantId", "actionId"],
    },
  },
];

/**
 * Universal Tool Dispatcher.
 */
export async function executeAgentTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<AgentToolResponse> {
  switch (toolName) {
    case "analyzeCrossSell":
      return analyzeCrossSellTool({
        merchantId: toolInput.merchantId as string,
      });

    case "getGrowthOpportunities":
      return getGrowthOpportunitiesTool({
        merchantId: toolInput.merchantId as string,
      });

    case "inspectOpportunityEvidence":
      return inspectOpportunityEvidenceTool({
        merchantId: toolInput.merchantId as string,
        opportunityId: toolInput.opportunityId as string,
      });

    case "resolveEligibleCustomers":
      return resolveEligibleCustomersTool({
        merchantId: toolInput.merchantId as string,
        opportunityId: toolInput.opportunityId as string,
      });

    case "recommendGrowthAction":
      return recommendGrowthActionTool({
        merchantId: toolInput.merchantId as string,
        opportunityId: toolInput.opportunityId as string,
      });

    case "prepareGrowthActions":
      return prepareGrowthActionsTool({
        merchantId: toolInput.merchantId as string,
        opportunityId: toolInput.opportunityId as string,
      });

    case "isCustomerEligible":
      return isCustomerEligibleTool({
        merchantId: toolInput.merchantId as string,
        customerId: toolInput.customerId as string,
        targetProductId: toolInput.targetProductId as string,
        sourceProductId: toolInput.sourceProductId as string | undefined,
        opportunityId: toolInput.opportunityId as string | undefined,
      });

    case "createGrowthAction":
      return createGrowthActionTool({
        merchantId: toolInput.merchantId as string,
        opportunityId: toolInput.opportunityId as string,
        customerId: toolInput.customerId as string,
        sourceProductId: toolInput.sourceProductId as string | undefined,
        targetProductId: toolInput.targetProductId as string | undefined,
      });

    case "createGrowthActionsForCustomers":
      return createGrowthActionsForCustomersTool({
        merchantId: toolInput.merchantId as string,
        opportunityId: toolInput.opportunityId as string,
        customerIds: toolInput.customerIds as string[] | undefined,
        sourceProductId: toolInput.sourceProductId as string | undefined,
        targetProductId: toolInput.targetProductId as string | undefined,
      });

    case "approveGrowthAction":
      return approveGrowthActionTool({
        merchantId: toolInput.merchantId as string,
        actionId: toolInput.actionId as string,
      });

    case "getGrowthActionStatus":
      return getGrowthActionStatusTool({
        merchantId: toolInput.merchantId as string,
        actionId: toolInput.actionId as string,
      });

    default:
      return {
        success: false,
        toolName,
        error: `Unknown tool: '${toolName}'. Supported tools: ${agentToolDefinitions.map((t) => t.name).join(", ")}`,
      };
  }
}

