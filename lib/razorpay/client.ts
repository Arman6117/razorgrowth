import "dotenv/config";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export class RazorpayConfigError extends Error {
  public missingVariables: string[];

  constructor(missingVariables: string[]) {
    super(
      `Razorpay configuration error: Missing required environment variable(s): ${missingVariables.join(
        ", "
      )}. Please set them in your .env or environment configuration.`
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
 * Retrieves and validates Razorpay API credentials from environment variables.
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
 * Low-level HTTP client helper for Razorpay API.
 * Uses HTTP Basic Authentication.
 */
export async function razorpayRequest<TResponse>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<TResponse> {
  const { keyId, keySecret } = getRazorpayCredentials();

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
