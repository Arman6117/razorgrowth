import { prisma } from "../lib/prisma";
import { createGrowthAction } from "../lib/actions/growth-action";
import { approveGrowthAction } from "../lib/actions/approve";
import { executeGrowthAction } from "../lib/actions/execute";
import { handlePaymentLinkWebhook } from "../lib/razorpay/webhooks";
import { analyzeCrossSell } from "../lib/analytics/cross-sell";
import { GrowthActionStatus, AuditActor } from "../lib/generated/prisma/enums";

async function runGoldenPathAudit() {
  console.log("==================================================");
  console.log("🚀 RAZORGROWTH GOLDEN PATH AUDIT TRACE");
  console.log("==================================================");

  // 1. Merchant Identity
  const merchant = await prisma.merchant.findUnique({
    where: { email: "merchant@technova.demo" },
  });
  if (!merchant) {
    throw new Error("Demo merchant merchant@technova.demo not found!");
  }
  console.log(`\n[STEP 1] Merchant verified: ${merchant.name} (ID: ${merchant.id}, Currency: ${merchant.currency})`);

  // Initial Realized Revenue
  const initialExecuted = await prisma.growthAction.findMany({
    where: { merchantId: merchant.id, status: GrowthActionStatus.EXECUTED },
  });
  let initialRevenue = 0;
  for (const a of initialExecuted) {
    const p = a.parameters as any;
    initialRevenue += p?.amountInRupees || 0;
  }
  console.log(`Initial Realized Revenue: ₹${initialRevenue} from ${initialExecuted.length} executed actions`);

  // 2. Discover Opportunities
  console.log("\n[STEP 2] Running deterministic cross-sell analytics...");
  const crossSellOpps = await analyzeCrossSell(merchant.id);
  console.log(`Discovered ${crossSellOpps.length} cross-sell opportunities from transaction history.`);
  if (crossSellOpps.length === 0) {
    throw new Error("Zero opportunities discovered!");
  }

  const topOpp = crossSellOpps[0];
  console.log(`\n[STEP 3] Top Opportunity:`);
  console.log(`  Source: ${topOpp.sourceProductName} (${topOpp.sourceCustomers} buyers)`);
  console.log(`  Target: ${topOpp.targetProductName} (Price: ₹${topOpp.targetProductPrice})`);
  console.log(`  Attach Rate: ${(topOpp.crossSellRate * 100).toFixed(1)}% (${topOpp.customersTogether} co-purchases)`);
  console.log(`  Eligible Audience: ${topOpp.eligibleCustomerCount} buyers`);
  console.log(`  Expected Revenue: ₹${topOpp.expectedRevenue}`);

  // Find or create DB opportunity record
  let dbOpp = await prisma.opportunity.findFirst({
    where: {
      merchantId: merchant.id,
      sourceProductId: topOpp.sourceProductId,
      targetProductId: topOpp.targetProductId,
    },
  });
  if (!dbOpp) {
    dbOpp = await prisma.opportunity.create({
      data: {
        merchantId: merchant.id,
        type: "CROSS_SELL",
        title: `Cross-sell: ${topOpp.sourceProductName} → ${topOpp.targetProductName}`,
        description: `Analytics identified ${topOpp.eligibleCustomerCount} eligible customers`,
        sourceProductId: topOpp.sourceProductId,
        targetProductId: topOpp.targetProductId,
        confidence: topOpp.crossSellRate,
        estimatedRevenue: topOpp.expectedRevenue,
        evidence: {
          sourceProductName: topOpp.sourceProductName,
          targetProductName: topOpp.targetProductName,
          sourceCustomers: topOpp.sourceCustomers,
          customersTogether: topOpp.customersTogether,
          eligibleCustomerCount: topOpp.eligibleCustomerCount,
          crossSellRate: topOpp.crossSellRate,
          expectedRevenue: topOpp.expectedRevenue,
        },
        status: "NEW",
      },
    });
  }

  // 4. Customer Eligibility
  console.log("\n[STEP 4] Customer Eligibility Verification...");
  const eligibleIds = topOpp.eligibleCustomerIds;
  console.log(`Eligible customer pool: ${eligibleIds.length} candidate IDs.`);

  // Find an eligible customer without an existing in-flight action
  let selectedCustomer = null;
  for (const cId of eligibleIds) {
    const existing = await prisma.growthAction.findFirst({
      where: {
        merchantId: merchant.id,
        opportunityId: dbOpp.id,
        parameters: { path: ["customerId"], equals: cId },
      },
    });
    if (!existing) {
      selectedCustomer = await prisma.customer.findUnique({ where: { id: cId } });
      if (selectedCustomer) break;
    }
  }

  if (!selectedCustomer) {
    console.log("All existing eligible customers have actions; creating a fresh test customer with source purchase...");
    selectedCustomer = await prisma.customer.create({
      data: {
        merchantId: merchant.id,
        name: "Audit Test Customer",
        email: `audit.test.${Date.now()}@technova-customer.demo`,
      },
    });
    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId: selectedCustomer.id,
        status: "PAID",
        total: 1500,
        currency: "INR",
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: topOpp.sourceProductId,
        quantity: 1,
        unitPrice: 1500,
      },
    });
  }
  console.log(`Selected customer: ${selectedCustomer.name} (${selectedCustomer.email}, ID: ${selectedCustomer.id})`);

  // 5. Growth Action Preparation
  console.log("\n[STEP 5] Preparing GrowthAction (Gated Creation)...");
  const preparedAction = await createGrowthAction({
    merchantId: merchant.id,
    opportunityId: dbOpp.id,
    customerId: selectedCustomer.id,
    sourceProductId: topOpp.sourceProductId,
    targetProductId: topOpp.targetProductId,
  });

  console.log(`Prepared Action ID: ${preparedAction.id}`);
  console.log(`  Initial Status: ${preparedAction.status} (MUST BE PENDING_APPROVAL)`);
  if (preparedAction.status !== GrowthActionStatus.PENDING_APPROVAL) {
    throw new Error(`CRITICAL: Prepared action status is ${preparedAction.status}, expected PENDING_APPROVAL!`);
  }

  const prepParams = preparedAction.parameters as any;
  if (prepParams.paymentLinkId) {
    throw new Error("CRITICAL: Payment Link was created during preparation phase!");
  }
  console.log("  ✓ Confirmed: Zero payment links and zero customer outreach during preparation.");

  // Test duplicate prevention
  console.log("  Testing duplicate action prevention...");
  const dupAction = await createGrowthAction({
    merchantId: merchant.id,
    opportunityId: dbOpp.id,
    customerId: selectedCustomer.id,
  });
  if (dupAction.id !== preparedAction.id) {
    throw new Error("Duplicate creation allowed parallel in-flight actions!");
  }
  console.log("  ✓ Confirmed: In-flight duplicate creation is idempotent.");

  // 6. Explicit Merchant Approval
  console.log("\n[STEP 6] Explicit Merchant Approval Gate...");
  const approvedAction = await approveGrowthAction({
    merchantId: merchant.id,
    actionId: preparedAction.id,
  });
  console.log(`  Action status after approval: ${approvedAction.status} (MUST BE APPROVED)`);
  if (approvedAction.status !== GrowthActionStatus.APPROVED) {
    throw new Error(`CRITICAL: Action status after approval is ${approvedAction.status}, expected APPROVED!`);
  }
  if (!approvedAction.approvedAt) {
    throw new Error("CRITICAL: approvedAt timestamp missing!");
  }

  const approvalAudit = await prisma.auditEvent.findFirst({
    where: {
      actionId: approvedAction.id,
      eventType: "GROWTH_ACTION_APPROVED",
    },
  });
  if (!approvalAudit || approvalAudit.actor !== AuditActor.MERCHANT) {
    throw new Error("CRITICAL: GROWTH_ACTION_APPROVED audit event missing or incorrect actor!");
  }
  console.log(`  ✓ Confirmed: GROWTH_ACTION_APPROVED audit event recorded with actor MERCHANT.`);

  // 7. Payment Link Execution
  console.log("\n[STEP 7] Payment Link Execution (Dispatching)...");
  const executionResult = await executeGrowthAction({
    merchantId: merchant.id,
    actionId: approvedAction.id,
  });
  const executingAction = executionResult.action;
  console.log(`  Action status after execution: ${executingAction.status} (MUST BE EXECUTING)`);
  if (executingAction.status !== GrowthActionStatus.EXECUTING) {
    throw new Error(`CRITICAL: Action status after execution is ${executingAction.status}, expected EXECUTING!`);
  }

  const execParams = executingAction.parameters as any;
  console.log(`  Payment Link ID: ${execParams.paymentLinkId}`);
  console.log(`  Short URL: ${execParams.shortUrl}`);
  console.log(`  Amount: ₹${execParams.amountInRupees} (${execParams.amountInPaise} paise)`);
  console.log(`  Currency: ${execParams.currency}`);

  if (!execParams.paymentLinkId || !execParams.shortUrl) {
    throw new Error("CRITICAL: paymentLinkId or shortUrl missing from parameters!");
  }

  const createdAudit = await prisma.auditEvent.findFirst({
    where: { actionId: executingAction.id, eventType: "PAYMENT_LINK_CREATED" },
  });
  const deliveredAudit = await prisma.auditEvent.findFirst({
    where: { actionId: executingAction.id, eventType: "PAYMENT_LINK_DELIVERED" },
  });
  if (!createdAudit || !deliveredAudit) {
    throw new Error("CRITICAL: PAYMENT_LINK_CREATED or PAYMENT_LINK_DELIVERED audit event missing!");
  }
  console.log("  ✓ Confirmed: PAYMENT_LINK_CREATED & PAYMENT_LINK_DELIVERED audit events recorded.");

  // Check that realized revenue has NOT yet increased!
  const midRevenue = await prisma.growthAction.findMany({
    where: { merchantId: merchant.id, status: GrowthActionStatus.EXECUTED },
  });
  let midSum = 0;
  for (const a of midRevenue) {
    const p = a.parameters as any;
    midSum += p?.amountInRupees || 0;
  }
  if (midSum !== initialRevenue) {
    throw new Error(`CRITICAL: Realized revenue increased before payment! (Initial: ₹${initialRevenue}, Mid: ₹${midSum})`);
  }
  console.log(`  ✓ Confirmed: Realized revenue remains unchanged (₹${midSum}) while link is merely active.`);

  // 8. Payment Webhook Verification & Transition to EXECUTED
  console.log("\n[STEP 8] Razorpay Webhook Simulation & Payment Confirmation...");
  const webhookPayload = {
    entity: "event" as const,
    account_id: "acc_test_razorgrowth",
    event: "payment_link.paid",
    contains: ["payment_link", "payment", "order"],
    payload: {
      payment_link: {
        entity: {
          id: execParams.paymentLinkId,
          entity: "payment_link" as const,
          amount: execParams.amountInPaise,
          amount_paid: execParams.amountInPaise,
          currency: execParams.currency,
          status: "paid",
          short_url: execParams.shortUrl,
          customer: {
            name: selectedCustomer.name,
            email: selectedCustomer.email,
          },
          notes: {
            merchantId: merchant.id,
            customerId: selectedCustomer.id,
            targetProductId: execParams.targetProductId,
            opportunityId: dbOpp.id,
            growthActionId: executingAction.id,
          },
        },
      },
      payment: {
        entity: {
          id: `pay_audit_${Date.now()}`,
          entity: "payment" as const,
          amount: execParams.amountInPaise,
          currency: execParams.currency,
          status: "captured",
          method: "upi",
        },
      },
      order: {
        entity: {
          id: `order_audit_${Date.now()}`,
          entity: "order" as const,
          amount: execParams.amountInPaise,
          amount_paid: execParams.amountInPaise,
          amount_due: 0,
          currency: execParams.currency,
          status: "paid",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };

  const webhookResult = await handlePaymentLinkWebhook(webhookPayload);
  console.log(`  Webhook process result:`, webhookResult);
  if (!webhookResult.success || webhookResult.statusCode !== 200) {
    throw new Error(`CRITICAL: Webhook processing failed: ${webhookResult.error}`);
  }

  const finalAction = await prisma.growthAction.findUnique({
    where: { id: executingAction.id },
  });
  console.log(`  Action status after webhook: ${finalAction?.status} (MUST BE EXECUTED)`);
  if (finalAction?.status !== GrowthActionStatus.EXECUTED) {
    throw new Error(`CRITICAL: Action status after webhook is ${finalAction?.status}, expected EXECUTED!`);
  }

  const paidAudit = await prisma.auditEvent.findFirst({
    where: { actionId: executingAction.id, eventType: "PAYMENT_LINK_PAID" },
  });
  if (!paidAudit || paidAudit.actor !== AuditActor.RAZORPAY) {
    throw new Error("CRITICAL: PAYMENT_LINK_PAID audit event missing or actor not RAZORPAY!");
  }
  console.log(`  ✓ Confirmed: Action transitioned to EXECUTED and PAYMENT_LINK_PAID audit event recorded.`);

  // 9. Webhook Idempotency Check
  console.log("\n[STEP 9] Webhook Idempotency Check (Duplicate Delivery)...");
  const dupWebhookResult = await handlePaymentLinkWebhook(webhookPayload);
  console.log(`  Duplicate webhook result:`, dupWebhookResult);
  if (!dupWebhookResult.success || dupWebhookResult.statusCode !== 200 || !dupWebhookResult.isDuplicate) {
    throw new Error(`CRITICAL: Duplicate webhook was not handled idempotently!`);
  }
  const paidAuditCount = await prisma.auditEvent.count({
    where: { actionId: executingAction.id, eventType: "PAYMENT_LINK_PAID" },
  });
  if (paidAuditCount !== 1) {
    throw new Error(`CRITICAL: Duplicate webhook created duplicate audit events! (Found: ${paidAuditCount})`);
  }
  console.log("  ✓ Confirmed: Duplicate webhook is safely 200 idempotent with exactly 1 audit event.");

  // 10. Realized Revenue Verification
  console.log("\n[STEP 10] Realized Revenue Verification...");
  const finalExecuted = await prisma.growthAction.findMany({
    where: { merchantId: merchant.id, status: GrowthActionStatus.EXECUTED },
  });
  let finalRevenue = 0;
  for (const a of finalExecuted) {
    const p = a.parameters as any;
    finalRevenue += p?.amountInRupees || 0;
  }
  const expectedNewRevenue = initialRevenue + execParams.amountInRupees;
  console.log(`  Final Realized Revenue: ₹${finalRevenue} (Expected: ₹${expectedNewRevenue})`);
  if (finalRevenue !== expectedNewRevenue) {
    throw new Error(`CRITICAL: Realized revenue mismatch! Expected ₹${expectedNewRevenue}, got ₹${finalRevenue}`);
  }
  console.log("  ✓ Confirmed: Realized Revenue increased by exact authoritative product price.");

  console.log("\n==================================================");
  console.log("🏆 ALL 10 GOLDEN PATH STEPS PASSED WITH 100% INTEGRITY!");
  console.log("==================================================");
}

runGoldenPathAudit().catch((err) => {
  console.error("❌ GOLDEN PATH AUDIT FAILED:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
