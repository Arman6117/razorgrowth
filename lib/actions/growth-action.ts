import { prisma } from "../prisma";
import {
  GrowthActionStatus,
  GrowthActionType,
  AuditActor,
  OpportunityStatus,
} from "../generated/prisma/enums";
import { createPaymentLink, PaymentLinkResult } from "../razorpay/payment-links";
import { RazorpayApiError } from "../razorpay/client";
import type { GrowthActionModel } from "../generated/prisma/models/GrowthAction";

export interface IsCustomerEligibleInput {
  customerId: string;
  sourceProductId?: string | null;
  targetProductId: string;
  merchantId?: string;
  opportunityId?: string;
}

/**
 * Validates whether a customer is eligible for a cross-sell opportunity.
 *
 * Rules:
 * 1. If sourceProductId is specified: customer MUST have at least 1 PAID order containing sourceProductId.
 * 2. Customer MUST NOT have any PAID order containing targetProductId.
 */
export async function isCustomerEligible({
  customerId,
  sourceProductId,
  targetProductId,
  merchantId,
  opportunityId,
}: IsCustomerEligibleInput): Promise<boolean> {
  if (!customerId?.trim() || !targetProductId?.trim()) {
    return false;
  }

  let effectiveSourceProductId = sourceProductId;
  let effectiveTargetProductId = targetProductId;

  if (opportunityId && (!effectiveSourceProductId || !effectiveTargetProductId)) {
    const opp = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { sourceProductId: true, targetProductId: true },
    });
    if (opp) {
      if (!effectiveSourceProductId && opp.sourceProductId) {
        effectiveSourceProductId = opp.sourceProductId;
      }
      if (!effectiveTargetProductId && opp.targetProductId) {
        effectiveTargetProductId = opp.targetProductId;
      }
    }
  }

  if (!effectiveTargetProductId) {
    return false;
  }

  // 1. If sourceProductId is required, check customer purchased it with PAID status
  if (effectiveSourceProductId) {
    const sourceOrder = await prisma.order.findFirst({
      where: {
        customerId,
        ...(merchantId ? { merchantId } : {}),
        status: "PAID",
        items: {
          some: {
            productId: effectiveSourceProductId,
          },
        },
      },
    });

    if (!sourceOrder) {
      return false;
    }
  }

  // 2. Check customer has NOT purchased target product in any PAID order
  const targetOrder = await prisma.order.findFirst({
    where: {
      customerId,
      ...(merchantId ? { merchantId } : {}),
      status: "PAID",
      items: {
        some: {
          productId: effectiveTargetProductId,
        },
      },
    },
  });

  if (targetOrder) {
    return false;
  }

  // 3. If opportunityId is provided, check customer has NOT already completed/paid an EXECUTED GrowthAction for this opportunity
  if (opportunityId) {
    const completedAction = await prisma.growthAction.findFirst({
      where: {
        ...(merchantId ? { merchantId } : {}),
        opportunityId,
        status: GrowthActionStatus.EXECUTED,
        parameters: {
          path: ["customerId"],
          equals: customerId,
        },
      },
    });

    if (completedAction) {
      return false;
    }
  }

  return true;
}

export interface DuplicateActionCheckInput {
  merchantId: string;
  opportunityId: string;
  customerId: string;
  excludeActionId?: string;
}

/**
 * Checks if an active or completed GrowthAction already exists for the given merchant, opportunity, and customer.
 * Prevents multiple active actions for the same customer + opportunity.
 * Note: FAILED and REJECTED actions do not count as active duplicates and do not block retries.
 */
