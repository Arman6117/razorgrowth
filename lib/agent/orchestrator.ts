import { prisma } from "../prisma";
import type {
  AgentOrchestratorInput,
  AgentOrchestratorResponse,
  AgentToolCallSummary,
  GenerateTextResult,
  ProviderModelConfig,
  LatencyBreakdown,
  LatencyStepProfile,
  ToolExecutionProfile,
} from "./types";
import { SYSTEM_PROMPT, buildMerchantContextPrompt } from "./prompts";
import {
  getPrimaryModelConfig,
  getFallbackModelConfig,
  getLanguageModel,
} from "./providers";
import {
  classifyProviderError,
  isProviderAvailabilityOrQuotaError,
} from "./provider-errors";
import { createAiTools, createToolCollector, type AiTools } from "./ai-tools";
import { executeAgent } from "./execution";

// Re-export public members for backwards compatibility with existing callers
export {
  getPrimaryModelConfig,
  getFallbackModelConfig,
  getLanguageModel,
  isProviderAvailabilityOrQuotaError,
  classifyProviderError,
};
export type * from "./types";

interface ToolResultItem {
  toolName: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
  output?: unknown;
  result?: unknown;
}

/**
 * Extracts and synthesizes opportunities, actions, and summaries from LLM tool execution results.
 */
function synthesizeToolResults(result: GenerateTextResult | null): {
  toolCallsSummary: AgentToolCallSummary[];
  opportunitiesFound: unknown[];
  actionsCreated: unknown[];
  pendingCount: number;
} {
  const toolCallsSummary: AgentToolCallSummary[] = [];
  const opportunitiesFound: unknown[] = [];
  const actionsCreated: unknown[] = [];

  if (result?.toolResults && Array.isArray(result.toolResults)) {
    for (const rawTr of result.toolResults) {
      const tr = rawTr as ToolResultItem;
      const toolArgs = tr.input || tr.args || {};
      const toolOutput = tr.output !== undefined ? tr.output : tr.result;

      toolCallsSummary.push({
        toolName: tr.toolName,
        args: toolArgs,
        result: toolOutput,
      });

      const resData = toolOutput as { success?: boolean; data?: unknown } | undefined;
      if (
        (tr.toolName === "analyzeCrossSell" || tr.toolName === "getGrowthOpportunities") &&
        resData?.success &&
        Array.isArray(resData.data)
      ) {
        opportunitiesFound.push(...resData.data);
      }
      if (tr.toolName === "recommendGrowthAction" && resData?.success && resData.data) {
        opportunitiesFound.push(resData.data);
      }
      if (tr.toolName === "createGrowthAction" && resData?.success && resData.data) {
        actionsCreated.push(resData.data);
      }
      if (
        (tr.toolName === "createGrowthActionsForCustomers" || tr.toolName === "prepareGrowthActions") &&
        resData?.success &&
        resData.data
      ) {
        const bulkData = resData.data as { createdActions?: unknown[]; actionIds?: string[] };
        if (Array.isArray(bulkData.createdActions)) {
          actionsCreated.push(...bulkData.createdActions);
        } else if (Array.isArray(bulkData.actionIds)) {
          actionsCreated.push(
            ...bulkData.actionIds.map((id) => ({ id, status: "PENDING_APPROVAL" }))
          );
        }
      }
    }
  }

  const pendingCount = actionsCreated.filter(
    (a) => (a as { status?: string }).status === "PENDING_APPROVAL"
  ).length;

  return {
    toolCallsSummary,
    opportunitiesFound,
    actionsCreated,
    pendingCount,
  };
}

