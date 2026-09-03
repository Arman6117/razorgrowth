import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { createAIBuyerPurchaseIntent } from "@/lib/buyer/ai-catalog";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    const productId = (body.productId as string)?.trim();
    if (!productId) {
      return NextResponse.json(
        { error: "productId parameter is required" },
        { status: 400 }
      );
    }

    const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim() : undefined;
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : undefined;

    const intent = await createAIBuyerPurchaseIntent({
      merchantId,
      productId,
      customerEmail,
      customerName,
    });

    return NextResponse.json(intent, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to create purchase intent";
    const status = message.includes("not found") ? 404 : message.includes("inactive") ? 422 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
