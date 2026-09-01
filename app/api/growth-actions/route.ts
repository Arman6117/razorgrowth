import { NextRequest, NextResponse } from "next/server";
import {
  createGrowthAction,
  createGrowthActionsForCustomers,
  listGrowthActions,
} from "@/lib/actions/growth-action";
import { GrowthActionStatus } from "@/lib/generated/prisma/enums";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const body = await req.json().catch(() => ({}));
    const {
      opportunityId,
      customerId,
      customerIds,
      sourceProductId,
      targetProductId,
      type,
    } = body;

    if (!opportunityId) {
      return NextResponse.json(
        {
          error: "opportunityId is required",
        },
        { status: 400 }
      );
    }

    // Single action creation mode
    if (typeof customerId === "string" && customerId.trim()) {
      const action = await createGrowthAction({
        merchantId,
        opportunityId,
        customerId: customerId.trim(),
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
    }

    // Batch creation mode (either explicit customerIds array or omitted for automatic candidate resolution)
    if (Array.isArray(customerIds) && customerIds.length === 0) {
      return NextResponse.json(
        {
          error: "customerIds must be a non-empty array of customer IDs or omitted for all candidates",
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
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to create GrowthAction";
    const status =
      message.includes("not found") ? 404 :
      message.includes("not eligible") || message.includes("inactive") || message.includes("Invalid") ? 422 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const { searchParams } = new URL(req.url);
    const opportunityId = searchParams.get("opportunityId") || undefined;
    const statusParam = searchParams.get("status");

    const status = statusParam ? (statusParam as GrowthActionStatus) : undefined;

    const actions = await listGrowthActions({
      merchantId,
      opportunityId,
      status,
    });

    return NextResponse.json({ success: true, actions }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to list GrowthActions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
