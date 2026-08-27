import { generateText, tool } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "../prisma";
import {
  analyzeCrossSellTool,
  isCustomerEligibleTool,
  createGrowthActionTool,
  getGrowthActionStatusTool,
} from "./tools";

export interface AgentOrchestratorInput {
  merchantId: string;
  message: string;
}

export interface AgentToolCallSummary {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface AgentOrchestratorResponse {
  success: boolean;
  merchantId: string;
  merchantName?: string;
  message: string;
  summary: string;
  toolCalls: AgentToolCallSummary[];
  opportunitiesFound: unknown[];
  actionsCreated: unknown[];
  actionsPendingApproval: number;
  error?: string;
}

/**
 * Resolves the appropriate LLM provider model based on environment variables.
 * Priority: Gemini (GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) -> OpenAI (OPENAI_API_KEY).
 */
function getLanguageModel() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    return google("gemini-2.5-flash");
  } else if (openaiKey) {
    return openai("gpt-4o");
  }
  return null;
}

/**
 * System prompt defining the AI Agent's persona, operating principles, and safety boundaries.
 */
const SYSTEM_PROMPT = `
You are RazorGrowth's AI Growth & Agentic Commerce Orchestration Agent.
Your primary role is to help merchants automatically analyze sales data, discover high-value cross-sell opportunities, verify customer eligibility, and prepare targeted GrowthActions.

CRITICAL OPERATING RULES & SAFETY BOUNDARIES:
1. DETERMINISTIC BACKEND TOOLS ARE AUTHORITATIVE:
   - You MUST NOT calculate product prices, discount amounts, or customer eligibility in your prompt logic.
   - Always call backend tools (analyzeCrossSell, isCustomerEligible, createGrowthAction, getGrowthActionStatus) to retrieve or mutate state.
   - Do NOT invent product prices or fabricate customer records.

2. HUMAN CONTROL BOUNDARY (NO DIRECT APPROVAL OR EXECUTION):
   - You CAN create GrowthActions using 'createGrowthAction'. All created actions will automatically have status 'PENDING_APPROVAL'.
   - You MUST NOT approve or execute financial actions. Merchant approval is strictly human-controlled.
   - Creating a GrowthAction is NOT executing or approving it.

3. MULTI-CUSTOMER CAMPAIGNS:
   - When asked to analyze opportunities or create campaigns, first call 'analyzeCrossSell' to find opportunities and eligible customers.
   - For top opportunities, iterate through eligible customers and call 'createGrowthAction'.
   - The backend deterministic engine handles duplicate prevention and eligibility validation under the hood.

4. MERCHANT ISOLATION:
   - Always pass the provided 'merchantId' in every tool call.

5. CONCISE, DATA-BACKED EXPLANATIONS:
   - Provide a clear, professional summary explaining which opportunities were selected, why they were chosen, how many eligible customers were identified, and which GrowthActions were created in PENDING_APPROVAL status.
`;

/**
 * Runs the real AI Agent LLM Orchestrator.
 */
