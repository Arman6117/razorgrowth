import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { createAIBuyerPurchaseIntent, PurchaseIntentError } from "@/lib/buyer/ai-catalog";

export const dynamic = "force-dynamic";

/**
 * Focused Zod schema for runtime validation of purchase-intent requests.
 * Normalizes strings via trimming and rejects invalid emails/empty names.
 */
export const purchaseIntentRequestSchema = z.object({
  productId: z
    .string({
      message: "productId must be a string and is required",
    })
    .trim()
    .min(1, "productId cannot be empty")
    .max(128, "productId exceeds maximum length of 128 characters"),
  customerEmail: z
    .string({
      message: "customerEmail must be a string",
    })
    .trim()
    .email("Invalid email format for customerEmail")
    .max(255, "customerEmail exceeds maximum length of 255 characters")
    .optional(),
  customerName: z
    .string({
      message: "customerName must be a string",
    })
    .trim()
    .min(1, "customerName cannot be empty if provided")
    .max(255, "customerName exceeds maximum length of 255 characters")
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    const parsed = purchaseIntentRequestSchema.safeParse(body);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json(
        { error: `Invalid request input: ${errorMsg}` },
        { status: 400 }
      );
    }

    const intent = await createAIBuyerPurchaseIntent({
      merchantId,
      productId: parsed.data.productId,
      customerEmail: parsed.data.customerEmail,
      customerName: parsed.data.customerName,
    });

    return NextResponse.json(intent, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof PurchaseIntentError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to create purchase intent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
