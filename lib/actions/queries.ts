import { prisma } from "../prisma";
import { GrowthActionStatus } from "../generated/prisma/enums";
import type { GetGrowthActionInput, ListGrowthActionsInput } from "./types";

/**
 * Retrieves a GrowthAction by ID with opportunity and audit events.
 */
export async function getGrowthAction({
  merchantId,
  actionId,
}: GetGrowthActionInput) {
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
}: ListGrowthActionsInput) {
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