export async function duplicateActionCheck({
  merchantId,
  opportunityId,
  customerId,
  excludeActionId,
}: DuplicateActionCheckInput) {
  const existingAction = await prisma.growthAction.findFirst({
    where: {
      merchantId,
      opportunityId,
      ...(excludeActionId ? { id: { not: excludeActionId } } : {}),
      status: {
        in: [
          GrowthActionStatus.PENDING_APPROVAL,
          GrowthActionStatus.APPROVED,
          GrowthActionStatus.EXECUTING,
          GrowthActionStatus.EXECUTED,
        ],
      },
      parameters: {
        path: ["customerId"],
        equals: customerId,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return existingAction;
}

export interface CreateGrowthActionInput {
  merchantId: string;
  opportunityId: string;
  customerId: string;
  sourceProductId?: string;
  targetProductId?: string;
  type?: GrowthActionType;
}

/**
 * Creates a GrowthAction in PENDING_APPROVAL status.
 *
 * SAFETY GUARANTEES:
 * 1. Strictly validates merchant, opportunity, customer, and product relationships.
 * 2. Enforces customer eligibility (source product bought, target product not bought, orders PAID).
 * 3. Prevents duplicate active actions by checking existing in-flight actions.
 * 4. Authoritative target product price is resolved from Prisma DB.
 * 5. Records a GROWTH_ACTION_CREATED AuditEvent.
 */
export async function createGrowthAction(input: CreateGrowthActionInput) {
  const { merchantId, opportunityId, customerId } = input;

  if (!merchantId?.trim()) {
    throw new Error("merchantId is required");
  }
  if (!opportunityId?.trim()) {
    throw new Error("opportunityId is required");
  }
  if (!customerId?.trim()) {
    throw new Error("customerId is required");
  }

  // 1. Authoritative merchant validation
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });
  if (!merchant) {
    throw new Error(`Merchant not found with ID: ${merchantId}`);
  }

  // 2. Authoritative opportunity validation
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, merchantId },
    select: {
      id: true,
      title: true,
      sourceProductId: true,
      targetProductId: true,
      status: true,
    },
  });
  if (!opportunity) {
    throw new Error(`Opportunity not found or does not belong to merchant: ${opportunityId}`);
  }

  // 3. Resolve authoritative source and target products
  const sourceProductId = opportunity.sourceProductId || input.sourceProductId || null;
  const targetProductId = opportunity.targetProductId || input.targetProductId;

  if (!targetProductId) {
    throw new Error("Opportunity is missing targetProductId");
  }

  if (
    input.targetProductId &&
    opportunity.targetProductId &&
    input.targetProductId !== opportunity.targetProductId
  ) {
    throw new Error(
      `targetProductId '${input.targetProductId}' does not match opportunity targetProductId '${opportunity.targetProductId}'`
    );
  }

  if (
    input.sourceProductId &&
    opportunity.sourceProductId &&
    input.sourceProductId !== opportunity.sourceProductId
  ) {
    throw new Error(
      `sourceProductId '${input.sourceProductId}' does not match opportunity sourceProductId '${opportunity.sourceProductId}'`
    );
  }

  // 4. Validate customer belongs to merchant
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, merchantId },
    select: { id: true, name: true, email: true },
  });
  if (!customer) {
    throw new Error(`Customer not found or does not belong to merchant: ${customerId}`);
  }

  // 5. Validate target product belongs to merchant and is active
  const targetProduct = await prisma.product.findFirst({
    where: { id: targetProductId, merchantId },
    select: { id: true, name: true, price: true, active: true },
  });
  if (!targetProduct) {
    throw new Error(`Target product not found or does not belong to merchant: ${targetProductId}`);
  }
  if (!targetProduct.active) {
    throw new Error(`Target product '${targetProduct.name}' is inactive`);
  }

  // 6. Prevent duplicate completed/paid actions for same merchant + opportunity + customer
  const existingAction = await duplicateActionCheck({
    merchantId,
    opportunityId,
    customerId,
  });

  if (existingAction && existingAction.status === GrowthActionStatus.EXECUTED) {
    throw new Error(
      `Cannot create duplicate GrowthAction: Customer '${customer.name}' has already completed and paid for this opportunity (GrowthAction: ${existingAction.id}).`
    );
  }

  // 7. Enforce customer eligibility
  const eligible = await isCustomerEligible({
    merchantId,
    customerId,
    sourceProductId: sourceProductId || undefined,
    targetProductId: targetProduct.id,
    opportunityId,
  });

  if (!eligible) {
    throw new Error("Customer is not eligible for this opportunity");
  }

  // 8. Prevent duplicate active in-flight actions (reusing pending/approved/executing action)
  if (existingAction) {
    return existingAction;
  }

  // 8. Authoritative pricing from DB
  const priceInRupees = Number(targetProduct.price);
  if (isNaN(priceInRupees) || priceInRupees <= 0) {
    throw new Error(`Invalid target product price in database: ₹${targetProduct.price}`);
  }
  const amountInPaise = Math.round(priceInRupees * 100);

  // 9. Create GrowthAction in PENDING_APPROVAL status atomically with AuditEvent
  const actionType = input.type || GrowthActionType.CREATE_PAYMENT_LINK;

  const action = await prisma.$transaction(async (tx) => {
    const createdAction = await tx.growthAction.create({
      data: {
        merchantId,
        opportunityId,
        type: actionType,
        status: GrowthActionStatus.PENDING_APPROVAL,
        parameters: {
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          targetProductId: targetProduct.id,
          targetProductName: targetProduct.name,
          sourceProductId: sourceProductId,
          amountInRupees: priceInRupees,
          amountInPaise: amountInPaise,
          currency: merchant.currency || "INR",
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        merchantId,
        actionId: createdAction.id,
        eventType: "GROWTH_ACTION_CREATED",
        actor: AuditActor.AGENT,
        metadata: {
          actionId: createdAction.id,
          opportunityId,
          customerId,
          targetProductId: targetProduct.id,
          amountInRupees: priceInRupees,
          amountInPaise,
          currency: merchant.currency || "INR",
          createdAt: new Date().toISOString(),
        },
      },
    });

    return createdAction;
  });

  return action;
}

