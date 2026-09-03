import { prisma } from "../prisma";
import {
  GrowthActionStatus,
  AuditActor,
} from "../generated/prisma/enums";
import type { GrowthActionModel } from "../generated/prisma/models/GrowthAction";
import {
  ValidationError,
  NotFoundError,
  InvalidStateTransitionError,
} from "./errors";
import { assertCanApprove } from "./state-machine";
import type {
  ApproveGrowthActionInput,
  ApproveGrowthActionsForOpportunityInput,
  ApproveGrowthActionsForOpportunityResult,
} from "./types";

/**
 * Approves a PENDING_APPROVAL GrowthAction atomically and race-safely.
 *
 * STATE MACHINE:
 * - Allowed transition: PENDING_APPROVAL → APPROVED
 * - Idempotent: If already APPROVED, returns existing action
 * - Invalid transitions: EXECUTING, EXECUTED, FAILED, REJECTED throw Error
 * - Race-safe: Conditional DB update ensures exactly one concurrent request performs the transition
 *   and produces the audit event.
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

  const approvedAt = new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. Conditional atomic update: Only update if status is still PENDING_APPROVAL
    const updateResult = await tx.growthAction.updateMany({
      where: {
        id: actionId,
        merchantId,
        status: GrowthActionStatus.PENDING_APPROVAL,
      },
      data: {
        status: GrowthActionStatus.APPROVED,
        approvedAt,
      },
    });

    if (updateResult.count === 1) {
      // Transition succeeded! Record the audit event atomically
      await tx.auditEvent.create({
        data: {
          merchantId,
          actionId,
          eventType: "GROWTH_ACTION_APPROVED",
          actor: AuditActor.MERCHANT,
          metadata: {
            actionId,
            approvedAt: approvedAt.toISOString(),
          },
        },
      });

      const updated = await tx.growthAction.findFirst({
        where: { id: actionId, merchantId },
        include: { opportunity: true },
      });

      return updated!;
    }

    // 2. If update count is 0, the action was either already transitioned, in an invalid status, or doesn't exist
    const growthAction = await tx.growthAction.findFirst({
      where: { id: actionId, merchantId },
      include: { opportunity: true },
    });

    if (!growthAction) {
      throw new NotFoundError(
        `GrowthAction '${actionId}' not found for merchant '${merchantId}'`
      );
    }

    // Idempotent return if already approved (DO NOT create duplicate audit event)
    if (growthAction.status === GrowthActionStatus.APPROVED) {
      return growthAction;
    }

    // State machine enforcement for invalid statuses (EXECUTING, EXECUTED, FAILED, REJECTED)
    assertCanApprove(growthAction.status);

    throw new InvalidStateTransitionError(
      `Cannot approve GrowthAction in status '${growthAction.status}'. Must be in '${GrowthActionStatus.PENDING_APPROVAL}' status.`
    );
  });
}

/**
 * Bulk approves all PENDING_APPROVAL GrowthActions for a specific opportunity atomically and race-safely.
 *
 * SAFETY GUARANTEES:
 * 1. Strictly validates merchant and opportunity ownership.
 * 2. Selects and conditionally updates ONLY actions in PENDING_APPROVAL status.
 * 3. Records AuditEvents ONLY for the specific actions transitioned by this transaction.
 * 4. Preserves set-based Prisma performance (no N+1 loops).
 * 5. Strictly human-controlled operation (NOT exposed to LLM).
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

  return await prisma.$transaction(async (tx) => {
    // 1. Authoritative opportunity & merchant validation
    const opportunity = await tx.opportunity.findFirst({
      where: { id: opportunityId, merchantId },
    });

    if (!opportunity) {
      throw new NotFoundError(
        `Opportunity not found or does not belong to merchant: ${opportunityId}`
      );
    }

    // 2. Find candidate PENDING_APPROVAL GrowthActions for this opportunity and merchant
    const pendingActions = await tx.growthAction.findMany({
      where: {
        merchantId,
        opportunityId,
        status: GrowthActionStatus.PENDING_APPROVAL,
      },
      select: { id: true },
    });

    if (pendingActions.length === 0) {
      return {
        success: true,
        approvedCount: 0,
        actionIds: [],
      };
    }

    const approvedAt = new Date();
    const candidateActionIds = pendingActions.map((a) => a.id);

    // 3. Atomically update actions to APPROVED conditionally
    const updateResult = await tx.growthAction.updateMany({
      where: {
        id: { in: candidateActionIds },
        merchantId,
        opportunityId,
        status: GrowthActionStatus.PENDING_APPROVAL,
      },
      data: {
        status: GrowthActionStatus.APPROVED,
        approvedAt,
      },
    });

    if (updateResult.count === 0) {
      return {
        success: true,
        approvedCount: 0,
        actionIds: [],
      };
    }

    // 4. Determine exact transitioned action IDs in a set-based manner
    let actuallyApprovedActionIds: string[] = [];
    if (updateResult.count === candidateActionIds.length) {
      actuallyApprovedActionIds = candidateActionIds;
    } else {
      const transitioned = await tx.growthAction.findMany({
        where: {
          id: { in: candidateActionIds },
          merchantId,
          approvedAt,
          status: GrowthActionStatus.APPROVED,
        },
        select: { id: true },
      });
      actuallyApprovedActionIds = transitioned.map((a) => a.id);
    }

    // 5. Create individual AuditEvents ONLY for the transitioned actions
    if (actuallyApprovedActionIds.length > 0) {
      await tx.auditEvent.createMany({
        data: actuallyApprovedActionIds.map((actionId) => ({
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
    }

    return {
      success: true,
      approvedCount: actuallyApprovedActionIds.length,
      actionIds: actuallyApprovedActionIds,
    };
  });
}
