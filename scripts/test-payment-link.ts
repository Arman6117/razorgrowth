import { prisma } from "../lib/prisma";
import { analyzeCrossSell } from "../lib/analytics/cross-sell";
import { createPaymentLink } from "../lib/razorpay/payment-links";
import { RazorpayConfigError, RazorpayApiError } from "../lib/razorpay/client";

async function main() {
  // 1. Load the demo merchant
  const merchant = await prisma.merchant.findFirst();

  if (!merchant) {
    console.error("❌ No merchant found in database. Please run seed first.");
    process.exit(1);
  }

  // 2. Discover an eligible cross-sell opportunity
  const opportunities = await analyzeCrossSell(merchant.id);

  let customerId: string | undefined;
  let targetProductId: string | undefined;
  let targetProductName: string | undefined;

  if (opportunities.length > 0 && opportunities[0].eligibleCustomerIds.length > 0) {
    const opp = opportunities[0];
    customerId = opp.eligibleCustomerIds[0];
    targetProductId = opp.targetProductId;
    targetProductName = opp.targetProductName;
  } else {
    // Fallback: pick any customer and active product for the merchant
    const [customer, product] = await Promise.all([
      prisma.customer.findFirst({ where: { merchantId: merchant.id } }),
      prisma.product.findFirst({ where: { merchantId: merchant.id, active: true } }),
    ]);

    if (!customer || !product) {
      console.error("❌ Insufficient data: Merchant needs at least 1 customer and 1 active product.");
      process.exit(1);
    }

    customerId = customer.id;
    targetProductId = product.id;
    targetProductName = product.name;
  }

  // 3. Create ONE Razorpay test-mode payment link
  try {
    const result = await createPaymentLink({
      merchantId: merchant.id,
      customerId,
      targetProductId,
      description: `Cross-sell offer: ${targetProductName}`,
    });

    console.log("\n==================================================");
    console.log(" Razorpay Payment Link Created (Test Mode)");
    console.log("==================================================");
    console.log(`Payment Link ID : ${result.paymentLinkId}`);
    console.log(`Short URL       : ${result.shortUrl}`);
    console.log(`Amount          : ₹${result.amountInRupees.toFixed(2)} (${result.amountInPaise} paise)`);
    console.log(`Status          : ${result.status}`);
    console.log("==================================================\n");
  } catch (error) {
    if (error instanceof RazorpayConfigError) {
      console.error("\n❌ Configuration Error:");
      console.error(`Missing required environment variable(s): ${error.missingVariables.join(", ")}`);
      console.error("Please add valid Razorpay test mode credentials to your .env file.\n");
      process.exit(1);
    }

    if (error instanceof RazorpayApiError) {
      console.error("\n❌ Razorpay API Error:");
      console.error(`HTTP Status : ${error.statusCode}`);
      console.error(`Code        : ${error.code || "N/A"}`);
      console.error(`Description : ${error.description || error.message}`);
      if (error.field) console.error(`Field       : ${error.field}`);
      console.error("");
      process.exit(1);
    }

    console.error("\n❌ Payment Link Creation Failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
