import { NextRequest, NextResponse } from "next/server";
import {
  agentToolDefinitions,
  executeAgentTool,
} from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    tools: agentToolDefinitions,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { toolName, parameters } = body;

    if (!toolName) {
      return NextResponse.json(
        { error: "toolName is required in request body" },
        { status: 400 }
      );
    }

    const result = await executeAgentTool(toolName, parameters || {});

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to execute agent tool";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
