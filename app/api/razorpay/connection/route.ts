import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);

    const connection = await prisma.razorpayConnection.findUnique({
      where: { merchantId: authMerchant.id },
      select: {
        id: true,
        merchantId: true,
        keyId: true,
        mode: true,
        connectedAt: true,
        lastSyncedAt: true,
        createdAt: true,
        updatedAt: true,
        // encryptedKeySecret is intentionally omitted
      },
    });

    return NextResponse.json({
      success: true,
      connected: !!connection,
      connection: connection || null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch Razorpay connection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
