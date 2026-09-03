import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { analyzeMerchantGrowthIntelligence } from "@/lib/analytics/growth-intelligence";
import { computeMerchantGrowthSnapshot } from "@/lib/analytics/snapshot";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const result = await analyzeMerchantGrowthIntelligence(merchantId);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to run AI growth intelligence analysis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const snapshot = await computeMerchantGrowthSnapshot(merchantId);
    if (!snapshot) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      merchantId,
      snapshot,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch growth snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
