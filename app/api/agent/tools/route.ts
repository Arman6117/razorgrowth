import { NextRequest, NextResponse } from "next/server";
import {
  agentToolDefinitions,
  executeAgentTool,
} from "@/lib/agent/tools";
import { requireAuthenticatedMerchant, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAuthenticatedMerchant(req);
    return NextResponse.json({
      success: true,
      tools: agentToolDefinitions,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to fetch tools" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authMerchant = await requireAuthenticatedMerchant(req);
    const body = await req.json().catch(() => ({}));
    const { toolName, parameters } = body;

    if (!toolName) {
      return NextResponse.json(
        { error: "toolName is required in request body" },
        { status: 400 }
      );
    }

    // Force merchantId to session merchant
    const safeParameters = {
      ...(parameters || {}),
      merchantId: authMerchant.id,
    };

    const result = await executeAgentTool(toolName, safeParameters);

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message =
      error instanceof Error ? error.message : "Failed to execute agent tool";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
