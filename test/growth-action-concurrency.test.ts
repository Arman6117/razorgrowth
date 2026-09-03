import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  createGrowthAction,
  approveGrowthAction,
  approveGrowthActionsForOpportunity,
  executeGrowthAction,
  rejectGrowthAction,
  resendGrowthActionPaymentLink,
  getGrowthAction,
} from "../lib/actions/growth-action";
import {
  GrowthActionStatus,
  OpportunityType,
  OpportunityStatus,
  AuditActor,
} from "../lib/generated/prisma/enums";

describe("GROWTH ACTION ATOMIC & RACE-SAFE STATE TRANSITIONS", () => {
  let merchantAId: string;
  let merchantBId: string;
  let productA1Id: string;
  let productA2Id: string;

  const originalFetch = globalThis.fetch;

  // Helper to create an isolated customer with paid source order
  async function createEligibleCustomer(name: string) {
    const customer = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      },
    });

    const order = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customer.id,
        status: "PAID",
        total: 50000,
        currency: "INR",
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: productA1Id,
        quantity: 1,
        unitPrice: 50000,
      },
    });

    return customer;
  }

  // Helper to create an isolated opportunity
  async function createTestOpportunity(title: string) {
    return prisma.opportunity.create({
      data: {
        merchantId: merchantAId,
        type: OpportunityType.CROSS_SELL,
        title,
        description: "Concurrency test opportunity",
        sourceProductId: productA1Id,
        targetProductId: productA2Id,
        confidence: 0.8,
        estimatedRevenue: 2000,
        evidence: {},
        status: OpportunityStatus.APPROVED,
      },
    });
  }

  before(async () => {
    // Intercept Razorpay API calls
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

        // Handle POST /v1/payment_links
        if (url.includes("/payment_links") && !url.includes("/notify_by") && method === "POST") {
          const b = parsedBody as Record<string, any>;
          const linkId = `plink_concurr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
              reminder_enable: b.reminder_enable,
              notes: b.notes,
              created_at: Math.floor(Date.now() / 1000),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // Handle POST /v1/payment_links/:id/notify_by/:medium
        if (url.includes("/notify_by/") && method === "POST") {
          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      return originalFetch(input, init);
    }) as typeof globalThis.fetch;

    // Create Merchants
    const merchantA = await prisma.merchant.create({
      data: {
        name: "Concurrency Test Merchant A",
        email: `concurr_merchantA_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantAId = merchantA.id;

    const merchantB = await prisma.merchant.create({
      data: {
        name: "Concurrency Test Merchant B",
        email: `concurr_merchantB_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantBId = merchantB.id;

    // Create Products
    const productA1 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Source Laptop",
        price: 50000,
        category: "Computers",
        active: true,
      },
    });
    productA1Id = productA1.id;

    const productA2 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Target Mouse",
        price: 2000,
        category: "Accessories",
        active: true,
      },
    });
    productA2Id = productA2.id;
  });

  after(async () => {
    globalThis.fetch = originalFetch;

    // Cleanup
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

  it("A: Approval happy path (PENDING_APPROVAL -> APPROVED)", async () => {
    const customer = await createEligibleCustomer("Customer A");
    const opp = await createTestOpportunity("Opp A");

    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });
    assert.equal(action.status, GrowthActionStatus.PENDING_APPROVAL);

    const approved = await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(approved.status, GrowthActionStatus.APPROVED);

    const auditEvents = await prisma.auditEvent.findMany({
      where: { actionId: action.id, eventType: "GROWTH_ACTION_APPROVED" },
    });
    assert.equal(auditEvents.length, 1, "Exactly one approval audit event must be created");
  });

  it("B: Approval idempotency (APPROVED remains APPROVED without duplicate audit events)", async () => {
    const customer = await createEligibleCustomer("Customer B");
    const opp = await createTestOpportunity("Opp B");

    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    const firstApprove = await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(firstApprove.status, GrowthActionStatus.APPROVED);

    const initialAuditCount = await prisma.auditEvent.count({
      where: { actionId: action.id, eventType: "GROWTH_ACTION_APPROVED" },
    });
    assert.equal(initialAuditCount, 1);

    const secondApprove = await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(secondApprove.status, GrowthActionStatus.APPROVED);

    const finalAuditCount = await prisma.auditEvent.count({
      where: { actionId: action.id, eventType: "GROWTH_ACTION_APPROVED" },
    });
    assert.equal(finalAuditCount, 1, "Idempotent approval must not produce duplicate audit events");
  });

  it("C: Approval race — two simultaneous approval attempts for the same PENDING_APPROVAL action", async () => {
    const customer = await createEligibleCustomer("Customer C");
    const opp = await createTestOpportunity("Opp C");

    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    // Fire 2 concurrent approval requests simultaneously
    const results = await Promise.allSettled([
      approveGrowthAction({ merchantId: merchantAId, actionId: action.id }),
      approveGrowthAction({ merchantId: merchantAId, actionId: action.id }),
    ]);

    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "fulfilled");

    const finalAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(finalAction?.status, GrowthActionStatus.APPROVED);

    // Verify exactly ONE GROWTH_ACTION_APPROVED audit event was created
    const auditEvents = await prisma.auditEvent.findMany({
      where: { actionId: action.id, eventType: "GROWTH_ACTION_APPROVED" },
    });
    assert.equal(auditEvents.length, 1, "Race condition prevented: exactly ONE approval audit event created");
  });

  it("D: Execution happy path (APPROVED -> EXECUTING)", async () => {
    const customer = await createEligibleCustomer("Customer D");
    const opp = await createTestOpportunity("Opp D");

    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });

    const result = await executeGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });

    assert.equal(result.action.status, GrowthActionStatus.EXECUTING);
    assert.ok(result.paymentLink.paymentLinkId);

    const auditEvents = await prisma.auditEvent.findMany({
      where: { actionId: action.id },
    });
    const eventTypes = auditEvents.map((e) => e.eventType);
    assert.ok(eventTypes.includes("PAYMENT_LINK_CREATED"));
    assert.ok(eventTypes.includes("PAYMENT_LINK_DELIVERED"));
  });

  it("E: Retry happy path (FAILED -> EXECUTING with ACTION_RETRY audit event)", async () => {
    const customer = await createEligibleCustomer("Customer E");
    const opp = await createTestOpportunity("Opp E");

    const action = await prisma.growthAction.create({
      data: {
        merchantId: merchantAId,
        opportunityId: opp.id,
        type: "CREATE_PAYMENT_LINK",
        status: GrowthActionStatus.FAILED,
        parameters: {
          customerId: customer.id,
          targetProductId: productA2Id,
          sourceProductId: productA1Id,
          amountInRupees: 2000,
          amountInPaise: 200000,
          lastFailureReason: "Simulated past failure",
        },
      },
    });

    const result = await executeGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });

    assert.equal(result.action.status, GrowthActionStatus.EXECUTING);

    const retryAudit = await prisma.auditEvent.findFirst({
      where: { actionId: action.id, eventType: "ACTION_RETRY" },
    });
    assert.ok(retryAudit, "Must record ACTION_RETRY audit event on retry");
    assert.equal(retryAudit.actor, AuditActor.MERCHANT);
  });

  it("F: Execution race — two simultaneous execution attempts for the same APPROVED action", async () => {
    const customer = await createEligibleCustomer("Customer F");
    const opp = await createTestOpportunity("Opp F");

    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });

    // Execute simultaneously
    const results = await Promise.allSettled([
      executeGrowthAction({ merchantId: merchantAId, actionId: action.id }),
      executeGrowthAction({ merchantId: merchantAId, actionId: action.id }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "Exactly ONE execution must succeed");
    assert.equal(rejected.length, 1, "The racing execution must fail");

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    assert.match(
      rejectedReason.message,
      /Cannot execute GrowthAction in status 'EXECUTING'|already currently executing/,
      "Losing request fails with clean state error"
    );

    // Verify exactly ONE PAYMENT_LINK_CREATED audit event exists
    const createdAudits = await prisma.auditEvent.findMany({
      where: { actionId: action.id, eventType: "PAYMENT_LINK_CREATED" },
    });
    assert.equal(createdAudits.length, 1, "Exactly ONE payment link created");
  });

  it("G: Terminal protection — EXECUTED action cannot transition back or be executed/approved/rejected", async () => {
    const customer = await createEligibleCustomer("Customer G");
    const opp = await createTestOpportunity("Opp G");

    const action = await prisma.growthAction.create({
      data: {
        merchantId: merchantAId,
        opportunityId: opp.id,
        type: "CREATE_PAYMENT_LINK",
        status: GrowthActionStatus.EXECUTED,
        executedAt: new Date(),
        parameters: {
          customerId: customer.id,
          targetProductId: productA2Id,
          paymentLinkId: "plink_test_terminal_123",
          amountInRupees: 2000,
          amountInPaise: 200000,
        },
      },
    });

    // Attempt Execute on EXECUTED action
    await assert.rejects(
      async () => {
        await executeGrowthAction({ merchantId: merchantAId, actionId: action.id });
      },
      /Cannot execute GrowthAction '.*': action has already been EXECUTED/
    );

    // Attempt Approve on EXECUTED action
    await assert.rejects(
      async () => {
        await approveGrowthAction({ merchantId: merchantAId, actionId: action.id });
      },
      /Cannot approve GrowthAction in status 'EXECUTED'/
    );

    // Attempt Reject on EXECUTED action
    await assert.rejects(
      async () => {
        await rejectGrowthAction({ merchantId: merchantAId, actionId: action.id });
      },
      /Cannot reject GrowthAction in status 'EXECUTED'/
    );

    // Attempt Resend on EXECUTED action
    await assert.rejects(
      async () => {
        await resendGrowthActionPaymentLink({ merchantId: merchantAId, actionId: action.id });
      },
      /Cannot resend notification for already EXECUTED/
    );

    // Status remains EXECUTED
    const check = await prisma.growthAction.findUnique({ where: { id: action.id } });
    assert.equal(check?.status, GrowthActionStatus.EXECUTED);
  });

  it("H: Tenant isolation — Merchant B cannot transition Merchant A's actions", async () => {
    const customer = await createEligibleCustomer("Customer H");
    const opp = await createTestOpportunity("Opp H");

    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    // Merchant B attempts to approve Merchant A's action
    await assert.rejects(
      async () => {
        await approveGrowthAction({ merchantId: merchantBId, actionId: action.id });
      },
      /not found for merchant/
    );

    // Merchant B attempts to execute Merchant A's action
    await assert.rejects(
      async () => {
        await executeGrowthAction({ merchantId: merchantBId, actionId: action.id });
      },
      /not found for merchant/
    );

    // Merchant B attempts to reject Merchant A's action
    await assert.rejects(
      async () => {
        await rejectGrowthAction({ merchantId: merchantBId, actionId: action.id });
      },
      /not found for merchant/
    );

    // Action status remains unchanged in PENDING_APPROVAL
    const check = await prisma.growthAction.findUnique({ where: { id: action.id } });
    assert.equal(check?.status, GrowthActionStatus.PENDING_APPROVAL);
  });

  it("I: Bulk approval race — two simultaneous bulk approvals for same opportunity", async () => {
    const customer1 = await createEligibleCustomer("Bulk Cust 1");
    const customer2 = await createEligibleCustomer("Bulk Cust 2");
    const opp = await createTestOpportunity("Bulk Race Opp");

    const action1 = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer1.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    const action2 = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: customer2.id,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    // Run 2 simultaneous bulk approvals
    const [res1, res2] = await Promise.all([
      approveGrowthActionsForOpportunity({ merchantId: merchantAId, opportunityId: opp.id }),
      approveGrowthActionsForOpportunity({ merchantId: merchantAId, opportunityId: opp.id }),
    ]);

    const totalApproved = res1.approvedCount + res2.approvedCount;
    assert.equal(totalApproved, 2, "Across both racing calls, exactly 2 actions must be approved");

    // Check audit events count
    const audits = await prisma.auditEvent.findMany({
      where: {
        actionId: { in: [action1.id, action2.id] },
        eventType: "GROWTH_ACTION_APPROVED",
      },
    });
    assert.equal(audits.length, 2, "Exactly 2 audit events must be created, zero duplicate audits");
  });
});
