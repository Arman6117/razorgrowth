import { generateText, tool, isStepCount } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "../prisma";
import {
  analyzeCrossSellTool,
  isCustomerEligibleTool,
  createGrowthActionTool,
  createGrowthActionsForCustomersTool,
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

export interface LatencyStepProfile {
  step: number;
  provider: string;
  model: string;
  durationMs: number;
  type: "tool_call" | "final_text";
  toolNames?: string[];
}

export interface ToolExecutionProfile {
  toolName: string;
  durationMs: number;
  payloadSizeKb?: number;
  extraInfo?: string;
}

export interface LatencyBreakdown {
  orchestratorTotalMs: number;
  dbMerchantCheckMs: number;
  llmSteps: LatencyStepProfile[];
  toolExecutions: ToolExecutionProfile[];
  synthesisMs: number;
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
  iterations?: number;
  provider?: string;
  model?: string;
  fallbackOccurred?: boolean;
  fallbackReason?: string;
  attemptCount?: number;
  latencyBreakdown?: LatencyBreakdown;
  error?: string;
}

export interface ProviderModelConfig {
  model: any;
  providerName: string;
  modelName: string;
}

/**
 * Resolves the primary LLM provider model based on environment variables.
 * Default Priority: Gemini (if GEMINI_API_KEY) -> OpenAI (if OPENAI_API_KEY) -> OpenRouter (if OPENROUTER_API_KEY).
 */
export function getPrimaryModelConfig(): ProviderModelConfig | null {
  const provider = (process.env.AGENT_PROVIDER || "google").toLowerCase();
  const modelName = process.env.AGENT_MODEL;

  if (provider === "google" || provider === "gemini") {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (geminiKey) {
      const google = createGoogleGenerativeAI({ apiKey: geminiKey });
      return {
        model: google(modelName || "gemini-3.5-flash"),
        providerName: "google",
        modelName: modelName || "gemini-3.5-flash",
      };
    }
  } else if (provider === "openrouter") {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      const openrouter = createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: openrouterKey,
      });
      return {
        model: openrouter(modelName || "openai/gpt-oss-20b:free"),
        providerName: "openrouter",
        modelName: modelName || "openai/gpt-oss-20b:free",
      };
    }
  } else if (provider === "openai") {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const openaiClient = createOpenAI({ apiKey: openaiKey });
      return {
        model: openaiClient(modelName || "gpt-4o"),
        providerName: "openai",
        modelName: modelName || "gpt-4o",
      };
    }
  }

  // Fallback defaults if AGENT_PROVIDER did not match available keys
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey) {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    return {
      model: google(modelName || "gemini-3.5-flash"),
      providerName: "google",
      modelName: modelName || "gemini-3.5-flash",
    };
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    const openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openrouterKey,
    });
    return {
      model: openrouter(modelName || "openai/gpt-oss-20b:free"),
      providerName: "openrouter",
      modelName: modelName || "openai/gpt-oss-20b:free",
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const openaiClient = createOpenAI({ apiKey: openaiKey });
    return {
      model: openaiClient(modelName || "gpt-4o"),
      providerName: "openai",
      modelName: modelName || "gpt-4o",
    };
  }

  return null;
}

/**
 * Resolves the fallback LLM provider model (e.g. OpenRouter free tier).
 */
export function getFallbackModelConfig(): ProviderModelConfig | null {
  const fallbackProvider = (process.env.AGENT_FALLBACK_PROVIDER || "openrouter").toLowerCase();
  const fallbackModelName = process.env.AGENT_FALLBACK_MODEL || "liquid/lfm-2.5-2.6b:free";

  if (fallbackProvider === "openrouter") {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      const openrouter = createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: openrouterKey,
      });
      return {
        model: openrouter(fallbackModelName),
        providerName: "openrouter",
        modelName: fallbackModelName,
      };
    }
  } else if (fallbackProvider === "google" || fallbackProvider === "gemini") {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (geminiKey) {
      const google = createGoogleGenerativeAI({ apiKey: geminiKey });
      return {
        model: google(fallbackModelName || "gemini-3.5-flash"),
        providerName: "google",
        modelName: fallbackModelName || "gemini-3.5-flash",
      };
    }
  } else if (fallbackProvider === "openai") {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const openaiClient = createOpenAI({ apiKey: openaiKey });
      return {
        model: openaiClient(fallbackModelName || "gpt-4o-mini"),
        providerName: "openai",
        modelName: fallbackModelName || "gpt-4o-mini",
      };
    }
  }

  return null;
}

