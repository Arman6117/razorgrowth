import { prisma } from "../prisma";
import { razorpayMerchantRequest } from "./client";

export interface CreatePaymentLinkInput {
  merchantId: string;
  customerId: string;
  targetProductId: string;
  opportunityId?: string;
  growthActionId?: string;
  description?: string;
  callbackUrl?: string;
  callbackMethod?: "get" | "post";
}

export interface RazorpayPaymentLinkResponse {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  currency: string;
  status: string;
  description: string;
  short_url: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  created_at: number;
  expire_by?: number;
}

export interface PaymentLinkResult {
  paymentLinkId: string;
  shortUrl: string;
  status: string;
  amountInPaise: number;
  amountInRupees: number;
  currency: string;
  customer: {
    name: string;
    email: string;
  };
  notes: Record<string, string>;
  createdAt: number;
}

/**
 * Creates a Razorpay Test Mode Payment Link for a verified merchant cross-sell opportunity.
 *
 * SAFETY GUARANTEES:
 * 1. Target product price is strictly retrieved from the database - NEVER from arbitrary user/LLM input.
 * 2. Validates that the target product exists, is active, and belongs to the merchant.
 * 3. Validates that the customer exists and belongs to the merchant.
 * 4. Ensures the amount is positive and currency is valid.
 * 5. Embeds internal IDs in Razorpay `notes` for end-to-end reconciliation.
 */
export async function createPaymentLink(
  input: CreatePaymentLinkInput
): Promise<PaymentLinkResult> {
  const { merchantId, customerId, targetProductId, opportunityId, growthActionId } = input;

  if (!merchantId?.trim()) {
    throw new Error("merchantId is required");
  }
  if (!customerId?.trim()) {
    throw new Error("customerId is required");
  }
  if (!targetProductId?.trim()) {
    throw new Error("targetProductId is required");
  }

  // 1. Validate merchant
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });

  if (!merchant) {
    throw new Error(`Merchant not found with ID: ${merchantId}`);
  }

  // 2. Validate customer belongs to merchant
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      merchantId: merchant.id,
    },
    select: { id: true, name: true, email: true },
  });

  if (!customer) {
    throw new Error(
      `Customer not found or does not belong to merchant: ${customerId}`
    );
  }

  // 3. Validate target product exists, belongs to merchant, and is active
  const product = await prisma.product.findFirst({
    where: {
      id: targetProductId,
      merchantId: merchant.id,
    },
    select: { id: true, name: true, price: true, active: true },
  });

  if (!product) {
    throw new Error(
      `Target product not found or does not belong to merchant: ${targetProductId}`
    );
  }

  if (!product.active) {
    throw new Error(`Target product is inactive: ${product.name} (${targetProductId})`);
  }

  // 4. Financial Safety: Calculate amount strictly from authoritative DB product price
  const priceInRupees = Number(product.price);
  if (isNaN(priceInRupees) || priceInRupees <= 0) {
    throw new Error(
      `Invalid product price in database: ₹${product.price}. Amount must be positive.`
    );
  }

  const currency = merchant.currency || "INR";
  if (currency.toUpperCase() !== "INR") {
    throw new Error(`Unsupported currency: ${currency}. Only INR is currently supported.`);
  }

  // Convert INR amount to paise (1 INR = 100 paise)
  const amountInPaise = Math.round(priceInRupees * 100);

  // 5. Optional verification of opportunity & growth action
  if (opportunityId) {
    const opp = await prisma.opportunity.findFirst({
      where: { id: opportunityId, merchantId: merchant.id },
      select: { id: true },
    });
    if (!opp) {
      throw new Error(`Opportunity not found with ID: ${opportunityId}`);
    }
  }

  if (growthActionId) {
    const action = await prisma.growthAction.findFirst({
      where: { id: growthActionId, merchantId: merchant.id },
      select: { id: true },
    });
    if (!action) {
      throw new Error(`GrowthAction not found with ID: ${growthActionId}`);
    }
  }

  // 6. Build Razorpay Payment Link payload
  const notes: Record<string, string> = {
    merchantId: merchant.id,
    customerId: customer.id,
    targetProductId: product.id,
  };
  if (opportunityId) notes.opportunityId = opportunityId;
  if (growthActionId) notes.growthActionId = growthActionId;

  const description =
    input.description?.trim() || `Cross-sell offer: ${product.name}`;

  const payload: Record<string, unknown> = {
    amount: amountInPaise,
    currency,
    accept_partial: false,
    description,
    customer: {
      name: customer.name,
      email: customer.email,
    },
    notify: {
      sms: false,
      email: true,
    },
    reminder_enable: false,
    notes,
  };

  if (input.callbackUrl) {
    payload.callback_url = input.callbackUrl;
    payload.callback_method = input.callbackMethod || "get";
  }

  // 7. Execute Razorpay API call with merchant credentials
  const response = await razorpayMerchantRequest<RazorpayPaymentLinkResponse>(
    merchant.id,
    "/payment_links",
    {
      method: "POST",
      body: payload,
    }
  );

  return {
    paymentLinkId: response.id,
    shortUrl: response.short_url,
    status: response.status,
    amountInPaise: response.amount,
    amountInRupees: priceInRupees,
    currency: response.currency,
    customer: {
      name: customer.name,
      email: customer.email,
    },
    notes: response.notes || notes,
    createdAt: response.created_at,
  };
}

export interface ResendPaymentLinkNotificationInput {
  merchantId: string;
  paymentLinkId: string;
  medium?: "email" | "sms";
}

export interface RazorpayNotifyResponse {
  success: boolean;
  [key: string]: unknown;
}

/**
 * Resends a payment link notification to the customer via Razorpay's native notification API.
 * POST https://api.razorpay.com/v1/payment_links/:id/notify_by/:medium
 */
export async function resendPaymentLinkNotification(
  input: ResendPaymentLinkNotificationInput
): Promise<RazorpayNotifyResponse> {
  const { merchantId, paymentLinkId, medium = "email" } = input;

  if (!merchantId?.trim()) {
    throw new Error("merchantId is required");
  }
  if (!paymentLinkId?.trim()) {
    throw new Error("paymentLinkId is required");
  }

  const endpoint = `/payment_links/${encodeURIComponent(paymentLinkId)}/notify_by/${encodeURIComponent(medium)}`;

  const response = await razorpayMerchantRequest<RazorpayNotifyResponse>(
    merchantId,
    endpoint,
    {
      method: "POST",
    }
  );

  return response;
}

