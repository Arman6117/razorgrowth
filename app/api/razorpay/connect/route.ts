import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto/encryption";
import { razorpayRequestWithCredentials } from "@/lib/razorpay/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const body = await req.json().catch(() => ({}));
    const { keyId, keySecret, mode } = body;

    if (!keyId || typeof keyId !== "string" || !keyId.trim()) {
      return NextResponse.json(
        { error: "Razorpay Key ID is required" },
        { status: 400 }
      );
    }

    if (!keySecret || typeof keySecret !== "string" || !keySecret.trim()) {
      return NextResponse.json(
        { error: "Razorpay Key Secret is required" },
        { status: 400 }
      );
    }

    const trimmedKeyId = keyId.trim();
    const trimmedKeySecret = keySecret.trim();

    // 1. Validate credentials with a harmless live call to Razorpay API
    try {
      await razorpayRequestWithCredentials(
        { keyId: trimmedKeyId, keySecret: trimmedKeySecret },
        "/customers?count=1"
      );
    } catch (err) {
      console.warn("Razorpay credential validation failed for merchant", authMerchant.id);
      return NextResponse.json(
        {
          error:
            "Invalid Razorpay credentials. Failed to authenticate with Razorpay API. Please check your Key ID and Key Secret.",
        },
        { status: 400 }
      );
    }

    // 2. Encrypt secret at rest using server-side encryption key
    const encryptedKeySecret = encryptSecret(trimmedKeySecret);

    // 3. Upsert RazorpayConnection for the authenticated merchant
    const connection = await prisma.razorpayConnection.upsert({
      where: { merchantId: authMerchant.id },
      create: {
        merchantId: authMerchant.id,
        keyId: trimmedKeyId,
        encryptedKeySecret,
        mode: mode || "TEST",
        connectedAt: new Date(),
      },
      update: {
        keyId: trimmedKeyId,
        encryptedKeySecret,
        mode: mode || "TEST",
        connectedAt: new Date(),
      },
      select: {
        id: true,
        merchantId: true,
        keyId: true,
        mode: true,
        connectedAt: true,
        lastSyncedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Razorpay Test Mode connected successfully",
        connection,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to connect Razorpay account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);

    await prisma.razorpayConnection.deleteMany({
      where: { merchantId: authMerchant.id },
    });

    return NextResponse.json({
      success: true,
      message: "Razorpay connection removed successfully",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to disconnect Razorpay account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
