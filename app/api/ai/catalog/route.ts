import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { getAIBuyerCatalog } from "@/lib/buyer/ai-catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const { searchParams } = new URL(req.url);
    const onlyActive = searchParams.get("onlyActive") === "true";
    const includeJsonLd = searchParams.get("includeJsonLd") !== "false";

    const catalog = await getAIBuyerCatalog(merchantId, {
      onlyActive,
      includeJsonLd,
      recordAudit: true,
    });

    return NextResponse.json(
      {
        success: true,
        ...catalog,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to retrieve AI catalog";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
