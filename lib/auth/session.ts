import crypto from "node:crypto";
import { prisma } from "../prisma";
import type { MerchantModel } from "../generated/prisma/models/Merchant";

export const SESSION_COOKIE_NAME = "razorgrowth_session";
export const SESSION_DURATION_DAYS = 30;

export class AuthError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

/**
 * Creates a database-backed session for a merchant.
 */
export async function createSession(merchantId: string): Promise<{
  sessionToken: string;
  expiresAt: Date;
}> {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      sessionToken,
      merchantId,
      expiresAt,
    },
  });

  return { sessionToken, expiresAt };
}

/**
 * Destroys an active session by token.
 */
export async function destroySession(sessionToken: string): Promise<void> {
  if (!sessionToken) return;
  try {
    await prisma.session.deleteMany({
      where: { sessionToken },
    });
  } catch {
    // Ignore if already deleted
  }
}

/**
 * Extracts session token from a NextRequest, standard Request, or cookies.
 */
export function extractSessionToken(req?: Request): string | null {
  if (!req) return null;

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // 2. Check cookie header
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
        return decodeURIComponent(cookie.substring(SESSION_COOKIE_NAME.length + 1));
      }
    }
  }

  return null;
}

/**
 * Resolves the authenticated merchant from an active session token.
 */
export async function resolveMerchantFromToken(
  sessionToken: string
): Promise<MerchantModel | null> {
  if (!sessionToken?.trim()) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: {
      merchant: true,
    },
  });

  if (!session) return null;

  // Check expiration
  if (session.expiresAt.getTime() < Date.now()) {
    // Clean up expired session in background
    prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session.merchant;
}

/**
 * Server-side helper to resolve the authenticated merchant.
 * Supports Next.js Request objects, standard Web Requests, or next/headers cookies.
 */
export async function getAuthenticatedMerchant(
  req?: Request
): Promise<MerchantModel | null> {
  let token: string | null = null;

  if (req) {
    token = extractSessionToken(req);
  }

  if (!token) {
    try {
      // Attempt to read next/headers cookies if available in server action / server component
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
    } catch {
      // Ignored if outside request context
    }
  }

  if (!token) return null;

  return resolveMerchantFromToken(token);
}

/**
 * Strict server-side helper that enforces merchant authentication.
 * Throws AuthError(401) if unauthenticated.
 */
export async function requireAuthenticatedMerchant(
  req?: Request
): Promise<MerchantModel> {
  const merchant = await getAuthenticatedMerchant(req);
  if (!merchant) {
    throw new AuthError("Unauthorized: Valid merchant session required", 401);
  }
  return merchant;
}

/**
 * Builds the Set-Cookie header string for establishing a session.
 */
export function buildSessionCookieHeader(
  sessionToken: string,
  expiresAt: Date
): string {
  const isProduction = process.env.NODE_ENV === "production";
  const secureFlag = isProduction ? "Secure; " : "";
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    sessionToken
  )}; Path=/; HttpOnly; ${secureFlag}SameSite=Lax; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}`;
}

/**
 * Builds the Set-Cookie header string for clearing a session.
 */
export function buildClearSessionCookieHeader(): string {
  const isProduction = process.env.NODE_ENV === "production";
  const secureFlag = isProduction ? "Secure; " : "";

  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; ${secureFlag}SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