/**
 * Legacy compatibility resolver.
 */
export function getLanguageModel() {
  const primary = getPrimaryModelConfig();
  if (primary) return primary.model;
  const fallback = getFallbackModelConfig();
  if (fallback) return fallback.model;
  return null;
}

/**
 * Detects whether an error is a provider availability, rate-limit, or quota exhaustion error.
 * Inspects HTTP status codes (429/500/502/503/504), nested gRPC statuses (RESOURCE_EXHAUSTED/UNAVAILABLE),
 * and actual Gemini / Vercel AI SDK error signatures.
 */
export function isProviderAvailabilityOrQuotaError(error: unknown): boolean {
  if (!error) return false;

  const err = error as Record<string, unknown>;

  // 1. Check top-level and nested HTTP status codes
  const status =
    (err.status as number | undefined) ??
    (err.statusCode as number | undefined) ??
    ((err.response as Record<string, unknown> | undefined)?.status as number | undefined) ??
    ((err.data as Record<string, unknown> | undefined)?.error as Record<string, unknown> | undefined)?.code as number | undefined ??
    ((err.cause as Record<string, unknown> | undefined)?.status as number | undefined) ??
    ((err.cause as Record<string, unknown> | undefined)?.statusCode as number | undefined);

  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 500) {
    return true;
  }

  // 2. Check gRPC error status or code (Google AI SDK)
  const grpcStatus =
    ((err.data as Record<string, unknown> | undefined)?.error as Record<string, unknown> | undefined)?.status as string | undefined;
  if (grpcStatus === "RESOURCE_EXHAUSTED" || grpcStatus === "UNAVAILABLE") {
    return true;
  }

  // 3. Check error name, message, and serialized structure
  const message = String(err.message || "").toLowerCase();
  const name = String(err.name || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();

  let stringified = "";
  try {
    stringified = JSON.stringify(error).toLowerCase();
  } catch {
    stringified = String(error).toLowerCase();
  }

  const quotaPatterns = [
    "quota",
    "resource_exhausted",
    "rate limit",
    "rate_limit",
    "ratelimit",
    "429",
    "too many requests",
    "free_tier_requests",
    "exceeded your current quota",
    "quota exceeded",
    "service unavailable",
    "overloaded",
    "temporarily unavailable",
    "model is overloaded",
    "capacity",
    "failed after",
    "generativelanguage.googleapis.com",
  ];

  return quotaPatterns.some(
    (pattern) =>
      message.includes(pattern) ||
      name.includes(pattern) ||
      code.includes(pattern) ||
      stringified.includes(pattern)
  );
}

/**
 * System prompt defining the AI Agent's persona, operating principles, and safety boundaries.
 */
/**
 * System prompt defining the AI Agent's persona, operating principles, and safety boundaries.
 */
