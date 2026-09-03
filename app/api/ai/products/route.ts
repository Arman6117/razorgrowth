import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { getAIBuyerCatalog } from "@/lib/buyer/ai-catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const { searchParams } = new URL(req.url);
    const onlyActive = searchParams.get("onlyActive") !== "false";
    const includeJsonLd = searchParams.get("includeJsonLd") === "true";

    const catalog = await getAIBuyerCatalog(merchantId, {
      onlyActive,
      includeJsonLd,
    });

    return NextResponse.json(
      {
        success: true,
        merchant: catalog.merchant,
        products: catalog.products,
        total: catalog.products.length,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to retrieve products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
