import type { generateText } from "ai";
import type { AiTools } from "./ai-tools";

export type LanguageModelTarget = Parameters<typeof generateText>[0]["model"];
export type GenerateTextResult = Awaited<ReturnType<typeof generateText<AiTools>>>;

export type ProviderName = "google" | "openai" | "openrouter";

export interface ProviderModelConfig {
  model: LanguageModelTarget;
  providerName: ProviderName | string;
  modelName: string;
}

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
