import { NextRequest, NextResponse } from "next/server";
import { runAgentOrchestrator } from "@/lib/agent/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tRouteStart = performance.now();
  console.log(`[Latency Profile] [Route] HTTP POST /api/agent received at t=0ms`);

  try {
    const tBodyParseStart = performance.now();
    const body = await req.json().catch(() => ({}));
    const tBodyParsed = performance.now();
    const bodyParseDuration = Math.round(tBodyParsed - tBodyParseStart);

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

    const tOrchestratorStart = performance.now();
    const response = await runAgentOrchestrator({
      merchantId: merchantId.trim(),
      message: message.trim(),
    });
    const tOrchestratorEnd = performance.now();
    const orchestratorDuration = Math.round(tOrchestratorEnd - tOrchestratorStart);

    const tSerializeStart = performance.now();
    const statusCode = response.success ? 200 : response.error?.includes("Merchant not found") ? 404 : 400;

    const jsonRes = NextResponse.json(response, {
      status: statusCode,
    });
    const tSerializeEnd = performance.now();
    const serializeDuration = Math.round(tSerializeEnd - tSerializeStart);
    const totalRouteDuration = Math.round(tSerializeEnd - tRouteStart);

    console.log(
      `[Latency Profile] [Route] Total = ${totalRouteDuration}ms | Body Parse = ${bodyParseDuration}ms | Orchestrator = ${orchestratorDuration}ms | Serialization = ${serializeDuration}ms | Status = ${statusCode}`
    );

    return jsonRes;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error in AI Agent orchestration";
    const totalRouteDuration = Math.round(performance.now() - tRouteStart);

    console.error(`[Latency Profile] [Route] Failed after ${totalRouteDuration}ms: ${errorMessage}`);

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