export interface SkippedCustomerInfo {
  customerId: string;
  reason: string;
  type: "DUPLICATE" | "INELIGIBLE" | "NOT_FOUND" | "ERROR";
}

export interface CreateGrowthActionsForCustomersInput {
  merchantId: string;
  opportunityId: string;
  customerIds?: string[];
  sourceProductId?: string;
  targetProductId?: string;
  type?: GrowthActionType;
}

export interface CreateGrowthActionsForCustomersResult {
  success: boolean;
  createdCount: number;
  duplicateCount: number;
  rejectedCount: number;
  actionIds: string[];
  skippedCustomers: SkippedCustomerInfo[];
  createdActions: GrowthActionModel[];
}

/**
 * Creates GrowthActions in bulk for multiple eligible customers for an opportunity.
 *
 * SAFETY GUARANTEES:
 * 1. Strictly validates merchant, opportunity, and product relationships.
 * 2. Authoritative target product price is resolved from Prisma DB.
 * 3. Enforces deterministic customer eligibility (source product bought, target product not bought, orders PAID).
 * 4. Prevents duplicate active actions and prevents duplicate billing on EXECUTED actions.
 * 5. Handles partial failures gracefully without failing the entire batch.
 * 6. Creates one PENDING_APPROVAL GrowthAction and GROWTH_ACTION_CREATED AuditEvent per valid customer.
 */
