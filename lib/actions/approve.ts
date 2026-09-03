import { prisma } from "../prisma";
import {
  GrowthActionStatus,
  AuditActor,
} from "../generated/prisma/enums";
import type { GrowthActionModel } from "../generated/prisma/models/GrowthAction";
import {
  ValidationError,
  NotFoundError,
} from "./errors";
import { assertCanApprove } from "./state-machine";
import type {
  ApproveGrowthActionInput,
  ApproveGrowthActionsForOpportunityInput,
  ApproveGrowthActionsForOpportunityResult,
} from "./types";

/**
 * Approves a PENDING_APPROVAL GrowthAction.
 *
 * STATE MACHINE:
 * - Allowed transition: PENDING_APPROVAL → APPROVED
 * - Idempotent: If already APPROVED, returns existing action
 * - Invalid transitions: EXECUTING, EXECUTED, FAILED, REJECTED throw Error
 */
export async function approveGrowthAction(
  input: ApproveGrowthActionInput
): Promise<GrowthActionModel> {
  const { merchantId, actionId } = input;

  if (!merchantId?.trim()) {
    throw new ValidationError("merchantId is required");
  }
  if (!actionId?.trim()) {
    throw new ValidationError("actionId is required");
  }

  // Fetch authoritative GrowthAction
  const growthAction = await prisma.growthAction.findFirst({
    where: { id: actionId, merchantId },
    include: { opportunity: true },
  });

  if (!growthAction) {
    throw new NotFoundError(
      `GrowthAction '${actionId}' not found for merchant '${merchantId}'`
    );
  }

  // Idempotent return if already approved
  if (growthAction.status === GrowthActionStatus.APPROVED) {
    return growthAction;
  }

  // State machine enforcement
  assertCanApprove(growthAction.status);

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
    throw new ValidationError("merchantId is required");
  }
  if (!opportunityId?.trim()) {
    throw new ValidationError("opportunityId is required");
  }

  // 1. Authoritative opportunity & merchant validation
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, merchantId },
  });

  if (!opportunity) {
    throw new NotFoundError(
      `Opportunity not found or does not belong to merchant: ${opportunityId}`
    );
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
