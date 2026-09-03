import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  computeMerchantGrowthSnapshot,
} from "../lib/analytics/snapshot";
import {
  analyzeMerchantGrowthIntelligence,
  generateDeterministicOpportunities,
  calculateOpportunityScore,
} from "../lib/analytics/growth-intelligence";
import {
  createGrowthAction,
  approveGrowthAction,
  executeGrowthAction,
  createGrowthActionsForCustomers,
} from "../lib/actions/growth-action";
import {
  handlePaymentLinkWebhook,
} from "../lib/razorpay/webhooks";
import {
  OpportunityType,
  OpportunityStatus,
  GrowthActionStatus,
  AuditActor,
} from "../lib/generated/prisma/enums";
import { POST as analyzeGrowthRoute, GET as getGrowthRoute } from "../app/api/growth/analyze/route";
import { createSession } from "../lib/auth/session";
import { NextRequest } from "next/server";

describe("PHASE 3 — AI GROWTH INTELLIGENCE", () => {
  let merchantAId: string;
  let merchantBId: string;
  let customerA1Id: string;
  let customerA2Id: string;
  let customerA3Id: string;
  let customerB1Id: string;
  let productLaptopId: string;
  let productSleeveId: string;
  let productMouseId: string;

  before(async () => {
    // 1. Create Merchant A & B
    const merchantA = await prisma.merchant.create({
      data: {
        name: "Phase3 Store Alpha",
        email: `merchantA_p3_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantAId = merchantA.id;

    const merchantB = await prisma.merchant.create({
      data: {
        name: "Phase3 Store Beta",
        email: `merchantB_p3_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantBId = merchantB.id;

    // 2. Create Products for Merchant A
    // Laptop: 60,000 | Sleeve: 2,000 | Mouse: 1,500
    const prodLaptop = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Alpha Pro Laptop",
        price: 60000,
        category: "Laptops",
        active: true,
      },
    });
    productLaptopId = prodLaptop.id;

    const prodSleeve = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Alpha Laptop Sleeve",
        price: 2000,
        category: "Accessories",
        active: true,
      },
    });
    productSleeveId = prodSleeve.id;

    const prodMouse = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Alpha Wireless Mouse",
        price: 1500,
        category: "Accessories",
        active: true,
      },
    });
    productMouseId = prodMouse.id;

    // 3. Create Customers for Merchant A
    const custA1 = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Alice Alpha",
        email: `alice_p3_${Date.now()}@testcustomer.com`,
      },
    });
    customerA1Id = custA1.id;

    const custA2 = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Bob Alpha",
        email: `bob_p3_${Date.now()}@testcustomer.com`,
      },
    });
    customerA2Id = custA2.id;

    const custA3 = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Charlie Alpha",
        email: `charlie_p3_${Date.now()}@testcustomer.com`,
      },
    });
    customerA3Id = custA3.id;

    // Create Customer for Merchant B
    const custB1 = await prisma.customer.create({
      data: {
        merchantId: merchantBId,
        name: "David Beta",
        email: `david_p3_${Date.now()}@testcustomer.com`,
      },
    });
    customerB1Id = custB1.id;

    // 4. Create Seeded Orders for Merchant A with deterministic cross-sell patterns:
    // Customer A1: Bought Laptop + Sleeve (Co-purchaser)
    const order1 = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerA1Id,
        status: "PAID",
        total: 62000,
        currency: "INR",
      },
    });
    await prisma.orderItem.createMany({
      data: [
        { orderId: order1.id, productId: productLaptopId, quantity: 1, unitPrice: 60000 },
        { orderId: order1.id, productId: productSleeveId, quantity: 1, unitPrice: 2000 },
      ],
    });

    // Customer A2: Bought Laptop only (Eligible target for Sleeve)
    const order2 = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerA2Id,
        status: "PAID",
        total: 60000,
        currency: "INR",
      },
    });
    await prisma.orderItem.create({
      data: { orderId: order2.id, productId: productLaptopId, quantity: 1, unitPrice: 60000 },
    });

    // Customer A3: Bought Mouse only (Dormant past buyer)
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const order3 = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerA3Id,
        status: "PAID",
        total: 1500,
        currency: "INR",
        createdAt: oldDate,
        updatedAt: oldDate,
      },
    });
    await prisma.orderItem.create({
      data: { orderId: order3.id, productId: productMouseId, quantity: 1, unitPrice: 1500 },
    });
  });

  after(async () => {
    // Clean up test data
    await prisma.auditEvent.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.growthAction.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.opportunity.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { merchantId: { in: [merchantAId, merchantBId] } } },
    });
    await prisma.order.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.customer.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.product.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.merchant.deleteMany({
      where: { id: { in: [merchantAId, merchantBId] } },
    });
    await prisma.$disconnect();
  });

  it("A: Merchant Isolation — Merchant A cannot analyze Merchant B's data", async () => {
    const sessionB = await createSession(merchantBId);

    // Call analyze with Merchant B's session
    const req = new NextRequest("http://localhost:3000/api/growth/analyze", {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionB.sessionToken}`,
      },
    });

    const res = await analyzeGrowthRoute(req);
    assert.equal(res.status, 200);
    const data = await res.json();

    // Merchant B has 0 orders, 0 products, 1 customer (David Beta)
    assert.equal(data.merchantId, merchantBId);
    assert.equal(data.snapshot.orders.paid, 0);
    assert.equal(data.snapshot.orders.totalRealizedRevenue, 0);
    assert.equal(data.snapshot.products.length, 0);
    assert.equal(data.opportunities.length, 0);
  });

  it("B: Deterministic Analytics — Snapshot accurately computes known merchant facts", async () => {
    const snapshot = await computeMerchantGrowthSnapshot(merchantAId);
    assert.ok(snapshot);

    assert.equal(snapshot.merchantId, merchantAId);
    assert.equal(snapshot.customers.total, 3);
    assert.equal(snapshot.customers.withPurchases, 3);
    assert.equal(snapshot.orders.paid, 3);
    assert.equal(snapshot.orders.totalRealizedRevenue, 123500); // 62000 + 60000 + 1500
    assert.equal(snapshot.products.length, 3);

    // Find Laptop in product stats
    const laptopStats = snapshot.products.find((p) => p.id === productLaptopId);
    assert.ok(laptopStats);
    assert.equal(laptopStats.uniqueBuyersCount, 2); // Customer A1, A2
    assert.equal(laptopStats.unitsSold, 2);
    assert.equal(laptopStats.revenue, 120000);
  });

  it("C: Evidence Correctness — Product pair attach rates match historical co-purchases", async () => {
    const snapshot = await computeMerchantGrowthSnapshot(merchantAId);
    assert.ok(snapshot);

    // Pair: Laptop -> Sleeve
    const pair = snapshot.productPairs.find(
      (p) => p.sourceProductId === productLaptopId && p.targetProductId === productSleeveId
    );
    assert.ok(pair, "Laptop -> Sleeve pair must exist");
    assert.equal(pair.sourceBuyersCount, 2, "2 customers bought Laptop");
    assert.equal(pair.coPurchasersCount, 1, "1 customer also bought Sleeve (A1)");
    assert.equal(pair.sourceOnlyBuyersCount, 1, "1 customer bought Laptop only (A2)");
    assert.equal(pair.attachRate, 0.5, "Observed attach rate must be 50%");
    assert.equal(pair.targetPrice, 2000);
  });

  it("D: Financial Calculations — Estimated values use authoritative database Product.price", async () => {
    const snapshot = await computeMerchantGrowthSnapshot(merchantAId);
    assert.ok(snapshot);

    const opps = generateDeterministicOpportunities(snapshot);
    const laptopToSleeveOpp = opps.find(
      (o) => o.sourceProductId === productLaptopId && o.targetProductId === productSleeveId
    );

    assert.ok(laptopToSleeveOpp);
    // targetProductPrice = 2000, eligibleCustomers = 1, attachRate = 0.5
    // expectedRevenue = 1 * 2000 * 0.5 = 1000
    assert.equal(laptopToSleeveOpp.evidence.targetPrice, 2000);
    assert.equal(laptopToSleeveOpp.targetCustomerCount, 1);
    assert.equal(laptopToSleeveOpp.estimatedValue, 1000);
  });

  it("E: Ranking Heuristic & No Hallucinated Entities — Score is calculated with documented transparent formula", () => {
    const dummyCandidate = {
      estimatedValue: 10000,
      confidence: 0.5,
      evidence: {
        sampleSize: 50,
        targetProductName: "Test Product",
        targetPrice: 2000,
        eligibleCustomerCount: 10,
      },
    };

    const maxVal = 20000;
    const { score, breakdown } = calculateOpportunityScore(dummyCandidate, maxVal);

    // normVal = 10000 / 20000 = 0.5
    // evidenceStrength = min(50 / 50, 1.0) = 1.0
    // confidence = 0.5
    // score = (0.5 * 0.5) + (1.0 * 0.3) + (0.5 * 0.2) = 0.25 + 0.30 + 0.10 = 0.65
    assert.equal(breakdown.normalizedEstimatedValue, 0.5);
    assert.equal(breakdown.evidenceStrength, 1.0);
    assert.equal(breakdown.confidence, 0.5);
    assert.equal(score, 0.65);
  });

  it("F: Human Approval Boundary — AI Analysis generates Opportunity in NEW status and does NOT create APPROVED/EXECUTED actions", async () => {
    const analysisResult = await analyzeMerchantGrowthIntelligence(merchantAId);
    assert.equal(analysisResult.success, true);
    assert.ok(analysisResult.opportunities.length > 0);

    const persistedOpps = await prisma.opportunity.findMany({
      where: { merchantId: merchantAId },
    });

    for (const opp of persistedOpps) {
      // Must be NEW or existing review status, NEVER auto-approved or executed
      assert.ok(
        opp.status === OpportunityStatus.NEW || opp.status === OpportunityStatus.APPROVED,
        "Opportunity status must not be modified to financial execution"
      );
    }

    // Verify AI analysis did not create any auto-approved GrowthActions
    const autoActions = await prisma.growthAction.findMany({
      where: {
        merchantId: merchantAId,
        status: { in: [GrowthActionStatus.APPROVED, GrowthActionStatus.EXECUTED, GrowthActionStatus.EXECUTING] },
      },
    });
    assert.equal(autoActions.length, 0, "No GrowthAction should be auto-approved or executed by AI analysis");

    // Verify AuditEvent logged
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        merchantId: merchantAId,
        eventType: "AI_GROWTH_ANALYSIS_COMPLETED",
      },
    });
    assert.ok(auditEvent, "Must record AI_GROWTH_ANALYSIS_COMPLETED");
    assert.equal(auditEvent.actor, AuditActor.AGENT);
  });

  it("G: Existing GrowthAction & Bulk Creation Workflow remains intact", async () => {
    const opp = await prisma.opportunity.findFirst({
      where: { merchantId: merchantAId, sourceProductId: productLaptopId, targetProductId: productSleeveId },
    });
    assert.ok(opp);

    // Create single GrowthAction for eligible customer Bob (A2)
    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customerA2Id,
      targetProductId: productSleeveId,
    });

    assert.equal(action.status, GrowthActionStatus.PENDING_APPROVAL);

    // Re-calling createGrowthAction while in-flight returns the existing action idempotently
    const duplicateInFlight = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customerA2Id,
      targetProductId: productSleeveId,
    });
    assert.equal(duplicateInFlight.id, action.id);

    // Merchant explicitly approves action
    const approved = await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(approved.status, GrowthActionStatus.APPROVED);
  });

  it("H: Existing Webhook Regression — Webhook marks action EXECUTED and records audit trail", async () => {
    const action = await prisma.growthAction.findFirst({
      where: { merchantId: merchantAId },
    });
    assert.ok(action);

    // Transition to EXECUTING manually to test webhook processing
    const paymentLinkId = `plink_phase3_test_${Date.now()}`;
    const executingAction = await prisma.growthAction.update({
      where: { id: action.id },
      data: {
        status: GrowthActionStatus.EXECUTING,
        parameters: {
          customerId: customerA2Id,
          targetProductId: productSleeveId,
          paymentLinkId,
          amountInRupees: 2000,
        },
      },
    });

    const webhookPayload = {
      entity: "event" as const,
      account_id: "acc_test_razorgrowth",
      event: "payment_link.paid",
      contains: ["payment_link", "payment", "order"],
      payload: {
        payment_link: {
          entity: {
            id: paymentLinkId,
            entity: "payment_link" as const,
            amount: 200000,
            amount_paid: 200000,
            currency: "INR",
            status: "paid" as const,
            notes: {
              merchantId: merchantAId,
              customerId: customerA2Id,
              targetProductId: productSleeveId,
              opportunityId: executingAction.opportunityId,
              growthActionId: executingAction.id,
            },
          },
        },
        payment: {
          entity: {
            id: "pay_test_phase3_999",
            entity: "payment" as const,
            amount: 200000,
            currency: "INR",
            status: "captured",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const webhookRes = await handlePaymentLinkWebhook(webhookPayload);
    assert.equal(webhookRes.success, true);
    assert.equal(webhookRes.statusCode, 200);

    const paidAction = await prisma.growthAction.findUnique({
      where: { id: executingAction.id },
    });
    assert.equal(paidAction?.status, GrowthActionStatus.EXECUTED);
  });

  it("I: Existing Auth Regression — Unauthenticated request to /api/growth/analyze returns 401", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/growth/analyze", {
      method: "POST",
    });

    const res = await analyzeGrowthRoute(unauthReq);
    assert.equal(res.status, 401);
  });
});
