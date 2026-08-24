import { prisma } from "../lib/prisma";
import { analyzeCrossSell } from "../lib/analytics/cross-sell";

async function main() {
  const merchant = await prisma.merchant.findFirst();

  if (!merchant) {
    console.error("❌ No merchant found in database. Please run seed first.");
    process.exit(1);
  }

  console.log(
    `\n🔍 Analyzing cross-sell opportunities for merchant: "${merchant.name}" (${merchant.id})\n`
  );

  const opportunities = await analyzeCrossSell(merchant.id);

  if (opportunities.length === 0) {
    console.log("No cross-sell opportunities met the threshold criteria.");
    return;
  }

  const tableData = opportunities.map((opp) => ({
    "Source Product": opp.sourceProductName,
    "Target Product": opp.targetProductName,
    "Source Customers": opp.sourceCustomers,
    "Customers Together": opp.customersTogether,
    "Eligible Customers": opp.eligibleCustomerCount,
    "Cross-sell Rate": `${(opp.crossSellRate * 100).toFixed(2)}%`,
    "Expected Revenue": `₹${opp.expectedRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }));

  console.table(tableData);

  console.log(`\n✨ Discovered ${opportunities.length} cross-sell opportunities.\n`);
}

main()
  .catch((err) => {
    console.error("Error executing cross-sell test:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });