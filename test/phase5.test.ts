import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  getAIBuyerCatalog,
  getAIPublicCatalog,
  slugifyMerchantName,
  calculateAIBuyerReadiness,
  calculateReadinessScore,
  discoverProductsForAIBuyer,
  createAIBuyerPurchaseIntent,
} from "../lib/buyer/ai-catalog";
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
import { GET as catalogRoute } from "../app/api/ai/catalog/route";
import { GET as publicCatalogRoute } from "../app/api/ai/catalog/public/route";
import { GET as productsRoute } from "../app/api/ai/products/route";
import { GET as readinessRoute } from "../app/api/ai/readiness/route";
import { POST as discoverRoute } from "../app/api/ai/discover/route";
import { POST as purchaseIntentRoute } from "../app/api/ai/purchase-intent/route";
import { createSession } from "../lib/auth/session";
import { proxy } from "../proxy";
import { NextRequest } from "next/server";

describe("PHASE 5 — AI BUYER READINESS & AGENTIC COMMERCE", () => {
  let merchantAId: string;
  let merchantBId: string;
  let productA1Id: string; // Complete product (Sleeve)
  let productA2Id: string; // Complete product (Mouse)
  let productA3Id: string; // Missing metadata (Cable)
  let productA4Id: string; // Inactive product (Backpack)
  let productB1Id: string; // Merchant B private product

  let sessionAToken: string;
  let sessionBToken: string;

  let capturedRazorpayRequests: Array<{ url: string; method: string; body?: unknown }> = [];
  const originalFetch = globalThis.fetch;

  before(async () => {
    // Intercept fetch to mock Razorpay payment links for regression tests
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

        if (url.includes("/payment_links") && !url.includes("/notify_by") && method === "POST") {
          const b = parsedBody as Record<string, any>;
          const linkId = `plink_p5_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
        name: "Phase5 Store Alpha",
        email: `merchantA_p5_${Date.now()}@test.local`,
        passwordHash: "hashed_secret_12345",
        currency: "INR",
      },
    });
    merchantAId = merchantA.id;

    const merchantB = await prisma.merchant.create({
      data: {
        name: "Phase5 Store Beta",
        email: `merchantB_p5_${Date.now()}@test.local`,
        passwordHash: "hashed_secret_67890",
        currency: "INR",
      },
    });
    merchantBId = merchantB.id;

    // Create Sessions
    const sessionA = await createSession(merchantAId);
    sessionAToken = sessionA.sessionToken;

    const sessionB = await createSession(merchantBId);
    sessionBToken = sessionB.sessionToken;

    // Create RazorpayConnection for Merchant A
    await prisma.razorpayConnection.create({
      data: {
        merchantId: merchantAId,
        keyId: "rzp_test_p5_key",
        encryptedKeySecret: "dummy_encrypted_secret",
        mode: "TEST",
      },
    });

    // 2. Create Products for Merchant A
    // Product A1: Complete (Name, Price, Category, Description, Active)
    const prodA1 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Ultra Laptop Sleeve 15",
        price: 1500,
        category: "Accessories",
        description: "Padded protective sleeve designed for 15 inch laptops with water resistant exterior",
        active: true,
      },
    });
    productA1Id = prodA1.id;

    // Product A2: Complete (Name, Price, Category, Description, Active)
    const prodA2 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Ergonomic Wireless Mouse",
        price: 800,
        category: "Accessories",
        description: "Wireless ergonomic optical mouse with 2.4GHz USB receiver and silent clicks",
        active: true,
      },
    });
    productA2Id = prodA2.id;

    // Product A3: Missing Category and Description (Incomplete)
    const prodA3 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Type-C Charging Cable",
        price: 299,
        category: null,
        description: null,
        active: true,
      },
    });
    productA3Id = prodA3.id;

    // Product A4: Inactive Product
    const prodA4 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Discontinued Travel Backpack",
        price: 3500,
        category: "Bags",
        description: "Heavy duty travel backpack with laptop compartment",
        active: false,
      },
    });
    productA4Id = prodA4.id;

    // Product for Merchant B
    const prodB1 = await prisma.product.create({
      data: {
        merchantId: merchantBId,
        name: "Beta 4K Camera Drone",
        price: 45000,
        category: "Drones",
        description: "Merchant B exclusive aerial photography drone",
        active: true,
      },
    });
    productB1Id = prodB1.id;
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
    await prisma.razorpayConnection.deleteMany({
      where: { merchantId: { in: [merchantAId, merchantBId] } },
    });
    await prisma.session.deleteMany({
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

  it("A: Authentication & Authorization — Unauthenticated requests return 401", async () => {
    // 1. GET /api/ai/catalog
    const unauthCatalogReq = new NextRequest("http://localhost:3000/api/ai/catalog");
    const res1 = await catalogRoute(unauthCatalogReq);
    assert.equal(res1.status, 401);

    // 2. GET /api/ai/readiness
    const unauthReadinessReq = new NextRequest("http://localhost:3000/api/ai/readiness");
    const res2 = await readinessRoute(unauthReadinessReq);
    assert.equal(res2.status, 401);

    // 3. POST /api/ai/discover
    const unauthDiscoverReq = new NextRequest("http://localhost:3000/api/ai/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "laptop sleeve" }),
    });
    const res3 = await discoverRoute(unauthDiscoverReq);
    assert.equal(res3.status, 401);

    // 4. POST /api/ai/purchase-intent
    const unauthIntentReq = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: productA1Id }),
    });
    const res4 = await purchaseIntentRoute(unauthIntentReq);
    assert.equal(res4.status, 401);
  });

  it("B: Merchant Isolation — Merchant A cannot view or discover Merchant B's products", async () => {
    // Merchant A queries catalog
    const reqA = new NextRequest("http://localhost:3000/api/ai/catalog", {
      headers: { authorization: `Bearer ${sessionAToken}` },
    });
    const resA = await catalogRoute(reqA);
    assert.equal(resA.status, 200);
    const dataA = await resA.json();

    // Verify Merchant A only sees Merchant A's products
    const returnedProductIds = dataA.products.map((p: any) => p.id);
    assert.ok(returnedProductIds.includes(productA1Id));
    assert.ok(returnedProductIds.includes(productA2Id));
    assert.equal(
      returnedProductIds.includes(productB1Id),
      false,
      "Merchant A MUST NOT see Merchant B's product"
    );

    // Cross-tenant purchase intent: Merchant A attempts to create purchase intent for Merchant B's product
    const intentReq = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({ productId: productB1Id }), // Merchant B product
    });
    const intentRes = await purchaseIntentRoute(intentReq);
    assert.equal(intentRes.status, 404, "Must reject cross-tenant product purchase intent with 404");
  });

  it("C: Catalog Correctness — Machine-readable catalog accurately matches database Product records", async () => {
    const catalog = await getAIBuyerCatalog(merchantAId, { includeJsonLd: true });

    assert.equal(catalog.merchant.id, merchantAId);
    assert.equal(catalog.merchant.currency, "INR");
    assert.equal(catalog.products.length, 4);

    const sleeve = catalog.products.find((p) => p.id === productA1Id);
    assert.ok(sleeve);
    assert.equal(sleeve.name, "Ultra Laptop Sleeve 15");
    assert.equal(sleeve.price, 1500);
    assert.equal(sleeve.category, "Accessories");
    assert.equal(sleeve.active, true);
    assert.ok(sleeve.description?.includes("15 inch laptops"));

    // Verify schema.org / JSON-LD structure
    assert.ok(sleeve.jsonLd);
    assert.equal(sleeve.jsonLd["@type"], "Product");
    assert.equal(sleeve.jsonLd.name, "Ultra Laptop Sleeve 15");
    assert.equal((sleeve.jsonLd.offers as any).price, 1500);
    assert.equal((sleeve.jsonLd.offers as any).priceCurrency, "INR");
  });

  it("D: No Secrets — Catalog response contains zero credentials, hashes, or sensitive tokens", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/catalog", {
      headers: { authorization: `Bearer ${sessionAToken}` },
    });
    const res = await catalogRoute(req);
    const text = await res.text();

    assert.equal(text.includes("passwordHash"), false);
    assert.equal(text.includes("hashed_secret"), false);
    assert.equal(text.includes("sessionToken"), false);
    assert.equal(text.includes("keySecret"), false);
    assert.equal(text.includes("encryptedKeySecret"), false);
  });

  it("E: AI Product Validation — Invalid product IDs cannot become real recommendations or purchase intents", async () => {
    // 1. Direct discovery rejection of invalid ID
    await assert.rejects(
      async () => {
        await createAIBuyerPurchaseIntent({
          merchantId: merchantAId,
          productId: "non_existent_product_999",
        });
      },
      /Product 'non_existent_product_999' not found/
    );

    // 2. Discover endpoint with query
    const discovery = await discoverProductsForAIBuyer({
      merchantId: merchantAId,
      query: "laptop sleeve under ₹2,000",
    });

    assert.equal(discovery.success, true);
    for (const match of discovery.matches) {
      // Must be real active product belonging to Merchant A
      assert.ok([productA1Id, productA2Id, productA3Id].includes(match.productId));
      assert.notEqual(match.productId, "fake_product_id");
    }
  });

  it("F: Authoritative Price — Displayed and prepared purchase price always comes from database Product.price", async () => {
    const discovery = await discoverProductsForAIBuyer({
      merchantId: merchantAId,
      query: "mouse",
    });

    const mouseMatch = discovery.matches.find((m) => m.productId === productA2Id);
    assert.ok(mouseMatch);
    assert.equal(mouseMatch.price, 800); // Database price

    const intent = await createAIBuyerPurchaseIntent({
      merchantId: merchantAId,
      productId: productA2Id,
    });

    assert.equal(intent.authoritativePrice, 800);
    assert.equal(intent.amountInPaise, 80000);
    assert.equal(intent.currency, "INR");
  });

  it("G: Inactive Products — Inactive products cannot be purchased or recommended as active inventory", async () => {
    // 1. Purchase intent for inactive product A4 is rejected
    await assert.rejects(
      async () => {
        await createAIBuyerPurchaseIntent({
          merchantId: merchantAId,
          productId: productA4Id, // Inactive backpack
        });
      },
      /inactive and cannot be purchased/
    );

    // 2. Discovery only searches active products
    const discovery = await discoverProductsForAIBuyer({
      merchantId: merchantAId,
      query: "travel backpack",
    });

    const backpackMatch = discovery.matches.find((m) => m.productId === productA4Id);
    assert.equal(
      backpackMatch,
      undefined,
      "Inactive product must NOT appear in AI buyer active discovery"
    );
  });

  it("H: AI Readiness Score — Score is deterministic, reproducible, and uses the documented transparent formula", async () => {
    const report = await calculateAIBuyerReadiness(merchantAId);

    assert.equal(report.merchantId, merchantAId);
    assert.equal(report.totalProducts, 4);
    assert.equal(report.activeProducts, 3);

    // Product A1: 1.0 (Name 0.25, Price 0.25, Cat 0.20, Desc 0.20, Active 0.10)
    // Product A2: 1.0 (Name 0.25, Price 0.25, Cat 0.20, Desc 0.20, Active 0.10)
    // Product A3: 0.60 (Name 0.25, Price 0.25, Active 0.10)
    // Product A4: 0.90 (Name 0.25, Price 0.25, Cat 0.20, Desc 0.20)
    // Average = (1.0 + 1.0 + 0.60 + 0.90) / 4 = 3.5 / 4 = 0.875 -> 88%
    assert.equal(report.readinessScore, 88);
    assert.equal(report.completeProducts, 2);
    assert.equal(report.needsAttentionCount, 2);

    // Check checklist details
    assert.equal(report.checklist.productNames.complete, true);
    assert.equal(report.checklist.prices.complete, true);
    assert.equal(report.checklist.categories.complete, false);
    assert.equal(report.checklist.descriptions.complete, false);
    assert.equal(report.checklist.activeInventory.complete, false);

    // Documented formula present
    assert.ok(report.formula.includes("Completeness per product"));
  });

  it("I: Missing Metadata — Missing category and description are represented as null without hallucination", async () => {
    const catalog = await getAIBuyerCatalog(merchantAId);
    const cable = catalog.products.find((p) => p.id === productA3Id);

    assert.ok(cable);
    assert.equal(cable.category, null);
    assert.equal(cable.description, null);
    assert.equal(cable.price, 299);
  });

  it("J: Purchase Safety — Purchase intent does not deduct funds and explicitly states Razorpay confirmation", async () => {
    const intent = await createAIBuyerPurchaseIntent({
      merchantId: merchantAId,
      productId: productA1Id,
      customerEmail: "buyer@test.com",
    });

    assert.equal(intent.requiresConfirmation, true);
    assert.equal(intent.status, "READY_FOR_CONFIRMATION");
    assert.ok(intent.paymentNotice.includes("explicit buyer confirmation"));

    // Verify AI_PURCHASE_INTENT_CREATED audit event
    const audit = await prisma.auditEvent.findFirst({
      where: {
        merchantId: merchantAId,
        eventType: "AI_PURCHASE_INTENT_CREATED",
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit);
    assert.equal(audit.actor, AuditActor.AGENT);
    const meta = audit.metadata as Record<string, unknown>;
    assert.equal(meta.productId, productA1Id);
    assert.equal(meta.authoritativePrice, 1500);
  });

  it("K: Existing GrowthAction & Webhook Regression — State transitions and payment webhooks remain intact", async () => {
    // 1. Create Opportunity for regression test
    const opp = await prisma.opportunity.create({
      data: {
        merchantId: merchantAId,
        type: OpportunityType.CROSS_SELL,
        title: "Regression Opportunity",
        description: "Regression test",
        sourceProductId: productA1Id,
        targetProductId: productA2Id,
        confidence: 0.5,
        estimatedRevenue: 400,
        evidence: {},
        status: OpportunityStatus.NEW,
      },
    });

    const cust = await prisma.customer.create({
      data: {
        merchantId: merchantAId,
        name: "Regression Customer",
        email: `regression_${Date.now()}@test.com`,
      },
    });

    // Seed PAID order with source product so customer is eligible for cross-sell
    const order = await prisma.order.create({
      data: {
        merchantId: merchantAId,
        customerId: cust.id,
        status: "PAID",
        total: 1500,
        currency: "INR",
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: productA1Id,
        quantity: 1,
        unitPrice: 1500,
      },
    });

    // 2. Create GrowthAction
    const action = await createGrowthAction({
      merchantId: merchantAId,
      opportunityId: opp.id,
      customerId: cust.id,
      targetProductId: productA2Id,
    });
    assert.equal(action.status, GrowthActionStatus.PENDING_APPROVAL);

    // 3. Approve GrowthAction
    const approved = await approveGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(approved.status, GrowthActionStatus.APPROVED);

    // 4. Execute GrowthAction (Creates Razorpay link)
    const executed = await executeGrowthAction({
      merchantId: merchantAId,
      actionId: action.id,
    });
    assert.equal(executed.action.status, GrowthActionStatus.EXECUTING);
    assert.ok(executed.paymentLink.paymentLinkId);

    // 5. Simulate payment_link.paid webhook
    const webhookPayload = {
      entity: "event" as const,
      account_id: "acc_test_razorgrowth",
      event: "payment_link.paid",
      contains: ["payment_link", "payment", "order"],
      payload: {
        payment_link: {
          entity: {
            id: executed.paymentLink.paymentLinkId,
            entity: "payment_link" as const,
            amount: 80000,
            amount_paid: 80000,
            currency: "INR",
            status: "paid" as const,
            notes: {
              merchantId: merchantAId,
              customerId: cust.id,
              targetProductId: productA2Id,
              opportunityId: opp.id,
              growthActionId: action.id,
            },
          },
        },
        payment: {
          entity: {
            id: "pay_test_p5_999",
            entity: "payment" as const,
            amount: 80000,
            currency: "INR",
            status: "captured",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const webhookRes = await handlePaymentLinkWebhook(webhookPayload);
    assert.equal(webhookRes.success, true);

    const finalizedAction = await prisma.growthAction.findUnique({
      where: { id: action.id },
    });
    assert.equal(finalizedAction?.status, GrowthActionStatus.EXECUTED);
  });

  // ---------------------------------------------------------------------------
  // PHASE 5 HARDENING — SAFE PUBLIC AI BUYER CATALOG TESTS
  // ---------------------------------------------------------------------------

  it("L: Public Access — Public catalog works without merchant session and passes proxy", async () => {
    // 1. NextRequest to public catalog without any auth cookie or bearer header
    const req = new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantAId}`);
    
    // Verify proxy allows request through without 401 redirect or unauthorized response
    const proxyRes = proxy(req);
    assert.equal(proxyRes.status, 200, "Proxy must allow public AI catalog request through");

    // Execute route handler directly
    const res = await publicCatalogRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.merchant.name, "Phase5 Store Alpha");
    assert.equal(data.merchant.currency, "INR");
    assert.equal(data.merchant.slug, "phase5-store-alpha");
    assert.ok(Array.isArray(data.products));
    assert.ok(data.totalProducts > 0);
  });

  it("M: Product Filtering — Inactive products are strictly excluded from public catalog", async () => {
    const req = new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantAId}`);
    const res = await publicCatalogRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    const productIds = data.products.map((p: { id: string }) => p.id);

    // Active products must be present
    assert.ok(productIds.includes(productA1Id), "Active product A1 must be present");
    assert.ok(productIds.includes(productA2Id), "Active product A2 must be present");
    assert.ok(productIds.includes(productA3Id), "Active product A3 must be present");

    // Inactive product must be excluded
    assert.equal(
      productIds.includes(productA4Id),
      false,
      "Inactive product A4 must NOT be included in public catalog"
    );

    // Total products count must match active items only
    assert.equal(data.totalProducts, 3);
    for (const prod of data.products) {
      assert.equal(prod.active, true, "Every returned product must have active === true");
    }
  });

  it("N: Strict Allowlist & Zero Sensitive Data Leakage — Private data never appears in public response", async () => {
    const req = new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantAId}`);
    const res = await publicCatalogRoute(req);
    const rawText = await res.text();
    const data = JSON.parse(rawText);

    // 1. Zero credential / secret leakage
    assert.equal(rawText.includes("passwordHash"), false);
    assert.equal(rawText.includes("hashed_secret"), false);
    assert.equal(rawText.includes("sessionToken"), false);
    assert.equal(rawText.includes("keySecret"), false);
    assert.equal(rawText.includes("encryptedKeySecret"), false);
    assert.equal(rawText.includes("rzp_test_"), false);

    // 2. Zero customer PII or customer data leakage
    assert.equal(rawText.includes("customerEmail"), false);
    assert.equal(rawText.includes("customerId"), false);
    assert.equal(rawText.includes("Phase5 Cust Alpha"), false);
    assert.equal(rawText.includes("cust_p5_"), false);

    // 3. Zero order / operational data leakage
    assert.equal(rawText.includes("orderId"), false);
    assert.equal(rawText.includes("growthActionId"), false);
    assert.equal(rawText.includes("opportunityId"), false);
    assert.equal(rawText.includes("auditEvent"), false);

    // 4. Raw database Merchant.id must not be exposed in merchant metadata
    assert.equal(data.merchant.id, undefined, "Raw Merchant cuid must not be exposed in merchant object");
    assert.equal(data.merchant.email, undefined, "Merchant private email must not be exposed");

    // 5. Check strictly allowlisted keys in product objects
    for (const prod of data.products) {
      const keys = Object.keys(prod);
      const allowedKeys = new Set(["id", "name", "description", "category", "price", "currency", "active", "jsonLd"]);
      for (const k of keys) {
        assert.ok(allowedKeys.has(k), `Unexpected field '${k}' in public product output`);
      }
      assert.equal(prod.merchantId, undefined, "merchantId must not be exposed on products");
      assert.equal(prod.createdAt, undefined, "Internal timestamps must not be exposed");
      assert.equal(prod.updatedAt, undefined, "Internal timestamps must not be exposed");
    }
  });

  it("O: Authoritative Price & Currency — Returned price equals Product.price and currency matches configuration", async () => {
    const req = new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantAId}`);
    const res = await publicCatalogRoute(req);
    const data = await res.json();

    const sleeve = data.products.find((p: { id: string }) => p.id === productA1Id);
    assert.ok(sleeve);
    assert.equal(sleeve.price, 1500);
    assert.equal(sleeve.currency, "INR");

    const mouse = data.products.find((p: { id: string }) => p.id === productA2Id);
    assert.ok(mouse);
    assert.equal(mouse.price, 800);
    assert.equal(mouse.currency, "INR");

    const cable = data.products.find((p: { id: string }) => p.id === productA3Id);
    assert.ok(cable);
    assert.equal(cable.price, 299);
    assert.equal(cable.currency, "INR");

    // Verify directly against PostgreSQL Product record
    const dbSleeve = await prisma.product.findUniqueOrThrow({ where: { id: productA1Id } });
    assert.equal(Number(dbSleeve.price), sleeve.price, "Public catalog price must strictly equal Product.price");
  });

  it("P: Tenant Isolation — Merchant A's catalog cannot contain Merchant B's products and vice versa", async () => {
    // Merchant A query
    const resA = await publicCatalogRoute(
      new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantAId}`)
    );
    const dataA = await resA.json();
    const idsA = dataA.products.map((p: { id: string }) => p.id);
    assert.equal(idsA.includes(productB1Id), false, "Merchant A public catalog must NOT contain Merchant B products");

    // Merchant B query
    const resB = await publicCatalogRoute(
      new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantBId}`)
    );
    const dataB = await resB.json();
    const idsB = dataB.products.map((p: { id: string }) => p.id);
    assert.equal(idsB.includes(productB1Id), true, "Merchant B catalog must contain Merchant B product");
    assert.equal(idsB.includes(productA1Id), false, "Merchant B catalog must NOT contain Merchant A product");
  });

  it("Q: Safe Merchant Resolution & Unknown Merchant Handling — Resolves by ID/slug/name and returns 404 for unknown merchant", async () => {
    // 1. Query by slug
    const slugRes = await publicCatalogRoute(
      new NextRequest("http://localhost:3000/api/ai/catalog/public?slug=phase5-store-alpha")
    );
    assert.equal(slugRes.status, 200);
    const slugData = await slugRes.json();
    assert.equal(slugData.merchant.name, "Phase5 Store Alpha");

    // 2. Query by 'merchant' parameter (auto-detects slug/id)
    const merchantParamRes = await publicCatalogRoute(
      new NextRequest("http://localhost:3000/api/ai/catalog/public?merchant=phase5-store-alpha")
    );
    assert.equal(merchantParamRes.status, 200);

    // 3. Unknown merchant ID returns 404
    const unknownIdRes = await publicCatalogRoute(
      new NextRequest("http://localhost:3000/api/ai/catalog/public?merchantId=non_existent_merchant_cuid_999")
    );
    assert.equal(unknownIdRes.status, 404);
    const unknownIdJson = await unknownIdRes.json();
    assert.ok(unknownIdJson.error?.includes("Merchant not found"));

    // 4. Unknown merchant slug returns 404
    const unknownSlugRes = await publicCatalogRoute(
      new NextRequest("http://localhost:3000/api/ai/catalog/public?slug=non-existent-store-slug")
    );
    assert.equal(unknownSlugRes.status, 404);
  });

  it("R: Request Validation — Missing/invalid query parameters return 400 with descriptive error", async () => {
    // Missing all merchant identifiers
    const emptyReq = new NextRequest("http://localhost:3000/api/ai/catalog/public");
    const emptyRes = await publicCatalogRoute(emptyReq);
    assert.equal(emptyRes.status, 400);
    const emptyJson = await emptyRes.json();
    assert.ok(emptyJson.error?.includes("merchant identifier"));

    // Invalid includeJsonLd parameter
    const invalidReq = new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantAId}&includeJsonLd=invalid_boolean`);
    const invalidRes = await publicCatalogRoute(invalidReq);
    assert.equal(invalidRes.status, 400);
  });

  it("S: Purchase Safety Boundary — Public catalog access is strictly read-only and cannot trigger payments or approve actions", async () => {
    const actionCountBefore = await prisma.growthAction.count({ where: { merchantId: merchantAId } });
    const auditCountBefore = await prisma.auditEvent.count({ where: { merchantId: merchantAId } });
    const rzpRequestsBefore = capturedRazorpayRequests.length;

    // Perform multiple public catalog reads
    for (let i = 0; i < 3; i++) {
      const res = await publicCatalogRoute(
        new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantAId}`)
      );
      assert.equal(res.status, 200);
    }

    const actionCountAfter = await prisma.growthAction.count({ where: { merchantId: merchantAId } });
    const auditCountAfter = await prisma.auditEvent.count({ where: { merchantId: merchantAId } });
    const rzpRequestsAfter = capturedRazorpayRequests.length;

    // Assert zero mutations and zero payment interactions
    assert.equal(actionCountAfter, actionCountBefore, "Public catalog MUST NOT create or mutate GrowthActions");
    assert.equal(auditCountAfter, auditCountBefore, "Public catalog read must not pollute audit events");
    assert.equal(rzpRequestsAfter, rzpRequestsBefore, "Public catalog access MUST NOT call Razorpay API");
  });

  it("T: JSON-LD Integrity — Contains only grounded schema.org fields without fabricated inventory or availability", async () => {
    const req = new NextRequest(`http://localhost:3000/api/ai/catalog/public?merchantId=${merchantAId}&includeJsonLd=true`);
    const res = await publicCatalogRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    const sleeve = data.products.find((p: { id: string }) => p.id === productA1Id);
    assert.ok(sleeve?.jsonLd);

    const ld = sleeve.jsonLd as Record<string, any>;
    assert.equal(ld["@context"], "https://schema.org/");
    assert.equal(ld["@type"], "Product");
    assert.equal(ld.identifier, productA1Id);
    assert.equal(ld.name, "Ultra Laptop Sleeve 15");
    assert.ok(ld.description?.includes("15 inch laptops"));
    assert.equal(ld.category, "Accessories");
    assert.equal(ld.offers?.["@type"], "Offer");
    assert.equal(ld.offers?.price, 1500);
    assert.equal(ld.offers?.priceCurrency, "INR");

    // STRICT GROUNDING CHECKS: No fabricated inventory, availability, reviews, ratings
    assert.equal(ld.offers?.availability, undefined, "Public JSON-LD must NOT fabricate availability status");
    assert.equal(ld.inventory, undefined, "Public JSON-LD must NOT fabricate inventory");
    assert.equal(ld.aggregateRating, undefined, "Public JSON-LD must NOT fabricate aggregateRating");
    assert.equal(ld.review, undefined, "Public JSON-LD must NOT fabricate reviews");
    assert.equal(ld.brand, undefined, "Public JSON-LD must NOT fabricate brand when not in schema");
    assert.equal(ld.shippingDetails, undefined, "Public JSON-LD must NOT fabricate shippingDetails");

    // Product A3 (missing description and category) must not hallucinate fields
    const cable = data.products.find((p: { id: string }) => p.id === productA3Id);
    assert.ok(cable?.jsonLd);
    const cableLd = cable.jsonLd as Record<string, any>;
    assert.equal(cableLd.description, undefined, "Missing description must remain undefined in JSON-LD");
    assert.equal(cableLd.category, undefined, "Missing category must remain undefined in JSON-LD");
    assert.equal(cableLd.offers?.price, 299);
  });
});

