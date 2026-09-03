import { z } from "zod";
import { prisma } from "../prisma";
import { decryptSecret } from "../crypto/encryption";
import { RazorpayErrorPayloadSchema } from "./schemas";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

/**
 * Redacts any occurrence of known sensitive credentials from error messages or diagnostic strings.
 */
export function sanitizeSecrets(
  text: string,
  secrets: (string | undefined | null)[]
): string {
  let sanitized = text;
  for (const secret of secrets) {
    if (secret && typeof secret === "string" && secret.trim().length > 3) {
      sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }
  return sanitized;
}

export class RazorpayConfigError extends Error {
  public missingVariables: string[];

  constructor(missingVariables: string[]) {
    super(
      `Razorpay configuration error: Missing required credentials: ${missingVariables.join(
        ", "
      )}. Please connect your Razorpay account in dashboard settings or configure .env.`
    );
    this.name = "RazorpayConfigError";
    this.missingVariables = missingVariables;
  }
}

export interface RazorpayRequestErrorDetails {
  statusCode?: number;
  code?: string;
  description?: string;
  field?: string;
  isNetworkError?: boolean;
  isValidationError?: boolean;
  isParseError?: boolean;
  endpoint?: string;
}

/**
 * Normalized error class representing all Razorpay HTTP/provider/validation/network failures.
 * Never stores or leaks secrets, auth headers, or raw credentials.
 */
export class RazorpayRequestError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly description?: string;
  public readonly field?: string;
  public readonly isNetworkError: boolean;
  public readonly isValidationError: boolean;
  public readonly isParseError: boolean;
  public readonly endpoint?: string;

  constructor(
    message: string,
    details: RazorpayRequestErrorDetails = {},
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "RazorpayRequestError";
    this.statusCode = details.statusCode;
    this.code = details.code;
    this.description = details.description || message;
    this.field = details.field;
    this.isNetworkError = details.isNetworkError ?? false;
    this.isValidationError = details.isValidationError ?? false;
    this.isParseError = details.isParseError ?? false;
    this.endpoint = details.endpoint;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Backward compatibility alias for RazorpayApiError.
 */
export class RazorpayApiError extends RazorpayRequestError {
  constructor(
    statusCode: number,
    errorData?: { code?: string; description?: string; field?: string }
  ) {
    const message =
      errorData?.description ||
      errorData?.code ||
      `Razorpay API error (HTTP ${statusCode})`;
    super(
      message,
      {
        statusCode,
        code: errorData?.code,
        description: errorData?.description,
        field: errorData?.field,
      }
    );
    this.name = "RazorpayApiError";
  }
}

/**
 * Retrieves and validates global Razorpay API credentials from environment variables.
 * Fails clearly if credentials are missing or empty.
 * Never logs secrets.
 */
export function getRazorpayCredentials(): RazorpayCredentials {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  const missing: string[] = [];
  if (!keyId) missing.push("RAZORPAY_KEY_ID");
  if (!keySecret) missing.push("RAZORPAY_KEY_SECRET");

  if (missing.length > 0) {
    throw new RazorpayConfigError(missing);
  }

  return { keyId: keyId!, keySecret: keySecret! };
}

/**
 * Resolves Razorpay credentials for a specific merchant.
 * 1. Resolves from database `RazorpayConnection` if connected.
 * 2. Falls back to global environment variables (for demo merchant backward compatibility).
 * 3. Never logs or exposes the secret.
 */
export async function getMerchantRazorpayCredentials(
  merchantId: string
): Promise<RazorpayCredentials> {
  if (!merchantId) {
    throw new RazorpayConfigError(["merchantId"]);
  }

  // 1. Check if the merchant has connected credentials in the DB
  const connection = await prisma.razorpayConnection.findUnique({
    where: { merchantId },
  });

  if (connection) {
    const keySecret = decryptSecret(connection.encryptedKeySecret);
    if (connection.keyId && keySecret) {
      return {
        keyId: connection.keyId,
        keySecret,
      };
    }
  }

  // 2. Fall back to environment configuration for demo / fallback setup
  try {
    return getRazorpayCredentials();
  } catch {
    throw new RazorpayConfigError([
      `Razorpay credentials for merchant ${merchantId}`,
    ]);
  }
}

export interface RazorpayRequestOptions<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: TSchema;
}

/**
 * Low-level HTTP client helper executing requests with explicit Razorpay credentials.
 * Distinguishes network failures, non-2xx responses, malformed JSON, empty responses,
 * and validates 2xx payloads against optional Zod schemas.
 * Never leaks Key Secret or Authorization headers in errors.
 */
export async function razorpayRequestWithCredentials<
  T = unknown,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
>(
  credentials: RazorpayCredentials,
  endpoint: string,
  options: RazorpayRequestOptions<TSchema> = {}
): Promise<T> {
  const { keyId, keySecret } = credentials;

  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://api.razorpay.com/v1${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  const headers: Record<string, string> = {
    Authorization: authHeader,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkErr: unknown) {
    const rawMsg =
      networkErr instanceof Error ? networkErr.message : String(networkErr);
    const safeMsg = sanitizeSecrets(rawMsg, [keySecret, keyId]);
    throw new RazorpayRequestError(
      `Razorpay network request failed: ${safeMsg}`,
      {
        isNetworkError: true,
        code: "NETWORK_ERROR",
        description: safeMsg,
        endpoint,
      },
      { cause: networkErr }
    );
  }

  let responseText = "";
  try {
    responseText = await response.text();
  } catch (readErr: unknown) {
    const rawMsg =
      readErr instanceof Error ? readErr.message : String(readErr);
    throw new RazorpayRequestError(
      `Failed to read Razorpay response: ${rawMsg}`,
      {
        statusCode: response.status,
        isNetworkError: true,
        code: "RESPONSE_READ_ERROR",
        endpoint,
      },
      { cause: readErr }
    );
  }

  const trimmedText = responseText.trim();

  // Handle empty responses
  if (!trimmedText) {
    if (!response.ok) {
      throw new RazorpayRequestError(
        `Razorpay API error (HTTP ${response.status}): Empty response body`,
        {
          statusCode: response.status,
          code: `HTTP_${response.status}`,
          description: `HTTP ${response.status} with empty response body`,
          endpoint,
        }
      );
    }

    if (options.schema) {
      const parsed = options.schema.safeParse({});
      if (parsed.success) {
        return parsed.data as T;
      }
      throw new RazorpayRequestError(
        `Razorpay response error: Expected JSON body but received empty response (HTTP ${response.status})`,
        {
          statusCode: response.status,
          code: "EMPTY_RESPONSE",
          isValidationError: true,
          description: "Empty response body received when JSON was expected",
          endpoint,
        }
      );
    }

    return {} as T;
  }

  // Parse JSON
  let responseData: unknown;
  try {
    responseData = JSON.parse(trimmedText);
  } catch (jsonErr: unknown) {
    if (!response.ok) {
      const truncated =
        trimmedText.length > 120 ? `${trimmedText.slice(0, 120)}...` : trimmedText;
      const safeSnippet = sanitizeSecrets(truncated, [keySecret, keyId]);
      throw new RazorpayRequestError(
        `Razorpay API error (HTTP ${response.status}): Non-JSON response received: ${safeSnippet}`,
        {
          statusCode: response.status,
          code: `HTTP_${response.status}`,
          description: safeSnippet,
          endpoint,
        }
      );
    }

    throw new RazorpayRequestError(
      `Failed to parse Razorpay JSON response (HTTP ${response.status})`,
      {
        statusCode: response.status,
        code: "PARSE_ERROR",
        isParseError: true,
        description: "Response contained invalid JSON",
        endpoint,
      },
      { cause: jsonErr }
    );
  }

  // Handle non-2xx status
  if (!response.ok) {
    const errorPayloadResult = RazorpayErrorPayloadSchema.safeParse(responseData);
    const errObj = errorPayloadResult.success
      ? errorPayloadResult.data.error
      : undefined;
    const errCode = errObj?.code || `HTTP_${response.status}`;
    const errDescription =
      errObj?.description ||
      errObj?.reason ||
      `Razorpay API error (HTTP ${response.status})`;
    const errField = errObj?.field;

    const safeDescription = sanitizeSecrets(errDescription, [keySecret, keyId]);

    throw new RazorpayRequestError(safeDescription, {
      statusCode: response.status,
      code: errCode,
      description: safeDescription,
      field: errField,
      endpoint,
    });
  }

  // Validate 2xx response against schema if provided
  if (options.schema) {
    const validationResult = options.schema.safeParse(responseData);
    if (!validationResult.success) {
      const issueSummary = validationResult.error.issues
        .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
        .join("; ");
      throw new RazorpayRequestError(
        `Razorpay response validation failed: ${issueSummary}`,
        {
          statusCode: response.status,
          code: "VALIDATION_ERROR",
          isValidationError: true,
          description: `Invalid response structure from Razorpay: ${issueSummary}`,
          endpoint,
        }
      );
    }
    return validationResult.data as T;
  }

  return responseData as T;
}

/**
 * Low-level HTTP client helper for Razorpay API.
 * Uses global environment credentials by default.
 */
export async function razorpayRequest<
  T = unknown,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
>(
  endpoint: string,
  options: RazorpayRequestOptions<TSchema> = {}
): Promise<T> {
  const credentials = getRazorpayCredentials();
  return razorpayRequestWithCredentials<T, TSchema>(credentials, endpoint, options);
}

/**
 * Executes an authenticated Razorpay API request scoped to a specific merchant.
 */
export async function razorpayMerchantRequest<
  T = unknown,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
>(
  merchantId: string,
  endpoint: string,
  options: RazorpayRequestOptions<TSchema> = {}
): Promise<T> {
  const credentials = await getMerchantRazorpayCredentials(merchantId);
  return razorpayRequestWithCredentials<T, TSchema>(credentials, endpoint, options);
}
