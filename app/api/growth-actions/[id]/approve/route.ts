import { NextRequest, NextResponse } from "next/server";
import { approveGrowthAction } from "@/lib/actions/growth-action";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(
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

    const action = await approveGrowthAction({
      merchantId,
      actionId: id,
    });

    return NextResponse.json(
      {
        success: true,
        action,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to approve GrowthAction";
    const status =
      message.includes("not found") ? 404 :
      message.includes("Cannot approve") || message.includes("Must be in") ? 409 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
