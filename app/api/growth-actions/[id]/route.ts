import { NextRequest, NextResponse } from "next/server";
import { getGrowthAction } from "@/lib/actions/growth-action";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const merchantId = searchParams.get("merchantId");

    if (!merchantId) {
      return NextResponse.json(
        { error: "merchantId query parameter is required" },
        { status: 400 }
      );
    }

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
        { error: `GrowthAction '${id}' not found for merchant '${merchantId}'` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, action }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch GrowthAction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