export async function createGrowthActionsForCustomers(
  input: CreateGrowthActionsForCustomersInput
): Promise<CreateGrowthActionsForCustomersResult> {
  const { merchantId, opportunityId } = input;

  if (!merchantId?.trim()) {
    throw new Error("merchantId is required");
  }
  if (!opportunityId?.trim()) {
    throw new Error("opportunityId is required");
  }

  // 1. Authoritative merchant validation
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });
  if (!merchant) {
    throw new Error(`Merchant not found with ID: ${merchantId}`);
  }

  // 2. Authoritative opportunity validation
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, merchantId },
    select: {
      id: true,
      title: true,
      sourceProductId: true,
      targetProductId: true,
      status: true,
    },
  });
  if (!opportunity) {
    throw new Error(`Opportunity not found or does not belong to merchant: ${opportunityId}`);
  }

  // 3. Resolve authoritative source and target products
  const sourceProductId = opportunity.sourceProductId || input.sourceProductId || null;
  const targetProductId = opportunity.targetProductId || input.targetProductId;

  if (!targetProductId) {
    throw new Error("Opportunity is missing targetProductId");
  }

  if (
    input.targetProductId &&
    opportunity.targetProductId &&
    input.targetProductId !== opportunity.targetProductId
  ) {
    throw new Error(
      `targetProductId '${input.targetProductId}' does not match opportunity targetProductId '${opportunity.targetProductId}'`
    );
  }

  if (
    input.sourceProductId &&
    opportunity.sourceProductId &&
    input.sourceProductId !== opportunity.sourceProductId
  ) {
    throw new Error(
      `sourceProductId '${input.sourceProductId}' does not match opportunity sourceProductId '${opportunity.sourceProductId}'`
    );
  }

  // 4. Validate target product belongs to merchant and is active
  const targetProduct = await prisma.product.findFirst({
    where: { id: targetProductId, merchantId },
    select: { id: true, name: true, price: true, active: true },
  });
  if (!targetProduct) {
    throw new Error(`Target product not found or does not belong to merchant: ${targetProductId}`);
  }
  if (!targetProduct.active) {
    throw new Error(`Target product '${targetProduct.name}' is inactive`);
  }

  // 5. Authoritative pricing from DB
  const priceInRupees = Number(targetProduct.price);
  if (isNaN(priceInRupees) || priceInRupees <= 0) {
    throw new Error(`Invalid target product price in database: ₹${targetProduct.price}`);
  }
  const amountInPaise = Math.round(priceInRupees * 100);

  // 6. Resolve customer list:
  // If customerIds is explicitly provided, use them.
  // Otherwise, automatically resolve all candidate customers who purchased sourceProductId.
  let candidateCustomerIds: string[] = [];
  if (input.customerIds && Array.isArray(input.customerIds)) {
    candidateCustomerIds = Array.from(
      new Set(input.customerIds.map((id) => id?.trim()).filter(Boolean))
    );
  } else {
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
    } else {
      const allCustomers = await prisma.customer.findMany({
        where: { merchantId },
        select: { id: true },
      });
      candidateCustomerIds = allCustomers.map((c) => c.id);
    }
  }

  const actionType = input.type || GrowthActionType.CREATE_PAYMENT_LINK;
  const createdActions: GrowthActionModel[] = [];
  const actionIds: string[] = [];
  const skippedCustomers: SkippedCustomerInfo[] = [];
  let duplicateCount = 0;
  let rejectedCount = 0;

  if (candidateCustomerIds.length === 0) {
    return {
      success: true,
      createdCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      actionIds: [],
      skippedCustomers: [],
      createdActions: [],
    };
  }

  // 1. Batch lookup for all candidate customers belonging to this merchant
  const foundCustomers = await prisma.customer.findMany({
    where: {
      id: { in: candidateCustomerIds },
      merchantId,
    },
    select: { id: true, name: true, email: true },
  });
  const customerMap = new Map(foundCustomers.map((c) => [c.id, c]));

  // 2. Batch lookup for existing active and executed actions for this opportunity
  const existingActions = await prisma.growthAction.findMany({
    where: {
      merchantId,
      opportunityId,
      status: {
        in: [
          GrowthActionStatus.PENDING_APPROVAL,
          GrowthActionStatus.APPROVED,
          GrowthActionStatus.EXECUTING,
          GrowthActionStatus.EXECUTED,
        ],
      },
    },
    select: {
      id: true,
      status: true,
      parameters: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const existingActionByCustomer = new Map<string, { id: string; status: GrowthActionStatus }>();
  for (const act of existingActions) {
    const params = act.parameters as Record<string, unknown> | null;
    const custId = params?.customerId as string | undefined;
    if (custId && !existingActionByCustomer.has(custId)) {
      existingActionByCustomer.set(custId, { id: act.id, status: act.status });
    }
  }

  // 3. Batch check for customer order eligibility
  let sourceBuyerIds = new Set<string>();
  if (sourceProductId) {
    const sourceOrders = await prisma.order.findMany({
      where: {
        merchantId,
        customerId: { in: candidateCustomerIds },
        status: "PAID",
        items: {
          some: { productId: sourceProductId },
        },
      },
      select: { customerId: true },
    });
    sourceBuyerIds = new Set(sourceOrders.map((o) => o.customerId));
  }

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
  });
  const targetBuyerIds = new Set(targetOrders.map((o) => o.customerId));

  // 4. In-memory validation and categorization of each candidate
  const validCustomers: Array<{ id: string; name: string; email: string }> = [];

  for (const customerId of candidateCustomerIds) {
    const customer = customerMap.get(customerId);
    if (!customer) {
      skippedCustomers.push({
        customerId,
        reason: `Customer not found or does not belong to merchant: ${customerId}`,
        type: "NOT_FOUND",
      });
      rejectedCount++;
      continue;
    }

    const existingAction = existingActionByCustomer.get(customerId);
    if (existingAction) {
      if (existingAction.status === GrowthActionStatus.EXECUTED) {
        skippedCustomers.push({
          customerId,
          reason: `Customer '${customer.name}' has already completed and paid for this opportunity (GrowthAction: ${existingAction.id})`,
          type: "DUPLICATE",
        });
        duplicateCount++;
        continue;
      } else {
        skippedCustomers.push({
          customerId,
          reason: `Active action already exists for customer '${customer.name}' in status '${existingAction.status}' (GrowthAction: ${existingAction.id})`,
          type: "DUPLICATE",
        });
        duplicateCount++;
        continue;
      }
    }

    const isEligible = (sourceProductId ? sourceBuyerIds.has(customerId) : true) && !targetBuyerIds.has(customerId);
    if (!isEligible) {
      skippedCustomers.push({
        customerId,
        reason: `Customer '${customer.name}' is not eligible for this opportunity`,
        type: "INELIGIBLE",
      });
      rejectedCount++;
      continue;
    }

    validCustomers.push(customer);
  }

  // 5. Batch insert valid GrowthActions and AuditEvents atomically
  if (validCustomers.length > 0) {
    const actionsData = validCustomers.map((customer) => ({
      merchantId,
      opportunityId,
      type: actionType,
      status: GrowthActionStatus.PENDING_APPROVAL,
      parameters: {
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        targetProductId: targetProduct.id,
        targetProductName: targetProduct.name,
        sourceProductId: sourceProductId,
        amountInRupees: priceInRupees,
        amountInPaise: amountInPaise,
        currency: merchant.currency || "INR",
      },
    }));

    const batchCreated = await prisma.$transaction(async (tx) => {
      const actions = await tx.growthAction.createManyAndReturn({
        data: actionsData,
      });

      const auditData = actions.map((action) => {
        const params = action.parameters as Record<string, unknown>;
        return {
          merchantId,
          actionId: action.id,
          eventType: "GROWTH_ACTION_CREATED",
          actor: AuditActor.AGENT,
          metadata: {
            actionId: action.id,
            opportunityId,
            customerId: String(params.customerId || ""),
            targetProductId: targetProduct.id,
            amountInRupees: priceInRupees,
            amountInPaise,
            currency: merchant.currency || "INR",
            createdAt: new Date().toISOString(),
            batch: true,
          },
        };
      });

      await tx.auditEvent.createMany({
        data: auditData,
      });

      return actions;
    });

    for (const action of batchCreated) {
      createdActions.push(action);
      actionIds.push(action.id);
    }
  }

  const createdCount = createdActions.length;

  return {
    success: true,
    createdCount,
    duplicateCount,
    rejectedCount,
    actionIds,
    skippedCustomers,
    createdActions,
  };
}

