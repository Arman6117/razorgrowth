import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderModelConfig, LanguageModelTarget } from "./types";

/**
 * Creates an instantiated language model target for a specific provider.
 */
function createModelForProvider(
  provider: string,
  modelName: string,
  apiKey: string,
  baseURL?: string
): LanguageModelTarget {
  switch (provider) {
    case "google":
    case "gemini": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelName);
    }
    case "openrouter": {
      const openrouter = createOpenAI({
        baseURL: baseURL || "https://openrouter.ai/api/v1",
        apiKey,
      });
      return openrouter(modelName);
    }
    case "openai": {
      const openaiClient = createOpenAI({ apiKey });
      return openaiClient(modelName);
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
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
    if (geminiKey?.trim()) {
      const resolvedModel = modelName || "gemini-3.5-flash";
      return {
        model: createModelForProvider("google", resolvedModel, geminiKey.trim()),
        providerName: "google",
        modelName: resolvedModel,
      };
    }
  } else if (provider === "openrouter") {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey?.trim()) {
      const resolvedModel = modelName || "openai/gpt-oss-20b:free";
      return {
        model: createModelForProvider("openrouter", resolvedModel, openrouterKey.trim()),
        providerName: "openrouter",
        modelName: resolvedModel,
      };
    }
  } else if (provider === "openai") {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey?.trim()) {
      const resolvedModel = modelName || "gpt-4o";
      return {
        model: createModelForProvider("openai", resolvedModel, openaiKey.trim()),
        providerName: "openai",
        modelName: resolvedModel,
      };
    }
  }

  // Fallback defaults if AGENT_PROVIDER did not match available keys
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey?.trim()) {
    const resolvedModel = modelName || "gemini-3.5-flash";
    return {
      model: createModelForProvider("google", resolvedModel, geminiKey.trim()),
      providerName: "google",
      modelName: resolvedModel,
    };
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey?.trim()) {
    const resolvedModel = modelName || "openai/gpt-oss-20b:free";
    return {
      model: createModelForProvider("openrouter", resolvedModel, openrouterKey.trim()),
      providerName: "openrouter",
      modelName: resolvedModel,
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey?.trim()) {
    const resolvedModel = modelName || "gpt-4o";
    return {
      model: createModelForProvider("openai", resolvedModel, openaiKey.trim()),
      providerName: "openai",
      modelName: resolvedModel,
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
    if (openrouterKey?.trim()) {
      return {
        model: createModelForProvider("openrouter", fallbackModelName, openrouterKey.trim()),
        providerName: "openrouter",
        modelName: fallbackModelName,
      };
    }
  } else if (fallbackProvider === "google" || fallbackProvider === "gemini") {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (geminiKey?.trim()) {
      const resolvedModel = fallbackModelName || "gemini-3.5-flash";
      return {
        model: createModelForProvider("google", resolvedModel, geminiKey.trim()),
        providerName: "google",
        modelName: resolvedModel,
      };
    }
  } else if (fallbackProvider === "openai") {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey?.trim()) {
      const resolvedModel = fallbackModelName || "gpt-4o-mini";
      return {
        model: createModelForProvider("openai", resolvedModel, openaiKey.trim()),
        providerName: "openai",
        modelName: resolvedModel,
      };
    }
  }

  return null;
}

/**
 * Legacy compatibility resolver.
 */
export function getLanguageModel(): LanguageModelTarget | null {
  const primary = getPrimaryModelConfig();
  if (primary) return primary.model;
  const fallback = getFallbackModelConfig();
  if (fallback) return fallback.model;
  return null;
}
