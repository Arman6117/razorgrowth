import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { analyzeCrossSell } from "../lib/analytics/cross-sell";
import {
  createGrowthAction,
  approveGrowthAction,
  executeGrowthAction,
  isCustomerEligible,
  getGrowthAction,
  duplicateActionCheck,
} from "../lib/actions/growth-action";
import {
  GrowthActionStatus,
  GrowthActionType,
  OpportunityType,
  OpportunityStatus,
  AuditActor,
} from "../lib/generated/prisma/enums";
import { POST as webhookPOST } from "../app/api/webhooks/razorpay/route";

const TEST_WEBHOOK_SECRET = "test_webhook_secret_razorgrowth_2026";

function generateSignature(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

async function runAllTests() {
  console.log("================================================================================");
  console.log(" 🚀 RazorGrowth: End-to-End GrowthAction Lifecycle & Safety Test Suite");
  console.log("================================================================================\n");

  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  const testActionIds: string[] = [];
  const testOpportunityIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // 0. Setup and Discover Data
    // -------------------------------------------------------------------------
    console.log("📦 Step 0: Loading merchant and discovering cross-sell opportunities...");
    const merchant = await prisma.merchant.findFirst();
    if (!merchant) {
      throw new Error("No merchant found. Run seed script first.");
    }
    console.log(`   Merchant: "${merchant.name}" (${merchant.id})\n`);

    const opportunities = await analyzeCrossSell(merchant.id);
    if (opportunities.length === 0) {
      throw new Error("No cross-sell opportunities discovered from analytics.");
    }

    // Select opportunity with low-value target product (Laptop Bag preferred) for test mode safety
    const targetOpp =
      opportunities.find(
        (o) =>
          o.targetProductName.toLowerCase().includes("laptop bag") &&
          o.eligibleCustomerIds.length > 0
      ) ||
      opportunities.find(
        (o) =>
          o.targetProductName.toLowerCase().includes("bag") &&
          o.eligibleCustomerIds.length > 0
      ) ||
      opportunities.find((o) => o.eligibleCustomerIds.length > 0)!;

    console.log(
      `   Selected Opportunity: ${targetOpp.sourceProductName} → ${targetOpp.targetProductName} (₹${targetOpp.targetProductPrice})`
    );
    console.log(`   Eligible customers count: ${targetOpp.eligibleCustomerCount}`);
    const eligibleCustomerId = targetOpp.eligibleCustomerIds[0];
    console.log(`   Selected eligible customer ID: ${eligibleCustomerId}\n`);

    // Create a dedicated test opportunity to ensure isolation and idempotency
    const testOpportunity = await prisma.opportunity.create({
      data: {
        merchantId: merchant.id,
        type: OpportunityType.CROSS_SELL,
        title: `Test Cross-sell: ${targetOpp.sourceProductName} → ${targetOpp.targetProductName}`,
        description: `AI-discovered cross-sell opportunity for ${targetOpp.targetProductName}`,
        sourceProductId: targetOpp.sourceProductId,
        targetProductId: targetOpp.targetProductId,
        confidence: targetOpp.crossSellRate,
        estimatedRevenue: targetOpp.expectedRevenue,
        evidence: {
          test: true,
          sourceProductName: targetOpp.sourceProductName,
          targetProductName: targetOpp.targetProductName,
          crossSellRate: targetOpp.crossSellRate,
          eligibleCustomerCount: targetOpp.eligibleCustomerCount,
        },
        status: OpportunityStatus.APPROVED,
      },
    });
    testOpportunityIds.push(testOpportunity.id);

    // -------------------------------------------------------------------------
    // 1. Test Ineligible Customer Rejection
    // -------------------------------------------------------------------------
    console.log("🛡️ Test 1: Ineligible Customer Rejection...");
    const buyerOfTargetProduct = await prisma.order.findFirst({
      where: {
        merchantId: merchant.id,
        status: "PAID",
        items: {
          some: {
            productId: targetOpp.targetProductId,
          },
        },
      },
      select: { customerId: true },
    });

    if (buyerOfTargetProduct) {
      const isEligible = await isCustomerEligible({
        merchantId: merchant.id,
        customerId: buyerOfTargetProduct.customerId,
        sourceProductId: targetOpp.sourceProductId,
        targetProductId: targetOpp.targetProductId,
      });

      if (isEligible) {
        throw new Error("Customer who bought target product was incorrectly evaluated as eligible!");
      }

      let errorThrown = false;
      try {
        await createGrowthAction({
          merchantId: merchant.id,
          opportunityId: testOpportunity.id,
          customerId: buyerOfTargetProduct.customerId,
          sourceProductId: targetOpp.sourceProductId,
          targetProductId: targetOpp.targetProductId,
        });
      } catch (err: unknown) {
        errorThrown = true;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`   ✅ Correctly rejected ineligible customer with message: "${msg}"`);
      }

      if (!errorThrown) {
        throw new Error("Expected createGrowthAction to throw for ineligible customer, but it succeeded.");
      }
    }
    console.log("   ✅ Ineligible customer rejection verified.\n");

    // -------------------------------------------------------------------------
    // 2. Test Eligible Customer → GrowthAction Created as PENDING_APPROVAL
    // -------------------------------------------------------------------------
    console.log("📝 Test 2: GrowthAction Creation (PENDING_APPROVAL)...");
    const createdAction = await createGrowthAction({
      merchantId: merchant.id,
      opportunityId: testOpportunity.id,
      customerId: eligibleCustomerId,
      sourceProductId: targetOpp.sourceProductId,
      targetProductId: targetOpp.targetProductId,
    });
    testActionIds.push(createdAction.id);

    console.log(`   Action ID : ${createdAction.id}`);
    console.log(`   Status    : ${createdAction.status} (Expected: PENDING_APPROVAL)`);
    console.log(`   Type      : ${createdAction.type}`);

    if (createdAction.status !== GrowthActionStatus.PENDING_APPROVAL) {
      throw new Error(`Expected status PENDING_APPROVAL, got ${createdAction.status}`);
    }

    // Verify AuditEvent for creation
    const createAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: createdAction.id,
        eventType: "GROWTH_ACTION_CREATED",
      },
    });
    if (!createAudit) {
      throw new Error("Missing GROWTH_ACTION_CREATED AuditEvent");
    }
    console.log(`   AuditEvent: Created (ID: ${createAudit.id}, Actor: ${createAudit.actor})`);
    console.log("   ✅ GrowthAction created as PENDING_APPROVAL with audit record.\n");

    // -------------------------------------------------------------------------
    // 3. Test Duplicate Action Reused/Prevented
    // -------------------------------------------------------------------------
    console.log("🔁 Test 3: Duplicate Action Prevention...");
    const duplicateAttempt = await createGrowthAction({
      merchantId: merchant.id,
      opportunityId: testOpportunity.id,
      customerId: eligibleCustomerId,
      sourceProductId: targetOpp.sourceProductId,
      targetProductId: targetOpp.targetProductId,
    });

    if (duplicateAttempt.id !== createdAction.id) {
      throw new Error(
        `Duplicate action check failed: created duplicate ID ${duplicateAttempt.id} instead of reusing ${createdAction.id}`
      );
    }
    console.log(`   ✅ Duplicate action reused existing action ID: ${duplicateAttempt.id}\n`);

    // -------------------------------------------------------------------------
    // 4. Test Invalid State Transitions
    // -------------------------------------------------------------------------
    console.log("🚫 Test 4: Invalid State Transition Rejection...");
    // Cannot execute PENDING_APPROVAL action
    let executionBlocked = false;
    try {
      await executeGrowthAction({
        merchantId: merchant.id,
        actionId: createdAction.id,
      });
    } catch (err: unknown) {
      executionBlocked = true;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   ✅ Correctly blocked premature execution: "${msg}"`);
    }

    if (!executionBlocked) {
      throw new Error("Expected executeGrowthAction to fail for PENDING_APPROVAL action");
    }
    console.log("   ✅ Premature execution guard verified.\n");

    // -------------------------------------------------------------------------
    // 5. Test Merchant Approval → APPROVED + AuditEvent
    // -------------------------------------------------------------------------
    console.log("👍 Test 5: Merchant Approval (APPROVED)...");
    const approvedAction = await approveGrowthAction({
      merchantId: merchant.id,
      actionId: createdAction.id,
    });

    console.log(`   Status     : ${approvedAction.status} (Expected: APPROVED)`);
    console.log(`   Approved At: ${approvedAction.approvedAt}`);

    if (approvedAction.status !== GrowthActionStatus.APPROVED || !approvedAction.approvedAt) {
      throw new Error(`Expected status APPROVED with approvedAt timestamp, got ${approvedAction.status}`);
    }

    // Verify AuditEvent for approval
    const approvalAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: createdAction.id,
        eventType: "GROWTH_ACTION_APPROVED",
      },
    });
    if (!approvalAudit || approvalAudit.actor !== AuditActor.MERCHANT) {
      throw new Error("Missing or invalid GROWTH_ACTION_APPROVED AuditEvent");
    }
    console.log(`   AuditEvent : Approved (ID: ${approvalAudit.id}, Actor: ${approvalAudit.actor})`);

    // Idempotent approval check
    const reApprove = await approveGrowthAction({
      merchantId: merchant.id,
      actionId: createdAction.id,
    });
    if (reApprove.status !== GrowthActionStatus.APPROVED) {
      throw new Error("Re-approval should idempotently return APPROVED action");
    }
    console.log("   ✅ Approval transition and audit trail verified.\n");

    // -------------------------------------------------------------------------
    // 6. Test Execution → Razorpay Payment Link Created (EXECUTING)
    // -------------------------------------------------------------------------
    console.log("💳 Test 6: Razorpay Payment Link Execution (EXECUTING)...");
    const executionResult = await executeGrowthAction({
      merchantId: merchant.id,
      actionId: createdAction.id,
    });

    const { action: executingAction, paymentLink } = executionResult;
    console.log(`   Status        : ${executingAction.status} (Expected: EXECUTING)`);
    console.log(`   Payment Link  : ${paymentLink.paymentLinkId}`);
    console.log(`   Short URL     : ${paymentLink.shortUrl}`);
    console.log(`   Amount        : ₹${paymentLink.amountInRupees} (${paymentLink.amountInPaise} paise)`);

    if (executingAction.status !== GrowthActionStatus.EXECUTING) {
      throw new Error(`Expected status EXECUTING, got ${executingAction.status}`);
    }
    if (!paymentLink.paymentLinkId || !paymentLink.shortUrl) {
      throw new Error("Payment link was not returned properly from Razorpay");
    }

    // Verify parameters stored payment link details
    const params = executingAction.parameters as Record<string, unknown>;
    if (params.paymentLinkId !== paymentLink.paymentLinkId || !params.shortUrl) {
      throw new Error("GrowthAction.parameters did not store payment link details");
    }

    // Verify AuditEvent for creation
    const paymentCreatedAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: createdAction.id,
        eventType: "PAYMENT_LINK_CREATED",
      },
    });
    if (!paymentCreatedAudit || paymentCreatedAudit.actor !== AuditActor.SYSTEM) {
      throw new Error("Missing or invalid PAYMENT_LINK_CREATED AuditEvent");
    }
    console.log(`   AuditEvent    : Link Created (ID: ${paymentCreatedAudit.id}, Actor: ${paymentCreatedAudit.actor})`);

    // Invalid transition checks on EXECUTING action:
    let reExecBlocked = false;
    try {
      await executeGrowthAction({ merchantId: merchant.id, actionId: createdAction.id });
    } catch (err) {
      reExecBlocked = true;
    }
    if (!reExecBlocked) throw new Error("Expected re-execution of EXECUTING action to be rejected");

    let approveExecutingBlocked = false;
    try {
      await approveGrowthAction({ merchantId: merchant.id, actionId: createdAction.id });
    } catch (err) {
      approveExecutingBlocked = true;
    }
    if (!approveExecutingBlocked) throw new Error("Expected approval of EXECUTING action to be rejected");
    console.log("   ✅ Payment link created and stored in parameters; state is EXECUTING.\n");

    // -------------------------------------------------------------------------
    // 7. Test Webhook Confirmation → EXECUTED + AuditEvent + Idempotency
    // -------------------------------------------------------------------------
    console.log("⚡ Test 7: Razorpay Webhook Confirmation (EXECUTED)...");
    const customer = await prisma.customer.findUnique({ where: { id: eligibleCustomerId } });

    const webhookPayload = {
      entity: "event",
      account_id: "acc_test_razorgrowth",
      event: "payment_link.paid",
      contains: ["payment_link", "order", "payment"],
      payload: {
        payment_link: {
          entity: {
            id: paymentLink.paymentLinkId,
            entity: "payment_link",
            amount: paymentLink.amountInPaise,
            amount_paid: paymentLink.amountInPaise,
            currency: "INR",
            status: "paid",
            customer: {
              name: customer?.name || "Test Customer",
              email: customer?.email || "test@example.com",
            },
            notes: {
              merchantId: merchant.id,
              customerId: eligibleCustomerId,
              targetProductId: targetOpp.targetProductId,
              opportunityId: testOpportunity.id,
              growthActionId: createdAction.id,
            },
          },
        },
        payment: {
          entity: {
            id: `pay_test_${Date.now()}`,
            entity: "payment",
            amount: paymentLink.amountInPaise,
            currency: "INR",
            status: "captured",
            method: "upi",
          },
        },
        order: {
          entity: {
            id: `order_test_${Date.now()}`,
            entity: "order",
            amount: paymentLink.amountInPaise,
            amount_paid: paymentLink.amountInPaise,
            amount_due: 0,
            currency: "INR",
            status: "paid",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const rawBody = JSON.stringify(webhookPayload);
    const signature = generateSignature(rawBody, TEST_WEBHOOK_SECRET);

    const webhookReq = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
      },
      body: rawBody,
    });

    const webhookRes = await webhookPOST(webhookReq);
    const webhookJson = await webhookRes.json();
    console.log(`   Webhook Status : ${webhookRes.status} (Expected: 200)`);
    console.log(`   Webhook Body   :`, webhookJson);

    if (webhookRes.status !== 200 || webhookJson.status !== "processed") {
      throw new Error(`Webhook failed: ${JSON.stringify(webhookJson)}`);
    }

    // Verify DB State
    const finalAction = await prisma.growthAction.findUnique({
      where: { id: createdAction.id },
    });
    console.log(`   Final Status   : ${finalAction?.status} (Expected: EXECUTED)`);
    console.log(`   Executed At    : ${finalAction?.executedAt}`);

    if (finalAction?.status !== GrowthActionStatus.EXECUTED || !finalAction?.executedAt) {
      throw new Error(`Expected status EXECUTED with executedAt timestamp, got ${finalAction?.status}`);
    }

    const paidAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: createdAction.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    if (!paidAudit || paidAudit.actor !== AuditActor.RAZORPAY) {
      throw new Error("Missing or invalid PAYMENT_LINK_PAID AuditEvent");
    }
    console.log(`   AuditEvent     : Payment Confirmed (ID: ${paidAudit.id}, Actor: ${paidAudit.actor})`);

    // Duplicate webhook idempotency
    const dupWebhookRes = await webhookPOST(
      new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": signature,
        },
        body: rawBody,
      })
    );
    const dupJson = await dupWebhookRes.json();
    console.log(`   Duplicate Webhook: Status ${dupWebhookRes.status}, Response:`, dupJson);
    if (dupWebhookRes.status !== 200 || dupJson.status !== "already_processed") {
      throw new Error("Expected already_processed on duplicate webhook");
    }
    console.log("   ✅ Webhook processed, action marked EXECUTED, idempotency confirmed.\n");

    // -------------------------------------------------------------------------
    // 8. Test Graceful Failure Handling
    // -------------------------------------------------------------------------
    console.log("⚠️ Test 8: Graceful Execution Failure Handling (FAILED)...");
    const inactiveProduct = await prisma.product.create({
      data: {
        merchantId: merchant.id,
        name: "Test Inactive Product",
        price: 1500,
        active: false,
      },
    });

    const failedTestOpp = await prisma.opportunity.create({
      data: {
        merchantId: merchant.id,
        type: OpportunityType.CROSS_SELL,
        title: "Test Inactive Opportunity",
        description: "Test",
        targetProductId: inactiveProduct.id,
        confidence: 0.9,
        estimatedRevenue: 1500,
        evidence: {},
      },
    });
    testOpportunityIds.push(failedTestOpp.id);

    const actionForFailure = await prisma.growthAction.create({
      data: {
        merchantId: merchant.id,
        opportunityId: failedTestOpp.id,
        type: GrowthActionType.CREATE_PAYMENT_LINK,
        status: GrowthActionStatus.APPROVED,
        parameters: {
          customerId: eligibleCustomerId,
          targetProductId: inactiveProduct.id,
        },
      },
    });
    testActionIds.push(actionForFailure.id);

    let caughtExecutionFailure = false;
    try {
      await executeGrowthAction({
        merchantId: merchant.id,
        actionId: actionForFailure.id,
      });
    } catch (err: unknown) {
      caughtExecutionFailure = true;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   ✅ Caught expected failure: "${msg}"`);
    }

    if (!caughtExecutionFailure) {
      throw new Error("Expected executeGrowthAction to fail on inactive product");
    }

    const failedActionCheck = await prisma.growthAction.findUnique({
      where: { id: actionForFailure.id },
    });
    console.log(`   Failed Action Status: ${failedActionCheck?.status} (Expected: FAILED)`);

    if (failedActionCheck?.status !== GrowthActionStatus.FAILED) {
      throw new Error(`Expected action status FAILED, got ${failedActionCheck?.status}`);
    }

    const failedAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: actionForFailure.id,
        eventType: "GROWTH_ACTION_FAILED",
      },
    });
    if (!failedAudit) {
      throw new Error("Missing GROWTH_ACTION_FAILED AuditEvent");
    }
    console.log(`   AuditEvent   : Failure Logged (ID: ${failedAudit.id}, Actor: ${failedAudit.actor})`);
    console.log("   ✅ Graceful failure handling verified.\n");

    // -------------------------------------------------------------------------
    // 8b. Test GrowthAction Retry Flow:
    // APPROVED -> EXECUTING -> FAILED -> RETRY -> EXECUTING -> EXECUTED
    // Also verify that EXECUTED cannot be executed again (idempotency guard).
    // -------------------------------------------------------------------------
    console.log("🔄 Test 8b: GrowthAction Retry Flow (APPROVED -> EXECUTING -> FAILED -> RETRY -> EXECUTING -> EXECUTED)...");

    // 1. Verify duplicateActionCheck does NOT treat FAILED as an active duplicate
    const activeDuplicate = await duplicateActionCheck({
      merchantId: merchant.id,
      opportunityId: failedTestOpp.id,
      customerId: eligibleCustomerId,
    });
    if (activeDuplicate) {
      throw new Error(
        `duplicateActionCheck incorrectly treated FAILED action ${actionForFailure.id} as active duplicate!`
      );
    }
    console.log("   ✅ Verified duplicateActionCheck does NOT block retry (FAILED is not an active duplicate).");

    // 2. Fix the guardrail condition (activate the product so retry can succeed)
    await prisma.product.update({
      where: { id: inactiveProduct.id },
      data: { active: true },
    });
    console.log("   ✅ Target product re-activated to allow valid execution.");

    // 3. Trigger Retry Execution on the FAILED action
    console.log(`   Retrying execution on GrowthAction ${actionForFailure.id} (Status: FAILED)...`);
    const retryExecutionResult = await executeGrowthAction({
      merchantId: merchant.id,
      actionId: actionForFailure.id,
      actor: AuditActor.MERCHANT,
    });

    // 4. Verify ACTION_RETRY AuditEvent was logged
    const retryAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: actionForFailure.id,
        eventType: "ACTION_RETRY",
      },
    });
    if (!retryAudit) {
      throw new Error("Missing ACTION_RETRY AuditEvent for retry attempt");
    }
    if (retryAudit.actor !== AuditActor.MERCHANT) {
      throw new Error(`Expected ACTION_RETRY actor to be MERCHANT, got ${retryAudit.actor}`);
    }
    console.log(`   AuditEvent   : Retry Logged (ID: ${retryAudit.id}, Actor: ${retryAudit.actor})`);

    // 5. Verify action transitioned to EXECUTING with generated payment link
    const actionAfterRetry = await prisma.growthAction.findUnique({
      where: { id: actionForFailure.id },
    });
    console.log(`   Status after Retry: ${actionAfterRetry?.status} (Expected: EXECUTING)`);
    if (actionAfterRetry?.status !== GrowthActionStatus.EXECUTING) {
      throw new Error(`Expected action status EXECUTING after retry, got ${actionAfterRetry?.status}`);
    }

    const retryParams = actionAfterRetry?.parameters as Record<string, unknown>;
    if (!retryParams?.paymentLinkId || !retryParams?.shortUrl) {
      throw new Error("Missing paymentLinkId or shortUrl in action parameters after retry");
    }
    console.log(`   Payment Link Created: ${retryParams.paymentLinkId} (${retryParams.shortUrl})`);

    // 6. Simulate Razorpay Webhook to complete execution and verify EXECUTED status
    console.log("   Sending verified Razorpay payment_link.paid webhook for retried link...");
    const retryWebhookPayload = {
      entity: "event",
      account_id: "acc_test_razorgrowth",
      event: "payment_link.paid",
      contains: ["payment_link", "order", "payment"],
      payload: {
        payment_link: {
          entity: {
            id: retryParams.paymentLinkId as string,
            entity: "payment_link",
            amount: retryParams.amountInPaise as number,
            amount_paid: retryParams.amountInPaise as number,
            currency: "INR",
            status: "paid",
            customer: {
              name: "Test Customer",
              email: "test@example.com",
            },
            notes: {
              merchantId: merchant.id,
              customerId: eligibleCustomerId,
              targetProductId: inactiveProduct.id,
              opportunityId: failedTestOpp.id,
              growthActionId: actionForFailure.id,
            },
          },
        },
        payment: {
          entity: {
            id: `pay_retry_${Date.now()}`,
            entity: "payment",
            amount: retryParams.amountInPaise as number,
            currency: "INR",
            status: "captured",
            method: "upi",
          },
        },
        order: {
          entity: {
            id: `order_retry_${Date.now()}`,
            entity: "order",
            amount: retryParams.amountInPaise as number,
            amount_paid: retryParams.amountInPaise as number,
            amount_due: 0,
            currency: "INR",
            status: "paid",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const retryRawBody = JSON.stringify(retryWebhookPayload);
    const retrySignature = generateSignature(retryRawBody, TEST_WEBHOOK_SECRET);

    const retryWebhookReq = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": retrySignature,
      },
      body: retryRawBody,
    });

    const retryWebhookRes = await webhookPOST(retryWebhookReq);
    const retryWebhookJson = await retryWebhookRes.json();
    if (retryWebhookRes.status !== 200 || retryWebhookJson.status !== "processed") {
      throw new Error(`Retry webhook failed: ${JSON.stringify(retryWebhookJson)}`);
    }

    // 7. Verify final DB state is EXECUTED with executedAt
    const retriedFinalAction = await prisma.growthAction.findUnique({
      where: { id: actionForFailure.id },
    });
    console.log(`   Final Retried Action Status: ${retriedFinalAction?.status} (Expected: EXECUTED)`);
    console.log(`   Executed At                : ${retriedFinalAction?.executedAt}`);

    if (retriedFinalAction?.status !== GrowthActionStatus.EXECUTED || !retriedFinalAction?.executedAt) {
      throw new Error(
        `Expected status EXECUTED with executedAt timestamp, got ${retriedFinalAction?.status}`
      );
    }

    // 8. Idempotency Protection: Verify that an already EXECUTED action CANNOT be executed again
    console.log("   Testing Idempotency: Attempting to re-execute already EXECUTED action...");
    let reExecuteBlocked = false;
    try {
      await executeGrowthAction({
        merchantId: merchant.id,
        actionId: actionForFailure.id,
      });
    } catch (err: unknown) {
      reExecuteBlocked = true;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   ✅ Correctly blocked re-execution of EXECUTED action: "${msg}"`);
    }

    if (!reExecuteBlocked) {
      throw new Error("Expected executeGrowthAction to reject already EXECUTED action");
    }

    console.log(
      "   ✅ Full Retry flow verified: APPROVED -> EXECUTING -> FAILED -> RETRY -> EXECUTING -> EXECUTED\n"
    );

    // Clean up inactive product
    await prisma.product.delete({ where: { id: inactiveProduct.id } });

    // -------------------------------------------------------------------------
    // 9. Inspect Full Audit Trail for Demonstration
    // -------------------------------------------------------------------------
    console.log("📜 Test 9: Complete Audit Trail for Verified Action:");
    const fullAction = await getGrowthAction({
      merchantId: merchant.id,
      actionId: createdAction.id,
    });

    console.table(
      fullAction?.auditEvents.map((evt) => ({
        "Event Type": evt.eventType,
        Actor: evt.actor,
        "Created At": evt.createdAt.toISOString(),
      }))
    );

    console.log("\n================================================================================");
    console.log(" 🎉 ALL TESTS PASSED: Full End-to-End GrowthAction Lifecycle Verified!");
    console.log("================================================================================\n");
  } finally {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;

    // Clean up created test actions and test opportunities
    console.log("🧹 Cleaning up test actions and audit records...");
    if (testActionIds.length > 0) {
      await prisma.auditEvent.deleteMany({ where: { actionId: { in: testActionIds } } });
      await prisma.growthAction.deleteMany({ where: { id: { in: testActionIds } } });
    }
    if (testOpportunityIds.length > 0) {
      await prisma.opportunity.deleteMany({ where: { id: { in: testOpportunityIds } } });
    }
    console.log("✅ Cleanup complete.\n");
    await prisma.$disconnect();
  }
}

runAllTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Test suite failed with error:", err);
    process.exit(1);
  });
