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
import { assertCanReject } from "./state-machine";
import type { RejectGrowthActionInput } from "./types";

/**
 * Rejects a PENDING_APPROVAL or APPROVED GrowthAction atomically and race-safely.
 */
export async function rejectGrowthAction(
  input: RejectGrowthActionInput
): Promise<GrowthActionModel> {
  const { merchantId, actionId, reason } = input;

  if (!merchantId?.trim()) {
    throw new ValidationError("merchantId is required");
  }
  if (!actionId?.trim()) {
    throw new ValidationError("actionId is required");
  }

  return await prisma.$transaction(async (tx) => {
    const growthAction = await tx.growthAction.findFirst({
      where: { id: actionId, merchantId },
    });

    if (!growthAction) {
      throw new NotFoundError(
        `GrowthAction '${actionId}' not found for merchant '${merchantId}'`
      );
    }

    assertCanReject(growthAction.status);

    const expectedPreviousStatus = growthAction.status;

    // Conditional atomic update
    const updateResult = await tx.growthAction.updateMany({
      where: {
        id: actionId,
        merchantId,
        status: expectedPreviousStatus,
      },
      data: {
        status: GrowthActionStatus.REJECTED,
      },
    });

    if (updateResult.count === 0) {
      const freshAction = await tx.growthAction.findFirst({
        where: { id: actionId, merchantId },
      });

      if (!freshAction) {
        throw new NotFoundError(
          `GrowthAction '${actionId}' not found for merchant '${merchantId}'`
        );
      }

      assertCanReject(freshAction.status);

      throw new InvalidStateTransitionError(
        `Cannot reject GrowthAction in status '${freshAction.status}'`
      );
    }

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

    const updated = await tx.growthAction.findFirst({
      where: { id: actionId, merchantId },
    });

    return updated!;
  });
}
