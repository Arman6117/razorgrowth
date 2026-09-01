import "dotenv/config";
import { prisma } from "../prisma";
import { decryptSecret } from "../crypto/encryption";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
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

export class RazorpayApiError extends Error {
  public statusCode: number;
  public code?: string;
  public description?: string;
  public field?: string;

  constructor(statusCode: number, errorData?: { code?: string; description?: string; field?: string }) {
    const message = errorData?.description || errorData?.code || `Razorpay API error (HTTP ${statusCode})`;
    super(message);
    this.name = "RazorpayApiError";
    this.statusCode = statusCode;
    this.code = errorData?.code;
    this.description = errorData?.description;
    this.field = errorData?.field;
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

/**
 * Low-level HTTP client helper executing requests with explicit Razorpay credentials.
 */
export async function razorpayRequestWithCredentials<TResponse>(
  credentials: RazorpayCredentials,
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<TResponse> {
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

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseText = await response.text();
  let responseData: unknown;
  try {
    responseData = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    const errObj = (responseData as { error?: { code?: string; description?: string; field?: string } })?.error;
    throw new RazorpayApiError(response.status, errObj);
  }

  return responseData as TResponse;
}

/**
 * Low-level HTTP client helper for Razorpay API.
 * Uses global environment credentials by default.
 */
export async function razorpayRequest<TResponse>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<TResponse> {
  const credentials = getRazorpayCredentials();
  return razorpayRequestWithCredentials<TResponse>(credentials, endpoint, options);
}

/**
 * Executes an authenticated Razorpay API request scoped to a specific merchant.
 */
export async function razorpayMerchantRequest<TResponse>(
  merchantId: string,
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<TResponse> {
  const credentials = await getMerchantRazorpayCredentials(merchantId);
  return razorpayRequestWithCredentials<TResponse>(credentials, endpoint, options);
}
