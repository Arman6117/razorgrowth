import { prisma } from "../prisma";
import {
  GrowthActionStatus,
  GrowthActionType,
  AuditActor,
} from "../generated/prisma/enums";
import type { GrowthActionModel } from "../generated/prisma/models/GrowthAction";
import {
  ValidationError,
  NotFoundError,
  DuplicateActionError,
  IneligibleCustomerError,
} from "./errors";
import { validateGrowthActionContext } from "./validation";
import { duplicateActionCheck } from "./duplicate-check";
import { isCustomerEligible } from "./eligibility";
import { parseGrowthActionParameters, toPrismaJson } from "./types";
import type {
  CreateGrowthActionInput,
  CreateGrowthActionsForCustomersInput,
  CreateGrowthActionsForCustomersResult,
  SkippedCustomerInfo,
} from "./types";

/**
 * Creates a GrowthAction in PENDING_APPROVAL status.
 *
 * SAFETY GUARANTEES:
 * 1. Strictly validates merchant, opportunity, customer, and product relationships.
 * 2. Enforces customer eligibility (source product bought, target product not bought, orders PAID).
 * 3. Prevents duplicate active actions by checking existing in-flight actions.
 * 4. Authoritative target product price is resolved from Prisma DB.
 * 5. Atomically creates GrowthAction and GROWTH_ACTION_CREATED AuditEvent within a database transaction.
 * 6. Concurrency-safe: Database-level transaction advisory lock serializes simultaneous requests for the same opportunity,
 *    guaranteeing zero duplicate actions and zero duplicate audit events.
 */
export async function createGrowthAction(
  input: CreateGrowthActionInput
): Promise<GrowthActionModel> {
  const { merchantId, opportunityId, customerId } = input;

  if (!customerId?.trim()) {
    throw new ValidationError("customerId is required");
  }

  // 1-3. Authoritative merchant, opportunity, product & price validation
  const {
    merchant,
    sourceProductId,
    targetProduct,
    priceInRupees,
    amountInPaise,
  } = await validateGrowthActionContext(
    merchantId,
    opportunityId,
    input.sourceProductId,
    input.targetProductId
  );

  const actionType = input.type || GrowthActionType.CREATE_PAYMENT_LINK;

  return await prisma.$transaction(
    async (tx) => {
      // Acquire database-level transaction lock on this merchant + opportunity scope
      const lockKey = `growth_action_opp_lock:${merchantId}:${opportunityId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    // 4. Validate customer belongs to merchant
    const customer = await tx.customer.findFirst({
      where: { id: customerId, merchantId },
      select: { id: true, name: true, email: true },
    });
    if (!customer) {
      throw new NotFoundError(
        `Customer not found or does not belong to merchant: ${customerId}`
      );
    }

    // 5. Prevent duplicate completed/paid actions for same merchant + opportunity + customer
    const existingAction = await duplicateActionCheck({
      merchantId,
      opportunityId,
      customerId,
      client: tx,
    });

    if (existingAction && existingAction.status === GrowthActionStatus.EXECUTED) {
      throw new DuplicateActionError(
        `Cannot create duplicate GrowthAction: Customer '${customer.name}' has already completed and paid for this opportunity (GrowthAction: ${existingAction.id}).`
      );
    }

    // 6. Enforce customer eligibility
    const eligible = await isCustomerEligible({
      merchantId,
      customerId,
      sourceProductId: sourceProductId || undefined,
      targetProductId: targetProduct.id,
      opportunityId,
      client: tx,
    });

    if (!eligible) {
      throw new IneligibleCustomerError("Customer is not eligible for this opportunity");
    }

    // 7. Prevent duplicate active in-flight actions (reusing pending/approved/executing action)
    if (existingAction) {
      return existingAction;
    }

    // 8. Create GrowthAction in PENDING_APPROVAL status atomically with AuditEvent
    const createdAction = await tx.growthAction.create({
      data: {
        merchantId,
        opportunityId,
        type: actionType,
        status: GrowthActionStatus.PENDING_APPROVAL,
        parameters: toPrismaJson({
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          targetProductId: targetProduct.id,
          targetProductName: targetProduct.name,
          sourceProductId: sourceProductId,
          amountInRupees: priceInRupees,
          amountInPaise: amountInPaise,
          currency: merchant.currency || "INR",
        }),
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
  }, { timeout: 20000, maxWait: 20000 });
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
 * 7. Maintains optimized set-based queries (no N+1 lookups).
 * 8. Concurrency-safe: Database-level transaction advisory lock serializes simultaneous bulk requests,
 *    ensuring audit events correspond only to newly inserted rows.
 */
export async function createGrowthActionsForCustomers(
  input: CreateGrowthActionsForCustomersInput
): Promise<CreateGrowthActionsForCustomersResult> {
  const { merchantId, opportunityId } = input;

  // 1-5. Authoritative merchant, opportunity, product & price validation
  const {
    merchant,
    sourceProductId,
    targetProduct,
    priceInRupees,
    amountInPaise,
  } = await validateGrowthActionContext(
    merchantId,
    opportunityId,
    input.sourceProductId,
    input.targetProductId
  );

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

  return await prisma.$transaction(async (tx) => {
    // Acquire database-level transaction lock on this merchant + opportunity scope
    const lockKey = `growth_action_opp_lock:${merchantId}:${opportunityId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const createdActions: GrowthActionModel[] = [];
    const actionIds: string[] = [];
    const skippedCustomers: SkippedCustomerInfo[] = [];
    let duplicateCount = 0;
    let rejectedCount = 0;

    // 1. Batch lookup for all candidate customers belonging to this merchant
    const foundCustomers = await tx.customer.findMany({
      where: {
        id: { in: candidateCustomerIds },
        merchantId,
      },
      select: { id: true, name: true, email: true },
    });
    const customerMap = new Map(foundCustomers.map((c) => [c.id, c]));

    // 2. Batch lookup for existing active and executed actions for this opportunity
    const existingActions = await tx.growthAction.findMany({
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

    const existingActionByCustomer = new Map<
      string,
      { id: string; status: GrowthActionStatus }
    >();
    for (const act of existingActions) {
      const params = parseGrowthActionParameters(act.parameters);
      const custId = params.customerId;
      if (custId && !existingActionByCustomer.has(custId)) {
        existingActionByCustomer.set(custId, { id: act.id, status: act.status });
      }
    }

    // 3. Batch check for customer order eligibility
    let sourceBuyerIds = new Set<string>();
    if (sourceProductId) {
      const sourceOrders = await tx.order.findMany({
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

    const targetOrders = await tx.order.findMany({
      where: {
        merchantId,
        customerId: { in: candidateCustomerIds },
        status: "PAID",
        items: {
          some: { productId: targetProduct.id },
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

      const isEligible =
        (sourceProductId ? sourceBuyerIds.has(customerId) : true) &&
        !targetBuyerIds.has(customerId);
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
        parameters: toPrismaJson({
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          targetProductId: targetProduct.id,
          targetProductName: targetProduct.name,
          sourceProductId: sourceProductId,
          amountInRupees: priceInRupees,
          amountInPaise: amountInPaise,
          currency: merchant.currency || "INR",
        }),
      }));

      const batchCreated = await tx.growthAction.createManyAndReturn({
        data: actionsData,
      });

      const auditData = batchCreated.map((action) => {
        const params = parseGrowthActionParameters(action.parameters);
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
  }, { timeout: 20000, maxWait: 20000 });
}
