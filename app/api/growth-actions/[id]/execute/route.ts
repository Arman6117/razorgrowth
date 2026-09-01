import { NextRequest, NextResponse } from "next/server";
import { executeGrowthAction } from "@/lib/actions/growth-action";
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
    const body = await req.json().catch(() => ({}));
    const { description, callbackUrl, callbackMethod, actor } = body;

    if (!id) {
      return NextResponse.json(
        { error: "GrowthAction id parameter is required" },
        { status: 400 }
      );
    }

    const result = await executeGrowthAction({
      merchantId,
      actionId: id,
      description,
      callbackUrl,
      callbackMethod,
      actor: actor || "MERCHANT",
    });

    return NextResponse.json(
      {
        success: true,
        action: result.action,
        paymentLink: result.paymentLink,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to execute GrowthAction";
    const status =
      message.includes("not found") ? 404 :
      message.includes("Cannot execute") || message.includes("Action must be") ? 409 :
      message.includes("inactive") || message.includes("Invalid") ? 422 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
