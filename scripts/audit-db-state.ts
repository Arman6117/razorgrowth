import { prisma } from "../lib/prisma";

async function main() {
  const merchants = await prisma.merchant.findMany();
  console.log("=== MERCHANTS IN DATABASE ===");
  console.log(`Total merchants: ${merchants.length}`);
  for (const m of merchants) {
    console.log(`\n- Merchant ID: ${m.id}`);
    console.log(`  Name: ${m.name} | Email: ${m.email} | Currency: ${m.currency}`);
    const productCount = await prisma.product.count({ where: { merchantId: m.id } });
    const customerCount = await prisma.customer.count({ where: { merchantId: m.id } });
    const orderCount = await prisma.order.count({ where: { merchantId: m.id } });
    const paidOrderCount = await prisma.order.count({ where: { merchantId: m.id, status: "PAID" } });
    const oppCount = await prisma.opportunity.count({ where: { merchantId: m.id } });
    const actionCount = await prisma.growthAction.count({ where: { merchantId: m.id } });
    const executedActionCount = await prisma.growthAction.count({ where: { merchantId: m.id, status: "EXECUTED" } });
    const pendingActionCount = await prisma.growthAction.count({ where: { merchantId: m.id, status: "PENDING_APPROVAL" } });
    const approvedActionCount = await prisma.growthAction.count({ where: { merchantId: m.id, status: "APPROVED" } });
    const executingActionCount = await prisma.growthAction.count({ where: { merchantId: m.id, status: "EXECUTING" } });
    const auditEvents = await prisma.auditEvent.count({ where: { merchantId: m.id } });

    console.log(`  Products: ${productCount}`);
    console.log(`  Customers: ${customerCount}`);
    console.log(`  Orders: ${orderCount} (${paidOrderCount} PAID)`);
    console.log(`  Opportunities: ${oppCount}`);
    console.log(`  GrowthActions: ${actionCount} (Pending: ${pendingActionCount}, Approved: ${approvedActionCount}, Executing: ${executingActionCount}, Executed: ${executedActionCount})`);
    console.log(`  AuditEvents: ${auditEvents}`);

    // If opportunities exist, print top opportunity
    if (oppCount > 0) {
      const topOpp = await prisma.opportunity.findFirst({
        where: { merchantId: m.id },
        include: { sourceProduct: true, targetProduct: true },
        orderBy: { estimatedRevenue: "desc" },
      });
      if (topOpp && topOpp.sourceProduct && topOpp.targetProduct) {
        const evidence = topOpp.evidence as any;
        console.log(`  Top Opportunity: ${topOpp.sourceProduct.name} -> ${topOpp.targetProduct.name}`);
        console.log(`    Value: ₹${topOpp.estimatedRevenue} | Confidence: ${topOpp.confidence}`);
        console.log(`    Evidence:`, JSON.stringify(evidence));
      }
    }

    // Check realized revenue from EXECUTED actions
    const executedActions = await prisma.growthAction.findMany({
      where: { merchantId: m.id, status: "EXECUTED" },
    });
    let realizedSum = 0;
    for (const a of executedActions) {
      const p = a.parameters as any;
      if (p?.amountInRupees) realizedSum += p.amountInRupees;
    }
    console.log(`  Realized Revenue from EXECUTED actions: ₹${realizedSum}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
