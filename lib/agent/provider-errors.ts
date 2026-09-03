/**
 * Provider error classification module.
 * Replaces overly broad heuristics with structured categorization.
 */

export type ProviderErrorCategory =
  | "RATE_LIMIT"
  | "QUOTA_EXHAUSTED"
  | "TEMPORARY_UNAVAILABLE"
  | "AUTHENTICATION"
  | "INVALID_REQUEST"
  | "UNKNOWN";

export interface ClassifiedProviderError {
  category: ProviderErrorCategory;
  isFallbackEligible: boolean;
  statusCode?: number;
  grpcStatus?: string;
  message: string;
  safeClientMessage: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts numeric HTTP status code from top-level or nested error structures safely.
 */
export function extractStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;

  if (typeof error.status === "number") return error.status;
  if (typeof error.statusCode === "number") return error.statusCode;

  if (isRecord(error.response) && typeof error.response.status === "number") {
    return error.response.status;
  }

  if (isRecord(error.data) && isRecord(error.data.error) && typeof error.data.error.code === "number") {
    return error.data.error.code;
  }

  if (isRecord(error.cause)) {
    if (typeof error.cause.status === "number") return error.cause.status;
    if (typeof error.cause.statusCode === "number") return error.cause.statusCode;
  }

  return undefined;
}

/**
 * Extracts gRPC status string (e.g. from Google / Gemini SDK errors).
 */
export function extractGrpcStatus(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;

  if (typeof error.grpcStatus === "string") return error.grpcStatus;

  if (isRecord(error.data) && isRecord(error.data.error) && typeof error.data.error.status === "string") {
    return error.data.error.status;
  }

  return undefined;
}

/**
 * Extracts raw error message safely across various SDK error representations.
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (isRecord(error)) {
    if (typeof error.message === "string") return error.message;
    if (isRecord(error.data) && isRecord(error.data.error) && typeof error.data.error.message === "string") {
      return error.data.error.message;
    }
    if (isRecord(error.error) && typeof error.error.message === "string") {
      return error.error.message;
    }
  }
  return String(error ?? "Unknown error");
}

/**
 * Redacts any detected API key patterns or sensitive credential tokens from error text.
 */
export function redactErrorText(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z-_]{20,}/g, "[REDACTED_GEMINI_KEY]")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED_API_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]");
}

/**
 * Classifies an unknown error into a structured provider error category.
 */
export function classifyProviderError(error: unknown): ClassifiedProviderError {
  if (!error) {
    return {
      category: "UNKNOWN",
      isFallbackEligible: false,
      message: "No error information provided",
      safeClientMessage: "An unknown AI service error occurred.",
    };
  }

  const statusCode = extractStatusCode(error);
  const grpcStatus = extractGrpcStatus(error);
  const rawMessage = extractErrorMessage(error);
  const sanitizedMessage = redactErrorText(rawMessage);
  const lowerMessage = sanitizedMessage.toLowerCase();

  // 1. Authentication / Permission errors (NEVER fallback-eligible)
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    grpcStatus === "PERMISSION_DENIED" ||
    grpcStatus === "UNAUTHENTICATED" ||
    lowerMessage.includes("api_key_invalid") ||
    lowerMessage.includes("invalid api key") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("permission denied") ||
    lowerMessage.includes("authentication failed")
  ) {
    return {
      category: "AUTHENTICATION",
      isFallbackEligible: false,
      statusCode,
      grpcStatus,
      message: sanitizedMessage,
      safeClientMessage:
        "AI service configuration or authentication failed. Please check your credentials.",
    };
  }

  // 2. Quota Exhaustion (Fallback-eligible) - Check before general client error
  if (
    grpcStatus === "RESOURCE_EXHAUSTED" ||
    lowerMessage.includes("resource_exhausted") ||
    lowerMessage.includes("quota exceeded") ||
    lowerMessage.includes("exceeded your current quota") ||
    lowerMessage.includes("free_tier_requests") ||
    lowerMessage.includes("insufficient_quota") ||
    lowerMessage.includes("resource has been exhausted") ||
    (lowerMessage.includes("quota") && !lowerMessage.includes("no quota"))
  ) {
    return {
      category: "QUOTA_EXHAUSTED",
      isFallbackEligible: true,
      statusCode: statusCode || 429,
      grpcStatus,
      message: sanitizedMessage,
      safeClientMessage:
        "AI provider quota is currently exhausted. Please try again shortly.",
    };
  }

  // 3. Rate Limit (Fallback-eligible)
  if (
    statusCode === 429 ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("rate_limit") ||
    lowerMessage.includes("ratelimit") ||
    lowerMessage.includes("too many requests")
  ) {
    return {
      category: "RATE_LIMIT",
      isFallbackEligible: true,
      statusCode: 429,
      grpcStatus,
      message: sanitizedMessage,
      safeClientMessage:
        "AI service is momentarily rate-limited. Please try again shortly.",
    };
  }

  // 4. Temporary Unavailable / Overloaded (Fallback-eligible)
  if (
    statusCode === 503 ||
    statusCode === 502 ||
    statusCode === 504 ||
    statusCode === 500 ||
    grpcStatus === "UNAVAILABLE" ||
    lowerMessage.includes("service unavailable") ||
    lowerMessage.includes("temporarily unavailable") ||
    lowerMessage.includes("overloaded") ||
    lowerMessage.includes("model is overloaded")
  ) {
    return {
      category: "TEMPORARY_UNAVAILABLE",
      isFallbackEligible: true,
      statusCode,
      grpcStatus,
      message: sanitizedMessage,
      safeClientMessage:
        "AI provider is temporarily unavailable. Please try again shortly.",
    };
  }

  // 5. Invalid Request / Validation errors (NEVER fallback-eligible)
  if (
    statusCode === 400 ||
    statusCode === 404 ||
    statusCode === 422 ||
    grpcStatus === "INVALID_ARGUMENT" ||
    grpcStatus === "NOT_FOUND" ||
    lowerMessage.includes("invalid argument") ||
    lowerMessage.includes("validation error") ||
    lowerMessage.includes("bad request") ||
    lowerMessage.includes("invalid prompt")
  ) {
    return {
      category: "INVALID_REQUEST",
      isFallbackEligible: false,
      statusCode,
      grpcStatus,
      message: sanitizedMessage,
      safeClientMessage:
        "Invalid request format provided to AI service.",
    };
  }

  // 6. Default: Unknown (Not fallback-eligible)
  return {
    category: "UNKNOWN",
    isFallbackEligible: false,
    statusCode,
    grpcStatus,
    message: sanitizedMessage,
    safeClientMessage:
      "An unexpected error occurred while processing the AI request.",
  };
}

/**
 * Convenience compatibility helper.
 * Returns true if the error qualifies for provider fallback.
 */
export function isProviderAvailabilityOrQuotaError(error: unknown): boolean {
  return classifyProviderError(error).isFallbackEligible;
}
