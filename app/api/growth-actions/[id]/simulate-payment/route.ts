import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePaymentLinkWebhook, RazorpayWebhookPayload } from "@/lib/razorpay/webhooks";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";
import { parseGrowthActionParameters } from "@/lib/actions/growth-action";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const { id } = await context.params;

    const action = await prisma.growthAction.findFirst({
      where: { id, merchantId: authMerchant.id },
      include: { opportunity: true },
    });

    if (!action) {
      return NextResponse.json({ error: `GrowthAction '${id}' not found` }, { status: 404 });
    }

    const params = parseGrowthActionParameters(action.parameters);
    if (!params.paymentLinkId) {
      return NextResponse.json(
        { error: `GrowthAction '${id}' does not have an active payment link to simulate payment for` },
        { status: 400 }
      );
    }

    const paymentLinkId = params.paymentLinkId;
    const amountInPaise = params.amountInPaise || 200000;

    const payload: RazorpayWebhookPayload = {
      entity: "event",
      account_id: "acc_test_razorgrowth",
      event: "payment_link.paid",
      contains: ["payment_link", "order", "payment"],
      payload: {
        payment_link: {
          entity: {
            id: paymentLinkId,
            entity: "payment_link",
            amount: amountInPaise,
            amount_paid: amountInPaise,
            currency: params.currency || "INR",
            status: "paid",
            short_url: params.shortUrl || `https://rzp.io/rzp/sim_${id.slice(-6)}`,
            customer: {
              name: params.customerName || "Customer",
              email: params.customerEmail || "customer@demo.com",
            },
            notes: {
              merchantId: action.merchantId,
              customerId: params.customerId || "",
              targetProductId:
                params.targetProductId || action.opportunity?.targetProductId || "",
              opportunityId: action.opportunityId,
              growthActionId: action.id,
            },
          },
        },
        payment: {
          entity: {
            id: `pay_sim_${Date.now()}`,
            entity: "payment",
            amount: amountInPaise,
            currency: params.currency || "INR",
            status: "captured",
            method: "upi",
          },
        },
        order: {
          entity: {
            id: `order_sim_${Date.now()}`,
            entity: "order",
            amount: amountInPaise,
            amount_paid: amountInPaise,
            amount_due: 0,
            currency: params.currency || "INR",
            status: "paid",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const result = await handlePaymentLinkWebhook(payload);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Failed to simulate webhook payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
