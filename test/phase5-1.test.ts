import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  getAIPublicCatalog,
  resolvePublicMerchant,
  createAIBuyerPurchaseIntent,
  PublicCatalogError,
  PurchaseIntentError,
  PurchaseIntentNotFoundError,
  PurchaseIntentInactiveProductError,
} from "../lib/buyer/ai-catalog";
import { GET as publicCatalogRoute } from "../app/api/ai/catalog/public/route";
import { POST as purchaseIntentRoute } from "../app/api/ai/purchase-intent/route";
import { createSession } from "../lib/auth/session";
import { NextRequest } from "next/server";

describe("PHASE 5.1 — PUBLIC CATALOG IDENTITY + PURCHASE-INTENT INPUT HARDENING", () => {
  let merchantAId: string;
  let merchantAPublicId: string;
  let merchantBId: string;
  let merchantBPublicId: string;

  let productA1Id: string; // Active product (₹1,500)
  let productA2Id: string; // Active product (₹800)
  let productA4Id: string; // Inactive product (₹3,500)
  let productB1Id: string; // Merchant B active product (₹45,000)

  let sessionAToken: string;
  let capturedRazorpayRequests: Array<{ url: string; method: string; body?: unknown }> = [];
  const originalFetch = globalThis.fetch;

  before(async () => {
    // Intercept fetch to track Razorpay calls
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
      }
      return originalFetch(input, init);
    }) as typeof globalThis.fetch;

    // 1. Create Merchant A
    const merchantA = await prisma.merchant.create({
      data: {
        name: "Phase 5-1 Store Alpha",
        email: `merchantA_p51_${Date.now()}@test.local`,
        passwordHash: "super_secret_hash_value_12345",
        currency: "INR",
      },
    });
    merchantAId = merchantA.id;
    merchantAPublicId = merchantA.publicId;

    // 2. Create Merchant B
    const merchantB = await prisma.merchant.create({
      data: {
        name: "Phase 5-1 Store Beta",
        email: `merchantB_p51_${Date.now()}@test.local`,
        passwordHash: "super_secret_hash_value_67890",
        currency: "INR",
      },
    });
    merchantBId = merchantB.id;
    merchantBPublicId = merchantB.publicId;

    // 3. Create Session for Merchant A
    const sessionA = await createSession(merchantAId);
    sessionAToken = sessionA.sessionToken;

    // 4. Create Products for Merchant A
    const prodA1 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Noise Cancelling Headphones",
        price: 1500,
        category: "Audio",
        description: "Premium over-ear noise cancelling headphones with 30hr battery",
        active: true,
      },
    });
    productA1Id = prodA1.id;

    const prodA2 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Wireless Charger Pad",
        price: 800,
        category: "Accessories",
        description: "Fast 15W Qi wireless charging pad with LED indicator",
        active: true,
      },
    });
    productA2Id = prodA2.id;

    const prodA4 = await prisma.product.create({
      data: {
        merchantId: merchantAId,
        name: "Discontinued Audio Cable",
        price: 3500,
        category: "Audio",
        description: "Old audio cable discontinued from catalog",
        active: false,
      },
    });
    productA4Id = prodA4.id;

    // 5. Create Product for Merchant B
    const prodB1 = await prisma.product.create({
      data: {
        merchantId: merchantBId,
        name: "Merchant B Exclusive Drone",
        price: 45000,
        category: "Drones",
        description: "Exclusive Merchant B aerial photography drone",
        active: true,
      },
    });
    productB1Id = prodB1.id;
  });

  after(async () => {
    globalThis.fetch = originalFetch;

    // Cleanup test data
    await prisma.auditEvent.deleteMany({
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

  // =========================================================================
  // PUBLIC CATALOG TESTS (1 - 7)
  // =========================================================================

  it("1. resolves merchant using stable public identifier", async () => {
    assert.ok(merchantAPublicId, "Merchant must have a non-empty publicId");
    assert.notEqual(merchantAPublicId, merchantAId, "Public identifier must be distinct from cuid");

    const req = new NextRequest(
      `http://localhost:3000/api/ai/catalog/public?merchant=${merchantAPublicId}`
    );
    const res = await publicCatalogRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.merchant.publicId, merchantAPublicId);
    assert.equal(data.merchant.name, "Phase 5-1 Store Alpha");
    assert.equal(data.merchant.currency, "INR");
    assert.ok(Array.isArray(data.products));
    assert.equal(data.totalProducts, 2);
  });

  it("2. unknown public identifier returns safe 404", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/ai/catalog/public?merchant=pub_unknown_merchant_999"
    );
    const res = await publicCatalogRoute(req);
    assert.equal(res.status, 404);

    const data = await res.json();
    assert.ok(data.error);
    assert.equal(data.error.includes("password"), false);
    assert.equal(data.error.includes("SELECT"), false);
    assert.equal(data.error.includes("WHERE"), false);
  });

  it("3. public catalog does not expose merchant email", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/ai/catalog/public?merchant=${merchantAPublicId}`
    );
    const res = await publicCatalogRoute(req);
    assert.equal(res.status, 200);

    const rawText = await res.text();
    const data = JSON.parse(rawText);

    assert.equal(data.merchant.email, undefined);
    assert.equal(rawText.includes("merchantA_p51_"), false);
    assert.equal(rawText.includes("@test.local"), false);
  });

  it("4. public catalog does not expose credentials/sessions", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/ai/catalog/public?merchant=${merchantAPublicId}`
    );
    const res = await publicCatalogRoute(req);
    const rawText = await res.text();

    assert.equal(rawText.includes("passwordHash"), false);
    assert.equal(rawText.includes("super_secret_hash_value"), false);
    assert.equal(rawText.includes("sessionToken"), false);
    assert.equal(rawText.includes(sessionAToken), false);
    assert.equal(rawText.includes("encryptedKeySecret"), false);
    assert.equal(rawText.includes("keySecret"), false);
  });

  it("5. inactive products are excluded", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/ai/catalog/public?merchant=${merchantAPublicId}`
    );
    const res = await publicCatalogRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    const productIds = data.products.map((p: { id: string }) => p.id);

    assert.ok(productIds.includes(productA1Id), "Active product A1 must be present");
    assert.ok(productIds.includes(productA2Id), "Active product A2 must be present");
    assert.equal(
      productIds.includes(productA4Id),
      false,
      "Inactive product A4 must be strictly excluded"
    );
    assert.equal(data.totalProducts, 2);
    for (const prod of data.products) {
      assert.equal(prod.active, true);
    }
  });

  it("6. public catalog remains read-only", async () => {
    const actionsBefore = await prisma.growthAction.count({
      where: { merchantId: merchantAId },
    });
    const auditsBefore = await prisma.auditEvent.count({
      where: { merchantId: merchantAId },
    });
    const capturedBefore = capturedRazorpayRequests.length;

    // Execute 3 catalog queries
    for (let i = 0; i < 3; i++) {
      const res = await publicCatalogRoute(
        new NextRequest(
          `http://localhost:3000/api/ai/catalog/public?merchant=${merchantAPublicId}`
        )
      );
      assert.equal(res.status, 200);
    }

    const actionsAfter = await prisma.growthAction.count({
      where: { merchantId: merchantAId },
    });
    const auditsAfter = await prisma.auditEvent.count({
      where: { merchantId: merchantAId },
    });
    const capturedAfter = capturedRazorpayRequests.length;

    assert.equal(actionsAfter, actionsBefore, "Must not create GrowthActions");
    assert.equal(auditsAfter, auditsBefore, "Public read must not record private audits");
    assert.equal(capturedAfter, capturedBefore, "Public catalog must not interact with Razorpay");
  });

  it("7. cross-merchant product access cannot occur through public identity", async () => {
    // Merchant A query
    const resA = await publicCatalogRoute(
      new NextRequest(
        `http://localhost:3000/api/ai/catalog/public?merchant=${merchantAPublicId}`
      )
    );
    const dataA = await resA.json();
    const idsA = dataA.products.map((p: { id: string }) => p.id);
    assert.equal(idsA.includes(productB1Id), false, "Merchant A cannot view Merchant B products");

    // Merchant B query
    const resB = await publicCatalogRoute(
      new NextRequest(
        `http://localhost:3000/api/ai/catalog/public?merchant=${merchantBPublicId}`
      )
    );
    const dataB = await resB.json();
    const idsB = dataB.products.map((p: { id: string }) => p.id);
    assert.equal(idsB.includes(productB1Id), true, "Merchant B catalog contains product B1");
    assert.equal(idsB.includes(productA1Id), false, "Merchant B cannot view Merchant A products");
  });

  // =========================================================================
  // PURCHASE INTENT TESTS (8 - 21)
  // =========================================================================

  it("8. valid productId succeeds", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({ productId: productA1Id }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.productId, productA1Id);
    assert.equal(data.merchantId, merchantAId);
    assert.equal(data.status, "READY_FOR_CONFIRMATION");
    assert.equal(data.requiresConfirmation, true);
    assert.equal(data.authoritativePrice, 1500);
    assert.equal(data.amountInPaise, 150000);
    assert.equal(data.currency, "INR");
  });

  it("9. missing productId returns 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({ customerEmail: "buyer@test.com" }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.includes("productId"));
  });

  it("10. non-string productId returns 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({ productId: 12345 }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.includes("productId"));
  });

  it("11. malformed customerEmail returns 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
        customerEmail: "not-a-valid-email-address",
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.toLowerCase().includes("email"));
  });

  it("12. customerEmail omitted succeeds", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.productId, productA1Id);
  });

  it("13. customerName omitted succeeds", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
        customerEmail: "buyer@example.com",
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.productId, productA1Id);
  });

  it("14. customerName is trimmed", async () => {
    // 1. Valid customerName with whitespace trims and succeeds
    const reqValid = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
        customerName: "   Jane Doe   ",
      }),
    });

    const resValid = await purchaseIntentRoute(reqValid);
    assert.equal(resValid.status, 200);

    // 2. Obviously invalid empty strings after trimming return 400
    const reqEmpty = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
        customerName: "      ",
      }),
    });

    const resEmpty = await purchaseIntentRoute(reqEmpty);
    assert.equal(resEmpty.status, 400);
    const dataEmpty = await resEmpty.json();
    assert.ok(dataEmpty.error.toLowerCase().includes("customername"));
  });

  it("15. product from another merchant cannot be purchased", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productB1Id, // Belongs to Merchant B
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 404);

    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.toLowerCase().includes("not found") || data.error.toLowerCase().includes("inaccessible"));
    // Must NOT leak internal merchant IDs in error
    assert.equal(data.error.includes(merchantBId), false);
  });

  it("16. inactive product returns 422", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA4Id, // Inactive product
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 422);

    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.toLowerCase().includes("inactive"));
  });

  it("17. client cannot override price", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
        price: 1, // Fraudulent client override attempt
        amountInPaise: 100, // Fraudulent client override attempt
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    // Authoritative price is 1500 (150000 paise), NOT client override
    assert.equal(data.authoritativePrice, 1500);
    assert.equal(data.amountInPaise, 150000);
  });

  it("18. client cannot override currency", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
        currency: "USD", // Client override attempt
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    // Currency comes authoritatively from Merchant.currency ("INR")
    assert.equal(data.currency, "INR");
  });

  it("19. purchase intent does not create a Payment Link", async () => {
    const rzpCountBefore = capturedRazorpayRequests.length;

    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA2Id,
        customerEmail: "buyer@example.com",
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 200);

    const rzpCountAfter = capturedRazorpayRequests.length;
    assert.equal(
      rzpCountAfter,
      rzpCountBefore,
      "Creating purchase intent MUST NOT call Razorpay payment link APIs"
    );
  });

  it("20. purchase intent remains READY_FOR_CONFIRMATION", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${sessionAToken}`,
      },
      body: JSON.stringify({
        productId: productA1Id,
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, "READY_FOR_CONFIRMATION");
    assert.equal(data.requiresConfirmation, true);
    assert.ok(data.paymentNotice);
    assert.ok(data.paymentNotice.includes("explicit buyer confirmation"));
  });

  it("21. unauthenticated request returns 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/ai/purchase-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: productA1Id,
      }),
    });

    const res = await purchaseIntentRoute(req);
    assert.equal(res.status, 401);

    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.toLowerCase().includes("unauthorized") || data.error.toLowerCase().includes("session"));
  });
});