export interface ApproveGrowthActionInput {
  merchantId: string;
  actionId: string;
}

/**
 * Approves a PENDING_APPROVAL GrowthAction.
 *
 * STATE MACHINE:
 * - Allowed transition: PENDING_APPROVAL → APPROVED
 * - Idempotent: If already APPROVED, returns existing action
 * - Invalid transitions: EXECUTING, EXECUTED, FAILED, REJECTED throw Error
 */
export async function approveGrowthAction(input: ApproveGrowthActionInput) {
  const { merchantId, actionId } = input;

  if (!merchantId?.trim()) {
    throw new Error("merchantId is required");
  }
  if (!actionId?.trim()) {
    throw new Error("actionId is required");
  }

  // Fetch authoritative GrowthAction
  const growthAction = await prisma.growthAction.findFirst({
    where: { id: actionId, merchantId },
    include: { opportunity: true },
  });

  if (!growthAction) {
    throw new Error(`GrowthAction '${actionId}' not found for merchant '${merchantId}'`);
  }

  // Idempotent return if already approved
  if (growthAction.status === GrowthActionStatus.APPROVED) {
    return growthAction;
  }

  // State machine enforcement
  if (growthAction.status !== GrowthActionStatus.PENDING_APPROVAL) {
    throw new Error(
      `Cannot approve GrowthAction in status '${growthAction.status}'. Must be in '${GrowthActionStatus.PENDING_APPROVAL}' status.`
    );
  }

  const approvedAt = new Date();

  // Atomically update GrowthAction and create AuditEvent
  const updatedAction = await prisma.$transaction(async (tx) => {
    const updated = await tx.growthAction.update({
      where: { id: growthAction.id },
      data: {
        status: GrowthActionStatus.APPROVED,
        approvedAt,
      },
    });

    await tx.auditEvent.create({
      data: {
        merchantId,
        actionId: growthAction.id,
        eventType: "GROWTH_ACTION_APPROVED",
        actor: AuditActor.MERCHANT,
        metadata: {
          actionId: growthAction.id,
          opportunityId: growthAction.opportunityId,
          approvedAt: approvedAt.toISOString(),
        },
      },
    });

    return updated;
  });

  return updatedAction;
}

export interface ApproveGrowthActionsForOpportunityInput {
  merchantId: string;
  opportunityId: string;
}

export interface ApproveGrowthActionsForOpportunityResult {
  success: boolean;
  approvedCount: number;
  actionIds: string[];
}

/**
 * Bulk approves all PENDING_APPROVAL GrowthActions for a specific opportunity.
 *
 * SAFETY GUARANTEES:
 * 1. Strictly validates merchant and opportunity ownership.
 * 2. Selects ONLY actions in PENDING_APPROVAL status.
 * 3. Atomically transitions status to APPROVED and records individual GROWTH_ACTION_APPROVED AuditEvents with actor MERCHANT.
 * 4. Strictly human-controlled operation (NOT exposed to LLM).
 */
export async function approveGrowthActionsForOpportunity(
  input: ApproveGrowthActionsForOpportunityInput
): Promise<ApproveGrowthActionsForOpportunityResult> {
  const { merchantId, opportunityId } = input;

  if (!merchantId?.trim()) {
    throw new Error("merchantId is required");
  }
  if (!opportunityId?.trim()) {
    throw new Error("opportunityId is required");
  }

  // 1. Authoritative opportunity & merchant validation
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, merchantId },
  });

  if (!opportunity) {
    throw new Error(`Opportunity not found or does not belong to merchant: ${opportunityId}`);
  }

  // 2. Find all PENDING_APPROVAL GrowthActions for this opportunity and merchant
  const pendingActions = await prisma.growthAction.findMany({
    where: {
      merchantId,
      opportunityId,
      status: GrowthActionStatus.PENDING_APPROVAL,
    },
    select: { id: true, opportunityId: true },
  });

  if (pendingActions.length === 0) {
    return {
      success: true,
      approvedCount: 0,
      actionIds: [],
    };
  }

  const approvedAt = new Date();
  const approvedActionIds = pendingActions.map((a) => a.id);

  // 3. Atomically update actions to APPROVED and create individual AuditEvents
  await prisma.$transaction(async (tx) => {
    await tx.growthAction.updateMany({
      where: {
        id: { in: approvedActionIds },
        merchantId,
        status: GrowthActionStatus.PENDING_APPROVAL,
      },
      data: {
        status: GrowthActionStatus.APPROVED,
        approvedAt,
      },
    });

    await tx.auditEvent.createMany({
      data: approvedActionIds.map((actionId) => ({
        merchantId,
        actionId,
        eventType: "GROWTH_ACTION_APPROVED",
        actor: AuditActor.MERCHANT,
        metadata: {
          actionId,
          opportunityId,
          approvedAt: approvedAt.toISOString(),
          batch: true,
        },
      })),
    });
  });

  return {
    success: true,
    approvedCount: approvedActionIds.length,
    actionIds: approvedActionIds,
  };
}

