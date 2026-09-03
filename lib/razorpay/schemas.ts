import { z } from "zod";

/**
 * Zod schema for Razorpay Payment Link creation response.
 * Strictly validates only fields consumed by RazorGrowth.
 */
export const RazorpayPaymentLinkResponseSchema = z
  .object({
    id: z.string().min(1, "Payment link ID cannot be empty"),
    entity: z.string().optional().default("payment_link"),
    amount: z.number().nonnegative("Amount must be non-negative"),
    amount_paid: z.number().optional().default(0),
    currency: z.string().default("INR"),
    status: z.string().min(1, "Status cannot be empty"),
    description: z.string().optional().default(""),
    short_url: z.string().min(1, "short_url cannot be empty"),
    customer: z
      .object({
        name: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        contact: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
    notes: z.record(z.string(), z.string()).optional().nullable(),
    created_at: z.number(),
    expire_by: z.number().optional().nullable(),
  })
  .passthrough();

export type RazorpayPaymentLinkResponse = z.infer<
  typeof RazorpayPaymentLinkResponseSchema
>;

/**
 * Zod schema for Razorpay Payment Link notification response.
 */
export const RazorpayNotifyResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

export type RazorpayNotifyResponse = z.infer<
  typeof RazorpayNotifyResponseSchema
>;

/**
 * Zod schema for single customer item in Razorpay customer list.
 */
export const RazorpayCustomerItemSchema = z
  .object({
    id: z.string().min(1, "Customer ID cannot be empty"),
    name: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    contact: z.string().optional().nullable(),
    created_at: z.number().optional(),
  })
  .passthrough();

export type RazorpayCustomerItem = z.infer<typeof RazorpayCustomerItemSchema>;

/**
 * Zod schema for Razorpay Customer list response used by sync & connection validation.
 */
export const RazorpayCustomerListResponseSchema = z
  .object({
    entity: z.string().optional().default("collection"),
    count: z.number().optional(),
    items: z.array(RazorpayCustomerItemSchema),
  })
  .passthrough();

export type RazorpayCustomerListResponse = z.infer<
  typeof RazorpayCustomerListResponseSchema
>;

/**
 * Zod schema for single order item in Razorpay order list.
 */
export const RazorpayOrderItemSchema = z
  .object({
    id: z.string().min(1, "Order ID cannot be empty"),
    entity: z.string().optional().default("order"),
    amount: z.number().nonnegative("Amount must be non-negative"),
    amount_paid: z.number().optional(),
    amount_due: z.number().optional(),
    currency: z.string().optional().default("INR"),
    receipt: z.string().optional().nullable(),
    status: z.string().min(1, "Order status cannot be empty"),
    notes: z.record(z.string(), z.string()).optional().nullable(),
    created_at: z.number(),
  })
  .passthrough();

export type RazorpayOrderItem = z.infer<typeof RazorpayOrderItemSchema>;

/**
 * Zod schema for Razorpay Order list response used by sync.
 */
export const RazorpayOrderListResponseSchema = z
  .object({
    entity: z.string().optional().default("collection"),
    count: z.number().optional(),
    items: z.array(RazorpayOrderItemSchema),
  })
  .passthrough();

export type RazorpayOrderListResponse = z.infer<
  typeof RazorpayOrderListResponseSchema
>;

/**
 * Zod schema for structured Razorpay error payloads.
 */
export const RazorpayErrorPayloadSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        description: z.string().optional(),
        field: z.string().optional(),
        reason: z.string().optional(),
        source: z.string().optional(),
        step: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .passthrough();

export type RazorpayErrorPayload = z.infer<typeof RazorpayErrorPayloadSchema>;
