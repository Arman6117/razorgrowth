import { NextRequest, NextResponse } from "next/server";
import {
  createGrowthAction,
  createGrowthActionsForCustomers,
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
      customerIds,
      sourceProductId,
      targetProductId,
      type,
    } = body;

    if (!merchantId || !opportunityId) {
      return NextResponse.json(
        {
          error: "merchantId and opportunityId are required",
        },
        { status: 400 }
      );
    }

    // Batch creation mode
    if (Array.isArray(customerIds)) {
      if (customerIds.length === 0) {
        return NextResponse.json(
          {
            error: "customerIds must be a non-empty array of customer IDs",
          },
          { status: 400 }
        );
      }

      const result = await createGrowthActionsForCustomers({
        merchantId,
        opportunityId,
        customerIds,
        sourceProductId,
        targetProductId,
        type,
      });

      return NextResponse.json(result, { status: 201 });
    }

    // Single action creation mode
    if (!customerId) {
      return NextResponse.json(
        {
          error: "Either customerId (string) or customerIds (array) is required",
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
