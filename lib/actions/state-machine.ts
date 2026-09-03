import { GrowthActionStatus } from "../generated/prisma/enums";
import { InvalidStateTransitionError } from "./errors";

/**
 * State machine predicates and assertion helpers for GrowthAction lifecycle.
 * Centralizes all transition rules while strictly maintaining existing error semantics.
 */

export function canApprove(status: GrowthActionStatus): boolean {
  return (
    status === GrowthActionStatus.PENDING_APPROVAL ||
    status === GrowthActionStatus.APPROVED
  );
}

export function assertCanApprove(status: GrowthActionStatus): void {
  if (status !== GrowthActionStatus.PENDING_APPROVAL && status !== GrowthActionStatus.APPROVED) {
    throw new InvalidStateTransitionError(
      `Cannot approve GrowthAction in status '${status}'. Must be in '${GrowthActionStatus.PENDING_APPROVAL}' status.`
    );
  }
}

export function canExecute(status: GrowthActionStatus): boolean {
  return (
    status === GrowthActionStatus.APPROVED ||
    status === GrowthActionStatus.FAILED
  );
}

export function assertCanExecute(
  status: GrowthActionStatus,
  actionId?: string
): void {
  if (status === GrowthActionStatus.EXECUTED) {
    throw new InvalidStateTransitionError(
      `Cannot execute GrowthAction${actionId ? ` '${actionId}'` : ""}: action has already been EXECUTED.`
    );
  }

  if (status === GrowthActionStatus.PENDING_APPROVAL) {
    throw new InvalidStateTransitionError(
      `Cannot execute GrowthAction in status '${status}'. Action must be in '${GrowthActionStatus.APPROVED}' status before execution.`
    );
  }

  if (status === GrowthActionStatus.REJECTED) {
    throw new InvalidStateTransitionError(
      `Cannot execute GrowthAction in status '${status}'. Action has been rejected.`
    );
  }

  if (status === GrowthActionStatus.EXECUTING) {
    throw new InvalidStateTransitionError(
      `Cannot execute GrowthAction in status '${status}'. Action is already currently executing.`
    );
  }

  if (
    status !== GrowthActionStatus.APPROVED &&
    status !== GrowthActionStatus.FAILED
  ) {
    throw new InvalidStateTransitionError(
      `Cannot execute GrowthAction in status '${status}'. Allowed statuses: APPROVED, FAILED.`
    );
  }
}

export function canReject(status: GrowthActionStatus): boolean {
  return (
    status === GrowthActionStatus.PENDING_APPROVAL ||
    status === GrowthActionStatus.APPROVED
  );
}

export function assertCanReject(status: GrowthActionStatus): void {
  if (!canReject(status)) {
    throw new InvalidStateTransitionError(
      `Cannot reject GrowthAction in status '${status}'`
    );
  }
}

export function canResend(status: GrowthActionStatus): boolean {
  return (
    status !== GrowthActionStatus.EXECUTED &&
    status !== GrowthActionStatus.PENDING_APPROVAL &&
    status !== GrowthActionStatus.REJECTED
  );
}

export function assertCanResend(
  status: GrowthActionStatus,
  actionId?: string
): void {
  if (status === GrowthActionStatus.EXECUTED) {
    throw new InvalidStateTransitionError(
      `Cannot resend notification for already EXECUTED (paid) GrowthAction${actionId ? ` '${actionId}'` : ""}`
    );
  }

  if (status === GrowthActionStatus.PENDING_APPROVAL) {
    throw new InvalidStateTransitionError(
      `Cannot resend notification: Action is in '${GrowthActionStatus.PENDING_APPROVAL}' and has no active Payment Link`
    );
  }

  if (status === GrowthActionStatus.REJECTED) {
    throw new InvalidStateTransitionError(
      `Cannot resend notification: Action has been rejected`
    );
  }
}

export function canRetry(status: GrowthActionStatus): boolean {
  return status === GrowthActionStatus.FAILED;
}