export async function runAgentOrchestrator(
  input: AgentOrchestratorInput
): Promise<AgentOrchestratorResponse> {
  const { merchantId, message } = input;

  if (!merchantId?.trim()) {
    return {
      success: false,
      merchantId: merchantId || "",
      message: message || "",
      summary: "Validation Error: merchantId parameter is required.",
      toolCalls: [],
      opportunitiesFound: [],
      actionsCreated: [],
      actionsPendingApproval: 0,
      error: "merchantId is required",
    };
  }

  if (!message?.trim()) {
    return {
      success: false,
      merchantId,
      message: message || "",
      summary: "Validation Error: Natural language message is required.",
      toolCalls: [],
      opportunitiesFound: [],
      actionsCreated: [],
      actionsPendingApproval: 0,
      error: "message is required",
    };
  }

  // 1. Authoritative Merchant Check in Database
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });

  if (!merchant) {
    return {
      success: false,
      merchantId,
      message,
      summary: `Merchant not found with ID: ${merchantId}`,
      toolCalls: [],
      opportunitiesFound: [],
      actionsCreated: [],
      actionsPendingApproval: 0,
      error: `Merchant not found with ID: ${merchantId}`,
    };
  }

  // 2. Select Language Model
  const model = getLanguageModel();

  if (!model) {
    return {
      success: false,
      merchantId,
      merchantName: merchant.name,
      message,
      summary:
        "AI SDK Configuration Error: No LLM API key configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in environment variables.",
      toolCalls: [],
      opportunitiesFound: [],
      actionsCreated: [],
      actionsPendingApproval: 0,
      error:
        "GEMINI_API_KEY or OPENAI_API_KEY environment variable is required to execute LLM agent calls.",
    };
  }

  // 3. Register Tool Definitions for Vercel AI SDK
  // Note: approveGrowthAction is intentionally omitted to enforce human approval boundary.
  const tools = {
    analyzeCrossSell: tool({
      description:
        "Analyzes merchant transactions to discover cross-sell opportunities, conversion rates, eligible customer lists, and expected revenue.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier in RazorGrowth."),
      }),
      execute: async (toolInput: { merchantId: string }) => {
        return await analyzeCrossSellTool({ merchantId: toolInput.merchantId });
      },
    }),

    isCustomerEligible: tool({
      description:
        "Checks whether a specific customer is eligible for a cross-sell opportunity (bought source product, has not bought target product).",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
        customerId: z.string().describe("Authoritative customer identifier."),
        targetProductId: z.string().describe("Target product identifier."),
        sourceProductId: z.string().optional().describe("Source product identifier."),
        opportunityId: z.string().optional().describe("Opportunity identifier."),
      }),
      execute: async (toolInput: {
        merchantId: string;
        customerId: string;
        targetProductId: string;
        sourceProductId?: string;
        opportunityId?: string;
      }) => {
        return await isCustomerEligibleTool({
          merchantId: toolInput.merchantId,
          customerId: toolInput.customerId,
          targetProductId: toolInput.targetProductId,
          sourceProductId: toolInput.sourceProductId,
          opportunityId: toolInput.opportunityId,
        });
      },
    }),

    createGrowthAction: tool({
      description:
        "Creates a GrowthAction (CREATE_PAYMENT_LINK) in PENDING_APPROVAL status for an eligible customer. Target product price is resolved authoritatively from DB. The AI CANNOT approve or execute financial actions.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
        opportunityId: z.string().describe("Discovered opportunity identifier."),
        customerId: z.string().describe("Eligible customer identifier."),
        sourceProductId: z.string().optional().describe("Source product identifier."),
        targetProductId: z.string().optional().describe("Target product identifier."),
      }),
      execute: async (toolInput: {
        merchantId: string;
        opportunityId: string;
        customerId: string;
        sourceProductId?: string;
        targetProductId?: string;
      }) => {
        return await createGrowthActionTool({
          merchantId: toolInput.merchantId,
          opportunityId: toolInput.opportunityId,
          customerId: toolInput.customerId,
          sourceProductId: toolInput.sourceProductId,
          targetProductId: toolInput.targetProductId,
        });
      },
    }),

    getGrowthActionStatus: tool({
      description:
        "Retrieves current status, payment link information, and audit timeline for a GrowthAction.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
        actionId: z.string().describe("GrowthAction identifier."),
      }),
      execute: async (toolInput: { merchantId: string; actionId: string }) => {
        return await getGrowthActionStatusTool({
          merchantId: toolInput.merchantId,
          actionId: toolInput.actionId,
        });
      },
    }),
  };

  try {
    // 4. Invoke LLM with Tool Calling Orchestration
    const promptText = `Merchant Context:
- Merchant Name: "${merchant.name}"
- Merchant ID: "${merchant.id}"
- Currency: "${merchant.currency}"

Merchant Instruction:
"${message}"`;

    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: promptText,
      tools,
    });

    // 5. Process & Synthesize Output
    const toolCallsSummary: AgentToolCallSummary[] = [];
    const opportunitiesFound: unknown[] = [];
    const actionsCreated: unknown[] = [];

    if (result.toolResults && Array.isArray(result.toolResults)) {
      for (const tr of result.toolResults as Array<{
        toolName: string;
        args?: Record<string, unknown>;
        result?: unknown;
      }>) {
        toolCallsSummary.push({
          toolName: tr.toolName,
          args: tr.args || {},
          result: tr.result,
        });

        const resData = tr.result as { success?: boolean; data?: unknown };
        if (tr.toolName === "analyzeCrossSell" && resData?.success && Array.isArray(resData.data)) {
          opportunitiesFound.push(...resData.data);
        }
        if (tr.toolName === "createGrowthAction" && resData?.success && resData.data) {
          actionsCreated.push(resData.data);
        }
      }
    }

    const pendingCount = actionsCreated.filter(
      (a) => (a as { status?: string }).status === "PENDING_APPROVAL"
    ).length;

    return {
      success: true,
      merchantId,
      merchantName: merchant.name,
      message,
      summary: result.text || "AI agent processed the request successfully.",
      toolCalls: toolCallsSummary,
      opportunitiesFound,
      actionsCreated,
      actionsPendingApproval: pendingCount,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      merchantId,
      merchantName: merchant.name,
      message,
      summary: `AI Agent execution error: ${errorMessage}`,
      toolCalls: [],
      opportunitiesFound: [],
      actionsCreated: [],
      actionsPendingApproval: 0,
      error: errorMessage,
    };
  }
}