/**
 * Runs the AI Agent LLM Orchestrator.
 * Orchestrates provider resolution, primary-to-fallback execution, and safe client-facing synthesis.
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
      fallbackOccurred: false,
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
      fallbackOccurred: false,
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
      fallbackOccurred: false,
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
      fallbackOccurred: false,
      error:
        "GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY environment variable is required to execute LLM agent calls.",
    };
  }

  const toolCollector = createToolCollector();
  const tools = createAiTools(toolCollector);
  const promptText = buildMerchantContextPrompt(merchant, message);

  let activeConfig: ProviderModelConfig = primaryConfig || fallbackConfig!;
  let fallbackOccurred = false;
  let fallbackReason: string | undefined = undefined;
  let attemptCount = 0;
  let result: GenerateTextResult | null = null;
  const llmStepProfiles: LatencyStepProfile[] = [];

  try {
    attemptCount++;
    console.log(
      `[RazorGrowth AI Agent] Attempt ${attemptCount}: Executing primary provider '${activeConfig.providerName}' with model '${activeConfig.modelName}'...`
    );

    const execResult = await executeAgent({
      config: activeConfig,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: promptText,
      tools,
      maxRetries: 0,
      maxSteps: 5,
      isPrimary: true,
    });

    result = execResult.result;
    llmStepProfiles.push(...execResult.stepProfiles);

    console.log(
      `[RazorGrowth AI Agent] Provider '${activeConfig.providerName}' call succeeded (${activeConfig.modelName}). Fallback occurred: false. Total attempts: ${attemptCount}.`
    );
  } catch (primaryErr: unknown) {
    const classifiedPrimary = classifyProviderError(primaryErr);
    console.warn(
      `[RazorGrowth AI Agent] Provider '${activeConfig.providerName}' failed [${classifiedPrimary.category}]: ${classifiedPrimary.message}`
    );

    // If quota/availability error occurred and distinct fallback provider is configured:
    const isFallbackEligible =
      classifiedPrimary.isFallbackEligible &&
      fallbackConfig &&
      (fallbackConfig.providerName !== activeConfig.providerName ||
        fallbackConfig.modelName !== activeConfig.modelName);

    if (isFallbackEligible) {
      fallbackOccurred = true;
      fallbackReason = classifiedPrimary.safeClientMessage;
      activeConfig = fallbackConfig;
      attemptCount++;

      console.log(
        `[RazorGrowth AI Agent] Attempt ${attemptCount}: Immediately attempting fallback provider '${activeConfig.providerName}' (Model: '${activeConfig.modelName}') due to primary ${classifiedPrimary.category}.`
      );

      try {
        const fallbackExecResult = await executeAgent({
          config: activeConfig,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: promptText,
          tools,
          maxRetries: 1,
          maxSteps: 5,
          isPrimary: false,
        });

        result = fallbackExecResult.result;
        llmStepProfiles.push(...fallbackExecResult.stepProfiles);

        console.log(
          `[RazorGrowth AI Agent] Fallback provider '${activeConfig.providerName}' call succeeded (${activeConfig.modelName}). Total attempts: ${attemptCount}.`
        );
      } catch (fallbackErr: unknown) {
        const classifiedFallback = classifyProviderError(fallbackErr);
        console.error(
          `[RazorGrowth AI Agent] Fallback provider '${activeConfig.providerName}' failed [${classifiedFallback.category}]: ${classifiedFallback.message}`
        );

        const totalOrchestratorMs = Math.round(performance.now() - tOrchestratorStart);

        return {
          success: false,
          merchantId,
          merchantName: merchant.name,
          message,
          summary: `AI Agent execution error after fallback to ${activeConfig.providerName}: ${classifiedFallback.safeClientMessage}`,
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
            toolExecutions: toolCollector.getProfiles(),
            synthesisMs: 0,
          },
          error: `Primary provider (${primaryConfig?.providerName || "primary"}) failed. Fallback (${activeConfig.providerName}) also failed: ${classifiedFallback.safeClientMessage}`,
        };
      }
    } else {
      const totalOrchestratorMs = Math.round(performance.now() - tOrchestratorStart);
      return {
        success: false,
        merchantId,
        merchantName: merchant.name,
        message,
        summary: `AI Agent execution error: ${classifiedPrimary.safeClientMessage}`,
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
          toolExecutions: toolCollector.getProfiles(),
          synthesisMs: 0,
        },
        error: classifiedPrimary.safeClientMessage,
      };
    }
  }

  // 3. Process & Synthesize Output
  const tSynthesisStart = performance.now();
  const {
    toolCallsSummary,
    opportunitiesFound,
    actionsCreated,
    pendingCount,
  } = synthesizeToolResults(result);

  const synthesisMs = Math.round(performance.now() - tSynthesisStart);
  const orchestratorTotalMs = Math.round(performance.now() - tOrchestratorStart);
  const toolProfiles = toolCollector.getProfiles();

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
