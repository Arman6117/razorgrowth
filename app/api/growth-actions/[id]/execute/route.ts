import { NextRequest, NextResponse } from "next/server";
import { executeGrowthAction } from "@/lib/actions/growth-action";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { merchantId, description, callbackUrl, callbackMethod, actor } = body;

    if (!merchantId) {
      return NextResponse.json(
        { error: "merchantId is required in request body" },
        { status: 400 }
      );
    }

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
    const message = error instanceof Error ? error.message : "Failed to execute GrowthAction";
    const status =
      message.includes("not found") ? 404 :
      message.includes("Cannot execute") || message.includes("Action must be") ? 409 :
      message.includes("inactive") || message.includes("Invalid") ? 422 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
