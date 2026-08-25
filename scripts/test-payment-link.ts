import { prisma } from "../lib/prisma";
import { analyzeCrossSell } from "../lib/analytics/cross-sell";
import { createPaymentLink } from "../lib/razorpay/payment-links";
import { handlePaymentLinkWebhook, RazorpayWebhookPayload } from "../lib/razorpay/webhooks";
import { RazorpayConfigError, RazorpayApiError } from "../lib/razorpay/client";
import {
  GrowthActionStatus,
  GrowthActionType,
  OpportunityType,
  OpportunityStatus,
} from "../lib/generated/prisma/enums";

async function main() {
  // 1. Load the demo merchant
  const merchant = await prisma.merchant.findFirst();

  if (!merchant) {
    console.error("❌ No merchant found in database. Please run seed first.");
    process.exit(1);
  }

  // 2. Discover eligible cross-sell opportunities
  const opportunities = await analyzeCrossSell(merchant.id);

  let customerId: string | undefined;
  let targetProductId: string | undefined;
  let targetProductName: string | undefined;
  let targetProductPrice: number | undefined;
  let sourceProductId: string | undefined;

  // Deliberately select a low-value target product from the existing demo catalog
  // (preferably "Laptop Bag", ₹2,000) instead of whichever highest-value opportunity is first
  // to avoid test mode maximum amount limits on single payment links.
  const targetOpportunity =
    opportunities.find(
      (opp) =>
        opp.targetProductName.toLowerCase().includes("laptop bag") &&
        opp.eligibleCustomerIds.length > 0
    ) ||
    opportunities.find(
      (opp) =>
        opp.targetProductName.toLowerCase().includes("bag") &&
        opp.eligibleCustomerIds.length > 0
    ) ||
    opportunities
      .filter((opp) => opp.eligibleCustomerIds.length > 0)
      .sort((a, b) => a.targetProductPrice - b.targetProductPrice)[0];

  if (targetOpportunity && targetOpportunity.eligibleCustomerIds.length > 0) {
    customerId = targetOpportunity.eligibleCustomerIds[0];
    targetProductId = targetOpportunity.targetProductId;
    targetProductName = targetOpportunity.targetProductName;
    targetProductPrice = targetOpportunity.targetProductPrice;
    sourceProductId = targetOpportunity.sourceProductId;
    console.log(
      `🎯 Selected cross-sell opportunity for target product: ${targetProductName} (₹${targetOpportunity.targetProductPrice})`
    );
  } else {
    // Fallback: pick any customer and a low-value active product (Laptop Bag preferred)
    const [customer, bagProduct, anyProduct] = await Promise.all([
      prisma.customer.findFirst({ where: { merchantId: merchant.id } }),
      prisma.product.findFirst({
        where: {
          merchantId: merchant.id,
          name: { contains: "Bag", mode: "insensitive" },
          active: true,
        },
      }),
      prisma.product.findFirst({
        where: { merchantId: merchant.id, active: true },
        orderBy: { price: "asc" },
      }),
    ]);

    const product = bagProduct || anyProduct;

    if (!customer || !product) {
      console.error("❌ Insufficient data: Merchant needs at least 1 customer and 1 active product.");
      process.exit(1);
    }

    customerId = customer.id;
    targetProductId = product.id;
    targetProductName = product.name;
    targetProductPrice = Number(product.price);
    sourceProductId = undefined;
    console.log(
      `🎯 Fallback selected low-value target product: ${targetProductName} (₹${Number(product.price)})`
    );
  }

  // 3. Ensure Opportunity record exists in database
  let opportunity = await prisma.opportunity.findFirst({
    where: {
      merchantId: merchant.id,
      type: OpportunityType.CROSS_SELL,
      targetProductId: targetProductId,
      sourceProductId: sourceProductId ?? null,
    },
  });

  if (!opportunity) {
    opportunity = await prisma.opportunity.create({
      data: {
        merchantId: merchant.id,
        type: OpportunityType.CROSS_SELL,
        title: targetOpportunity
          ? `Cross-sell: ${targetOpportunity.sourceProductName} → ${targetProductName}`
          : `Cross-sell: ${targetProductName}`,
        description: targetOpportunity
          ? `AI-discovered cross-sell opportunity for ${targetProductName} based on ${targetOpportunity.sourceProductName} purchase patterns`
          : `Cross-sell opportunity for ${targetProductName}`,
        sourceProductId: sourceProductId ?? null,
        targetProductId: targetProductId,
        confidence: targetOpportunity?.crossSellRate ?? 0.85,
        estimatedRevenue: targetOpportunity?.expectedRevenue ?? (targetProductPrice || 2000),
        evidence: targetOpportunity
          ? {
              sourceProductName: targetOpportunity.sourceProductName,
              targetProductName: targetOpportunity.targetProductName,
              sourceCustomers: targetOpportunity.sourceCustomers,
              customersTogether: targetOpportunity.customersTogether,
              eligibleCustomerCount: targetOpportunity.eligibleCustomerCount,
              crossSellRate: targetOpportunity.crossSellRate,
              expectedRevenue: targetOpportunity.expectedRevenue,
            }
          : { manualFallback: true },
        status: OpportunityStatus.APPROVED,
      },
    });
  }

  // 4. Create GrowthAction record with status PENDING_APPROVAL
  const growthAction = await prisma.growthAction.create({
    data: {
      merchantId: merchant.id,
      opportunityId: opportunity.id,
      type: GrowthActionType.CREATE_PAYMENT_LINK,
      status: GrowthActionStatus.PENDING_APPROVAL,
      parameters: {
        customerId,
        targetProductId,
        targetProductName,
        amountInRupees: targetProductPrice,
        amountInPaise: Math.round((targetProductPrice || 2000) * 100),
        description: `Cross-sell offer: ${targetProductName}`,
      },
    },
  });

  console.log(`📋 Created GrowthAction ID : ${growthAction.id} (Status: ${growthAction.status})`);
  console.log(`💡 Associated Opportunity ID: ${opportunity.id} (${opportunity.title})`);

  // 5. Create ONE Razorpay test-mode payment link with both opportunityId and growthActionId
  try {
    const result = await createPaymentLink({
      merchantId: merchant.id,
      customerId,
      targetProductId,
      opportunityId: opportunity.id,
      growthActionId: growthAction.id,
      description: `Cross-sell offer: ${targetProductName}`,
    });

    console.log("\n==================================================");
    console.log(" Razorpay Payment Link Created (Test Mode)");
    console.log("==================================================");
    console.log(`Payment Link ID : ${result.paymentLinkId}`);
    console.log(`Short URL       : ${result.shortUrl}`);
    console.log(`Amount          : ₹${result.amountInRupees.toFixed(2)} (${result.amountInPaise} paise)`);
    console.log(`Status          : ${result.status}`);
    console.log(`GrowthAction ID : ${growthAction.id}`);
    console.log(`Opportunity ID  : ${opportunity.id}`);
    console.log("Embedded Notes  :", JSON.stringify(result.notes, null, 2));
    console.log("==================================================\n");

    // 6. Verify end-to-end webhook correlation and execution flow
    console.log("🔄 Simulating payment_link.paid webhook event for verification...");
    const webhookPayload: RazorpayWebhookPayload = {
      entity: "event",
      account_id: "acc_test_razorgrowth",
      event: "payment_link.paid",
      contains: ["payment_link", "order", "payment"],
      payload: {
        payment_link: {
          entity: {
            id: result.paymentLinkId,
            entity: "payment_link",
            amount: result.amountInPaise,
            amount_paid: result.amountInPaise,
            currency: result.currency,
            status: "paid",
            short_url: result.shortUrl,
            customer: {
              name: result.customer.name,
              email: result.customer.email,
            },
            notes: result.notes,
          },
        },
        payment: {
          entity: {
            id: `pay_test_${Date.now()}`,
            entity: "payment",
            amount: result.amountInPaise,
            currency: result.currency,
            status: "captured",
            method: "upi",
            notes: result.notes,
          },
        },
        order: {
          entity: {
            id: `order_test_${Date.now()}`,
            entity: "order",
            amount: result.amountInPaise,
            amount_paid: result.amountInPaise,
            amount_due: 0,
            currency: result.currency,
            status: "paid",
            notes: result.notes,
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const webhookResult = await handlePaymentLinkWebhook(webhookPayload);
    if (!webhookResult.success) {
      throw new Error(`Webhook processing failed: ${webhookResult.error}`);
    }

    // 7. Verify updated DB state and audit event
    const updatedAction = await prisma.growthAction.findUnique({
      where: { id: growthAction.id },
    });

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        actionId: growthAction.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });

    console.log("\n==================================================");
    console.log(" End-to-End Verification Summary");
    console.log("==================================================");
    console.log(`GrowthAction ID : ${growthAction.id}`);
    console.log(`Opportunity ID  : ${opportunity.id}`);
    console.log(`Payment Link ID : ${result.paymentLinkId}`);
    console.log(`Payment URL     : ${result.shortUrl}`);
    console.log(`Final Status    : ${updatedAction?.status}`);
    console.log(
      `AuditEvent Done : ${auditEvent ? `Yes (ID: ${auditEvent.id}, Actor: ${auditEvent.actor})` : "No"}`
    );
    console.log("==================================================\n");

    if (updatedAction?.status !== GrowthActionStatus.EXECUTED) {
      throw new Error(
        `Expected GrowthAction status EXECUTED, but found ${updatedAction?.status}`
      );
    }

    if (!auditEvent) {
      throw new Error("Expected AuditEvent to be created for PAYMENT_LINK_PAID");
    }

    console.log("✅ Complete Cross-sell Opportunity → GrowthAction → Razorpay Payment Link → Webhook → EXECUTED → AuditEvent workflow verified successfully!\n");
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