const SYSTEM_PROMPT = `
You are RazorGrowth's AI Growth & Agentic Commerce Orchestration Agent.
Your primary role is to help merchants automatically analyze sales data, discover high-value cross-sell opportunities, verify customer eligibility, and prepare targeted GrowthActions.

CRITICAL OPERATING RULES & WORKFLOW:
1. DETERMINISTIC BACKEND TOOLS ARE AUTHORITATIVE:
   - You MUST NOT calculate product prices, discount amounts, or customer eligibility in your prompt logic.
   - Always call backend tools (analyzeCrossSell, isCustomerEligible, createGrowthAction, createGrowthActionsForCustomers, getGrowthActionStatus) to retrieve or mutate state.
   - Do NOT invent product prices or fabricate customer records.

2. HUMAN CONTROL BOUNDARY (NO DIRECT APPROVAL OR EXECUTION):
   - You CAN create GrowthActions using 'createGrowthActionsForCustomers' or 'createGrowthAction'. All created actions will automatically have status 'PENDING_APPROVAL'.
   - You MUST NOT approve or execute financial actions. Merchant approval is strictly human-controlled.
   - Creating a GrowthAction is NOT executing or approving it.

3. OPTIMAL BULK ACTION CREATION WORKFLOW:
   - When asked to find opportunities or create growth actions for eligible customers:
     Step 1: Call 'analyzeCrossSell' with merchantId to get compact opportunity summaries.
     Step 2: Select the strongest or requested opportunity based on expected revenue or conversion rate.
     Step 3: Call 'createGrowthActionsForCustomers' with ONLY { merchantId, opportunityId }. The deterministic backend will automatically target all eligible customers and prevent duplicate actions.
     Step 4: Once 'createGrowthActionsForCustomers' completes, DO NOT call it again for the same opportunity. Immediately produce your final concise summary and conclude.

4. MERCHANT ISOLATION:
   - Always pass the provided 'merchantId' in every tool call.

5. CONCISE, DATA-BACKED EXPLANATIONS:
   - Provide a clear, professional summary explaining which opportunity was selected, why it was chosen, how many eligible customers were targeted, and how many GrowthActions were created in PENDING_APPROVAL status based strictly on the tool outputs.
`;

/**
 * Runs the real AI Agent LLM Orchestrator.
 */
