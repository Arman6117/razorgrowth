import { prisma } from "../prisma";
import {
  GrowthActionStatus,
  GrowthActionType,
  AuditActor,
} from "../generated/prisma/enums";
import {
  createPaymentLink,
} from "../razorpay/payment-links";
import { RazorpayApiError, RazorpayRequestError } from "../razorpay/client";
import {
  ValidationError,
  NotFoundError,
  InactiveProductError,
  IneligibleCustomerError,
  DuplicateActionError,
  InvalidStateTransitionError,
} from "./errors";
import { assertCanExecute } from "./state-machine";
import { isCustomerEligible } from "./eligibility";
import { duplicateActionCheck } from "./duplicate-check";
import {
  parseGrowthActionParameters,
  safeParseGrowthActionParameters,
  toPrismaJson,
} from "./types";
import type {
  ExecuteGrowthActionInput,
  ExecuteGrowthActionResult,
} from "./types";

/**
 * Executes an APPROVED or FAILED (retry) CREATE_PAYMENT_LINK GrowthAction.
 *
 * STATE MACHINE:
 * - Allowed transitions:
 *     - APPROVED → EXECUTING
 *     - FAILED (retry) → EXECUTING
 * - Idempotency protection: EXECUTED actions CANNOT be executed again.
 * - Race-safe: Database conditional update ensures only ONE concurrent request can transition
 *   the action to EXECUTING. Concurrent duplicate execution requests fail cleanly.
 * - Calling on FAILED records an ACTION_RETRY audit event.
 * - Re-runs authoritative customer, product, and eligibility guardrails.
 * - Calls Razorpay Payment Link API (test mode).
 * - Stores payment link data into GrowthAction.parameters.
 * - Records PAYMENT_LINK_CREATED and PAYMENT_LINK_DELIVERED AuditEvents.
 * - On API failure: Transitions status to FAILED and records detailed GROWTH_ACTION_FAILED AuditEvent,
 *   including explicit explanations if Razorpay Test Mode maximum transaction limits are exceeded.
 * - Final transition to EXECUTED happens upon verified payment_link.paid webhook (or if markAsExecuted is requested).
 */
