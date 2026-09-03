import { prisma } from "../prisma";

export interface MerchantGrowthSnapshot {
  merchantId: string;
  merchantName: string;
  currency: string;
  generatedAt: string;
  customers: {
    total: number;
    withPurchases: number;
    repeatBuyers: number;
    oneTimeBuyers: number;
    dormantCount: number; // No purchase in last 30 days
  };
  orders: {
    total: number;
    paid: number;
    failedOrCancelled: number;
    totalRealizedRevenue: number;
    averageOrderValue: number;
  };
  products: Array<{
    id: string;
    name: string;
    category: string;
    price: number;
    active: boolean;
    paidOrdersCount: number;
    unitsSold: number;
    revenue: number;
    uniqueBuyersCount: number;
  }>;
  productPairs: Array<{
    sourceProductId: string;
    sourceProductName: string;
    targetProductId: string;
    targetProductName: string;
    sourceBuyersCount: number;
    coPurchasersCount: number;
    sourceOnlyBuyersCount: number;
    attachRate: number;
    targetPrice: number;
  }>;
}

/**
 * Computes a deterministic, merchant-scoped growth snapshot from authoritative database tables.
 * Never sends raw unlimited transaction rows to LLMs; produces a compact, aggregated facts object.
 */
export async function computeMerchantGrowthSnapshot(
  merchantId: string
): Promise<MerchantGrowthSnapshot | null> {
  if (!merchantId?.trim()) return null;

  // 1. Fetch merchant details
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });

  if (!merchant) return null;

  // 2. Fetch all products for merchant
  const products = await prisma.product.findMany({
    where: { merchantId },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      active: true,
    },
    orderBy: { price: "desc" },
  });

  const productMap = new Map<
    string,
    { id: string; name: string; category: string; price: number; active: boolean }
  >();
  for (const p of products) {
    productMap.set(p.id, {
      id: p.id,
      name: p.name,
      category: p.category || "General",
      price: Number(p.price),
      active: p.active,
    });
  }

  // 3. Fetch order status aggregation
  const orderCountsByStatus = await prisma.order.groupBy({
    by: ["status"],
    where: { merchantId },
    _count: { _all: true },
    _sum: { total: true },
  });

  let totalOrdersCount = 0;
  let paidOrdersCount = 0;
  let failedOrCancelledCount = 0;
  let totalRealizedRevenue = 0;

  for (const group of orderCountsByStatus) {
    totalOrdersCount += group._count._all;
    if (group.status === "PAID") {
      paidOrdersCount = group._count._all;
      totalRealizedRevenue = Number(group._sum.total || 0);
    } else if (group.status === "FAILED" || group.status === "CANCELLED") {
      failedOrCancelledCount += group._count._all;
    }
  }

  const averageOrderValue =
    paidOrdersCount > 0
      ? Number((totalRealizedRevenue / paidOrdersCount).toFixed(2))
      : 0;

  // 4. Fetch total customers count
  const totalCustomersCount = await prisma.customer.count({
    where: { merchantId },
  });

  // 5. Fetch all PAID orders with items for co-purchase and customer frequency aggregation
  const paidOrders = await prisma.order.findMany({
    where: {
      merchantId,
      status: "PAID",
    },
    select: {
      id: true,
      customerId: true,
      total: true,
      createdAt: true,
      items: {
        select: {
          productId: true,
          quantity: true,
          unitPrice: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const customerOrdersMap = new Map<string, { count: number; lastOrderDate: Date }>();
  const productBuyersMap = new Map<string, Set<string>>();
  const productUnitsMap = new Map<string, number>();
  const productPaidOrdersMap = new Map<string, number>();

  const pairBuyersMap = new Map<string, Set<string>>();

  // Latest order timestamp to compute dormancy relative to latest activity
  let latestOrderTimestamp = Date.now();

  for (const order of paidOrders) {
    const orderTime = order.createdAt.getTime();
    if (orderTime > latestOrderTimestamp) {
      latestOrderTimestamp = orderTime;
    }

    // Customer purchase stats
    const currentCust = customerOrdersMap.get(order.customerId);
    if (!currentCust) {
      customerOrdersMap.set(order.customerId, {
        count: 1,
        lastOrderDate: order.createdAt,
      });
    } else {
      currentCust.count++;
      if (order.createdAt > currentCust.lastOrderDate) {
        currentCust.lastOrderDate = order.createdAt;
      }
    }

    // Product stats
    const distinctProductIdsInOrder = new Set<string>();
    for (const item of order.items) {
      distinctProductIdsInOrder.add(item.productId);
      productUnitsMap.set(
        item.productId,
        (productUnitsMap.get(item.productId) || 0) + item.quantity
      );
    }

    for (const pId of distinctProductIdsInOrder) {
      productPaidOrdersMap.set(
        pId,
        (productPaidOrdersMap.get(pId) || 0) + 1
      );

      if (!productBuyersMap.has(pId)) {
        productBuyersMap.set(pId, new Set());
      }
      productBuyersMap.get(pId)!.add(order.customerId);
    }

    // Co-purchase pair combinations within the same customer history / baskets
    const productList = Array.from(distinctProductIdsInOrder);
    for (let i = 0; i < productList.length; i++) {
      for (let j = 0; j < productList.length; j++) {
        if (i === j) continue;
        const key = `${productList[i]}:${productList[j]}`;
        if (!pairBuyersMap.has(key)) {
          pairBuyersMap.set(key, new Set());
        }
        pairBuyersMap.get(key)!.add(order.customerId);
      }
    }
  }

  // Cross-order product co-purchasing (customer purchased A in order 1 and B in order 2)
  for (const [prodA, setA] of productBuyersMap) {
    for (const [prodB, setB] of productBuyersMap) {
      if (prodA === prodB) continue;
      const key = `${prodA}:${prodB}`;
      if (!pairBuyersMap.has(key)) {
        pairBuyersMap.set(key, new Set());
      }
      for (const custId of setA) {
        if (setB.has(custId)) {
          pairBuyersMap.get(key)!.add(custId);
        }
      }
    }
  }

  // 6. Aggregate customer segmentation metrics
  let repeatBuyers = 0;
  let oneTimeBuyers = 0;
  let dormantCount = 0;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  for (const [, stats] of customerOrdersMap) {
    if (stats.count > 1) {
      repeatBuyers++;
    } else {
      oneTimeBuyers++;
    }

    if (latestOrderTimestamp - stats.lastOrderDate.getTime() > THIRTY_DAYS_MS) {
      dormantCount++;
    }
  }

  // 7. Format Product Statistics
  const productStats = products.map((p) => {
    const buyersSet = productBuyersMap.get(p.id);
    const uniqueBuyersCount = buyersSet ? buyersSet.size : 0;
    const unitsSold = productUnitsMap.get(p.id) || 0;
    const paidOrdersCountForProd = productPaidOrdersMap.get(p.id) || 0;
    const priceNum = Number(p.price);
    const revenue = unitsSold * priceNum;

    return {
      id: p.id,
      name: p.name,
      category: p.category || "General",
      price: priceNum,
      active: p.active,
      paidOrdersCount: paidOrdersCountForProd,
      unitsSold,
      revenue,
      uniqueBuyersCount,
    };
  });

  // 8. Format Product Pairs with attach rates
  const productPairs: MerchantGrowthSnapshot["productPairs"] = [];

  for (const [key, coPurchaserSet] of pairBuyersMap) {
    const [sourceId, targetId] = key.split(":");
    const sourceProd = productMap.get(sourceId);
    const targetProd = productMap.get(targetId);
    if (!sourceProd || !targetProd) continue;

    const sourceBuyersSet = productBuyersMap.get(sourceId);
    const sourceBuyersCount = sourceBuyersSet ? sourceBuyersSet.size : 0;
    if (sourceBuyersCount === 0) continue;

    const coPurchasersCount = coPurchaserSet.size;
    const sourceOnlyBuyersCount = Math.max(0, sourceBuyersCount - coPurchasersCount);
    const attachRate = Number((coPurchasersCount / sourceBuyersCount).toFixed(4));

    productPairs.push({
      sourceProductId: sourceId,
      sourceProductName: sourceProd.name,
      targetProductId: targetId,
      targetProductName: targetProd.name,
      sourceBuyersCount,
      coPurchasersCount,
      sourceOnlyBuyersCount,
      attachRate,
      targetPrice: targetProd.price,
    });
  }

  // Sort pairs by coPurchasersCount descending
  productPairs.sort((a, b) => b.coPurchasersCount - a.coPurchasersCount);

  return {
    merchantId: merchant.id,
    merchantName: merchant.name,
    currency: merchant.currency,
    generatedAt: new Date().toISOString(),
    customers: {
      total: totalCustomersCount,
      withPurchases: customerOrdersMap.size,
      repeatBuyers,
      oneTimeBuyers,
      dormantCount,
    },
    orders: {
      total: totalOrdersCount,
      paid: paidOrdersCount,
      failedOrCancelled: failedOrCancelledCount,
      totalRealizedRevenue,
      averageOrderValue,
    },
    products: productStats,
    productPairs,
  };
}
