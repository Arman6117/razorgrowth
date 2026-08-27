import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCustomerEligible } from "@/lib/actions/growth-action";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    let merchantId = searchParams.get("merchantId");

    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: {
        sourceProduct: true,
        targetProduct: true,
      },
    });

    if (!opportunity) {
      return NextResponse.json(
        { error: `Opportunity not found: ${id}` },
        { status: 404 }
      );
    }

    merchantId = opportunity.merchantId;

    if (!opportunity.sourceProductId || !opportunity.targetProductId) {
      return NextResponse.json(
        { error: "Opportunity does not have defined source and target products" },
        { status: 400 }
      );
    }

    // Find all customers who bought the source product
    const sourceOrders = await prisma.order.findMany({
      where: {
        merchantId,
        status: "PAID",
        items: {
          some: { productId: opportunity.sourceProductId },
        },
      },
      select: {
        customerId: true,
      },
    });

    const sourceCustomerIds = Array.from(
      new Set(sourceOrders.map((o) => o.customerId))
    );

    // Find customers who already bought the target product
    const targetOrders = await prisma.order.findMany({
      where: {
        merchantId,
        customerId: { in: sourceCustomerIds },
        status: "PAID",
        items: {
          some: { productId: opportunity.targetProductId },
        },
      },
      select: {
        customerId: true,
      },
    });

    const excludedCustomerIds = new Set(targetOrders.map((o) => o.customerId));
    const eligibleCustomerIds = sourceCustomerIds.filter(
      (cId) => !excludedCustomerIds.has(cId)
    );

    // Fetch full customer profiles
    const customers = await prisma.customer.findMany({
      where: {
        id: { in: eligibleCustomerIds },
        merchantId,
      },
      include: {
        orders: {
          where: { status: "PAID" },
          select: {
            id: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    // Fetch existing GrowthActions for this opportunity
    const existingActions = await prisma.growthAction.findMany({
      where: {
        opportunityId: opportunity.id,
        merchantId,
      },
      orderBy: { createdAt: "desc" },
    });

    const actionByCustomerId = new Map<string, (typeof existingActions)[0]>();
    for (const action of existingActions) {
      const params = action.parameters as Record<string, unknown>;
      const cId = params?.customerId as string;
      if (cId && !actionByCustomerId.has(cId)) {
        actionByCustomerId.set(cId, action);
      }
    }

    const customerList = customers.map((c) => {
      const existingAction = actionByCustomerId.get(c.id);
      const totalSpend = c.orders.reduce(
        (sum, o) => sum + Number(o.total),
        0
      );

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        totalPaidOrders: c.orders.length,
        totalSpend,
        existingAction: existingAction
          ? {
              id: existingAction.id,
              status: existingAction.status,
              type: existingAction.type,
              parameters: existingAction.parameters,
              approvedAt: existingAction.approvedAt,
              executedAt: existingAction.executedAt,
              createdAt: existingAction.createdAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      opportunity: {
        id: opportunity.id,
        title: opportunity.title,
        sourceProductName: opportunity.sourceProduct?.name,
        targetProductName: opportunity.targetProduct?.name,
        targetProductPrice: opportunity.targetProduct
          ? Number(opportunity.targetProduct.price)
          : 0,
        eligibleCount: customerList.length,
      },
      customers: customerList,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch eligible customers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
