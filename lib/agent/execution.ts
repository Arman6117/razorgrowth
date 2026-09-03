import { generateText, isStepCount } from "ai";
import type {
  ProviderModelConfig,
  LatencyStepProfile,
  GenerateTextResult,
} from "./types";
import type { AiTools } from "./ai-tools";

export interface ExecuteAgentOptions {
  config: ProviderModelConfig;
  systemPrompt: string;
  userPrompt: string;
  tools: AiTools;
  maxRetries?: number;
  maxSteps?: number;
  isPrimary?: boolean;
}

export interface ExecuteAgentResult {
  result: GenerateTextResult;
  stepProfiles: LatencyStepProfile[];
}

/**
 * Executes a single AI provider step with tool calling and latency instrumentation.
 * Shared by both primary and fallback execution.
 */
export async function executeAgent(
  options: ExecuteAgentOptions
): Promise<ExecuteAgentResult> {
  const {
    config,
    systemPrompt,
    userPrompt,
    tools,
    maxRetries = 0,
    maxSteps = 5,
    isPrimary = false,
  } = options;

  // Development/test hook: Simulate Gemini quota exhaustion without modifying production behavior
  if (isPrimary && process.env.AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR === "true") {
    const simulatedQuotaError = new Error(
      "AI_APICallError: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.5-flash Please retry in 54.086447316s."
    );
    const errObj = simulatedQuotaError as unknown as Record<string, unknown>;
    errObj.statusCode = 429;
    errObj.status = 429;
    errObj.name = "AI_APICallError";
    errObj.data = {
      error: {
        code: 429,
        message:
          "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests",
        status: "RESOURCE_EXHAUSTED",
      },
    };
    throw simulatedQuotaError;
  }

  const stepProfiles: LatencyStepProfile[] = [];
  let stepNumber = 0;
  let stepStartTime = performance.now();

  const result = await generateText({
    model: config.model,
    system: systemPrompt,
    prompt: userPrompt,
    tools,
    stopWhen: isStepCount(maxSteps),
    maxRetries,
    onStepFinish: (event) => {
      stepNumber++;
      const now = performance.now();
      const durationMs = Math.round(now - stepStartTime);
      const hasToolCalls = Boolean(event.toolCalls && event.toolCalls.length > 0);
      const toolNames = hasToolCalls ? event.toolCalls.map((tc) => tc.toolName) : [];

      console.log(
        `[Latency Profile] ${isPrimary ? "Primary" : "Fallback"} LLM Step #${stepNumber}: Provider: ${config.providerName} | Model: ${config.modelName} | Duration: ${durationMs}ms | Output: ${hasToolCalls ? `Tool Call [${toolNames.join(", ")}]` : `Final Text (${event.text?.length || 0} chars)`}`
      );

      stepProfiles.push({
        step: stepNumber,
        provider: config.providerName,
        model: config.modelName,
        durationMs,
        type: hasToolCalls ? "tool_call" : "final_text",
        toolNames,
      });

      stepStartTime = performance.now();
    },
  });

  return {
    result,
    stepProfiles,
  };
}
