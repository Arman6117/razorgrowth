import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeCrossSell } from "@/lib/analytics/cross-sell";
import { OpportunityType, OpportunityStatus } from "@/lib/generated/prisma/enums";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let merchantId = searchParams.get("merchantId");

    if (!merchantId) {
      const defaultMerchant = await prisma.merchant.findFirst({ select: { id: true } });
      if (!defaultMerchant) {
        return NextResponse.json(
          { error: "No merchant found. Run database seed." },
          { status: 404 }
        );
      }
      merchantId = defaultMerchant.id;
    }

    // 1. Run deterministic cross-sell analytics engine
    const crossSellOpportunities = await analyzeCrossSell(merchantId);

    // 2. Fetch or sync persisted Opportunity records in DB
    const persistedOpps = await prisma.opportunity.findMany({
      where: { merchantId },
      include: {
        _count: {
          select: { actions: true },
        },
      },
    });

    const persistedMap = new Map<string, (typeof persistedOpps)[0]>();
    for (const opp of persistedOpps) {
      if (opp.sourceProductId && opp.targetProductId) {
        persistedMap.set(`${opp.sourceProductId}:${opp.targetProductId}`, opp);
      }
    }

    // Combine analytics opportunities with DB records
    const enrichedOpportunities = [];

    for (const opp of crossSellOpportunities) {
      const key = `${opp.sourceProductId}:${opp.targetProductId}`;
      let dbOpp = persistedMap.get(key);

      if (!dbOpp) {
        // Automatically persist discovered opportunity
        dbOpp = await prisma.opportunity.create({
          data: {
            merchantId,
            type: OpportunityType.CROSS_SELL,
            title: `Cross-sell: ${opp.sourceProductName} → ${opp.targetProductName}`,
            description: `AI analytics identified ${opp.eligibleCustomerCount} eligible customers who purchased ${opp.sourceProductName} but have not yet purchased ${opp.targetProductName}.`,
            sourceProductId: opp.sourceProductId,
            targetProductId: opp.targetProductId,
            confidence: opp.crossSellRate,
            estimatedRevenue: opp.expectedRevenue,
            evidence: {
              sourceProductName: opp.sourceProductName,
              targetProductName: opp.targetProductName,
              sourceCustomers: opp.sourceCustomers,
              customersTogether: opp.customersTogether,
              eligibleCustomerCount: opp.eligibleCustomerCount,
              crossSellRate: opp.crossSellRate,
              expectedRevenue: opp.expectedRevenue,
            },
            status: OpportunityStatus.NEW,
          },
          include: {
            _count: {
              select: { actions: true },
            },
          },
        });
        persistedMap.set(key, dbOpp);
      }

      enrichedOpportunities.push({
        id: dbOpp.id,
        merchantId: dbOpp.merchantId,
        sourceProductId: opp.sourceProductId,
        sourceProductName: opp.sourceProductName,
        targetProductId: opp.targetProductId,
        targetProductName: opp.targetProductName,
        targetProductPrice: opp.targetProductPrice,
        sourceCustomers: opp.sourceCustomers,
        customersTogether: opp.customersTogether,
        eligibleCustomerCount: opp.eligibleCustomerCount,
        eligibleCustomerIds: opp.eligibleCustomerIds,
        crossSellRate: opp.crossSellRate,
        expectedRevenue: opp.expectedRevenue,
        status: dbOpp.status,
        actionCount: dbOpp._count.actions,
        createdAt: dbOpp.createdAt,
      });
    }

    return NextResponse.json({
      success: true,
      opportunities: enrichedOpportunities,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch opportunities";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
