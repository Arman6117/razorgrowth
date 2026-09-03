import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseGrowthActionParameters,
  safeParseGrowthActionParameters,
  toPrismaJson,
  GrowthActionParametersSchema,
  InvalidGrowthActionParametersError,
} from "../lib/actions/growth-action";

describe("GROWTH ACTION PARAMETER PARSING & VALIDATION BOUNDARY", () => {
  it("A: Valid parameter object parses successfully and returns typed data", () => {
    const validParams = {
      customerId: "cust_123",
      customerName: "Alice Smith",
      customerEmail: "alice@example.com",
      targetProductId: "prod_target_456",
      targetProductName: "Target Laptop Mouse",
      sourceProductId: "prod_source_789",
      amountInRupees: 2500,
      amountInPaise: 250000,
      currency: "INR",
      paymentLinkId: "plink_xyz_999",
      shortUrl: "https://rzp.io/i/plink_xyz_999",
      paymentLinkStatus: "created",
      paymentLinkCreatedAt: 1720000000,
      lastExecutedAt: "2026-09-03T10:00:00.000Z",
      retriedAt: "2026-09-03T10:05:00.000Z",
      lastResentAt: "2026-09-03T10:10:00.000Z",
      resendCount: 1,
      description: "Special cross-sell offer",
    };

    const parsed = parseGrowthActionParameters(validParams);
    assert.deepEqual(parsed, validParams);

    const safeResult = safeParseGrowthActionParameters(validParams);
    assert.equal(safeResult.success, true);
    if (safeResult.success) {
      assert.equal(safeResult.data.customerId, "cust_123");
      assert.equal(safeResult.data.amountInPaise, 250000);
    }
  });

  it("B: Malformed JSON primitives or non-object values are rejected with InvalidGrowthActionParametersError", () => {
    assert.throws(
      () => parseGrowthActionParameters("string_instead_of_object"),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /must be a JSON object/);
        return true;
      }
    );

    assert.throws(
      () => parseGrowthActionParameters(12345),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /must be a JSON object/);
        return true;
      }
    );

    assert.throws(
      () => parseGrowthActionParameters([1, 2, 3]),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /must be a JSON object/);
        return true;
      }
    );

    const safeResult = safeParseGrowthActionParameters("invalid");
    assert.equal(safeResult.success, false);
    if (!safeResult.success) {
      assert.ok(safeResult.error instanceof InvalidGrowthActionParametersError);
    }
  });

  it("C: Wrong type for customerId is rejected", () => {
    const invalidData = {
      customerId: 12345, // Number instead of string
      targetProductId: "prod_1",
    };

    assert.throws(
      () => parseGrowthActionParameters(invalidData),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /customerId/);
        return true;
      }
    );

    const safeResult = safeParseGrowthActionParameters(invalidData);
    assert.equal(safeResult.success, false);
  });

  it("D: Wrong type for targetProductId is rejected", () => {
    const invalidData = {
      customerId: "cust_1",
      targetProductId: true, // Boolean instead of string
    };

    assert.throws(
      () => parseGrowthActionParameters(invalidData),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /targetProductId/);
        return true;
      }
    );
  });

  it("E: Wrong type for amountInPaise and amountInRupees is rejected", () => {
    const invalidData1 = {
      customerId: "cust_1",
      amountInPaise: "250000", // String instead of number
    };
    assert.throws(
      () => parseGrowthActionParameters(invalidData1),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /amountInPaise/);
        return true;
      }
    );

    const invalidData2 = {
      customerId: "cust_1",
      amountInRupees: [2500], // Array instead of number
    };
    assert.throws(
      () => parseGrowthActionParameters(invalidData2),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /amountInRupees/);
        return true;
      }
    );
  });

  it("F: Invalid failure details structure is rejected", () => {
    const invalidData = {
      customerId: "cust_1",
      lastFailureReason: "Some failure",
      lastFailureDetails: "invalid_string_instead_of_object",
    };

    assert.throws(
      () => parseGrowthActionParameters(invalidData),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /lastFailureDetails/);
        return true;
      }
    );

    const validFailureData = {
      customerId: "cust_1",
      lastFailureReason: "Some failure",
      lastFailureDetails: {
        statusCode: 400,
        code: "BAD_REQUEST_ERROR",
        description: "Payment link creation error",
        field: "amount",
        isRetry: false,
      },
    };

    const parsed = parseGrowthActionParameters(validFailureData);
    assert.equal(parsed.lastFailureDetails?.statusCode, 400);
    assert.equal(parsed.lastFailureDetails?.code, "BAD_REQUEST_ERROR");
  });

  it("G: Unknown fields are safely preserved via passthrough policy without bypassing type validation for known fields", () => {
    const paramsWithCustomMetadata = {
      customerId: "cust_999",
      targetProductId: "prod_888",
      amountInRupees: 1500,
      customDiscountNote: "Festive Season Offer 2026",
      crmLeadId: "lead_abc_123",
    };

    const parsed = parseGrowthActionParameters(paramsWithCustomMetadata);
    assert.equal(parsed.customerId, "cust_999");
    assert.equal((parsed as any).customDiscountNote, "Festive Season Offer 2026");
    assert.equal((parsed as any).crmLeadId, "lead_abc_123");

    // But invalid known fields mixed with custom metadata must still be rejected!
    const mixedInvalid = {
      ...paramsWithCustomMetadata,
      amountInPaise: "invalid_paise_string",
    };

    assert.throws(
      () => parseGrowthActionParameters(mixedInvalid),
      (err: any) => {
        assert.ok(err instanceof InvalidGrowthActionParametersError);
        assert.match(err.message, /amountInPaise/);
        return true;
      }
    );
  });

  it("H: toPrismaJson() accepts validated GrowthActionParameters", () => {
    const validatedParams = parseGrowthActionParameters({
      customerId: "cust_1",
      targetProductId: "prod_1",
      amountInRupees: 2000,
      amountInPaise: 200000,
      currency: "INR",
    });

    const prismaJson = toPrismaJson(validatedParams);
    assert.ok(prismaJson);
    assert.equal((prismaJson as any).customerId, "cust_1");
  });

  it("I: Empty or null parameters return empty object", () => {
    assert.deepEqual(parseGrowthActionParameters(null), {});
    assert.deepEqual(parseGrowthActionParameters(undefined), {});
    assert.deepEqual(parseGrowthActionParameters({}), {});
  });
});
