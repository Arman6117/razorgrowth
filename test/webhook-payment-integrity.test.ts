import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  handlePaymentLinkWebhook,
  RazorpayWebhookPayload,
} from "../lib/razorpay/webhooks";
import {
  createGrowthAction,
  approveGrowthAction,
  executeGrowthAction,
} from "../lib/actions/growth-action";
import {
  GrowthActionStatus,
  OpportunityType,
  OpportunityStatus,
} from "../lib/generated/prisma/enums";

describe("WEBHOOK PAYMENT INTEGRITY & IDEMPOTENCY", () => {
  let merchantAId: string;
  let merchantBId: string;
  let productA1Id: string;
  let productA2Id: string;
  let productBId: string;
  let oppAId: string;

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
        total: 500,
        currency: "INR",
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: productA1Id,
        quantity: 1,
        unitPrice: 500,
      },
    });

    return customer;
  }

  before(async () => {
    // Intercept Razorpay API calls
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("api.razorpay.com")) {
        const method = init?.method || "GET";
        const bodyText = typeof init?.body === "string" ? init.body : undefined;
        let parsedBody: any;
        try {
          if (bodyText) parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = bodyText;
        }

        if (url.includes("/payment_links") && !url.includes("/notify_by") && method === "POST") {
          const b = parsedBody || {};
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

        if (url.includes("/notify_by/") && method === "POST") {
          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      return originalFetch(input, init);
    }) as typeof globalThis.fetch;

    // 1. Create clean test merchants
    const merchantA = await prisma.merchant.create({
      data: {
        name: `Webhook Merchant A ${Date.now()}`,
        email: `merchant_a_webhook_${Date.now()}@test.com`,
        currency: "INR",
      },
    });
    merchantAId = merchantA.id;

    const merchantB = await prisma.merchant.create({
      data: {
        name: `Webhook Merchant B ${Date.now()}`,
        email: `merchant_b_webhook_${Date.now()}@test.com`,
        currency: "INR",
      },
    });
    merchantBId = merchantB.id;

    // 2. Create products for Merchant A and Merchant B
    const prodA1 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Pro Laptop Stand A1",
        price: 500,
        active: true,
      },
    });
    productA1Id = prodA1.id;

    const prodA2 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Ergonomic Keyboard A2",
        price: 1500,
        active: true,
      },
    });
    productA2Id = prodA2.id;

    const prodB = await prisma.product.create({
      data: {
        merchantId: merchantBId,
        name: "Merchant B Exclusive Widget",
        price: 2000,
        active: true,
      },
    });
    productBId = prodB.id;

    // 3. Create opportunity for Merchant A
    const oppA = await prisma.opportunity.create({
      data: {
        merchantId: merchantAId,
        sourceProductId: productA1Id,
        targetProductId: productA2Id,
        type: OpportunityType.CROSS_SELL,
        title: "Buy Stand, Get Keyboard",
        description: "Cross sell keyboard to stand buyers",
        status: OpportunityStatus.APPROVED,
        confidence: 0.8,
        estimatedRevenue: 1500,
        evidence: {},
      },
    });
    oppAId = oppA.id;
  });

  after(async () => {
    globalThis.fetch = originalFetch;

    // Cleanup all test data
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
      where: { product: { merchantId: { in: [merchantAId, merchantBId] } } },
    });
    await prisma.order.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.product.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.customer.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.merchant.deleteMany({
      where: { id: { in: [merchantAId, merchantBId] } },
    });
  });

  async function createAndExecuteAction(customName = "Customer") {
    const customer = await createEligibleCustomer(customName);
    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: oppAId,
      customerId: customer.id,
      sourceProductId: productA1Id,
      targetProductId: productA2Id,
    });

    await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });

    const execResult = await executeGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });

    return {
      action: execResult.action,
      customer,
      paymentLinkId: execResult.paymentLink.paymentLinkId,
    };
  }

  function buildWebhookPayload(opts: {
    paymentLinkId: string;
    amount?: number;
    amountPaid?: number;
    currency?: string;
    growthActionId?: string;
    merchantId?: string;
    customerId?: string;
    targetProductId?: string;
    opportunityId?: string;
  }): RazorpayWebhookPayload {
    const amount = opts.amount ?? 150000;
    const amountPaid = opts.amountPaid ?? 150000;
    const currency = opts.currency ?? "INR";
    const mId = opts.merchantId ?? merchantAId;

    return {
      entity: "event",
      account_id: "acc_test_razorgrowth",
      event: "payment_link.paid",
      contains: ["payment_link", "payment", "order"],
      payload: {
        payment_link: {
          entity: {
            id: opts.paymentLinkId,
            entity: "payment_link",
            amount,
            amount_paid: amountPaid,
            currency,
            status: "paid",
            notes: {
              merchantId: mId,
              ...(opts.customerId ? { customerId: opts.customerId } : {}),
              targetProductId: opts.targetProductId ?? productA2Id,
              opportunityId: opts.opportunityId ?? oppAId,
              ...(opts.growthActionId ? { growthActionId: opts.growthActionId } : {}),
            },
          },
        },
        payment: {
          entity: {
            id: `pay_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            entity: "payment",
            amount,
            currency,
            status: "captured",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  it("A: Exact payment-link identity — valid webhook confirms payment, marks action EXECUTED, and records exactly one PAYMENT_LINK_PAID", async () => {
    const { action, customer, paymentLinkId } = await createAndExecuteAction("Exact Test");

    const payload = buildWebhookPayload({
      paymentLinkId,
      growthActionId: action.id,
      customerId: customer.id,
    });

    const result = await handlePaymentLinkWebhook(payload);
    assert.equal(result.success, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.isDuplicate, false);
    assert.equal(result.actionId, action.id);

    // Verify GrowthAction status
    const updatedAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(updatedAction?.status, GrowthActionStatus.EXECUTED);
    assert.ok(updatedAction?.executedAt);

    // Verify exactly one PAYMENT_LINK_PAID event
    const audits = await prisma.auditEvent.findMany({
      where: {
        actionId: action.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    assert.equal(audits.length, 1);
    assert.equal((audits[0].metadata as any)?.paymentLinkId, paymentLinkId);
    assert.equal((audits[0].metadata as any)?.amountInRupees, 1500);
  });

  it("B: Mismatched payment-link ID — webhook reporting a different payment link ID is rejected and does NOT execute the action", async () => {
    const { action, customer, paymentLinkId } = await createAndExecuteAction("Mismatch Link Test");
    const spoofedLinkId = `plink_spoofed_${Date.now()}`;

    // Signed webhook claims spoofedLinkId for action
    const payload = buildWebhookPayload({
      paymentLinkId: spoofedLinkId,
      growthActionId: action.id,
      customerId: customer.id,
    });

    const result = await handlePaymentLinkWebhook(payload);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, 422);
    assert.match(result.error || "", /Payment link ID mismatch/);

    // GrowthAction remains in EXECUTING state
    const currentAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(currentAction?.status, GrowthActionStatus.EXECUTING);

    // No PAYMENT_LINK_PAID audit created
    const audits = await prisma.auditEvent.findMany({
      where: {
        actionId: action.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    assert.equal(audits.length, 0);
  });

  it("C: Missing persisted paymentLinkId — action without paymentLinkId is rejected safely without state mutation", async () => {
    const customer = await createEligibleCustomer("Missing Link Customer");
    // Create an action that was approved but NOT yet executed (has no paymentLinkId in parameters)
    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: oppAId,
      customerId: customer.id,
      sourceProductId: productA1Id,
      targetProductId: productA2Id,
    });
    await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });

    const arbitraryLinkId = `plink_arbitrary_${Date.now()}`;
    const payload = buildWebhookPayload({
      paymentLinkId: arbitraryLinkId,
      growthActionId: action.id,
      customerId: customer.id,
    });

    const result = await handlePaymentLinkWebhook(payload);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, 422);
    assert.match(result.error || "", /no persisted paymentLinkId/);

    // Verify action is still APPROVED
    const currentAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(currentAction?.status, GrowthActionStatus.APPROVED);

    const audits = await prisma.auditEvent.findMany({
      where: {
        actionId: action.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    assert.equal(audits.length, 0);
  });

  it("D: Duplicate sequential webhook — processing the exact same payload twice returns 200 idempotent duplicate with 1 audit event", async () => {
    const { action, customer, paymentLinkId } = await createAndExecuteAction("Sequential Duplicate Test");

    const payload = buildWebhookPayload({
      paymentLinkId,
      growthActionId: action.id,
      customerId: customer.id,
    });

    // First call
    const firstResult = await handlePaymentLinkWebhook(payload);
    assert.equal(firstResult.success, true);
    assert.equal(firstResult.statusCode, 200);
    assert.equal(firstResult.isDuplicate, false);

    // Second sequential call
    const secondResult = await handlePaymentLinkWebhook(payload);
    assert.equal(secondResult.success, true);
    assert.equal(secondResult.statusCode, 200);
    assert.equal(secondResult.isDuplicate, true);

    // Verify exactly one PAYMENT_LINK_PAID audit event
    const audits = await prisma.auditEvent.findMany({
      where: {
        actionId: action.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    assert.equal(audits.length, 1);
  });

  it("E: Concurrent duplicate webhook — simultaneous webhook calls for the same payment link are safely serialized with exactly 1 audit event", async () => {
    const { action, customer, paymentLinkId } = await createAndExecuteAction("Concurrent Duplicate Test");

    const payload = buildWebhookPayload({
      paymentLinkId,
      growthActionId: action.id,
      customerId: customer.id,
    });

    // Run 2 simultaneous webhook executions via Promise.all
    const [resA, resB] = await Promise.all([
      handlePaymentLinkWebhook(payload),
      handlePaymentLinkWebhook(payload),
    ]);

    assert.equal(resA.success, true);
    assert.equal(resB.success, true);
    assert.equal(resA.statusCode, 200);
    assert.equal(resB.statusCode, 200);

    // Exactly one must be fresh and the other must be duplicate
    const nonDuplicates = [resA, resB].filter((r) => !r.isDuplicate);
    const duplicates = [resA, resB].filter((r) => r.isDuplicate);

    assert.equal(nonDuplicates.length, 1);
    assert.equal(duplicates.length, 1);

    // Verify exactly one PAYMENT_LINK_PAID audit event
    const audits = await prisma.auditEvent.findMany({
      where: {
        actionId: action.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    assert.equal(audits.length, 1);
  });

  it("F: Currency mismatch — webhook with currency differing from Merchant.currency is rejected", async () => {
    const { action, customer, paymentLinkId } = await createAndExecuteAction("Currency Mismatch Test");

    const payload = buildWebhookPayload({
      paymentLinkId,
      growthActionId: action.id,
      customerId: customer.id,
      currency: "USD", // Merchant A currency is INR
    });

    const result = await handlePaymentLinkWebhook(payload);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, 422);
    assert.match(result.error || "", /Currency mismatch/);

    const currentAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(currentAction?.status, GrowthActionStatus.EXECUTING);

    const audits = await prisma.auditEvent.findMany({
      where: {
        actionId: action.id,
        eventType: "PAYMENT_LINK_PAID",
      },
    });
    assert.equal(audits.length, 0);
  });

  it("G: Amount mismatch — webhook with amount differing from authoritative Product.price is rejected", async () => {
    const { action, customer, paymentLinkId } = await createAndExecuteAction("Amount Mismatch Test");

    const payload = buildWebhookPayload({
      paymentLinkId,
      growthActionId: action.id,
      customerId: customer.id,
      amount: 9900, // Price in DB is 1500 (150000 paise)
      amountPaid: 9900,
    });

    const result = await handlePaymentLinkWebhook(payload);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, 422);
    assert.match(result.error || "", /Amount mismatch/);

    const currentAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(currentAction?.status, GrowthActionStatus.EXECUTING);
  });

  it("H: Tenant isolation — Merchant B cannot execute Merchant A's GrowthAction via webhook", async () => {
    const { action, customer, paymentLinkId } = await createAndExecuteAction("Tenant Isolation Test");

    // Payload signed/sent specifying Merchant B
    const payload = buildWebhookPayload({
      paymentLinkId,
      growthActionId: action.id,
      customerId: customer.id,
      merchantId: merchantBId,
      targetProductId: productBId,
    });

    const result = await handlePaymentLinkWebhook(payload);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, 422);
    assert.match(result.error || "", /does not belong to the merchant/);

    const currentAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(currentAction?.status, GrowthActionStatus.EXECUTING);
  });
});
