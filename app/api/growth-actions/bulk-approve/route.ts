import { NextRequest, NextResponse } from "next/server";
import { approveGrowthActionsForOpportunity } from "@/lib/actions/growth-action";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { merchantId, opportunityId } = body;

    if (!merchantId || !opportunityId) {
      return NextResponse.json(
        { error: "merchantId and opportunityId are required in request body" },
        { status: 400 }
      );
    }

    const result = await approveGrowthActionsForOpportunity({
      merchantId,
      opportunityId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to bulk approve GrowthActions";
    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
