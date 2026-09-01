import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Query merchant
    const merchant = await prisma.merchant.findUnique({
      where: { email: normalizedEmail },
    });

    // Generic error message to prevent user enumeration attacks
    const invalidAuthResponse = NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );

    if (!merchant || !merchant.passwordHash) {
      return invalidAuthResponse;
    }

    const isValidPassword = await verifyPassword(String(password), merchant.passwordHash);
    if (!isValidPassword) {
      return invalidAuthResponse;
    }

    // Create session
    const { sessionToken, expiresAt } = await createSession(merchant.id);
    const cookieHeader = buildSessionCookieHeader(sessionToken, expiresAt);

    const headers = new Headers();
    headers.append("Set-Cookie", cookieHeader);

    return NextResponse.json(
      {
        success: true,
        merchant: {
          id: merchant.id,
          name: merchant.name,
          email: merchant.email,
          currency: merchant.currency,
        },
        message: "Logged in successfully",
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during login" },
      { status: 500 }
    );
  }
}
