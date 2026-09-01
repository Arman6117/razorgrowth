import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);

    const merchant = await prisma.merchant.findUnique({
      where: { id: authMerchant.id },
      include: {
        _count: {
          select: {
            customers: true,
            products: true,
            orders: true,
            opportunities: true,
            growthActions: true,
          },
        },
      },
    });

    if (!merchant) {
      return NextResponse.json(
        { error: "Merchant not found" },
        { status: 404 }
      );
    }

    // Aggregate GrowthAction counts by status
    const actionCounts = await prisma.growthAction.groupBy({
      by: ["status"],
      where: { merchantId: merchant.id },
      _count: { _all: true },
    });

    const statusMap: Record<string, number> = {
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      EXECUTING: 0,
      EXECUTED: 0,
      FAILED: 0,
      REJECTED: 0,
    };

    for (const item of actionCounts) {
      statusMap[item.status] = item._count._all;
    }

    return NextResponse.json({
      success: true,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        currency: merchant.currency,
        createdAt: merchant.createdAt,
        counts: {
          ...merchant._count,
          actionsByStatus: statusMap,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch merchant";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
