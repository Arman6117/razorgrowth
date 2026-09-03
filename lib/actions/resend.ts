import { prisma } from "../prisma";
import { AuditActor } from "../generated/prisma/enums";
import { resendPaymentLinkNotification } from "../razorpay/payment-links";
import {
  ValidationError,
  NotFoundError,
} from "./errors";
import { assertCanResend } from "./state-machine";
import { parseGrowthActionParameters, toPrismaJson } from "./types";
import type {
  ResendGrowthActionPaymentLinkInput,
  ResendGrowthActionPaymentLinkResult,
} from "./types";

/**
 * Resends the existing Razorpay Payment Link email notification to the customer.
 *
 * SAFETY GUARANTEES:
 * 1. Requires authenticated merchant ownership.
 * 2. Validates that the action has an active paymentLinkId.
 * 3. Disallows resend for EXECUTED (already paid), PENDING_APPROVAL, or REJECTED actions.
 * 4. Calls Razorpay POST /v1/payment_links/:id/notify_by/:medium using merchant credentials.
 * 5. NEVER creates a new Payment Link.
 * 6. Records a PAYMENT_LINK_RESENT AuditEvent.
 */
export async function resendGrowthActionPaymentLink(
  input: ResendGrowthActionPaymentLinkInput
): Promise<ResendGrowthActionPaymentLinkResult> {
  const { merchantId, actionId, medium = "email" } = input;

  if (!merchantId?.trim()) {
    throw new ValidationError("merchantId is required");
  }
  if (!actionId?.trim()) {
    throw new ValidationError("actionId is required");
  }

  // 1. Fetch authoritative GrowthAction scoped to merchant
  const growthAction = await prisma.growthAction.findFirst({
    where: { id: actionId, merchantId },
  });

  if (!growthAction) {
    throw new NotFoundError(
      `GrowthAction '${actionId}' not found for merchant`
    );
  }

  // 2. Validate state machine
  assertCanResend(growthAction.status, actionId);

  // 3. Must have existing paymentLinkId
  const params = parseGrowthActionParameters(growthAction.parameters);

  const paymentLinkId = params.paymentLinkId?.trim();
  if (!paymentLinkId) {
    throw new ValidationError(
      `GrowthAction '${actionId}' has no active paymentLinkId to resend`
    );
  }

  const customerId = params.customerId?.trim();
  const customerEmail = params.customerEmail?.trim();
  const shortUrl = params.shortUrl?.trim();

  // 4. Call Razorpay notify API using merchant credentials
  const notifyResult = await resendPaymentLinkNotification({
    merchantId,
    paymentLinkId,
    medium,
  });

  const resentAt = new Date();

  // 5. Update parameters with resend metadata & record AuditEvent atomically
  const updatedParameters = {
    ...params,
    lastResentAt: resentAt.toISOString(),
    resendCount: (params.resendCount || 0) + 1,
  };

  const updatedAction = await prisma.$transaction(async (tx) => {
    const updated = await tx.growthAction.update({
      where: { id: growthAction.id },
      data: {
        parameters: toPrismaJson(updatedParameters),
      },
    });

    await tx.auditEvent.create({
      data: {
        merchantId,
        actionId: growthAction.id,
        eventType: "PAYMENT_LINK_RESENT",
        actor: AuditActor.MERCHANT,
        metadata: {
          paymentLinkId,
          shortUrl,
          deliveryMedium: medium.toUpperCase(),
          customerId,
          customerEmail,
          resentAt: resentAt.toISOString(),
          resendCount: updatedParameters.resendCount,
        },
      },
    });

    return updated;
  });

  return {
    success: true,
    action: updatedAction,
    notifyResult,
  };
}
