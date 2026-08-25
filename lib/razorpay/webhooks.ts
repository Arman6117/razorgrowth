import crypto from "node:crypto";
import { prisma } from "../prisma";
import { GrowthActionStatus, AuditActor } from "../generated/prisma/enums";

export interface RazorpayPaymentLinkEntity {
  id: string;
  entity: "payment_link";
  amount: number;
  amount_paid: number;
  currency: string;
  status: "created" | "partially_paid" | "paid" | "cancelled" | "expired" | string;
  description?: string;
  short_url?: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  created_at?: number;
  updated_at?: number;
  order_id?: string;
  [key: string]: unknown;
}

export interface RazorpayPaymentEntity {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: string;
  order_id?: string;
  method?: string;
  email?: string;
  contact?: string;
  notes?: Record<string, string>;
  [key: string]: unknown;
}

export interface RazorpayOrderEntity {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
  [key: string]: unknown;
}

export interface RazorpayWebhookPayload {
  entity: "event";
  account_id?: string;
  event: string;
  contains?: string[];
  payload?: {
    payment_link?: {
      entity: RazorpayPaymentLinkEntity;
    };
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    order?: {
      entity: RazorpayOrderEntity;
    };
    [key: string]: unknown;
  };
  created_at?: number;
}

export interface WebhookProcessResult {
  success: boolean;
  statusCode: number;
  isDuplicate?: boolean;
  actionId?: string;
  error?: string;
  message?: string;
}

/**
 * Validates Razorpay Webhook signature using HMAC-SHA256.
 * Uses timingSafeEqual to prevent side-channel timing attacks.
 * Never logs secrets or credentials.
 *
 * @param rawBody - Raw request body string (unparsed)
 * @param signature - Signature from 'x-razorpay-signature' header
 * @param secret - RAZORPAY_WEBHOOK_SECRET
 */
