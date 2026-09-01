import { NextRequest, NextResponse } from "next/server";
import { approveGrowthActionsForOpportunity } from "@/lib/actions/growth-action";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const body = await req.json().catch(() => ({}));
    const { opportunityId } = body;

    if (!opportunityId) {
      return NextResponse.json(
        { error: "opportunityId is required in request body" },
        { status: 400 }
      );
    }

    const result = await approveGrowthActionsForOpportunity({
      merchantId,
      opportunityId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message =
      error instanceof Error ? error.message : "Failed to bulk approve GrowthActions";
    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
