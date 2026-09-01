import { NextRequest, NextResponse } from "next/server";
import { getGrowthAction } from "@/lib/actions/growth-action";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "GrowthAction id parameter is required" },
        { status: 400 }
      );
    }

    const action = await getGrowthAction({
      merchantId,
      actionId: id,
    });

    if (!action) {
      return NextResponse.json(
        { error: `GrowthAction '${id}' not found for merchant` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, action }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch GrowthAction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
