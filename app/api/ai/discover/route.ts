import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { discoverProductsForAIBuyer } from "@/lib/buyer/ai-catalog";

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

    const query = (body.query as string)?.trim();
    if (!query) {
      return NextResponse.json(
        { error: "query parameter is required (e.g. 'laptop accessories under ₹2,000')" },
        { status: 400 }
      );
    }

    const budget = typeof body.budget === "number" && body.budget > 0 ? body.budget : undefined;
    const category = typeof body.category === "string" ? body.category.trim() : undefined;

    const discovery = await discoverProductsForAIBuyer({
      merchantId,
      query,
      budget,
      category,
    });

    return NextResponse.json(discovery, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Product discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
