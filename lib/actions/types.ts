import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import {
  GrowthActionStatus,
  GrowthActionType,
  AuditActor,
  OpportunityStatus,
} from "../generated/prisma/enums";
import type { GrowthActionModel } from "../generated/prisma/models/GrowthAction";
import type { PaymentLinkResult } from "../razorpay/payment-links";
import { InvalidGrowthActionParametersError } from "./errors";

// ============================================================================
// ZOD SCHEMAS & PARAMETER TYPES
// ============================================================================

export const GrowthActionFailureDetailsSchema = z
  .object({
    statusCode: z.number().optional(),
    code: z.string().optional(),
    description: z.string().optional(),
    field: z.string().optional(),
    isRetry: z.boolean().optional(),
  })
  .passthrough();

export type GrowthActionFailureDetails = z.infer<
  typeof GrowthActionFailureDetailsSchema
>;

/**
 * Zod schema defining the valid typed structure of GrowthAction.parameters.
 * Uses .passthrough() to retain unmodeled/custom metadata while strictly enforcing
 * runtime type correctness for all known domain properties.
 */
export const GrowthActionParametersSchema = z
  .object({
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    customerEmail: z.string().optional(),
    targetProductId: z.string().optional(),
    targetProductName: z.string().optional(),
    sourceProductId: z.string().nullable().optional(),
    amountInRupees: z.number().optional(),
    amountInPaise: z.number().optional(),
    currency: z.string().optional(),
    paymentLinkId: z.string().optional(),
    shortUrl: z.string().optional(),
    paymentLinkStatus: z.string().optional(),
    paymentLinkCreatedAt: z.number().optional(),
    lastExecutedAt: z.string().optional(),
    retriedAt: z.string().optional(),
    lastResentAt: z.string().optional(),
    resendCount: z.number().optional(),
    lastFailureReason: z.string().optional(),
    lastFailureCode: z.string().optional(),
    lastFailureAt: z.string().optional(),
    lastFailureDetails: GrowthActionFailureDetailsSchema.optional(),
    description: z.string().optional(),
    linkUrl: z.string().optional(),
    qrCodeUrl: z.string().optional(),
  })
  .passthrough();

export type GrowthActionParameters = z.infer<
  typeof GrowthActionParametersSchema
>;

export type SafeParseGrowthActionResult =
  | { success: true; data: GrowthActionParameters }
  | { success: false; error: InvalidGrowthActionParametersError };

/**
 * Safely parses GrowthAction parameters JSON with runtime validation without throwing.
 * Returns a discriminated union { success: true, data } | { success: false, error }.
 */
export function safeParseGrowthActionParameters(
  raw: unknown
): SafeParseGrowthActionResult {
  if (raw === null || raw === undefined) {
    return { success: true, data: {} };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      success: false,
      error: new InvalidGrowthActionParametersError(
        "GrowthAction parameters must be a JSON object"
      ),
    };
  }
  const result = GrowthActionParametersSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const issueSummary = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return {
    success: false,
    error: new InvalidGrowthActionParametersError(
      `Invalid GrowthAction parameters: ${issueSummary}`,
      result.error.issues
    ),
  };
}

/**
 * Strictly parses and validates GrowthAction parameters JSON.
 * Throws InvalidGrowthActionParametersError if raw data violates schema.
 */
export function parseGrowthActionParameters(
  raw: unknown
): GrowthActionParameters {
  const result = safeParseGrowthActionParameters(raw);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/**
 * Converts validated GrowthActionParameters to Prisma-compatible InputJsonObject.
 * Accepts ONLY already-validated GrowthActionParameters.
 */
export function toPrismaJson(
  params: GrowthActionParameters
): Prisma.InputJsonObject {
  return params as unknown as Prisma.InputJsonObject;
}

// ============================================================================
// DOMAIN INPUT & RESULT INTERFACES
// ============================================================================

export interface IsCustomerEligibleInput {
  customerId: string;
  sourceProductId?: string | null;
  targetProductId: string;
  merchantId?: string;
  opportunityId?: string;
  client?: any;
}

export interface DuplicateActionCheckInput {
  merchantId: string;
  opportunityId: string;
  customerId: string;
  excludeActionId?: string;
  client?: any;
}

export interface CreateGrowthActionInput {
  merchantId: string;
  opportunityId: string;
  customerId: string;
  sourceProductId?: string;
  targetProductId?: string;
  type?: GrowthActionType;
}

export interface SkippedCustomerInfo {
  customerId: string;
  reason: string;
  type: "DUPLICATE" | "INELIGIBLE" | "NOT_FOUND" | "ERROR";
}

export interface CreateGrowthActionsForCustomersInput {
  merchantId: string;
  opportunityId: string;
  customerIds?: string[];
  sourceProductId?: string;
  targetProductId?: string;
  type?: GrowthActionType;
}

export interface CreateGrowthActionsForCustomersResult {
  success: boolean;
  createdCount: number;
  duplicateCount: number;
  rejectedCount: number;
  actionIds: string[];
  skippedCustomers: SkippedCustomerInfo[];
  createdActions: GrowthActionModel[];
}

export interface ApproveGrowthActionInput {
  merchantId: string;
  actionId: string;
}

export interface ApproveGrowthActionsForOpportunityInput {
  merchantId: string;
  opportunityId: string;
}

export interface ApproveGrowthActionsForOpportunityResult {
  success: boolean;
  approvedCount: number;
  actionIds: string[];
}

export interface ExecuteGrowthActionInput {
  merchantId: string;
  actionId: string;
  description?: string;
  callbackUrl?: string;
  callbackMethod?: "get" | "post";
  actor?: AuditActor;
  markAsExecuted?: boolean;
}

export interface ExecuteGrowthActionResult {
  action: GrowthActionModel;
  paymentLink: PaymentLinkResult;
}

export interface RejectGrowthActionInput {
  merchantId: string;
  actionId: string;
  reason?: string;
}

export interface ResendGrowthActionPaymentLinkInput {
  merchantId: string;
  actionId: string;
  medium?: "email" | "sms";
}

export interface ResendGrowthActionPaymentLinkResult {
  success: boolean;
  action: GrowthActionModel;
  notifyResult: Record<string, unknown>;
}

export interface GetGrowthActionInput {
  merchantId: string;
  actionId: string;
}

export interface ListGrowthActionsInput {
  merchantId: string;
  opportunityId?: string;
  status?: GrowthActionStatus;
}
