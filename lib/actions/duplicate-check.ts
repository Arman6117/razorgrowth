import { prisma } from "../prisma";
import { GrowthActionStatus } from "../generated/prisma/enums";
import type { DuplicateActionCheckInput } from "./types";

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
  client = prisma,
}: DuplicateActionCheckInput) {
  const db = client || prisma;
  const existingAction = await db.growthAction.findFirst({
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