export interface ExecuteGrowthActionInput {
  merchantId: string;
  actionId: string;
  description?: string;
  callbackUrl?: string;
  callbackMethod?: "get" | "post";
  actor?: AuditActor;
  markAsExecuted?: boolean;
}

export interface ExecuteGrowthActionResult {
  action: GrowthActionModel;
  paymentLink: PaymentLinkResult;
}

/**
 * Executes an APPROVED or FAILED (retry) CREATE_PAYMENT_LINK GrowthAction.
 *
 * STATE MACHINE:
 * - Allowed transitions:
 *     - APPROVED → EXECUTING
 *     - FAILED (retry) → EXECUTING
 * - Idempotency protection: EXECUTED actions CANNOT be executed again.
 * - Calling on FAILED records an ACTION_RETRY audit event.
 * - Re-runs authoritative customer, product, and eligibility guardrails.
 * - Calls Razorpay Payment Link API (test mode).
 * - Stores payment link data into GrowthAction.parameters.
 * - Records PAYMENT_LINK_CREATED AuditEvent.
 * - On API failure: Transitions status to FAILED and records detailed GROWTH_ACTION_FAILED AuditEvent,
 *   including explicit explanations if Razorpay Test Mode maximum transaction limits are exceeded.
 * - Final transition to EXECUTED happens upon verified payment_link.paid webhook (or if markAsExecuted is requested).
 */
