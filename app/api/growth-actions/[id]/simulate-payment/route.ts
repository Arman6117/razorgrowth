import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePaymentLinkWebhook, RazorpayWebhookPayload } from "@/lib/razorpay/webhooks";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { merchantId } = body;

    const action = await prisma.growthAction.findUnique({
      where: { id },
      include: { opportunity: true },
    });

    if (!action) {
      return NextResponse.json({ error: `GrowthAction '${id}' not found` }, { status: 404 });
    }

    if (merchantId && action.merchantId !== merchantId) {
      return NextResponse.json({ error: "Unauthorized merchant" }, { status: 403 });
    }

    const params = (action.parameters || {}) as Record<string, unknown>;
    const paymentLinkId = (params.paymentLinkId as string) || `plink_test_${id.slice(-8)}`;
    const amountInPaise = (params.amountInPaise as number) || 200000;

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
            currency: (params.currency as string) || "INR",
            status: "paid",
            short_url: (params.shortUrl as string) || `https://rzp.io/rzp/sim_${id.slice(-6)}`,
            customer: {
              name: (params.customerName as string) || "Customer",
              email: (params.customerEmail as string) || "customer@demo.com",
            },
            notes: {
              merchantId: action.merchantId,
              customerId: (params.customerId as string) || "",
              targetProductId:
                (params.targetProductId as string) || action.opportunity?.targetProductId || "",
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
            currency: (params.currency as string) || "INR",
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
            currency: (params.currency as string) || "INR",
            status: "paid",
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    const result = await handlePaymentLinkWebhook(payload);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to simulate webhook payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
