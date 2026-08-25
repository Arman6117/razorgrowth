import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { GrowthActionStatus, GrowthActionType, OpportunityType, OpportunityStatus, AuditActor } from "../lib/generated/prisma/enums";
import { POST } from "../app/api/webhooks/razorpay/route";

const TEST_SECRET = "test_webhook_secret_razorgrowth_2026";

function generateSignature(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

async function runTests() {
  console.log("🧪 Starting RazorGrowth Webhook Integration & Edge Case Tests...\n");

  // Temporarily set RAZORPAY_WEBHOOK_SECRET for testing
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;

  try {
    // 1. Setup Test Data
    console.log("1️⃣ Setting up test merchant, product, opportunity, and GrowthAction...");
    const merchant = await prisma.merchant.findFirst();
    if (!merchant) {
      throw new Error("No merchant found in database. Run seed first.");
    }

    const bagProduct = await prisma.product.findFirst({
      where: { merchantId: merchant.id, name: { contains: "Bag", mode: "insensitive" } },
    });
    if (!bagProduct) {
      throw new Error("Laptop Bag product not found.");
    }

    const customer = await prisma.customer.findFirst({
      where: { merchantId: merchant.id },
    });
    if (!customer) {
      throw new Error("Customer not found.");
    }

    // Create a dedicated test opportunity and GrowthAction
    const testOpportunity = await prisma.opportunity.create({
      data: {
        merchantId: merchant.id,
        type: OpportunityType.CROSS_SELL,
        title: "Test Cross-Sell Opportunity: Laptop Bag",
        description: "Integration test cross-sell opportunity for webhook verification",
        targetProductId: bagProduct.id,
        confidence: 0.85,
        estimatedRevenue: Number(bagProduct.price),
        evidence: { test: true },
        status: OpportunityStatus.APPROVED,
      },
    });

    const testGrowthAction = await prisma.growthAction.create({
      data: {
        merchantId: merchant.id,
        opportunityId: testOpportunity.id,
        type: GrowthActionType.CREATE_PAYMENT_LINK,
        status: GrowthActionStatus.APPROVED,
        parameters: {
          customerId: customer.id,
          targetProductId: bagProduct.id,
          amountInRupees: Number(bagProduct.price),
          amountInPaise: Math.round(Number(bagProduct.price) * 100),
        },
      },
    });

    const paymentLinkId = `plink_test_${Date.now()}`;
    const amountInPaise = Math.round(Number(bagProduct.price) * 100);

    const validPayload = {
      entity: "event",
      account_id: "acc_test_razorgrowth",
      event: "payment_link.paid",
      contains: ["payment_link", "order", "payment"],
      payload: {
        payment_link: {
          entity: {
            id: paymentLinkId,
            entity: "payment_link",
            amount: amountInPaise,
            amount_paid: amountInPaise,
            currency: "INR",
            status: "paid",
            customer: {
              name: customer.name,
              email: customer.email,
            },
            notes: {
              merchantId: merchant.id,
              customerId: customer.id,
              targetProductId: bagProduct.id,
              opportunityId: testOpportunity.id,
              growthActionId: testGrowthAction.id,
            },
          },
        },
        payment: {
          entity: {
            id: `pay_test_${Date.now()}`,
            entity: "payment",
            amount: amountInPaise,
            currency: "INR",
            status: "captured",
            method: "upi",
          },
        },
        order: {
          entity: {
            id: `order_test_${Date.now()}`,
            entity: "order",
            amount: amountInPaise,
            amount_paid: amountInPaise,
            amount_due: 0,
            currency: "INR",
            status: "paid",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const validRawBody = JSON.stringify(validPayload);
    const validSignature = generateSignature(validRawBody, TEST_SECRET);

    // 2. Test Invalid Signature (Tampered Payload)
    console.log("2️⃣ Testing Invalid Signature Rejection...");
    const invalidSigReq = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "bad_signature_1234567890abcdef",
      },
      body: validRawBody,
    });

    const invalidSigRes = await POST(invalidSigReq);
    console.log(`   Status: ${invalidSigRes.status} (Expected: 400)`);
    if (invalidSigRes.status !== 400) {
      throw new Error(`Expected 400 for invalid signature, got ${invalidSigRes.status}`);
    }
    console.log("   ✅ Invalid signature successfully rejected.\n");

    // 3. Test Missing Signature
    console.log("3️⃣ Testing Missing Signature Header...");
    const missingSigReq = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: validRawBody,
    });

    const missingSigRes = await POST(missingSigReq);
    console.log(`   Status: ${missingSigRes.status} (Expected: 400)`);
    if (missingSigRes.status !== 400) {
      throw new Error(`Expected 400 for missing signature, got ${missingSigRes.status}`);
    }
    console.log("   ✅ Missing signature successfully rejected.\n");

    // 4. Test Valid Webhook Processing
    console.log("4️⃣ Testing Valid Webhook Processing...");
    const validReq = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": validSignature,
      },
      body: validRawBody,
    });

    const validRes = await POST(validReq);
    const validJson = await validRes.json();
    console.log(`   Status: ${validRes.status} (Expected: 200)`);
    console.log(`   Response:`, validJson);

    if (validRes.status !== 200 || validJson.status !== "processed") {
      throw new Error(`Expected 200 'processed', got ${validRes.status} ${JSON.stringify(validJson)}`);
    }

    // Verify Database State
    const updatedAction = await prisma.growthAction.findUnique({
      where: { id: testGrowthAction.id },
    });
    console.log(`   Updated GrowthAction Status: ${updatedAction?.status} (Expected: EXECUTED)`);
    console.log(`   Executed At: ${updatedAction?.executedAt}`);

    if (updatedAction?.status !== GrowthActionStatus.EXECUTED || !updatedAction?.executedAt) {
      throw new Error("GrowthAction was not updated to EXECUTED with executedAt timestamp");
    }

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        actionId: testGrowthAction.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    console.log(`   Created AuditEvent ID: ${auditEvent?.id}, Actor: ${auditEvent?.actor}`);
    if (!auditEvent || auditEvent.actor !== AuditActor.RAZORPAY) {
      throw new Error("AuditEvent was not recorded properly");
    }
    console.log("   ✅ Valid webhook successfully processed & DB state updated.\n");

    // 5. Test Idempotency (Duplicate Webhook Delivery)
    console.log("5️⃣ Testing Idempotency on Duplicate Webhook Delivery...");
    const duplicateReq = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": validSignature,
      },
      body: validRawBody,
    });

    const duplicateRes = await POST(duplicateReq);
    const duplicateJson = await duplicateRes.json();
    console.log(`   Status: ${duplicateRes.status} (Expected: 200)`);
    console.log(`   Response:`, duplicateJson);

    if (duplicateRes.status !== 200 || duplicateJson.status !== "already_processed") {
      throw new Error(`Expected 200 'already_processed', got ${duplicateRes.status} ${JSON.stringify(duplicateJson)}`);
    }

    const totalAudits = await prisma.auditEvent.count({
      where: { actionId: testGrowthAction.id, eventType: "PAYMENT_LINK_PAID" },
    });
    console.log(`   Total Audit Events for Action: ${totalAudits} (Expected: 1)`);
    if (totalAudits !== 1) {
      throw new Error(`Duplicate audit events created! Expected 1, found ${totalAudits}`);
    }
    console.log("   ✅ Idempotency verified: no duplicate actions or audit events.\n");

    // 6. Test Amount Mismatch / Business Validation Failure
    console.log("6️⃣ Testing Business Validation Failure (Amount Mismatch)...");
    const testAction2 = await prisma.growthAction.create({
      data: {
        merchantId: merchant.id,
        opportunityId: testOpportunity.id,
        type: GrowthActionType.CREATE_PAYMENT_LINK,
        status: GrowthActionStatus.APPROVED,
        parameters: {
          targetProductId: bagProduct.id,
        },
      },
    });

    const tamperedAmountPayload = {
      ...validPayload,
      payload: {
        ...validPayload.payload,
        payment_link: {
          entity: {
            ...validPayload.payload.payment_link.entity,
            id: `plink_mismatch_${Date.now()}`,
            amount: 5000, // ₹50 instead of ₹2,000 (200000 paise)
            amount_paid: 5000,
            notes: {
              ...validPayload.payload.payment_link.entity.notes,
              growthActionId: testAction2.id,
            },
          },
        },
      },
    };

    const tamperedAmountRaw = JSON.stringify(tamperedAmountPayload);
    const tamperedAmountSig = generateSignature(tamperedAmountRaw, TEST_SECRET);

    const mismatchReq = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": tamperedAmountSig,
      },
      body: tamperedAmountRaw,
    });

    const mismatchRes = await POST(mismatchReq);
    const mismatchJson = await mismatchRes.json();
    console.log(`   Status: ${mismatchRes.status} (Expected: 422)`);
    console.log(`   Response:`, mismatchJson);

    if (mismatchRes.status !== 422) {
      throw new Error(`Expected 422 for amount mismatch, got ${mismatchRes.status}`);
    }

    const action2Check = await prisma.growthAction.findUnique({
      where: { id: testAction2.id },
    });
    if (action2Check?.status !== GrowthActionStatus.APPROVED) {
      throw new Error("Action status should NOT be modified on validation failure");
    }
    console.log("   ✅ Amount mismatch safely rejected with 422, state unmodified.\n");

    // Clean up test records
    console.log("🧹 Cleaning up test records...");
    await prisma.auditEvent.deleteMany({ where: { actionId: { in: [testGrowthAction.id, testAction2.id] } } });
    await prisma.growthAction.deleteMany({ where: { id: { in: [testGrowthAction.id, testAction2.id] } } });
    await prisma.opportunity.delete({ where: { id: testOpportunity.id } });
    console.log("✅ Cleanup complete.\n");

    console.log("🎉 All Razorpay Webhook integration tests passed successfully!");
  } finally {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
  }
}

runTests()
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
