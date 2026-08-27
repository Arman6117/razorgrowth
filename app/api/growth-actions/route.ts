import { NextRequest, NextResponse } from "next/server";
import {
  createGrowthAction,
  listGrowthActions,
} from "@/lib/actions/growth-action";
import { GrowthActionStatus } from "@/lib/generated/prisma/enums";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      merchantId,
      opportunityId,
      customerId,
      sourceProductId,
      targetProductId,
      type,
    } = body;

    if (!merchantId || !opportunityId || !customerId) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: merchantId, opportunityId, and customerId are required",
        },
        { status: 400 }
      );
    }

    const action = await createGrowthAction({
      merchantId,
      opportunityId,
      customerId,
      sourceProductId,
      targetProductId,
      type,
    });

    return NextResponse.json(
      {
        success: true,
        action,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create GrowthAction";
    const status =
      message.includes("not found") ? 404 :
      message.includes("not eligible") || message.includes("inactive") || message.includes("Invalid") ? 422 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const merchantId = searchParams.get("merchantId");
    const opportunityId = searchParams.get("opportunityId") || undefined;
    const statusParam = searchParams.get("status");

    if (!merchantId) {
      return NextResponse.json(
        { error: "merchantId query parameter is required" },
        { status: 400 }
      );
    }

    const status = statusParam ? (statusParam as GrowthActionStatus) : undefined;

    const actions = await listGrowthActions({
      merchantId,
      opportunityId,
      status,
    });

    return NextResponse.json({ success: true, actions }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list GrowthActions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
