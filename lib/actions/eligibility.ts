import { prisma } from "../prisma";
import { GrowthActionStatus } from "../generated/prisma/enums";
import type { IsCustomerEligibleInput } from "./types";

/**
 * Validates whether a customer is eligible for a cross-sell opportunity.
 *
 * Rules:
 * 1. If sourceProductId is specified: customer MUST have at least 1 PAID order containing sourceProductId.
 * 2. Customer MUST NOT have any PAID order containing targetProductId.
 * 3. Customer MUST NOT have already completed/paid an EXECUTED GrowthAction for this opportunity.
 */
export async function isCustomerEligible({
  customerId,
  sourceProductId,
  targetProductId,
  merchantId,
  opportunityId,
  client = prisma,
}: IsCustomerEligibleInput): Promise<boolean> {
  if (!customerId?.trim() || !targetProductId?.trim()) {
    return false;
  }

  const db = client || prisma;
  let effectiveSourceProductId = sourceProductId;
  let effectiveTargetProductId = targetProductId;

  if (opportunityId && (!effectiveSourceProductId || !effectiveTargetProductId)) {
    const opp = await db.opportunity.findUnique({
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
    const sourceOrder = await db.order.findFirst({
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
  const targetOrder = await db.order.findFirst({
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
    const completedAction = await db.growthAction.findFirst({
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
