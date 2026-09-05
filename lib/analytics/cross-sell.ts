import { prisma } from "../prisma";

export interface CrossSellOpportunity {
  sourceProductId: string;
  sourceProductName: string;
  targetProductId: string;
  targetProductName: string;
  targetProductPrice: number;
  sourceCustomers: number;
  customersTogether: number;
  eligibleCustomerCount: number;
  eligibleCustomerIds: string[];
  crossSellRate: number;
  expectedRevenue: number;
}

export async function analyzeCrossSell(
  merchantId: string
): Promise<CrossSellOpportunity[]> {
  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      where: {
        merchantId,
        status: "PAID",
      },
      select: {
        customerId: true,
        items: {
          select: {
            productId: true,
          },
        },
      },
    }),
    prisma.product.findMany({
      where: {
        merchantId,
      },
      select: {
        id: true,
        name: true,
        price: true,
      },
    }),
  ]);

  const productMap = new Map<
    string,
    { id: string; name: string; price: number }
  >();
  for (const product of products) {
    productMap.set(product.id, {
      id: product.id,
      name: product.name,
      price: Number(product.price),
    });
  }

  const productCustomers = new Map<string, Set<string>>();
  const pairCustomers = new Map<string, Set<string>>();

  for (const order of orders) {
    for (const item of order.items) {
      const productId = item.productId;

      if (!productCustomers.has(productId)) {
        productCustomers.set(productId, new Set());
      }

      productCustomers.get(productId)!.add(order.customerId);
    }

    const productIds = [...new Set(order.items.map((item) => item.productId))];

    for (let i = 0; i < productIds.length; i++) {
      for (let j = i + 1; j < productIds.length; j++) {
        const productA = productIds[i];
        const productB = productIds[j];

        const keyAB = `${productA}:${productB}`;
        const keyBA = `${productB}:${productA}`;

        if (!pairCustomers.has(keyAB)) {
          pairCustomers.set(keyAB, new Set());
        }

        if (!pairCustomers.has(keyBA)) {
          pairCustomers.set(keyBA, new Set());
        }

        pairCustomers.get(keyAB)!.add(order.customerId);
        pairCustomers.get(keyBA)!.add(order.customerId);
      }
    }
  }

  const opportunities: CrossSellOpportunity[] = [];

  for (const [key, customers] of pairCustomers) {
    const [sourceProductId, targetProductId] = key.split(":");
    const sourceCustomerSet = productCustomers.get(sourceProductId);
    const sourceCustomers = sourceCustomerSet?.size ?? 0;

    if (sourceCustomers === 0) continue;

    const crossSellRate = Number((customers.size / sourceCustomers).toFixed(4));
    if (sourceCustomers < 20 || crossSellRate < 0.1) {
      continue;
    }

    const sourceProduct = productMap.get(sourceProductId);
    const targetProduct = productMap.get(targetProductId);

    if (!sourceProduct || !targetProduct) {
      continue;
    }

    const targetCustomerSet = productCustomers.get(targetProductId);

    // Eligible customers = source product buyers who have NOT purchased the target product
    const eligibleCustomerIds = Array.from(sourceCustomerSet!).filter(
      (customerId) => !targetCustomerSet?.has(customerId)
    );
    const eligibleCustomerCount = eligibleCustomerIds.length;

    // MVP formula: expectedRevenue = eligibleCustomerCount * targetProductPrice * crossSellRate
    const expectedRevenue = Number(
      (eligibleCustomerCount * targetProduct.price * crossSellRate).toFixed(2)
    );

    opportunities.push({
      sourceProductId,
      sourceProductName: sourceProduct.name,
      targetProductId,
      targetProductName: targetProduct.name,
      targetProductPrice: targetProduct.price,
      sourceCustomers,
      customersTogether: customers.size,
      eligibleCustomerCount,
      eligibleCustomerIds,
      crossSellRate,
      expectedRevenue,
    });
  }

  // Sort by expectedRevenue descending so highest value opportunities are first
  opportunities.sort((a, b) => b.expectedRevenue - a.expectedRevenue);

  return opportunities;
}
