import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  razorpayRequestWithCredentials,
  RazorpayRequestError,
  RazorpayApiError,
  sanitizeSecrets,
} from "../lib/razorpay/client";
import {
  RazorpayPaymentLinkResponseSchema,
  RazorpayNotifyResponseSchema,
  RazorpayCustomerListResponseSchema,
  RazorpayOrderListResponseSchema,
  type RazorpayCustomerListResponse,
} from "../lib/razorpay/schemas";
import {
  createPaymentLink,
  resendPaymentLinkNotification,
} from "../lib/razorpay/payment-links";
import {
  syncCustomers,
  syncOrders,
} from "../lib/razorpay/sync";
import {
  OpportunityType,
  OpportunityStatus,
} from "../lib/generated/prisma/enums";

describe("RAZORPAY HTTP CLIENT & EXTERNAL RESPONSE VALIDATION", () => {
  let merchantId: string;
  let productId: string;
  let customerId: string;
  let opportunityId: string;

  const originalFetch = globalThis.fetch;

  before(async () => {
    // 1. Create clean test merchant
    const merchant = await prisma.merchant.create({
      data: {
        name: `Razorpay Client Test Merchant ${Date.now()}`,
        email: `rzp_client_merchant_${Date.now()}@test.com`,
        currency: "INR",
      },
    });
    merchantId = merchant.id;

    // 2. Create product
    const product = await prisma.product.create({
      data: {
        merchantId,
        name: "Test Target Product",
        price: 1500,
        active: true,
      },
    });
    productId = product.id;

    // 3. Create customer
    const customer = await prisma.customer.create({
      data: {
        merchantId,
        name: "Test Client Customer",
        email: `client_cust_${Date.now()}@test.com`,
      },
    });
    customerId = customer.id;

    // 4. Create opportunity
    const opp = await prisma.opportunity.create({
      data: {
        merchantId,
        targetProductId: productId,
        type: OpportunityType.CROSS_SELL,
        title: "Test Cross-Sell",
        description: "Test description",
        status: OpportunityStatus.APPROVED,
        confidence: 0.85,
        estimatedRevenue: 1500,
        evidence: {},
      },
    });
    opportunityId = opp.id;
  });

  after(async () => {
    globalThis.fetch = originalFetch;

    await prisma.auditEvent.deleteMany({ where: { merchantId } });
    await prisma.growthAction.deleteMany({ where: { merchantId } });
    await prisma.opportunity.deleteMany({ where: { merchantId } });
    await prisma.orderItem.deleteMany({
      where: { product: { merchantId } },
    });
    await prisma.order.deleteMany({ where: { merchantId } });
    await prisma.product.deleteMany({ where: { merchantId } });
    await prisma.customer.deleteMany({ where: { merchantId } });
    await prisma.merchant.deleteMany({ where: { id: merchantId } });
  });

  it("A: Successful Payment Link creation response — validated and mapped into typed PaymentLinkResult", async () => {
    const mockPaymentLinkId = `plink_test_a_${Date.now()}`;
    const mockShortUrl = `https://rzp.io/i/${mockPaymentLinkId}`;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          id: mockPaymentLinkId,
          entity: "payment_link",
          amount: 150000,
          amount_paid: 0,
          currency: "INR",
          status: "created",
          description: "Cross-sell offer: Test Target Product",
          short_url: mockShortUrl,
          customer: {
            name: "Test Client Customer",
            email: "client_cust@test.com",
          },
          created_at: 1700000000,
          notes: {
            merchantId,
            customerId,
            targetProductId: productId,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    const result = await createPaymentLink({
      merchantId,
      customerId,
      targetProductId: productId,
      opportunityId,
    });

    assert.equal(result.paymentLinkId, mockPaymentLinkId);
    assert.equal(result.shortUrl, mockShortUrl);
    assert.equal(result.status, "created");
    assert.equal(result.amountInPaise, 150000);
    assert.equal(result.amountInRupees, 1500);
    assert.equal(result.currency, "INR");
    assert.equal(result.createdAt, 1700000000);
  });

  it("B: Successful Payment Link notification response — validated against RazorpayNotifyResponseSchema", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    const result = await resendPaymentLinkNotification({
      merchantId,
      paymentLinkId: "plink_notify_test_123",
      medium: "email",
    });

    assert.equal(result.success, true);
  });

  it("C: Successful customer sync response — validated against RazorpayCustomerListResponseSchema", async () => {
    const syncCustEmail = `synced_${Date.now()}@test.com`;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          entity: "collection",
          count: 1,
          items: [
            {
              id: "cust_rzp_sync_1",
              name: "Synced Alice",
              email: syncCustEmail,
              contact: "+919876543210",
              created_at: 1700000000,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    const result = await syncCustomers(merchantId);
    assert.equal(result.success, true);
    assert.equal(result.totalFound, 1);
    assert.equal(result.syncedCount, 1);

    const saved = await prisma.customer.findUnique({
      where: { merchantId_email: { merchantId, email: syncCustEmail } },
    });
    assert.ok(saved);
    assert.equal(saved?.name, "Synced Alice");
  });

  it("D: Successful order sync response — validated against RazorpayOrderListResponseSchema", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          entity: "collection",
          count: 1,
          items: [
            {
              id: `order_rzp_sync_${Date.now()}`,
              entity: "order",
              amount: 250000,
              amount_paid: 250000,
              currency: "INR",
              status: "paid",
              created_at: 1700000100,
              notes: {
                customerId,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    const result = await syncOrders(merchantId);
    assert.equal(result.success, true);
    assert.equal(result.totalFound, 1);
    assert.equal(result.syncedCount, 1);
  });

  it("E: Connection validation success — validated using customer list schema", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          entity: "collection",
          count: 1,
          items: [
            {
              id: "cust_validation_check",
              name: "Validation Customer",
              email: "val@test.com",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    const data = await razorpayRequestWithCredentials<RazorpayCustomerListResponse>(
      { keyId: "rzp_test_mock_key", keySecret: "rzp_test_mock_sec" },
      "/customers?count=1",
      {
        method: "GET",
        schema: RazorpayCustomerListResponseSchema,
      }
    );

    assert.ok(Array.isArray(data.items));
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].id, "cust_validation_check");
  });

  it("F: Malformed 2xx response — throws RazorpayRequestError with VALIDATION_ERROR code", async () => {
    // Missing required short_url and invalid type for amount
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          id: "plink_malformed_123",
          entity: "payment_link",
          amount: "invalid_string_amount",
          currency: "INR",
          status: "created",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    await assert.rejects(
      async () => {
        await createPaymentLink({
          merchantId,
          customerId,
          targetProductId: productId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RazorpayRequestError);
        assert.equal(err.code, "VALIDATION_ERROR");
        assert.equal(err.isValidationError, true);
        assert.match(err.message, /Razorpay response validation failed/);
        return true;
      }
    );
  });

  it("G: Non-2xx JSON Razorpay error — normalized into RazorpayRequestError with provider code and status", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "BAD_REQUEST_ERROR",
            description: "Amount exceeds maximum amount allowed in test mode",
            field: "amount",
            source: "business",
            step: "payment_initiation",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof globalThis.fetch;

    await assert.rejects(
      async () => {
        await razorpayRequestWithCredentials(
          { keyId: "rzp_test_key", keySecret: "rzp_test_sec" },
          "/payment_links",
          {
            method: "POST",
            body: { amount: 10000000 },
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof RazorpayRequestError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "BAD_REQUEST_ERROR");
        assert.equal(err.field, "amount");
        assert.match(err.message, /Amount exceeds maximum amount allowed/);
        return true;
      }
    );
  });

  it("H: Non-2xx non-JSON response — normalized into RazorpayRequestError with HTTP status and safe snippet", async () => {
    globalThis.fetch = (async () => {
      return new Response("<html><body>502 Bad Gateway from NGINX proxy</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      });
    }) as typeof globalThis.fetch;

    await assert.rejects(
      async () => {
        await razorpayRequestWithCredentials(
          { keyId: "rzp_test_key", keySecret: "rzp_test_sec" },
          "/customers"
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof RazorpayRequestError);
        assert.equal(err.statusCode, 502);
        assert.equal(err.code, "HTTP_502");
        assert.match(err.message, /502 Bad Gateway/);
        return true;
      }
    );
  });

  it("I: Malformed JSON response — throws RazorpayRequestError with PARSE_ERROR", async () => {
    globalThis.fetch = (async () => {
      return new Response("{ broken json: [unclosed string", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    await assert.rejects(
      async () => {
        await razorpayRequestWithCredentials(
          { keyId: "rzp_test_key", keySecret: "rzp_test_sec" },
          "/customers"
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof RazorpayRequestError);
        assert.equal(err.code, "PARSE_ERROR");
        assert.equal(err.isParseError, true);
        assert.match(err.message, /Failed to parse Razorpay JSON response/);
        return true;
      }
    );
  });

  it("J: Empty response where a body is expected — throws RazorpayRequestError with EMPTY_RESPONSE", async () => {
    globalThis.fetch = (async () => {
      return new Response("", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    await assert.rejects(
      async () => {
        await razorpayRequestWithCredentials(
          { keyId: "rzp_test_key", keySecret: "rzp_test_sec" },
          "/payment_links",
          {
            method: "POST",
            schema: RazorpayPaymentLinkResponseSchema,
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof RazorpayRequestError);
        assert.equal(err.code, "EMPTY_RESPONSE");
        assert.equal(err.isValidationError, true);
        return true;
      }
    );
  });

  it("K: Network/request failure — fetch throw is caught and normalized as NETWORK_ERROR", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:443");
    }) as typeof globalThis.fetch;

    await assert.rejects(
      async () => {
        await razorpayRequestWithCredentials(
          { keyId: "rzp_test_key", keySecret: "rzp_test_sec" },
          "/customers"
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof RazorpayRequestError);
        assert.equal(err.isNetworkError, true);
        assert.equal(err.code, "NETWORK_ERROR");
        assert.match(err.message, /Razorpay network request failed/);
        return true;
      }
    );
  });

  it("L: Ensure sensitive credential data is never included in normalized errors", async () => {
    const sensitiveSecret = "SECRET_KEY_abc123_DO_NOT_LEAK";
    const sensitiveKeyId = "KEY_ID_xyz789_SENSITIVE";

    // Simulate network error containing raw secrets in the exception text
    globalThis.fetch = (async () => {
      throw new Error(
        `Failed connection with Authorization Basic ${Buffer.from(`${sensitiveKeyId}:${sensitiveSecret}`).toString("base64")} containing ${sensitiveSecret} and ${sensitiveKeyId}`
      );
    }) as typeof globalThis.fetch;

    try {
      await razorpayRequestWithCredentials(
        { keyId: sensitiveKeyId, keySecret: sensitiveSecret },
        "/test_endpoint"
      );
      assert.fail("Should have thrown");
    } catch (err: unknown) {
      assert.ok(err instanceof RazorpayRequestError);
      assert.ok(!err.message.includes(sensitiveSecret), "Secret key leaked in error.message!");
      assert.ok(!err.message.includes(sensitiveKeyId), "Key ID leaked in error.message!");
      assert.ok(!err.description?.includes(sensitiveSecret), "Secret key leaked in error.description!");
      assert.ok(!err.description?.includes(sensitiveKeyId), "Key ID leaked in error.description!");
      assert.match(err.message, /\[REDACTED\]/);
    }

    // Also verify sanitizeSecrets unit function directly
    const sanitized = sanitizeSecrets(
      `Auth header with key ${sensitiveSecret} and ${sensitiveKeyId}`,
      [sensitiveSecret, sensitiveKeyId]
    );
    assert.equal(sanitized, "Auth header with key [REDACTED] and [REDACTED]");
  });
});
