import crypto from "node:crypto";
import { prisma } from "../prisma";
import { GrowthActionStatus, AuditActor } from "../generated/prisma/enums";
import { safeParseGrowthActionParameters } from "../actions/growth-action";

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
 *
 * FINANCIAL INTEGRITY & IDEMPOTENCY GUARANTEES:
 * 1. Exact Payment Link ID Binding: GrowthAction.parameters.paymentLinkId must strictly match paymentLink.id.
 * 2. Currency Validation: incoming payment link currency must match authoritative Merchant.currency.
 * 3. Authoritative DB Price: payment amount must strictly equal Product.price * 100 paise.
 * 4. Tenant Isolation: merchantId, growthAction.merchantId, customer.merchantId, and product.merchantId must match.
 * 5. Concurrent Idempotency: PostgreSQL transaction advisory lock on (merchantId, paymentLinkId) guarantees
 *    duplicate and parallel webhook deliveries execute state transition and PAYMENT_LINK_PAID audit event exactly once.
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

  // 5. Validate Currency against authoritative Merchant.currency
  const incomingCurrency = (paymentLink.currency || "").trim().toUpperCase();
  const merchantCurrency = (merchant.currency || "INR").trim().toUpperCase();
  if (incomingCurrency !== merchantCurrency) {
    return {
      success: false,
      statusCode: 422,
      error: `Currency mismatch: payment link currency is '${incomingCurrency}', but merchant currency is '${merchantCurrency}'`,
    };
  }

  // 6. Validate Payment Link Status & Amounts
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

  if (
    typeof paymentLink.amount_paid !== "number" ||
    paymentLink.amount_paid < paymentLink.amount
  ) {
    return {
      success: false,
      statusCode: 422,
      error: `Amount paid (${paymentLink.amount_paid} paise) is less than link amount (${paymentLink.amount} paise)`,
    };
  }

  // 7. Locate the corresponding GrowthAction
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

  // 8. Strict Merchant Ownership & Lifecycle Checks
  if (growthAction.merchantId !== merchantId) {
    return {
      success: false,
      statusCode: 422,
      error: "GrowthAction does not belong to the merchant specified in payment link notes",
    };
  }

  if (growthAction.status === GrowthActionStatus.REJECTED) {
    return {
      success: false,
      statusCode: 422,
      error: "Cannot confirm payment for rejected GrowthAction",
    };
  }

  if (opportunityId && growthAction.opportunityId !== opportunityId) {
    return {
      success: false,
      statusCode: 422,
      error: `GrowthAction is associated with opportunity '${growthAction.opportunityId}', but received '${opportunityId}'`,
    };
  }

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

  // 9. Exact Payment Link ID Verification
  // Safely parse persisted GrowthAction parameters and require exact paymentLinkId match
  const paramsResult = safeParseGrowthActionParameters(growthAction.parameters);
  if (!paramsResult.success) {
    return {
      success: false,
      statusCode: 422,
      error: `Malformed GrowthAction parameters: ${paramsResult.error.message}`,
    };
  }
  const params = paramsResult.data;

  if (!params.paymentLinkId || typeof params.paymentLinkId !== "string") {
    return {
      success: false,
      statusCode: 422,
      error: `GrowthAction '${growthAction.id}' has no persisted paymentLinkId to bind against payment link '${paymentLink.id}'`,
    };
  }

  if (params.paymentLinkId !== paymentLink.id) {
    return {
      success: false,
      statusCode: 422,
      error: `Payment link ID mismatch: GrowthAction '${growthAction.id}' is bound to payment link '${params.paymentLinkId}', but webhook reported '${paymentLink.id}'`,
    };
  }

  // 10. Authoritative Target Product & Price Verification
  const expectedProductId =
    targetProductId || params.targetProductId || growthAction.opportunity?.targetProductId;
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

  const expectedPriceInPaise = Math.round(Number(targetProduct.price) * 100);
  if (paymentLink.amount !== expectedPriceInPaise) {
    return {
      success: false,
      statusCode: 422,
      error: `Amount mismatch: payment link amount is ${paymentLink.amount} paise, but authoritative product price is ${expectedPriceInPaise} paise (₹${targetProduct.price})`,
    };
  }

  // 11. Atomic Database Updates with Transaction Advisory Lock
  const lockKey = `webhook_payment_lock:${merchantId}:${paymentLink.id}`;

  return await prisma.$transaction(async (tx) => {
    // 11a. Acquire PostgreSQL transaction-level advisory lock on (merchantId, paymentLinkId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    // 11b. Re-check inside transaction under lock: Has this payment link already been recorded?
    const existingAuditByPaymentLinkId = await tx.auditEvent.findFirst({
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

    // 11c. Re-check fresh action status inside transaction
    const freshAction = await tx.growthAction.findUnique({
      where: { id: growthAction.id },
    });

    if (freshAction?.status === GrowthActionStatus.EXECUTED) {
      const actionPaidAudit = await tx.auditEvent.findFirst({
        where: {
          actionId: growthAction.id,
          eventType: "PAYMENT_LINK_PAID",
        },
      });

      if (actionPaidAudit) {
        return {
          success: true,
          statusCode: 200,
          isDuplicate: true,
          actionId: growthAction.id,
          message: "GrowthAction already marked EXECUTED and payment confirmed (idempotent duplicate)",
        };
      }
    }

    // 11d. Atomically update GrowthAction status to EXECUTED
    await tx.growthAction.update({
      where: { id: growthAction.id },
      data: {
        status: GrowthActionStatus.EXECUTED,
        executedAt: freshAction?.executedAt || new Date(),
      },
    });

    // 11e. Record single authoritative PAYMENT_LINK_PAID audit event
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

    return {
      success: true,
      statusCode: 200,
      isDuplicate: false,
      actionId: growthAction.id,
      message: `Payment confirmed for GrowthAction ${growthAction.id}. Status updated to EXECUTED.`,
    };
  });
}
