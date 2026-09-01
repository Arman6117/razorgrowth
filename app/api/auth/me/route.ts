import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMerchant } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const merchant = await getAuthenticatedMerchant(req);

    if (!merchant) {
      return NextResponse.json(
        {
          authenticated: false,
          merchant: null,
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        currency: merchant.currency,
        createdAt: merchant.createdAt,
      },
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json(
      { authenticated: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
