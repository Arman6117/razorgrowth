import { NextRequest, NextResponse } from "next/server";
import {
  validateWebhookSignature,
  handlePaymentLinkWebhook,
  RazorpayWebhookPayload,
} from "@/lib/razorpay/webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest | Request) {
  // 1. Read the request body as RAW text BEFORE parsing JSON
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body as raw text" },
      { status: 400 }
    );
  }

  // 2. Read RAZORPAY_WEBHOOK_SECRET
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("❌ Razorpay webhook error: RAZORPAY_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret is not configured on server" },
      { status: 500 }
    );
  }

  // 3. Extract and verify Razorpay signature
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing x-razorpay-signature header" },
      { status: 400 }
    );
  }

  const isValidSignature = validateWebhookSignature(
    rawBody,
    signature,
    webhookSecret
  );

  if (!isValidSignature) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  // 4. Parse JSON payload strictly AFTER signature verification succeeds
  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON payload" },
      { status: 400 }
    );
  }

  // 5. Process the verified webhook event
  try {
    const result = await handlePaymentLinkWebhook(payload);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || "Webhook processing failed",
        },
        { status: result.statusCode || 422 }
      );
    }

    return NextResponse.json(
      {
        received: true,
        status: result.isDuplicate ? "already_processed" : "processed",
        message: result.message,
        actionId: result.actionId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "❌ Unhandled webhook processing error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Internal server error during webhook processing" },
      { status: 500 }
    );
  }
}