export async function runAgentOrchestrator(
  input: AgentOrchestratorInput
): Promise<AgentOrchestratorResponse> {
  const tOrchestratorStart = performance.now();
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
  const tMerchantStart = performance.now();
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, name: true, currency: true },
  });
  const dbMerchantCheckMs = Math.round(performance.now() - tMerchantStart);

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

  // 2. Resolve Primary and Fallback Language Models
  const primaryConfig = getPrimaryModelConfig();
  const fallbackConfig = getFallbackModelConfig();

  const fallbackKeyConfigured = Boolean(
    process.env.OPENROUTER_API_KEY?.trim() ||
      (process.env.AGENT_FALLBACK_PROVIDER === "openai" && process.env.OPENAI_API_KEY?.trim())
  );

  console.log(
    `[RazorGrowth AI Agent] Primary: ${primaryConfig ? `${primaryConfig.providerName}/${primaryConfig.modelName}` : "none"} (configured: ${Boolean(primaryConfig)}) | Fallback: ${fallbackConfig ? `${fallbackConfig.providerName}/${fallbackConfig.modelName}` : "none"} (fallback API key configured: ${fallbackKeyConfigured})`
  );

  if (!primaryConfig && !fallbackConfig) {
    return {
      success: false,
      merchantId,
      merchantName: merchant.name,
      message,
      summary:
        "AI SDK Configuration Error: No LLM API key configured. Please set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in environment variables.",
      toolCalls: [],
      opportunitiesFound: [],
      actionsCreated: [],
      actionsPendingApproval: 0,
      error:
        "GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY environment variable is required to execute LLM agent calls.",
    };
  }

  const toolProfiles: ToolExecutionProfile[] = [];

  // 3. Register Tool Definitions for Vercel AI SDK
  // Note: approveGrowthAction is intentionally omitted to enforce human approval boundary.
  const tools = {
    analyzeCrossSell: tool({
      description:
        "Analyzes merchant transactions to discover cross-sell opportunities, conversion rates, eligible customer lists, and expected revenue. Returns compact opportunity summaries.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier in RazorGrowth."),
      }),
      execute: async (toolInput: { merchantId: string }) => {
        const t0 = performance.now();
        const res = await analyzeCrossSellTool({ merchantId: toolInput.merchantId });
        const dt = Math.round(performance.now() - t0);
        const dataBytes = JSON.stringify(res).length;
        const sizeKb = Math.round((dataBytes / 1024) * 10) / 10;
        const oppCount = Array.isArray(res.data) ? res.data.length : 0;
        const totalEligible = Array.isArray(res.data)
          ? res.data.reduce((acc, o: any) => acc + (o.eligibleCustomerCount || 0), 0)
          : 0;

        console.log(
          `[Latency Profile] Tool 'analyzeCrossSell' executed in ${dt}ms | Opps: ${oppCount} | Total Eligible: ${totalEligible} | Payload Size: ${sizeKb} KB`
        );

        toolProfiles.push({
          toolName: "analyzeCrossSell",
          durationMs: dt,
          payloadSizeKb: sizeKb,
          extraInfo: `Opps: ${oppCount}, Total Eligible: ${totalEligible}`,
        });

        return res;
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
        const t0 = performance.now();
        const res = await isCustomerEligibleTool({
          merchantId: toolInput.merchantId,
          customerId: toolInput.customerId,
          targetProductId: toolInput.targetProductId,
          sourceProductId: toolInput.sourceProductId,
          opportunityId: toolInput.opportunityId,
        });
        const dt = Math.round(performance.now() - t0);

        console.log(
          `[Latency Profile] Tool 'isCustomerEligible' executed in ${dt}ms | Customer: ${toolInput.customerId}`
        );

        toolProfiles.push({
          toolName: "isCustomerEligible",
          durationMs: dt,
          extraInfo: `Customer: ${toolInput.customerId}`,
        });

        return res;
      },
    }),

    createGrowthAction: tool({
      description:
        "Creates a GrowthAction (CREATE_PAYMENT_LINK) in PENDING_APPROVAL status for an individual eligible customer. Target product price is resolved authoritatively from DB. The AI CANNOT approve or execute financial actions.",
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
        const t0 = performance.now();
        const res = await createGrowthActionTool({
          merchantId: toolInput.merchantId,
          opportunityId: toolInput.opportunityId,
          customerId: toolInput.customerId,
          sourceProductId: toolInput.sourceProductId,
          targetProductId: toolInput.targetProductId,
        });
        const dt = Math.round(performance.now() - t0);

        console.log(
          `[Latency Profile] Tool 'createGrowthAction' (Single) executed in ${dt}ms | Customer: ${toolInput.customerId}`
        );

        toolProfiles.push({
          toolName: "createGrowthAction",
          durationMs: dt,
          extraInfo: `Single Customer: ${toolInput.customerId}`,
        });

        return res;
      },
    }),

    createGrowthActionsForCustomers: tool({
      description:
        "Creates GrowthActions in bulk (CREATE_PAYMENT_LINK) in PENDING_APPROVAL status for eligible customers of an opportunity. If customerIds is omitted, the deterministic backend automatically targets all eligible customers. Pass ONLY merchantId and opportunityId. The AI CANNOT approve or execute financial actions.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
        opportunityId: z.string().describe("Discovered opportunity identifier."),
        customerIds: z.array(z.string()).optional().describe("Optional explicit customer ID array. If omitted, all eligible customers are targeted automatically."),
        sourceProductId: z.string().optional().describe("Source product identifier."),
        targetProductId: z.string().optional().describe("Target product identifier."),
      }),
      execute: async (toolInput: {
        merchantId: string;
        opportunityId: string;
        customerIds?: string[];
        sourceProductId?: string;
        targetProductId?: string;
      }) => {
        const t0 = performance.now();
        const res = await createGrowthActionsForCustomersTool({
          merchantId: toolInput.merchantId,
          opportunityId: toolInput.opportunityId,
          customerIds: toolInput.customerIds,
          sourceProductId: toolInput.sourceProductId,
          targetProductId: toolInput.targetProductId,
        });
        const dt = Math.round(performance.now() - t0);
        const createdCount = (res.data as any)?.createdCount ?? 0;
        const duplicateCount = (res.data as any)?.duplicateCount ?? 0;
        const reqCount = toolInput.customerIds?.length ?? "ALL";

        console.log(
          `[Latency Profile] Tool 'createGrowthActionsForCustomers' (Bulk) executed in ${dt}ms | Requested: ${reqCount} | Created: ${createdCount} | Duplicates: ${duplicateCount}`
        );

        toolProfiles.push({
          toolName: "createGrowthActionsForCustomers",
          durationMs: dt,
          extraInfo: `Bulk: Requested ${reqCount}, Created ${createdCount}, Dupes ${duplicateCount}`,
        });

        return res;
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
        const t0 = performance.now();
        const res = await getGrowthActionStatusTool({
          merchantId: toolInput.merchantId,
          actionId: toolInput.actionId,
        });
        const dt = Math.round(performance.now() - t0);

        console.log(
          `[Latency Profile] Tool 'getGrowthActionStatus' executed in ${dt}ms | Action: ${toolInput.actionId}`
        );

        toolProfiles.push({
          toolName: "getGrowthActionStatus",
          durationMs: dt,
          extraInfo: `Action: ${toolInput.actionId}`,
        });

        return res;
      },
    }),
  };

  // 4. Invoke LLM with Tool Calling Orchestration & Immediate Quota Fallback
  const promptText = `Merchant Context:
- Merchant Name: "${merchant.name}"
- Merchant ID: "${merchant.id}"
- Currency: "${merchant.currency}"

Merchant Instruction:
"${message}"`;

  let activeConfig = primaryConfig || fallbackConfig!;
  let fallbackOccurred = false;
  let fallbackReason: string | undefined = undefined;
  let attemptCount = 0;
  let result: any = null;
  const llmStepProfiles: LatencyStepProfile[] = [];

  let stepNumber = 0;
  let stepStartTime = performance.now();

  try {
    attemptCount++;
    console.log(
      `[RazorGrowth AI Agent] Attempt ${attemptCount}: Executing primary provider '${activeConfig.providerName}' with model '${activeConfig.modelName}'...`
    );

    // Development/test hook: Simulate Gemini quota exhaustion without modifying production behavior
    if (process.env.AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR === "true") {
      const simulatedQuotaError = new Error(
        "AI_APICallError: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.5-flash Please retry in 54.086447316s."
      );
      (simulatedQuotaError as any).statusCode = 429;
      (simulatedQuotaError as any).status = 429;
      (simulatedQuotaError as any).name = "AI_APICallError";
      (simulatedQuotaError as any).data = {
        error: {
          code: 429,
          message:
            "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests",
          status: "RESOURCE_EXHAUSTED",
        },
      };
      throw simulatedQuotaError;
    }

    stepStartTime = performance.now();
    result = await generateText({
      model: activeConfig.model,
      system: SYSTEM_PROMPT,
      prompt: promptText,
      tools,
      stopWhen: isStepCount(5),
      maxRetries: 0, // Prevent wasteful repeated retries on quota/rate limit errors
      onStepFinish: (event) => {
        stepNumber++;
        const now = performance.now();
        const durationMs = Math.round(now - stepStartTime);
        const hasToolCalls = Boolean(event.toolCalls && event.toolCalls.length > 0);
        const toolNames = hasToolCalls ? event.toolCalls.map((tc) => tc.toolName) : [];

        console.log(
          `[Latency Profile] LLM Step #${stepNumber}: Provider: ${activeConfig.providerName} | Model: ${activeConfig.modelName} | Duration: ${durationMs}ms | Output: ${hasToolCalls ? `Tool Call [${toolNames.join(", ")}]` : `Final Text (${event.text?.length || 0} chars)`}`
        );

        llmStepProfiles.push({
          step: stepNumber,
          provider: activeConfig.providerName,
          model: activeConfig.modelName,
          durationMs,
          type: hasToolCalls ? "tool_call" : "final_text",
          toolNames,
        });

        stepStartTime = performance.now();
      },
    });

    console.log(
      `[RazorGrowth AI Agent] Provider '${activeConfig.providerName}' call succeeded (${activeConfig.modelName}). Fallback occurred: false. Total attempts: ${attemptCount}.`
    );
  } catch (primaryErr: unknown) {
    const primaryErrorMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    console.warn(
      `[RazorGrowth AI Agent] Provider '${activeConfig.providerName}' failed: ${primaryErrorMsg}`
    );

    const isQuotaOrAvailability = isProviderAvailabilityOrQuotaError(primaryErr);

    // If quota/rate limit error occurred and fallback provider is configured and distinct:
    if (
      isQuotaOrAvailability &&
      fallbackConfig &&
      (fallbackConfig.providerName !== activeConfig.providerName ||
        fallbackConfig.modelName !== activeConfig.modelName)
    ) {
      fallbackOccurred = true;
      fallbackReason = primaryErrorMsg;
      activeConfig = fallbackConfig;
      attemptCount++;

      console.log(
        `[RazorGrowth AI Agent] Attempt ${attemptCount}: Immediately attempting fallback provider '${activeConfig.providerName}' (Model: '${activeConfig.modelName}') due to primary quota exhaustion.`
      );

      stepStartTime = performance.now();
      try {
        result = await generateText({
          model: activeConfig.model,
          system: SYSTEM_PROMPT,
          prompt: promptText,
          tools,
          stopWhen: isStepCount(5),
          maxRetries: 1,
          onStepFinish: (event) => {
            stepNumber++;
            const now = performance.now();
            const durationMs = Math.round(now - stepStartTime);
            const hasToolCalls = Boolean(event.toolCalls && event.toolCalls.length > 0);
            const toolNames = hasToolCalls ? event.toolCalls.map((tc) => tc.toolName) : [];

            console.log(
              `[Latency Profile] Fallback LLM Step #${stepNumber}: Provider: ${activeConfig.providerName} | Model: ${activeConfig.modelName} | Duration: ${durationMs}ms | Output: ${hasToolCalls ? `Tool Call [${toolNames.join(", ")}]` : `Final Text (${event.text?.length || 0} chars)`}`
            );

            llmStepProfiles.push({
              step: stepNumber,
              provider: activeConfig.providerName,
              model: activeConfig.modelName,
              durationMs,
              type: hasToolCalls ? "tool_call" : "final_text",
              toolNames,
            });

            stepStartTime = performance.now();
          },
        });

        console.log(
          `[RazorGrowth AI Agent] Fallback provider '${activeConfig.providerName}' call succeeded (${activeConfig.modelName}). Total attempts: ${attemptCount}.`
        );
      } catch (fallbackErr: unknown) {
        const fallbackErrorMsg =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error(
          `[RazorGrowth AI Agent] Fallback provider '${activeConfig.providerName}' failed: ${fallbackErrorMsg}`
        );

        const totalOrchestratorMs = Math.round(performance.now() - tOrchestratorStart);

        return {
          success: false,
          merchantId,
          merchantName: merchant.name,
          message,
          summary: `AI Agent execution error after fallback to ${activeConfig.providerName}: ${fallbackErrorMsg}`,
          toolCalls: [],
          opportunitiesFound: [],
          actionsCreated: [],
          actionsPendingApproval: 0,
          provider: activeConfig.providerName,
          model: activeConfig.modelName,
          fallbackOccurred: true,
          fallbackReason,
          attemptCount,
          latencyBreakdown: {
            orchestratorTotalMs: totalOrchestratorMs,
            dbMerchantCheckMs,
            llmSteps: llmStepProfiles,
            toolExecutions: toolProfiles,
            synthesisMs: 0,
          },
          error: `Primary (${primaryConfig?.providerName || "primary"}) failed (${primaryErrorMsg}). Fallback (${activeConfig.providerName}) also failed: ${fallbackErrorMsg}`,
        };
      }
    } else {
      const totalOrchestratorMs = Math.round(performance.now() - tOrchestratorStart);
      // Normal application/validation error or no fallback configured
      return {
        success: false,
        merchantId,
        merchantName: merchant.name,
        message,
        summary: `AI Agent execution error: ${primaryErrorMsg}`,
        toolCalls: [],
        opportunitiesFound: [],
        actionsCreated: [],
        actionsPendingApproval: 0,
        provider: activeConfig.providerName,
        model: activeConfig.modelName,
        fallbackOccurred: false,
        attemptCount,
        latencyBreakdown: {
          orchestratorTotalMs: totalOrchestratorMs,
          dbMerchantCheckMs,
          llmSteps: llmStepProfiles,
          toolExecutions: toolProfiles,
          synthesisMs: 0,
        },
        error: primaryErrorMsg,
      };
    }
  }

  // 5. Process & Synthesize Output
  const tSynthesisStart = performance.now();
  const toolCallsSummary: AgentToolCallSummary[] = [];
  const opportunitiesFound: unknown[] = [];
  const actionsCreated: unknown[] = [];

  if (result?.toolResults && Array.isArray(result.toolResults)) {
    for (const tr of result.toolResults as Array<{
      toolName: string;
      input?: Record<string, unknown>;
      args?: Record<string, unknown>;
      output?: unknown;
      result?: unknown;
    }>) {
      const toolArgs = tr.input || tr.args || {};
      const toolOutput = tr.output !== undefined ? tr.output : tr.result;

      toolCallsSummary.push({
        toolName: tr.toolName,
        args: toolArgs,
        result: toolOutput,
      });

      const resData = toolOutput as { success?: boolean; data?: unknown };
      if (tr.toolName === "analyzeCrossSell" && resData?.success && Array.isArray(resData.data)) {
        opportunitiesFound.push(...resData.data);
      }
      if (tr.toolName === "createGrowthAction" && resData?.success && resData.data) {
        actionsCreated.push(resData.data);
      }
      if (tr.toolName === "createGrowthActionsForCustomers" && resData?.success && resData.data) {
        const bulkData = resData.data as { createdActions?: unknown[] };
        if (Array.isArray(bulkData.createdActions)) {
          actionsCreated.push(...bulkData.createdActions);
        }
      }
    }
  }

  const pendingCount = actionsCreated.filter(
    (a) => (a as { status?: string }).status === "PENDING_APPROVAL"
  ).length;

  const synthesisMs = Math.round(performance.now() - tSynthesisStart);
  const orchestratorTotalMs = Math.round(performance.now() - tOrchestratorStart);

  console.log(
    `[Latency Profile] Orchestrator Finished: Total = ${orchestratorTotalMs}ms | DB Merchant Check = ${dbMerchantCheckMs}ms | LLM Steps (${llmStepProfiles.length}) = ${llmStepProfiles.reduce((a, b) => a + b.durationMs, 0)}ms | Tools (${toolProfiles.length}) = ${toolProfiles.reduce((a, b) => a + b.durationMs, 0)}ms | Synthesis = ${synthesisMs}ms`
  );

  return {
    success: true,
    merchantId,
    merchantName: merchant.name,
    message,
    summary: result?.text || "AI agent processed the request successfully.",
    toolCalls: toolCallsSummary,
    opportunitiesFound,
    actionsCreated,
    actionsPendingApproval: pendingCount,
    iterations: result?.steps?.length || 1,
    provider: activeConfig.providerName,
    model: activeConfig.modelName,
    fallbackOccurred,
    fallbackReason,
    attemptCount,
    latencyBreakdown: {
      orchestratorTotalMs,
      dbMerchantCheckMs,
      llmSteps: llmStepProfiles,
      toolExecutions: toolProfiles,
      synthesisMs,
    },
  };
}