export async function executeGrowthAction(
  input: ExecuteGrowthActionInput
): Promise<ExecuteGrowthActionResult> {
  const { merchantId, actionId, description, callbackUrl, callbackMethod, actor, markAsExecuted } = input;

  if (!merchantId?.trim()) {
    throw new Error("merchantId is required");
  }
  if (!actionId?.trim()) {
    throw new Error("actionId is required");
  }

  // 1. Fetch authoritative GrowthAction
  const growthAction = await prisma.growthAction.findFirst({
    where: { id: actionId, merchantId },
    include: { opportunity: true },
  });

  if (!growthAction) {
    throw new Error(`GrowthAction '${actionId}' not found for merchant '${merchantId}'`);
  }

  // 2. State machine enforcement & Idempotency guard
  if (growthAction.status === GrowthActionStatus.EXECUTED) {
    throw new Error(
      `Cannot execute GrowthAction '${actionId}': action has already been EXECUTED.`
    );
  }

  if (growthAction.status === GrowthActionStatus.PENDING_APPROVAL) {
    throw new Error(
      `Cannot execute GrowthAction in status '${growthAction.status}'. Action must be in '${GrowthActionStatus.APPROVED}' status before execution.`
    );
  }

  if (growthAction.status === GrowthActionStatus.REJECTED) {
    throw new Error(
      `Cannot execute GrowthAction in status '${growthAction.status}'. Action has been rejected.`
    );
  }

  if (growthAction.status === GrowthActionStatus.EXECUTING) {
    throw new Error(
      `Cannot execute GrowthAction in status '${growthAction.status}'. Action is already currently executing.`
    );
  }

  if (
    growthAction.status !== GrowthActionStatus.APPROVED &&
    growthAction.status !== GrowthActionStatus.FAILED
  ) {
    throw new Error(
      `Cannot execute GrowthAction in status '${growthAction.status}'. Allowed statuses: APPROVED, FAILED.`
    );
  }

  if (growthAction.type !== GrowthActionType.CREATE_PAYMENT_LINK) {
    throw new Error(`Unsupported GrowthAction type for execution: '${growthAction.type}'`);
  }

  const isRetry = growthAction.status === GrowthActionStatus.FAILED;
  const executionActor = actor || (isRetry ? AuditActor.MERCHANT : AuditActor.SYSTEM);

  // 3. Mark status as EXECUTING and record ACTION_RETRY audit event if retrying
  await prisma.$transaction(async (tx) => {
    await tx.growthAction.update({
      where: { id: growthAction.id },
      data: {
        status: GrowthActionStatus.EXECUTING,
      },
    });

    if (isRetry) {
      await tx.auditEvent.create({
        data: {
          merchantId,
          actionId: growthAction.id,
          eventType: "ACTION_RETRY",
          actor: executionActor,
          metadata: {
            actionId: growthAction.id,
            opportunityId: growthAction.opportunityId,
            previousStatus: GrowthActionStatus.FAILED,
            retriedAt: new Date().toISOString(),
          },
        },
      });
    }
  });

  try {
    // Extract and validate parameters
    const params = (
      typeof growthAction.parameters === "object" && growthAction.parameters !== null
        ? growthAction.parameters
        : {}
    ) as Record<string, unknown>;

    const customerId = (params.customerId as string)?.trim();
    const targetProductId =
      (params.targetProductId as string)?.trim() || growthAction.opportunity?.targetProductId;
    const sourceProductId =
      (params.sourceProductId as string)?.trim() || growthAction.opportunity?.sourceProductId || undefined;

    if (!customerId) {
      throw new Error("GrowthAction parameters missing customerId");
    }
    if (!targetProductId) {
      throw new Error("GrowthAction parameters missing targetProductId");
    }

    // Authoritative check: Customer & Target Product must still belong to merchant and product must be active
    const [customer, targetProduct] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: customerId, merchantId },
      }),
      prisma.product.findFirst({
        where: { id: targetProductId, merchantId },
      }),
    ]);

    if (!customer) {
      throw new Error(`Customer '${customerId}' not found or does not belong to merchant`);
    }
    if (!targetProduct) {
      throw new Error(`Target product '${targetProductId}' not found or does not belong to merchant`);
    }
    if (!targetProduct.active) {
      throw new Error(`Target product '${targetProduct.name}' is inactive`);
    }

    // Re-verify customer eligibility (must not have bought target product in any PAID order)
    const eligible = await isCustomerEligible({
      merchantId,
      customerId: customer.id,
      sourceProductId,
      targetProductId: targetProduct.id,
      opportunityId: growthAction.opportunityId,
    });

    if (!eligible) {
      throw new Error("Customer is no longer eligible for this opportunity");
    }

    // Verify duplicate action check does not detect another active in-flight action
    const duplicate = await duplicateActionCheck({
      merchantId,
      opportunityId: growthAction.opportunityId,
      customerId: customer.id,
      excludeActionId: growthAction.id,
    });
    if (duplicate) {
      throw new Error(
        `Another active action (${duplicate.id}, status: ${duplicate.status}) exists for customer '${customer.id}'`
      );
    }

    // Call existing Razorpay payment link service
    const paymentLinkResult = await createPaymentLink({
      merchantId,
      customerId: customer.id,
      targetProductId: targetProduct.id,
      opportunityId: growthAction.opportunityId,
      growthActionId: growthAction.id,
      description:
        description ||
        (params.description as string) ||
        `Cross-sell offer: ${targetProduct.name}`,
      callbackUrl,
      callbackMethod,
    });

    // Clean up any past failure details from parameters upon successful link creation
    const {
      lastFailureReason: _lfr,
      lastFailureCode: _lfc,
      lastFailureAt: _lfa,
      lastFailureDetails: _lfd,
      ...cleanParams
    } = params;

    const updatedParameters = {
      ...cleanParams,
      paymentLinkId: paymentLinkResult.paymentLinkId,
      shortUrl: paymentLinkResult.shortUrl,
      paymentLinkStatus: paymentLinkResult.status,
      amountInRupees: paymentLinkResult.amountInRupees,
      amountInPaise: paymentLinkResult.amountInPaise,
      currency: paymentLinkResult.currency,
      paymentLinkCreatedAt: paymentLinkResult.createdAt,
      lastExecutedAt: new Date().toISOString(),
      retriedAt: isRetry ? new Date().toISOString() : undefined,
    };

    const finalStatus = markAsExecuted ? GrowthActionStatus.EXECUTED : GrowthActionStatus.EXECUTING;
    const executedAtTimestamp = markAsExecuted ? new Date() : undefined;

    const updatedAction = await prisma.$transaction(async (tx) => {
      const updated = await tx.growthAction.update({
        where: { id: growthAction.id },
        data: {
          status: finalStatus,
          executedAt: executedAtTimestamp,
          parameters: updatedParameters,
        },
      });

      await tx.auditEvent.create({
        data: {
          merchantId,
          actionId: growthAction.id,
          eventType: "PAYMENT_LINK_CREATED",
          actor: AuditActor.SYSTEM,
          metadata: {
            paymentLinkId: paymentLinkResult.paymentLinkId,
            shortUrl: paymentLinkResult.shortUrl,
            amountInRupees: paymentLinkResult.amountInRupees,
            amountInPaise: paymentLinkResult.amountInPaise,
            currency: paymentLinkResult.currency,
            createdAt: new Date().toISOString(),
            isRetry,
          },
        },
      });

      return updated;
    });

    return {
      action: updatedAction,
      paymentLink: paymentLinkResult,
    };
  } catch (err: unknown) {
    const rawErrorMessage = err instanceof Error ? err.message : String(err);
    let errorCode: string | undefined;
    let errorDescription: string | undefined;
    let errorField: string | undefined;
    let statusCode: number | undefined;

    if (err instanceof RazorpayApiError) {
      errorCode = err.code;
      errorDescription = err.description;
      errorField = err.field;
      statusCode = err.statusCode;
    }

    // Explicitly diagnose Razorpay test-mode transaction amount limit
    let failureExplanation = rawErrorMessage;
    const isAmountLimitError =
      rawErrorMessage.toLowerCase().includes("amount exceeds maximum amount allowed") ||
      errorDescription?.toLowerCase().includes("amount exceeds maximum amount allowed");

    if (isAmountLimitError) {
      failureExplanation = `Razorpay Test Mode limit exceeded: Payment link amount exceeds Razorpay Test Mode maximum limit of ₹50,000 per payment link. Authoritative product price in database remains unchanged.`;
    }

    const currentParams = (
      typeof growthAction.parameters === "object" && growthAction.parameters !== null
        ? growthAction.parameters
        : {}
    ) as Record<string, unknown>;

    const updatedParamsWithFailure = {
      ...currentParams,
      lastFailureReason: failureExplanation,
      lastFailureCode: errorCode || "EXECUTION_ERROR",
      lastFailureAt: new Date().toISOString(),
      lastFailureDetails: {
        statusCode,
        code: errorCode,
        description: errorDescription || rawErrorMessage,
        field: errorField,
        isRetry,
      },
    };

    // On execution failure, atomically update GrowthAction to FAILED and record audit event
    await prisma.$transaction(async (tx) => {
      await tx.growthAction.update({
        where: { id: growthAction.id },
        data: {
          status: GrowthActionStatus.FAILED,
          parameters: updatedParamsWithFailure,
        },
      });

      await tx.auditEvent.create({
        data: {
          merchantId,
          actionId: growthAction.id,
          eventType: "GROWTH_ACTION_FAILED",
          actor: AuditActor.SYSTEM,
          metadata: {
            error: failureExplanation,
            rawError: rawErrorMessage,
            code: errorCode || null,
            statusCode: statusCode || null,
            field: errorField || null,
            isRetry,
            failedAt: new Date().toISOString(),
          },
        },
      });
    });

    throw new Error(failureExplanation);
  }
}

