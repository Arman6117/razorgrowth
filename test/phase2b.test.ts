import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  createGrowthAction,
  approveGrowthAction,
  executeGrowthAction,
  resendGrowthActionPaymentLink,
} from "../lib/actions/growth-action";
import {
  createPaymentLink,
  resendPaymentLinkNotification,
} from "../lib/razorpay/payment-links";
import {
  handlePaymentLinkWebhook,
  validateWebhookSignature,
} from "../lib/razorpay/webhooks";
import {
  GrowthActionStatus,
  GrowthActionType,
  OpportunityType,
  OpportunityStatus,
  AuditActor,
} from "../lib/generated/prisma/enums";
import { POST as resendRoute } from "../app/api/growth-actions/[id]/resend/route";
import { createSession } from "../lib/auth/session";
import { NextRequest } from "next/server";

describe("PHASE 2B — PAYMENT LINK DELIVERY + REVENUE LOOP", () => {
  let merchantAId: string;
  let merchantBId: string;
  let customerAId: string;
  let customerBId: string;
  let productA1Id: string;
  let productA2Id: string;
  let opportunityAId: string;

  let capturedRequests: Array<{ url: string; method: string; headers: Record<string, string>; body?: unknown }> = [];
  const originalFetch = globalThis.fetch;

  before(async () => {
    // Intercept Razorpay API calls to test payload verification & handle test mode rate limits hermetically
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("api.razorpay.com")) {
        const method = init?.method || "GET";
        const headers = (init?.headers as Record<string, string>) || {};
        const bodyText = typeof init?.body === "string" ? init.body : undefined;
        let parsedBody: unknown;
        try {
          if (bodyText) parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = bodyText;
        }

        capturedRequests.push({ url, method, headers, body: parsedBody });

        // Handle POST /v1/payment_links
        if (url.includes("/payment_links") && !url.includes("/notify_by") && method === "POST") {
          const b = parsedBody as Record<string, any>;
          const linkId = `plink_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
            JSON.stringify({
              success: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      return originalFetch(input, init);
    }) as typeof globalThis.fetch;

    // 1. Create Merchant A
    const merchantA = await prisma.merchant.create({
      data: {
        name: "Test Merchant A",
        email: `merchantA_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantAId = merchantA.id;

    // 2. Create Merchant B
    const merchantB = await prisma.merchant.create({
      data: {
        name: "Test Merchant B",
        email: `merchantB_${Date.now()}@test.local`,
        currency: "INR",
      },
    });
    merchantBId = merchantB.id;

    // 3. Create Products for Merchant A
    const productA1 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Source Laptop Pro",
        price: 45000,
        category: "Computers",
        active: true,
      },
    });
    productA1Id = productA1.id;

    const productA2 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Target Laptop Sleeve",
        price: 1500,
        category: "Accessories",
        active: true,
      },
    });
    productA2Id = productA2.id;

    // 4. Create Customers
    const customerA = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Alice Developer",
        email: `alice_${Date.now()}@testcustomer.com`,
      },
    });
    customerAId = customerA.id;

    const customerB = await prisma.customer.create({
      data: {
        merchantId: merchantBId,
        name: "Bob Buyer",
        email: `bob_${Date.now()}@testcustomer.com`,
      },
    });
    customerBId = customerB.id;

    // 5. Create PAID Order for Customer A containing Product A1
    const orderA = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerAId,
        status: "PAID",
        total: 45000,
        currency: "INR",
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: orderA.id,
        productId: productA1Id,
        quantity: 1,
        unitPrice: 45000,
      },
    });

    // 6. Create Opportunity for Merchant A
    const opportunityA = await prisma.opportunity.create({
      data: {
        merchantId: merchantAId,
        type: OpportunityType.CROSS_SELL,
        title: "Cross-sell: Laptop -> Sleeve",
        description: "Test cross-sell opportunity",
        sourceProductId: productA1Id,
        targetProductId: productA2Id,
        confidence: 0.35,
        estimatedRevenue: 15000,
        evidence: {},
        status: OpportunityStatus.APPROVED,
      },
    });
    opportunityAId = opportunityA.id;
  });

  after(async () => {
    // Restore fetch
    globalThis.fetch = originalFetch;

    // Cleanup test data
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

  it("A & B & C: Payment Link creation enables Razorpay native email notification with server Customer record email & merchant credentials", async () => {
    capturedRequests = [];

    const plinkResult = await createPaymentLink({
      merchantId: merchantAId,
      customerId: customerAId,
      targetProductId: productA2Id,
      opportunityId: opportunityAId,
    });

    assert.ok(plinkResult.paymentLinkId, "Should return a paymentLinkId");
    assert.ok(plinkResult.shortUrl, "Should return a shortUrl");
    assert.equal(plinkResult.amountInRupees, 1500);
    assert.equal(plinkResult.amountInPaise, 150000);
    assert.equal(plinkResult.currency, "INR");
    assert.equal(plinkResult.customer.name, "Alice Developer");
    assert.ok(plinkResult.customer.email.includes("alice_"), "Customer email must come from server record");

    // Inspect the exact payload sent to Razorpay API
    const createReq = capturedRequests.find((r) => r.url.endsWith("/payment_links") && r.method === "POST");
    assert.ok(createReq, "Should have called POST /v1/payment_links");
    const payload = createReq.body as Record<string, any>;

    assert.deepEqual(payload.notify, { sms: false, email: true }, "notify.email must be true and notify.sms must be false");
    assert.equal(payload.customer.email, plinkResult.customer.email);
    assert.equal(payload.customer.name, "Alice Developer");
    assert.equal(payload.amount, 150000);
    assert.equal(payload.currency, "INR");
    assert.equal(payload.accept_partial, false);
    assert.ok(createReq.headers["Authorization"], "Must include Authorization header with merchant credentials");
  });

  it("D: Delivery audit event (PAYMENT_LINK_DELIVERED) is recorded upon action execution with email notification", async () => {
    // 1. Create GrowthAction
    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opportunityAId,
      customerId: customerAId,
      targetProductId: productA2Id,
      sourceProductId: productA1Id,
    });

    assert.equal(action.status, GrowthActionStatus.PENDING_APPROVAL);

    // 2. Approve Action
    const approved = await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(approved.status, GrowthActionStatus.APPROVED);

    // 3. Execute Action
    const executedResult = await executeGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });

    assert.equal(executedResult.action.status, GrowthActionStatus.EXECUTING);
    assert.ok(executedResult.paymentLink.paymentLinkId);

    // 4. Verify AuditEvents
    const auditEvents = await prisma.auditEvent.findMany({
      where: { actionId: action.id },
      orderBy: { createdAt: "asc" },
    });

    const eventTypes = auditEvents.map((e) => e.eventType);
    assert.ok(eventTypes.includes("GROWTH_ACTION_CREATED"), "Must have GROWTH_ACTION_CREATED");
    assert.ok(eventTypes.includes("GROWTH_ACTION_APPROVED"), "Must have GROWTH_ACTION_APPROVED");
    assert.ok(eventTypes.includes("PAYMENT_LINK_CREATED"), "Must have PAYMENT_LINK_CREATED");
    assert.ok(eventTypes.includes("PAYMENT_LINK_DELIVERED"), "Must have PAYMENT_LINK_DELIVERED");

    const deliveryEvent = auditEvents.find((e) => e.eventType === "PAYMENT_LINK_DELIVERED");
    assert.ok(deliveryEvent);
    assert.equal(deliveryEvent.actor, AuditActor.RAZORPAY);

    const meta = deliveryEvent.metadata as Record<string, unknown>;
    assert.equal(meta.deliveryMedium, "EMAIL");
    assert.equal(meta.notificationRequested, true);
    assert.ok(meta.paymentLinkId);
    assert.ok(meta.shortUrl);
    assert.ok(meta.sentAt);
  });

  it("F: Merchant A cannot resend Merchant B's Payment Link (Merchant Isolation)", async () => {
    const action = await prisma.growthAction.findFirst({
      where: { merchantId: merchantAId },
    });
    assert.ok(action);

    await assert.rejects(
      async () => {
        await resendGrowthActionPaymentLink({
          merchantId: merchantBId, // Incorrect merchant
          actionId: action.id,
        });
      },
      /not found for merchant/
    );
  });

  it("G & H: Resend uses existing paymentLinkId and does NOT create a new Payment Link", async () => {
    capturedRequests = [];

    const actionBefore = await prisma.growthAction.findFirst({
      where: { merchantId: merchantAId, status: GrowthActionStatus.EXECUTING },
    });
    assert.ok(actionBefore);
    const paramsBefore = actionBefore.parameters as Record<string, unknown>;
    const originalPaymentLinkId = paramsBefore.paymentLinkId as string;
    const originalShortUrl = paramsBefore.shortUrl as string;

    assert.ok(originalPaymentLinkId);

    // Execute resend
    const resendResult = await resendGrowthActionPaymentLink({
      merchantId: merchantAId,
      actionId: actionBefore.id,
      medium: "email",
    });

    assert.equal(resendResult.success, true);

    // Verify endpoint called was POST /v1/payment_links/:id/notify_by/email
    const resendReq = capturedRequests.find((r) => r.url.includes(`/payment_links/${originalPaymentLinkId}/notify_by/email`));
    assert.ok(resendReq, "Must have called Razorpay notify_by/email endpoint");
    assert.equal(resendReq.method, "POST");

    // Verify NO new payment_link creation call was made
    const createReqs = capturedRequests.filter((r) => r.url.endsWith("/payment_links") && r.method === "POST");
    assert.equal(createReqs.length, 0, "Resend must NEVER create another Payment Link");

    const actionAfter = await prisma.growthAction.findUnique({
      where: { id: actionBefore.id },
    });
    assert.ok(actionAfter);
    const paramsAfter = actionAfter.parameters as Record<string, unknown>;

    // Verify SAME paymentLinkId and shortUrl (no new link created)
    assert.equal(paramsAfter.paymentLinkId, originalPaymentLinkId);
    assert.equal(paramsAfter.shortUrl, originalShortUrl);
    assert.equal(paramsAfter.resendCount, 1);
    assert.ok(paramsAfter.lastResentAt);

    // Verify PAYMENT_LINK_RESENT AuditEvent
    const resentEvent = await prisma.auditEvent.findFirst({
      where: {
        actionId: actionBefore.id,
        eventType: "PAYMENT_LINK_RESENT",
      },
    });

    assert.ok(resentEvent);
    assert.equal(resentEvent.actor, AuditActor.MERCHANT);
    const meta = resentEvent.metadata as Record<string, unknown>;
    assert.equal(meta.paymentLinkId, originalPaymentLinkId);
    assert.equal(meta.deliveryMedium, "EMAIL");
  });

  it("I: EXECUTED action cannot be resent", async () => {
    const executedAction = await prisma.growthAction.create({
      data: {
        merchantId: merchantAId,
        opportunityId: opportunityAId,
        type: GrowthActionType.CREATE_PAYMENT_LINK,
        status: GrowthActionStatus.EXECUTED,
        parameters: {
          customerId: customerAId,
          targetProductId: productA2Id,
          paymentLinkId: "plink_test_already_executed",
          amountInRupees: 1500,
        },
      },
    });

    await assert.rejects(
      async () => {
        await resendGrowthActionPaymentLink({
          merchantId: merchantAId,
          actionId: executedAction.id,
        });
      },
      /Cannot resend notification for already EXECUTED/
    );
  });

  it("L: payment_link.paid webhook confirms payment, marks action EXECUTED, and records PAYMENT_LINK_PAID", async () => {
    // Find the active EXECUTING action
    const action = await prisma.growthAction.findFirst({
      where: { merchantId: merchantAId, status: GrowthActionStatus.EXECUTING },
    });
    assert.ok(action);
    const params = action.parameters as Record<string, unknown>;
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
            amount: 150000,
            amount_paid: 150000,
            currency: "INR",
            status: "paid" as const,
            notes: {
              merchantId: merchantAId,
              customerId: customerAId,
              targetProductId: productA2Id,
              opportunityId: opportunityAId,
              growthActionId: action.id,
            },
          },
        },
        payment: {
          entity: {
            id: "pay_test_phase2b_123",
            entity: "payment" as const,
            amount: 150000,
            currency: "INR",
            status: "captured",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const result = await handlePaymentLinkWebhook(webhookPayload);
    assert.equal(result.success, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.isDuplicate, false);

    // Verify GrowthAction is now EXECUTED
    const updatedAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(updatedAction?.status, GrowthActionStatus.EXECUTED);
    assert.ok(updatedAction?.executedAt);

    // Verify PAYMENT_LINK_PAID AuditEvent
    const paidAudit = await prisma.auditEvent.findFirst({
      where: {
        actionId: action.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    assert.ok(paidAudit);
    assert.equal(paidAudit.actor, AuditActor.RAZORPAY);

    // Test Webhook Idempotency (Sending same webhook twice)
    const duplicateResult = await handlePaymentLinkWebhook(webhookPayload);
    assert.equal(duplicateResult.success, true);
    assert.equal(duplicateResult.isDuplicate, true);
  });

  it("J & K: Realized Revenue correctly aggregates completed actions while Pipeline Value remains separate", async () => {
    // Query all EXECUTED actions for Merchant A
    const executedActions = await prisma.growthAction.findMany({
      where: {
        merchantId: merchantAId,
        status: GrowthActionStatus.EXECUTED,
      },
      select: { parameters: true },
    });

    let totalRealizedRevenue = 0;
    for (const act of executedActions) {
      const p = act.parameters as Record<string, unknown> | null;
      const amount =
        typeof p?.amountInRupees === "number"
          ? p.amountInRupees
          : typeof p?.amountInPaise === "number"
          ? p.amountInPaise / 100
          : 0;
      totalRealizedRevenue += amount;
    }

    // Must be 3000 (1500 from the webhook executed action + 1500 from dummy executed action)
    assert.equal(totalRealizedRevenue, 3000);

    // Opportunity estimatedRevenue (pipeline value) is 15000 and remains distinct
    const opp = await prisma.opportunity.findUnique({
      where: { id: opportunityAId },
    });
    assert.equal(Number(opp?.estimatedRevenue), 15000);
    assert.notEqual(totalRealizedRevenue, Number(opp?.estimatedRevenue));
  });

  it("E: Resend endpoint /api/growth-actions/[id]/resend requires authentication and enforces merchant scoping", async () => {
    // 1. Test unauthenticated request -> 401
    const unauthReq = new NextRequest("http://localhost:3000/api/growth-actions/dummy-id/resend", {
      method: "POST",
    });
    const unauthRes = await resendRoute(unauthReq, { params: Promise.resolve({ id: "dummy-id" }) });
    assert.equal(unauthRes.status, 401);

    // 2. Create a dedicated customer Charlie with a PAID order for productA1
    const customerCharlie = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Charlie Customer",
        email: `charlie_${Date.now()}@testcustomer.com`,
      },
    });

    const orderCharlie = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: customerCharlie.id,
        status: "PAID",
        total: 45000,
        currency: "INR",
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: orderCharlie.id,
        productId: productA1Id,
        quantity: 1,
        unitPrice: 45000,
      },
    });

    // 3. Create an action for Charlie in EXECUTING state
    const actionA = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opportunityAId,
      customerId: customerCharlie.id,
      targetProductId: productA2Id,
    });
    await approveGrowthAction({ merchantId: merchantAId, actionId: actionA.id });
    await executeGrowthAction({ merchantId: merchantAId, actionId: actionA.id });

    // 3. Test with Merchant B's session -> 404 (Merchant B cannot access Merchant A's action)
    const sessionB = await createSession(merchantBId);
    const merchantBReq = new NextRequest(`http://localhost:3000/api/growth-actions/${actionA.id}/resend`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionB.sessionToken}`,
      },
    });
    const merchantBRes = await resendRoute(merchantBReq, { params: Promise.resolve({ id: actionA.id }) });
    assert.equal(merchantBRes.status, 404);

    // 4. Test with Merchant A's session -> 200 (Success)
    const sessionA = await createSession(merchantAId);
    const merchantAReq = new NextRequest(`http://localhost:3000/api/growth-actions/${actionA.id}/resend`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionA.sessionToken}`,
      },
    });
    const merchantARes = await resendRoute(merchantAReq, { params: Promise.resolve({ id: actionA.id }) });
    assert.equal(merchantARes.status, 200);
    const resData = await merchantARes.json();
    assert.equal(resData.success, true);
    assert.ok(resData.message.includes("resent successfully"));
  });
});