export function validateWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!signature || !secret || typeof rawBody !== "string") {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const signatureBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Handles verified Razorpay webhook events for the RazorGrowth flow.
 * Processes 'payment_link.paid' idempotently with strict business and amount validations.
 */
export async function handlePaymentLinkWebhook(
  payload: RazorpayWebhookPayload
): Promise<WebhookProcessResult> {
  // 1. Only handle 'payment_link.paid' events; acknowledge other events safely
  if (payload.event !== "payment_link.paid") {
    return {
      success: true,
      statusCode: 200,
      isDuplicate: false,
      message: `Event '${payload.event}' acknowledged but ignored (not payment_link.paid)`,
    };
  }

  // 2. Extract payment_link entity
  const paymentLink = payload.payload?.payment_link?.entity;
  if (!paymentLink || !paymentLink.id) {
    return {
      success: false,
      statusCode: 400,
      error: "Missing or malformed payment_link entity in webhook payload",
    };
  }

  const paymentEntity = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;

  // 3. Extract internal RazorGrowth identifiers from payment_link notes
  const notes = paymentLink.notes || {};
  const merchantId = notes.merchantId?.trim();
  const customerId = notes.customerId?.trim();
  const targetProductId = notes.targetProductId?.trim();
  const opportunityId = notes.opportunityId?.trim();
  const growthActionId = notes.growthActionId?.trim();

  if (!merchantId) {
    return {
      success: false,
      statusCode: 422,
      error: "Missing merchantId in payment link notes",
    };
  }

  // 4. Validate merchant existence in DB
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant) {
    return {
      success: false,
      statusCode: 422,
      error: `Merchant '${merchantId}' not found in database`,
    };
  }

  // 5. Locate the corresponding GrowthAction
  let growthAction = null;

  if (growthActionId) {
    growthAction = await prisma.growthAction.findUnique({
      where: { id: growthActionId },
      include: {
        opportunity: {
          include: {
            targetProduct: true,
          },
        },
      },
    });
  } else if (opportunityId) {
    growthAction = await prisma.growthAction.findFirst({
      where: { opportunityId, merchantId },
      include: {
        opportunity: {
          include: {
            targetProduct: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  } else if (targetProductId) {
    growthAction = await prisma.growthAction.findFirst({
      where: {
        merchantId,
        opportunity: {
          targetProductId,
        },
      },
      include: {
        opportunity: {
          include: {
            targetProduct: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!growthAction) {
    return {
      success: false,
      statusCode: 422,
      error: `No matching GrowthAction found for payment link ${paymentLink.id}`,
    };
  }

  // 6. Strict business validations BEFORE state modification
  // 6a. Validate merchant ownership
  if (growthAction.merchantId !== merchantId) {
    return {
      success: false,
      statusCode: 422,
      error: "GrowthAction does not belong to the merchant specified in payment link notes",
    };
  }

  // 6b. Validate opportunity association if present
  if (opportunityId && growthAction.opportunityId !== opportunityId) {
    return {
      success: false,
      statusCode: 422,
      error: `GrowthAction is associated with opportunity '${growthAction.opportunityId}', but received '${opportunityId}'`,
    };
  }

  // 6c. Validate customer if specified
  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, merchantId },
    });
    if (!customer) {
      return {
        success: false,
        statusCode: 422,
        error: `Customer '${customerId}' not found for merchant '${merchantId}'`,
      };
    }
  }

  // 6d. Validate target product and authoritative DB price
  const expectedProductId = targetProductId || growthAction.opportunity?.targetProductId;
  if (!expectedProductId) {
    return {
      success: false,
      statusCode: 422,
      error: "No target product identified for payment link verification",
    };
  }

  const targetProduct = await prisma.product.findFirst({
    where: { id: expectedProductId, merchantId },
  });

  if (!targetProduct) {
    return {
      success: false,
      statusCode: 422,
      error: `Target product '${expectedProductId}' not found for merchant`,
    };
  }

  if (
    growthAction.opportunity?.targetProductId &&
    growthAction.opportunity.targetProductId !== expectedProductId
  ) {
    return {
      success: false,
      statusCode: 422,
      error: "Target product does not match opportunity target product",
    };
  }

  // 6e. Validate payment status and amounts
  if (paymentLink.status !== "paid") {
    return {
      success: false,
      statusCode: 422,
      error: `Payment link status is '${paymentLink.status}', expected 'paid'`,
    };
  }

  if (typeof paymentLink.amount !== "number" || paymentLink.amount <= 0) {
    return {
      success: false,
      statusCode: 422,
      error: "Invalid payment link amount in payload",
    };
  }

  if (typeof paymentLink.amount_paid !== "number" || paymentLink.amount_paid < paymentLink.amount) {
    return {
      success: false,
      statusCode: 422,
      error: `Amount paid (${paymentLink.amount_paid} paise) is less than link amount (${paymentLink.amount} paise)`,
    };
  }

  // Authoritative check against database product price (convert rupees to paise)
  const expectedPriceInPaise = Math.round(Number(targetProduct.price) * 100);
  if (paymentLink.amount !== expectedPriceInPaise) {
    return {
      success: false,
      statusCode: 422,
      error: `Amount mismatch: payment link amount is ${paymentLink.amount} paise, but authoritative product price is ${expectedPriceInPaise} paise (₹${targetProduct.price})`,
    };
  }

  // 7. Idempotency Check: Prevent duplicate execution and duplicate audit logs
  if (growthAction.status === GrowthActionStatus.EXECUTED) {
    const existingAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: growthAction.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });

    if (existingAudit) {
      return {
        success: true,
        statusCode: 200,
        isDuplicate: true,
        actionId: growthAction.id,
        message: "GrowthAction already marked EXECUTED and payment confirmed (idempotent duplicate)",
      };
    }
  }

  const existingAuditByPaymentLinkId = await prisma.auditEvent.findFirst({
    where: {
      merchantId,
      eventType: "PAYMENT_LINK_PAID",
      metadata: {
        path: ["paymentLinkId"],
        equals: paymentLink.id,
      },
    },
  });

  if (existingAuditByPaymentLinkId) {
    return {
      success: true,
      statusCode: 200,
      isDuplicate: true,
      actionId: growthAction.id,
      message: "Payment link event already recorded in audit trail (idempotent duplicate)",
    };
  }

  // 8. Atomic Database Updates
  await prisma.$transaction(async (tx) => {
    // 8a. Update GrowthAction status to EXECUTED
    await tx.growthAction.update({
      where: { id: growthAction.id },
      data: {
        status: GrowthActionStatus.EXECUTED,
        executedAt: new Date(),
      },
    });

    // 8b. Create AuditEvent recording the verified payment confirmation
    await tx.auditEvent.create({
      data: {
        merchantId: merchant.id,
        actionId: growthAction.id,
        eventType: "PAYMENT_LINK_PAID",
        actor: AuditActor.RAZORPAY,
        metadata: {
          paymentLinkId: paymentLink.id,
          paymentId: paymentEntity?.id ?? null,
          orderId: orderEntity?.id ?? null,
          amountInPaise: paymentLink.amount,
          amountInRupees: paymentLink.amount / 100,
          amountPaidInPaise: paymentLink.amount_paid,
          currency: paymentLink.currency,
          status: paymentLink.status,
          customer: paymentLink.customer ?? null,
          notes: paymentLink.notes ?? {},
          event: payload.event,
          processedAt: new Date().toISOString(),
        },
      },
    });
  });

  return {
    success: true,
    statusCode: 200,
    isDuplicate: false,
    actionId: growthAction.id,
    message: `Payment confirmed for GrowthAction ${growthAction.id}. Status updated to EXECUTED.`,
  };
}
