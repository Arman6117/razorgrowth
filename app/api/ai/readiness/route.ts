import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { calculateAIBuyerReadiness } from "@/lib/buyer/ai-catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const report = await calculateAIBuyerReadiness(merchantId);

    return NextResponse.json(
      {
        success: true,
        report,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to calculate AI buyer readiness";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
