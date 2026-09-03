import { NextRequest, NextResponse } from "next/server";
import { resendGrowthActionPaymentLink } from "@/lib/actions/growth-action";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const merchantId = authMerchant.id;
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "GrowthAction id parameter is required" },
        { status: 400 }
      );
    }

    const result = await resendGrowthActionPaymentLink({
      merchantId,
      actionId: id,
      medium: "email",
    });

    return NextResponse.json(
      {
        success: true,
        message: "Payment link email notification resent successfully via Razorpay",
        action: result.action,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to resend payment link notification";
    const status =
      message.includes("not found") ? 404 :
      message.includes("Cannot resend") || message.includes("already EXECUTED") ? 409 :
      message.includes("no active paymentLinkId") ? 422 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
