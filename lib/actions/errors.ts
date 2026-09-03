/**
 * Typed domain errors for GrowthAction operations.
 * Preserves error message strings to maintain 100% backward compatibility
 * with API route status-code resolvers and test assertions.
 */

export class GrowthActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrowthActionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends GrowthActionError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends GrowthActionError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class InvalidGrowthActionParametersError extends ValidationError {
  public readonly issues?: Array<{ path: Array<string | number | symbol>; message: string }>;

  constructor(
    message: string,
    issues?: Array<{ path: Array<string | number | symbol>; message: string }>
  ) {
    super(message);
    this.name = "InvalidGrowthActionParametersError";
    this.issues = issues;
  }
}

export class IneligibleCustomerError extends GrowthActionError {
  constructor(message = "Customer is not eligible for this opportunity") {
    super(message);
    this.name = "IneligibleCustomerError";
  }
}

export class InactiveProductError extends GrowthActionError {
  constructor(message: string) {
    super(message);
    this.name = "InactiveProductError";
  }
}

export class DuplicateActionError extends GrowthActionError {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateActionError";
  }
}

export class InvalidStateTransitionError extends GrowthActionError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateTransitionError";
  }
}

export class ExecutionError extends GrowthActionError {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionError";
  }
}