export interface RejectGrowthActionInput {
  merchantId: string;
  actionId: string;
  reason?: string;
}

/**
 * Rejects a PENDING_APPROVAL or APPROVED GrowthAction.
 */
export async function rejectGrowthAction(input: RejectGrowthActionInput) {
  const { merchantId, actionId, reason } = input;

  const growthAction = await prisma.growthAction.findFirst({
    where: { id: actionId, merchantId },
  });

  if (!growthAction) {
    throw new Error(`GrowthAction '${actionId}' not found for merchant '${merchantId}'`);
  }

  if (
    growthAction.status !== GrowthActionStatus.PENDING_APPROVAL &&
    growthAction.status !== GrowthActionStatus.APPROVED
  ) {
    throw new Error(`Cannot reject GrowthAction in status '${growthAction.status}'`);
  }

  const updatedAction = await prisma.$transaction(async (tx) => {
    const updated = await tx.growthAction.update({
      where: { id: growthAction.id },
      data: {
        status: GrowthActionStatus.REJECTED,
      },
    });

    await tx.auditEvent.create({
      data: {
        merchantId,
        actionId: growthAction.id,
        eventType: "GROWTH_ACTION_REJECTED",
        actor: AuditActor.MERCHANT,
        metadata: {
          reason: reason || "Merchant rejected the action",
          rejectedAt: new Date().toISOString(),
        },
      },
    });

    return updated;
  });

  return updatedAction;
}

/**
 * Retrieves a GrowthAction by ID with opportunity and audit events.
 */
export async function getGrowthAction({
  merchantId,
  actionId,
}: {
  merchantId: string;
  actionId: string;
}) {
  return prisma.growthAction.findFirst({
    where: { id: actionId, merchantId },
    include: {
      opportunity: {
        include: {
          sourceProduct: true,
          targetProduct: true,
        },
      },
      auditEvents: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

/**
 * Lists GrowthActions for a merchant with optional filtering.
 */
export async function listGrowthActions({
  merchantId,
  opportunityId,
  status,
}: {
  merchantId: string;
  opportunityId?: string;
  status?: GrowthActionStatus;
}) {
  return prisma.growthAction.findMany({
    where: {
      merchantId,
      ...(opportunityId ? { opportunityId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      opportunity: {
        select: {
          id: true,
          title: true,
          type: true,
          sourceProductId: true,
          targetProductId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