export async function executeGrowthAction(
  input: ExecuteGrowthActionInput
): Promise<ExecuteGrowthActionResult> {
  const {
    merchantId,
    actionId,
    description,
    callbackUrl,
    callbackMethod,
    actor,
    markAsExecuted,
  } = input;

  if (!merchantId?.trim()) {
    throw new ValidationError("merchantId is required");
  }
  if (!actionId?.trim()) {
    throw new ValidationError("actionId is required");
  }

  // 1. Atomically transition status to EXECUTING with conditional update
  const { isRetry, growthAction } = await prisma.$transaction(async (tx) => {
    // Check initial state
    const action = await tx.growthAction.findFirst({
      where: { id: actionId, merchantId },
      include: { opportunity: true },
    });

    if (!action) {
      throw new NotFoundError(
        `GrowthAction '${actionId}' not found for merchant '${merchantId}'`
      );
    }

    assertCanExecute(action.status, actionId);

    if (action.type !== GrowthActionType.CREATE_PAYMENT_LINK) {
      throw new ValidationError(
        `Unsupported GrowthAction type for execution: '${action.type}'`
      );
    }

    const isRetry = action.status === GrowthActionStatus.FAILED;
    const expectedPreviousStatus = action.status; // Either APPROVED or FAILED
    const executionActor =
      actor || (isRetry ? AuditActor.MERCHANT : AuditActor.SYSTEM);

    // Conditional atomic update: only update if still in expectedPreviousStatus!
    const updateResult = await tx.growthAction.updateMany({
      where: {
        id: actionId,
        merchantId,
        status: expectedPreviousStatus,
      },
      data: {
        status: GrowthActionStatus.EXECUTING,
      },
    });

    if (updateResult.count === 0) {
      // A concurrent request changed the status before our update
      const freshAction = await tx.growthAction.findFirst({
        where: { id: actionId, merchantId },
      });

      if (!freshAction) {
        throw new NotFoundError(
          `GrowthAction '${actionId}' not found for merchant '${merchantId}'`
        );
      }

      assertCanExecute(freshAction.status, actionId);

      throw new InvalidStateTransitionError(
        `Cannot execute GrowthAction in status '${freshAction.status}'. Allowed statuses: APPROVED, FAILED.`
      );
    }

    // Record ACTION_RETRY audit event if retrying (atomic with the status transition)
    if (isRetry) {
      await tx.auditEvent.create({
        data: {
          merchantId,
          actionId: action.id,
          eventType: "ACTION_RETRY",
          actor: executionActor,
          metadata: {
            actionId: action.id,
            opportunityId: action.opportunityId,
            previousStatus: GrowthActionStatus.FAILED,
            retriedAt: new Date().toISOString(),
          },
        },
      });
    }

    return {
      isRetry,
      growthAction: action,
    };
  });

  try {
    // Extract and validate parameters
    const params = parseGrowthActionParameters(growthAction.parameters);

    const customerId = params.customerId?.trim();
    const targetProductId =
      params.targetProductId?.trim() || growthAction.opportunity?.targetProductId;
    const sourceProductId =
      params.sourceProductId?.trim() ||
      growthAction.opportunity?.sourceProductId ||
      undefined;

    if (!customerId) {
      throw new ValidationError("GrowthAction parameters missing customerId");
    }
    if (!targetProductId) {
      throw new ValidationError("GrowthAction parameters missing targetProductId");
    }

    // Authoritative check: Customer & Target Product must still belong to merchant and product must be active
    const [customer, targetProduct] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: customerId, merchantId },
      }),
      prisma.product.findFirst({
        where: { id: targetProductId, merchantId },
      }),
    ]);

    if (!customer) {
      throw new NotFoundError(
        `Customer '${customerId}' not found or does not belong to merchant`
      );
    }
    if (!targetProduct) {
      throw new NotFoundError(
        `Target product '${targetProductId}' not found or does not belong to merchant`
      );
    }
    if (!targetProduct.active) {
      throw new InactiveProductError(
        `Target product '${targetProduct.name}' is inactive`
      );
    }

    // Re-verify customer eligibility (must not have bought target product in any PAID order)
    const eligible = await isCustomerEligible({
      merchantId,
      customerId: customer.id,
      sourceProductId,
      targetProductId: targetProduct.id,
      opportunityId: growthAction.opportunityId,
    });

    if (!eligible) {
      throw new IneligibleCustomerError(
        "Customer is no longer eligible for this opportunity"
      );
    }

    // Verify duplicate action check does not detect another active in-flight action
    const duplicate = await duplicateActionCheck({
      merchantId,
      opportunityId: growthAction.opportunityId,
      customerId: customer.id,
      excludeActionId: growthAction.id,
    });
    if (duplicate) {
      throw new DuplicateActionError(
        `Another active action (${duplicate.id}, status: ${duplicate.status}) exists for customer '${customer.id}'`
      );
    }

    // Call existing Razorpay payment link service
    const paymentLinkResult = await createPaymentLink({
      merchantId,
      customerId: customer.id,
      targetProductId: targetProduct.id,
      opportunityId: growthAction.opportunityId,
      growthActionId: growthAction.id,
      description:
        description ||
        params.description ||
        `Cross-sell offer: ${targetProduct.name}`,
      callbackUrl,
      callbackMethod,
    });

    // Clean up any past failure details from parameters upon successful link creation
    const {
      lastFailureReason: _lfr,
      lastFailureCode: _lfc,
      lastFailureAt: _lfa,
      lastFailureDetails: _lfd,
      ...cleanParams
    } = params;

    const updatedParameters = {
      ...cleanParams,
      paymentLinkId: paymentLinkResult.paymentLinkId,
      shortUrl: paymentLinkResult.shortUrl,
      paymentLinkStatus: paymentLinkResult.status,
      amountInRupees: paymentLinkResult.amountInRupees,
      amountInPaise: paymentLinkResult.amountInPaise,
      currency: paymentLinkResult.currency,
      paymentLinkCreatedAt: paymentLinkResult.createdAt,
      lastExecutedAt: new Date().toISOString(),
      retriedAt: isRetry ? new Date().toISOString() : undefined,
    };

    const finalStatus = markAsExecuted
      ? GrowthActionStatus.EXECUTED
      : GrowthActionStatus.EXECUTING;
    const executedAtTimestamp = markAsExecuted ? new Date() : undefined;

    const updatedAction = await prisma.$transaction(async (tx) => {
      const updated = await tx.growthAction.update({
        where: { id: growthAction.id },
        data: {
          status: finalStatus,
          executedAt: executedAtTimestamp,
          parameters: toPrismaJson(updatedParameters),
        },
      });

      await tx.auditEvent.create({
        data: {
          merchantId,
          actionId: growthAction.id,
          eventType: "PAYMENT_LINK_CREATED",
          actor: AuditActor.SYSTEM,
          metadata: {
            paymentLinkId: paymentLinkResult.paymentLinkId,
            shortUrl: paymentLinkResult.shortUrl,
            amountInRupees: paymentLinkResult.amountInRupees,
            amountInPaise: paymentLinkResult.amountInPaise,
            currency: paymentLinkResult.currency,
            createdAt: new Date().toISOString(),
            isRetry,
          },
        },
      });

      // Record delivery/notification requested AuditEvent via Razorpay native email
      await tx.auditEvent.create({
        data: {
          merchantId,
          actionId: growthAction.id,
          eventType: "PAYMENT_LINK_DELIVERED",
          actor: AuditActor.RAZORPAY,
          metadata: {
            paymentLinkId: paymentLinkResult.paymentLinkId,
            shortUrl: paymentLinkResult.shortUrl,
            deliveryMedium: "EMAIL",
            customerId: customer.id,
            customerEmail: customer.email,
            notificationRequested: true,
            sentAt: new Date().toISOString(),
          },
        },
      });

      return updated;
    });

    return {
      action: updatedAction,
      paymentLink: paymentLinkResult,
    };
  } catch (err: unknown) {
    const rawErrorMessage = err instanceof Error ? err.message : String(err);
    let errorCode: string | undefined;
    let errorDescription: string | undefined;
    let errorField: string | undefined;
    let statusCode: number | undefined;

    if (err instanceof RazorpayRequestError) {
      errorCode = err.code;
      errorDescription = err.description;
      errorField = err.field;
      statusCode = err.statusCode;
    }

    // Explicitly diagnose Razorpay test-mode transaction amount limit
    let failureExplanation = rawErrorMessage;
    const isAmountLimitError =
      rawErrorMessage.toLowerCase().includes("amount exceeds maximum amount allowed") ||
      errorDescription?.toLowerCase().includes("amount exceeds maximum amount allowed");

    if (isAmountLimitError) {
      failureExplanation = `Razorpay Test Mode limit exceeded: Payment link amount exceeds Razorpay Test Mode maximum limit of ₹50,000 per payment link. Authoritative product price in database remains unchanged.`;
    }

    const currentParamsResult = safeParseGrowthActionParameters(growthAction.parameters);
    const currentParams = currentParamsResult.success ? currentParamsResult.data : {};

    const updatedParamsWithFailure = {
      ...currentParams,
      lastFailureReason: failureExplanation,
      lastFailureCode: errorCode || "EXECUTION_ERROR",
      lastFailureAt: new Date().toISOString(),
      lastFailureDetails: {
        statusCode,
        code: errorCode,
        description: errorDescription || rawErrorMessage,
        field: errorField,
        isRetry,
      },
    };

    // On execution failure, atomically update GrowthAction to FAILED and record audit event
    await prisma.$transaction(async (tx) => {
      await tx.growthAction.update({
        where: { id: growthAction.id },
        data: {
          status: GrowthActionStatus.FAILED,
          parameters: toPrismaJson(updatedParamsWithFailure),
        },
      });

      await tx.auditEvent.create({
        data: {
          merchantId,
          actionId: growthAction.id,
          eventType: "GROWTH_ACTION_FAILED",
          actor: AuditActor.SYSTEM,
          metadata: {
            error: failureExplanation,
            rawError: rawErrorMessage,
            code: errorCode || null,
            statusCode: statusCode || null,
            field: errorField || null,
            isRetry,
            failedAt: new Date().toISOString(),
          },
        },
      });
    });

    throw new Error(failureExplanation);
  }
}
