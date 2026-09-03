import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  generateGrowthPlan,
  prepareGrowthPlanActions,
  resolveEligibleCustomersForOpportunity,
} from "../lib/agent/growth-planner";
import {
  approveGrowthAction,
  executeGrowthAction,
  createGrowthAction,
} from "../lib/actions/growth-action";
import {
  handlePaymentLinkWebhook,
} from "../lib/razorpay/webhooks";
import {
  OpportunityType,
  OpportunityStatus,
  GrowthActionStatus,
  GrowthActionType,
  AuditActor,
} from "../lib/generated/prisma/enums";
import { POST as planRoute, GET as getPlanRoute } from "../app/api/growth/plan/route";
import { createSession } from "../lib/auth/session";
import { NextRequest } from "next/server";

describe("PHASE 4 — AGENTIC GROWTH PLANNER", () => {
  let merchantAId: string;
  let merchantBId: string;
  let customerA1Id: string; // Alice (co-purchaser of Laptop + Sleeve)
  let customerA2Id: string; // Bob (bought Laptop only -> eligible for Sleeve)
  let customerA3Id: string; // Charlie (bought Laptop only -> eligible for Sleeve)
  let customerA4Id: string; // David (bought Mouse only -> ineligible for Sleeve cross-sell from Laptop)
  let customerB1Id: string; // Eve (Merchant B customer)
  let productLaptopId: string;
  let productSleeveId: string;
  let productMouseId: string;
  let productInactiveId: string;
  let opportunityAId: string;
  let opportunityBId: string;

  let capturedRazorpayRequests: Array<{ url: string; method: string; body?: unknown }> = [];
  const originalFetch = globalThis.fetch;

  before(async () => {
    // Intercept fetch to track Razorpay calls and mock payment link creation for execution tests
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("api.razorpay.com")) {
        const method = init?.method || "GET";
        const bodyText = typeof init?.body === "string" ? init.body : undefined;
        let parsedBody: unknown;
        try {
          if (bodyText) parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = bodyText;
        }

        capturedRazorpayRequests.push({ url, method, body: parsedBody });

        // Handle POST /v1/payment_links
        if (url.includes("/payment_links") && !url.includes("/notify_by") && method === "POST") {
          const b = parsedBody as Record<string, any>;
          const linkId = `plink_p4_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          return new Response(
            JSON.stringify({
              id: linkId,
              entity: "payment_link",
              amount: b.amount,
              amount_paid: 0,
              currency: b.currency || "INR",
              status: "created",
              description: b.description,
              short_url: `https://rzp.io/i/${linkId}`,
              customer: b.customer,
              notify: b.notify,
              created_at: Math.floor(Date.now() / 1000),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.includes("/notify_by/") && method === "POST") {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      return originalFetch(input, init);
    }) as typeof globalThis.fetch;

    // 1. Create Merchants
    const merchantA = await prisma.merchant.create({
      data: {
        name: "Phase4 Store Alpha",
        email: `merchantA_p4_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantAId = merchantA.id;

    const merchantB = await prisma.merchant.create({
      data: {
        name: "Phase4 Store Beta",
        email: `merchantB_p4_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantBId = merchantB.id;

    // 2. Create Products for Merchant A
    // Laptop: 50,000 | Sleeve: 2,500 | Mouse: 1,200 | Inactive: 3,000
    const prodLaptop = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Pro Laptop 15",
        price: 50000,
        category: "Laptops",
        active: true,
      },
    });
    productLaptopId = prodLaptop.id;

    const prodSleeve = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Pro Leather Sleeve",
        price: 2500,
        category: "Accessories",
        active: true,
      },
    });
    productSleeveId = prodSleeve.id;

    const prodMouse = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Pro Optical Mouse",
        price: 1200,
        category: "Accessories",
        active: true,
      },
    });
    productMouseId = prodMouse.id;

    const prodInactive = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Discontinued Bag",
        price: 3000,
        category: "Accessories",
        active: false,
      },
    });
    productInactiveId = prodInactive.id;

    // 3. Create Customers for Merchant A
    const custA1 = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Alice Alpha",
        email: `alice_p4_${Date.now()}@testcustomer.com`,
      },
    });
    customerA1Id = custA1.id;

    const custA2 = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Bob Alpha",
        email: `bob_p4_${Date.now()}@testcustomer.com`,
      },
    });
    customerA2Id = custA2.id;

    const custA3 = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Charlie Alpha",
        email: `charlie_p4_${Date.now()}@testcustomer.com`,
      },
    });
    customerA3Id = custA3.id;

    const custA4 = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "David Alpha",
        email: `david_p4_${Date.now()}@testcustomer.com`,
      },
    });
    customerA4Id = custA4.id;

    // Customer for Merchant B
    const custB1 = await prisma.customer.create({
      data: {
        merchantId: merchantBId,
        name: "Eve Beta",
        email: `eve_p4_${Date.now()}@testcustomer.com`,
      },
    });
    customerB1Id = custB1.id;

    // 4. Create Seeded PAID Orders for Merchant A:
    // Alice (A1): Bought Laptop + Sleeve (Co-purchaser -> Ineligible for Sleeve cross-sell)
    const order1 = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerA1Id,
        status: "PAID",
        total: 52500,
        currency: "INR",
      },
    });
    await prisma.orderItem.createMany({
      data: [
        { orderId: order1.id, productId: productLaptopId, quantity: 1, unitPrice: 50000 },
        { orderId: order1.id, productId: productSleeveId, quantity: 1, unitPrice: 2500 },
      ],
    });

    // Bob (A2): Bought Laptop only (Eligible target for Sleeve)
    const order2 = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerA2Id,
        status: "PAID",
        total: 50000,
        currency: "INR",
      },
    });
    await prisma.orderItem.create({
      data: { orderId: order2.id, productId: productLaptopId, quantity: 1, unitPrice: 50000 },
    });

    // Charlie (A3): Bought Laptop only (Eligible target for Sleeve)
    const order3 = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerA3Id,
        status: "PAID",
        total: 50000,
        currency: "INR",
      },
    });
    await prisma.orderItem.create({
      data: { orderId: order3.id, productId: productLaptopId, quantity: 1, unitPrice: 50000 },
    });

    // David (A4): Bought Mouse only (Ineligible target for Laptop -> Sleeve cross-sell)
    const order4 = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerA4Id,
        status: "PAID",
        total: 1200,
        currency: "INR",
      },
    });
    await prisma.orderItem.create({
      data: { orderId: order4.id, productId: productMouseId, quantity: 1, unitPrice: 1200 },
    });

    // 5. Create Opportunity for Merchant A (Laptop -> Sleeve)
    const oppA = await prisma.opportunity.create({
      data: {
        merchantId: merchantAId,
        type: OpportunityType.CROSS_SELL,
        title: "Cross-sell: Pro Laptop 15 → Pro Leather Sleeve",
        description: "Target Laptop buyers with matching leather sleeve",
        sourceProductId: productLaptopId,
        targetProductId: productSleeveId,
        confidence: 0.3333,
        estimatedRevenue: 1666.67,
        evidence: {
          sourceProductName: "Pro Laptop 15",
          targetProductName: "Pro Leather Sleeve",
          sourceCustomers: 3,
          customersTogether: 1,
          eligibleCustomerCount: 2,
          attachRate: 0.3333,
          targetPrice: 2500,
        },
        status: OpportunityStatus.NEW,
      },
    });
    opportunityAId = oppA.id;

    // Create Opportunity for Merchant B
    const oppB = await prisma.opportunity.create({
      data: {
        merchantId: merchantBId,
        type: OpportunityType.CROSS_SELL,
        title: "Beta Store Opportunity",
        description: "Merchant B private opportunity",
        confidence: 0.5,
        estimatedRevenue: 5000,
        evidence: {},
        status: OpportunityStatus.NEW,
      },
    });
    opportunityBId = oppB.id;
  });

  after(async () => {
    globalThis.fetch = originalFetch;

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

  it("A: Authentication — Unauthenticated request to /api/growth/plan returns 401", async () => {
    const unauthReq = new NextRequest("http://localhost:3000/api/growth/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: opportunityAId }),
    });

    const res = await planRoute(unauthReq);
    assert.equal(res.status, 401);
  });

  it("B: Merchant Isolation — Merchant B cannot plan against Merchant A's opportunity", async () => {
    const sessionB = await createSession(merchantBId);

    const req = new NextRequest("http://localhost:3000/api/growth/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionB.sessionToken}`,
      },
      body: JSON.stringify({ opportunityId: opportunityAId }), // Merchant A's opp
    });

    const res = await planRoute(req);
    assert.equal(res.status, 404, "Must reject cross-tenant opportunity access with 404");
    const data = await res.json();
    assert.ok(data.error.includes("not found") || data.error.includes("does not belong"));
  });

  it("C: Opportunity Ownership — Cannot plan using another merchant's Opportunity ID", async () => {
    await assert.rejects(
      async () => {
        await generateGrowthPlan({
          merchantId: merchantBId, // Merchant B attempting to access Merchant A's opportunity
          opportunityId: opportunityAId,
        });
      },
      /not found or does not belong/
    );
  });

  it("D: Deterministic Eligibility — Agent target population accurately resolves backend eligibility", async () => {
    const plan = await generateGrowthPlan({
      merchantId: merchantAId,
      opportunityId: opportunityAId,
    });

    assert.ok(plan);
    assert.equal(plan.strategy, "CROSS_SELL");
    assert.equal(plan.targetProductId, productSleeveId);
    assert.equal(plan.targetProductName, "Pro Leather Sleeve");

    // Exactly Bob (A2) and Charlie (A3) are eligible
    assert.equal(plan.eligibleCustomerCount, 2, "Must resolve exactly 2 eligible customers");
    assert.ok(plan.eligibleCustomerIds.includes(customerA2Id), "Bob must be in eligible customer IDs");
    assert.ok(plan.eligibleCustomerIds.includes(customerA3Id), "Charlie must be in eligible customer IDs");
    assert.equal(plan.eligibleCustomerIds.includes(customerA1Id), false, "Alice (co-purchaser) must NOT be eligible");
    assert.equal(plan.eligibleCustomerIds.includes(customerA4Id), false, "David (mouse only) must NOT be eligible");
  });

  it("E: No Hallucinated Entities — Invalid product/customer IDs cannot become actions", async () => {
    // 1. Attempting to create an action with a hallucinated customer ID rejects
    await assert.rejects(
      async () => {
        await createGrowthAction({
          merchantId: merchantAId,
          opportunityId: opportunityAId,
          customerId: "non_existent_cust_999",
        });
      },
      /Customer not found/
    );

    // 2. Planning an opportunity with an inactive target product rejects cleanly
    const inactiveOpp = await prisma.opportunity.create({
      data: {
        merchantId: merchantAId,
        type: OpportunityType.CROSS_SELL,
        title: "Inactive Product Opp",
        description: "Testing inactive product rejection",
        sourceProductId: productLaptopId,
        targetProductId: productInactiveId,
        confidence: 0.5,
        estimatedRevenue: 1000,
        evidence: {},
        status: OpportunityStatus.NEW,
      },
    });

    await assert.rejects(
      async () => {
        await generateGrowthPlan({
          merchantId: merchantAId,
          opportunityId: inactiveOpp.id,
        });
      },
      /inactive/
    );
  });

  it("F: Authoritative Price — Plan and action parameters use authoritative Product.price from DB", async () => {
    const plan = await generateGrowthPlan({
      merchantId: merchantAId,
      opportunityId: opportunityAId,
    });

    // Authoritative Sleeve price = 2500
    assert.equal(plan.targetProductPrice, 2500);
    assert.equal(plan.recommendedAction.amountInRupees, 2500);
    assert.equal(plan.recommendedAction.amountInPaise, 250000);
    assert.equal(plan.recommendedAction.currency, "INR");

    // Estimated value = 2 eligible * 2500 * confidence (0.3333) = ~1666.5
    const expectedValue = Number((2 * 2500 * plan.confidence).toFixed(2));
    assert.equal(plan.estimatedValue, expectedValue);
  });

  it("G: Human Approval Boundary — Agent preparation creates ONLY PENDING_APPROVAL actions", async () => {
    capturedRazorpayRequests = [];

    const prepResult = await prepareGrowthPlanActions({
      merchantId: merchantAId,
      opportunityId: opportunityAId,
    });

    assert.equal(prepResult.success, true);
    assert.equal(prepResult.createdCount, 2, "Must create 2 actions (Bob and Charlie)");
    assert.equal(prepResult.status, "PREPARED");

    // Verify all created actions in DB are strictly PENDING_APPROVAL
    const createdActions = await prisma.growthAction.findMany({
      where: {
        id: { in: prepResult.actionIds },
        merchantId: merchantAId,
      },
    });

    assert.equal(createdActions.length, 2);
    for (const act of createdActions) {
      assert.equal(
        act.status,
        GrowthActionStatus.PENDING_APPROVAL,
        "Agent prepared action MUST be in PENDING_APPROVAL status"
      );
      assert.equal(act.approvedAt, null, "Agent prepared action MUST NOT have approvedAt");
      assert.equal(act.executedAt, null, "Agent prepared action MUST NOT have executedAt");
    }

    // Verify AGENT_GROWTH_PLAN_CREATED and AGENT_GROWTH_ACTIONS_PREPARED AuditEvents
    const planAudit = await prisma.auditEvent.findFirst({
      where: {
        merchantId: merchantAId,
        eventType: "AGENT_GROWTH_PLAN_CREATED",
      },
    });
    assert.ok(planAudit, "Must record AGENT_GROWTH_PLAN_CREATED");
    assert.equal(planAudit.actor, AuditActor.AGENT);

    const prepAudit = await prisma.auditEvent.findFirst({
      where: {
        merchantId: merchantAId,
        eventType: "AGENT_GROWTH_ACTIONS_PREPARED",
      },
    });
    assert.ok(prepAudit, "Must record AGENT_GROWTH_ACTIONS_PREPARED");
    assert.equal(prepAudit.actor, AuditActor.AGENT);
    const meta = prepAudit.metadata as Record<string, unknown>;
    assert.equal(meta.createdCount, 2);
  });

  it("H: No Payment Link Creation — Agent planning and preparation must NOT call Razorpay Payment Link creation", () => {
    // Check that NO call to Razorpay payment links API occurred during planning/preparation
    const paymentLinkCreations = capturedRazorpayRequests.filter(
      (r) => r.url.endsWith("/payment_links") && r.method === "POST"
    );
    assert.equal(
      paymentLinkCreations.length,
      0,
      "Agent planning and preparation must NEVER call Razorpay Payment Link creation directly"
    );
  });

  it("I: Duplicate Safety — Repeated planning/preparation does not create duplicate equivalent GrowthActions", async () => {
    // Call prepareGrowthPlanActions a second time for the same opportunity
    const duplicateResult = await prepareGrowthPlanActions({
      merchantId: merchantAId,
      opportunityId: opportunityAId,
    });

    assert.equal(duplicateResult.success, true);
    assert.equal(duplicateResult.createdCount, 0, "Must create 0 new actions on repeated call");
    assert.equal(duplicateResult.duplicateCount, 2, "Must detect 2 duplicate active actions");

    // Total pending actions in DB must still be 2
    const totalPending = await prisma.growthAction.count({
      where: {
        merchantId: merchantAId,
        opportunityId: opportunityAId,
        status: GrowthActionStatus.PENDING_APPROVAL,
      },
    });
    assert.equal(totalPending, 2);
  });

  it("J: Existing Approval Flow — Prepared actions can be approved and executed by merchant", async () => {
    const action = await prisma.growthAction.findFirst({
      where: {
        merchantId: merchantAId,
        opportunityId: opportunityAId,
        status: GrowthActionStatus.PENDING_APPROVAL,
      },
    });
    assert.ok(action);

    // 1. Merchant explicitly approves action
    const approved = await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(approved.status, GrowthActionStatus.APPROVED);
    assert.ok(approved.approvedAt);

    // Verify GROWTH_ACTION_APPROVED AuditEvent has actor MERCHANT
    const approveAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: action.id,
        eventType: "GROWTH_ACTION_APPROVED",
      },
    });
    assert.ok(approveAudit);
    assert.equal(approveAudit.actor, AuditActor.MERCHANT);

    // 2. Merchant executes action (Creates Razorpay Payment Link)
    capturedRazorpayRequests = [];
    const executedResult = await executeGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(executedResult.action.status, GrowthActionStatus.EXECUTING);
    assert.ok(executedResult.paymentLink.paymentLinkId);

    // Verify 1 Razorpay payment link call occurred upon explicit merchant execution
    assert.equal(capturedRazorpayRequests.length, 1);
  });

  it("K: Existing Webhook — payment_link.paid webhook confirms payment and marks action EXECUTED", async () => {
    const executingAction = await prisma.growthAction.findFirst({
      where: {
        merchantId: merchantAId,
        opportunityId: opportunityAId,
        status: GrowthActionStatus.EXECUTING,
      },
    });
    assert.ok(executingAction);

    const params = executingAction.parameters as Record<string, unknown>;
    const paymentLinkId = params.paymentLinkId as string;

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
            amount: 250000,
            amount_paid: 250000,
            currency: "INR",
            status: "paid" as const,
            notes: {
              merchantId: merchantAId,
              customerId: params.customerId as string,
              targetProductId: productSleeveId,
              opportunityId: opportunityAId,
              growthActionId: executingAction.id,
            },
          },
        },
        payment: {
          entity: {
            id: "pay_test_p4_999",
            entity: "payment" as const,
            amount: 250000,
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
});
