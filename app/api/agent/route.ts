import { NextRequest, NextResponse } from "next/server";
import { runAgentOrchestrator } from "@/lib/agent/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { merchantId, message } = body;

    if (!merchantId || typeof merchantId !== "string" || !merchantId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "merchantId is required in request body",
          message: "Please provide a valid merchantId string.",
        },
        { status: 400 }
      );
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "message is required in request body",
          message: "Please provide a natural language instruction message.",
        },
        { status: 400 }
      );
    }

    const response = await runAgentOrchestrator({
      merchantId: merchantId.trim(),
      message: message.trim(),
    });

    if (!response.success && response.error?.includes("Merchant not found")) {
      return NextResponse.json(response, { status: 404 });
    }

    return NextResponse.json(response, {
      status: response.success ? 200 : 400,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error in AI Agent orchestration";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        summary: `Request failed: ${errorMessage}`,
        toolCalls: [],
        opportunitiesFound: [],
        actionsCreated: [],
        actionsPendingApproval: 0,
      },
      { status: 500 }
    );
  }
}
