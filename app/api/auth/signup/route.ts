import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession, buildSessionCookieHeader } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, email, password } = body;

    // Server-side validation
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Business / Store name is required" },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        { error: "Valid email address is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    // Check duplicate email
    const existing = await prisma.merchant.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A merchant account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password securely
    const passwordHash = await hashPassword(password);

    // Create Merchant as root tenant entity
    const merchant = await prisma.merchant.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        currency: "INR",
      },
      select: {
        id: true,
        name: true,
        email: true,
        currency: true,
        createdAt: true,
      },
    });

    // Create authenticated session
    const { sessionToken, expiresAt } = await createSession(merchant.id);

    const cookieHeader = buildSessionCookieHeader(sessionToken, expiresAt);
    const headers = new Headers();
    headers.append("Set-Cookie", cookieHeader);

    return NextResponse.json(
      {
        success: true,
        merchant,
        message: "Merchant account created successfully",
      },
      {
        status: 201,
        headers,
      }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Failed to create merchant account. Please try again." },
      { status: 500 }
    );
  }
}
