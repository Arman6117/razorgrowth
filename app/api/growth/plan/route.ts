import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import {
  generateGrowthPlan,
  prepareGrowthPlanActions,
} from "@/lib/agent/growth-planner";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    const opportunityId = (body.opportunityId as string)?.trim();
    if (!opportunityId) {
      return NextResponse.json(
        { error: "opportunityId parameter is required" },
        { status: 400 }
      );
    }

    const isPrepareAction =
      body.prepareActions === true || body.action === "prepare";

    if (isPrepareAction) {
      const prepResult = await prepareGrowthPlanActions({
        merchantId,
        opportunityId,
      });

      return NextResponse.json(
        prepResult,
        { status: 200 }
      );
    }

    const plan = await generateGrowthPlan({
      merchantId,
      opportunityId,
    });

    return NextResponse.json(
      {
        success: true,
        plan,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to process growth plan";

    // If opportunity not found or not belonging to merchant, return 404
    if (message.includes("not found") || message.includes("does not belong")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;

    const { searchParams } = new URL(req.url);
    const opportunityId = searchParams.get("opportunityId")?.trim();

    if (!opportunityId) {
      return NextResponse.json(
        { error: "opportunityId query parameter is required" },
        { status: 400 }
      );
    }

    const plan = await generateGrowthPlan({
      merchantId,
      opportunityId,
    });

    return NextResponse.json(
      {
        success: true,
        plan,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to fetch growth plan";

    if (message.includes("not found") || message.includes("does not belong")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
