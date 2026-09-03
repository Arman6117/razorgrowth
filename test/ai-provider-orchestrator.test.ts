import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import {
  getPrimaryModelConfig,
  getFallbackModelConfig,
  getLanguageModel,
} from "../lib/agent/providers";
import {
  classifyProviderError,
  isProviderAvailabilityOrQuotaError,
  redactErrorText,
} from "../lib/agent/provider-errors";
import { createAiTools, createToolCollector } from "../lib/agent/ai-tools";
import { SYSTEM_PROMPT } from "../lib/agent/prompts";
import { runAgentOrchestrator } from "../lib/agent/orchestrator";

describe("AI PROVIDER ABSTRACTION & ORCHESTRATOR CLEANUP", () => {
  const originalEnv = { ...process.env };
  let testMerchantId: string;

  before(async () => {
    // Create test merchant for orchestrator testing
    const merchant = await prisma.merchant.create({
      data: {
        name: `AI Test Merchant ${Date.now()}`,
        email: `ai_test_${Date.now()}@test.com`,
        currency: "INR",
      },
    });
    testMerchantId = merchant.id;
  });

  after(async () => {
    // Restore environment
    process.env = { ...originalEnv };

    // Clean up test merchant
    await prisma.merchant.deleteMany({ where: { id: testMerchantId } });
    await prisma.$disconnect();
    setTimeout(() => process.exit(0), 100).unref();
  });

  it("A: Gemini primary provider resolution", () => {
    process.env.AGENT_PROVIDER = "google";
    process.env.GEMINI_API_KEY = "test_gemini_key_12345";
    process.env.AGENT_MODEL = "gemini-3.5-flash";

    const config = getPrimaryModelConfig();
    assert.ok(config);
    assert.equal(config.providerName, "google");
    assert.equal(config.modelName, "gemini-3.5-flash");
    assert.ok(config.model);
  });

  it("B: OpenRouter fallback resolution", () => {
    process.env.AGENT_FALLBACK_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "test_openrouter_key_abcde";
    process.env.AGENT_FALLBACK_MODEL = "liquid/lfm-2.5-2.6b:free";

    const config = getFallbackModelConfig();
    assert.ok(config);
    assert.equal(config.providerName, "openrouter");
    assert.equal(config.modelName, "liquid/lfm-2.5-2.6b:free");
    assert.ok(config.model);
  });

  it("C: OpenAI resolution if supported", () => {
    process.env.AGENT_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-proj-test_openai_key_12345678901234567890";
    process.env.AGENT_MODEL = "gpt-4o";

    const config = getPrimaryModelConfig();
    assert.ok(config);
    assert.equal(config.providerName, "openai");
    assert.equal(config.modelName, "gpt-4o");
    assert.ok(config.model);
  });

  it("D: Provider ordering — defaults to Gemini first when multiple keys exist", () => {
    delete process.env.AGENT_PROVIDER;
    delete process.env.AGENT_MODEL;
    process.env.GEMINI_API_KEY = "test_gemini_key";
    process.env.OPENROUTER_API_KEY = "test_openrouter_key";
    process.env.OPENAI_API_KEY = "sk-proj-test_openai_key";

    const config = getPrimaryModelConfig();
    assert.ok(config);
    assert.equal(config.providerName, "google");
    assert.equal(config.modelName, "gemini-3.5-flash");
  });

  it("E: Quota error classification — classified as QUOTA_EXHAUSTED and fallback-eligible", () => {
    const quotaErrors = [
      {
        data: {
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "Quota exceeded for metric: generativelanguage.googleapis.com",
          },
        },
      },
      new Error("AI_APICallError: You exceeded your current quota, please check plan"),
      new Error("Resource has been exhausted (e.g. check quota)."),
    ];

    for (const err of quotaErrors) {
      const classified = classifyProviderError(err);
      assert.equal(classified.category, "QUOTA_EXHAUSTED");
      assert.equal(classified.isFallbackEligible, true);
      assert.equal(isProviderAvailabilityOrQuotaError(err), true);
    }
  });

  it("F: Rate-limit classification — classified as RATE_LIMIT and fallback-eligible", () => {
    const rateLimitErrors = [
      { status: 429, message: "Too many requests" },
      { statusCode: 429, message: "Rate limit reached for requests per minute" },
      new Error("Rate limit exceeded. Please wait 10 seconds."),
    ];

    for (const err of rateLimitErrors) {
      const classified = classifyProviderError(err);
      assert.equal(classified.category, "RATE_LIMIT");
      assert.equal(classified.isFallbackEligible, true);
      assert.equal(isProviderAvailabilityOrQuotaError(err), true);
    }
  });

  it("G: Temporary-unavailable classification — classified as TEMPORARY_UNAVAILABLE and fallback-eligible", () => {
    const unavailableErrors = [
      { status: 503, message: "Service Unavailable" },
      { status: 502, message: "Bad Gateway" },
      { status: 500, message: "Internal Server Error" },
      { data: { error: { status: "UNAVAILABLE", message: "Model is overloaded" } } },
      new Error("The model is temporarily unavailable. Please retry later."),
    ];

    for (const err of unavailableErrors) {
      const classified = classifyProviderError(err);
      assert.equal(classified.category, "TEMPORARY_UNAVAILABLE");
      assert.equal(classified.isFallbackEligible, true);
      assert.equal(isProviderAvailabilityOrQuotaError(err), true);
    }
  });

  it("H: Authentication error NOT classified as fallback-eligible", () => {
    const authErrors = [
      { status: 401, message: "API_KEY_INVALID: Provided API key is expired" },
      { status: 403, message: "Forbidden: insufficient permissions" },
      { data: { error: { status: "PERMISSION_DENIED", message: "Permission denied" } } },
      new Error("Unauthorized: Invalid API key"),
    ];

    for (const err of authErrors) {
      const classified = classifyProviderError(err);
      assert.equal(classified.category, "AUTHENTICATION");
      assert.equal(classified.isFallbackEligible, false);
      assert.equal(isProviderAvailabilityOrQuotaError(err), false);
    }
  });

  it("I: Invalid-request error NOT classified as fallback-eligible", () => {
    const badRequestErrors = [
      { status: 400, message: "Bad Request: invalid payload" },
      { status: 422, message: "Unprocessable Entity" },
      { data: { error: { status: "INVALID_ARGUMENT", message: "Invalid argument" } } },
      new Error("Validation error in request parameters"),
    ];

    for (const err of badRequestErrors) {
      const classified = classifyProviderError(err);
      assert.equal(classified.category, "INVALID_REQUEST");
      assert.equal(classified.isFallbackEligible, false);
      assert.equal(isProviderAvailabilityOrQuotaError(err), false);
    }
  });

  it("J: Unknown error classification — does not match vague heuristics and is NOT fallback-eligible", () => {
    const vagueErrors = [
      new Error("Operation failed after trying 3 times"),
      new Error("Customer is not eligible for this opportunity"),
      new Error("Database connection closed abruptly"),
      new Error("Unexpected internal issue in worker pool"),
    ];

    for (const err of vagueErrors) {
      const classified = classifyProviderError(err);
      assert.equal(classified.category, "UNKNOWN");
      assert.equal(classified.isFallbackEligible, false);
      assert.equal(isProviderAvailabilityOrQuotaError(err), false);
    }
  });

  it("K: Primary success without fallback", async () => {
    // Setup valid mock model that returns simulated success
    const mockModel: any = {
      specificationVersion: "v2",
      modelId: "mock-primary-model",
      provider: "mock-provider",
      doGenerate: async () => ({
        text: "Successfully analyzed cross-sell opportunities for merchant.",
        content: [
          {
            type: "text",
            text: "Successfully analyzed cross-sell opportunities for merchant.",
          },
        ],
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 20 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      }),
    };

    process.env.AGENT_PROVIDER = "google";
    process.env.GEMINI_API_KEY = "test_key";
    delete process.env.AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR;

    // Use test harness to test execution directly
    const collector = createToolCollector();
    const tools = createAiTools(collector);

    const { executeAgent } = await import("../lib/agent/execution");
    const execRes = await executeAgent({
      config: {
        model: mockModel,
        providerName: "google",
        modelName: "gemini-3.5-flash",
      },
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: "Find opportunities",
      tools,
      maxRetries: 0,
      isPrimary: true,
    });

    assert.ok(execRes.result.text);
    assert.match(execRes.result.text, /Successfully analyzed/);
    assert.ok(Array.isArray(execRes.stepProfiles));
  });

  it("L: Primary quota failure → fallback triggers and executes fallback provider", async () => {
    process.env.AGENT_PROVIDER = "google";
    process.env.GEMINI_API_KEY = "test_key";
    process.env.AGENT_FALLBACK_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "test_openrouter_key";
    process.env.AGENT_FALLBACK_MODEL = "liquid/lfm-2.5-2.6b:free";
    process.env.AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR = "true";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          id: "resp_mock_fallback",
          status: "completed",
          output: [
            {
              id: "msg_fallback_1",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "Successfully analyzed cross-sell opportunities via fallback provider.",
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 15, output_tokens: 20 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof globalThis.fetch;

    try {
      const res = await runAgentOrchestrator({
        merchantId: testMerchantId,
        message: "Find cross-sell opportunities",
      });

      // Fallback occurred and succeeded
      assert.equal(res.fallbackOccurred, true);
      assert.equal(res.attemptCount, 2);
      assert.ok(res.fallbackReason);
      assert.equal(res.provider, "openrouter");
      assert.equal(res.success, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("M: Primary non-retryable failure → no fallback attempted", async () => {
    delete process.env.AGENT_TEST_FORCE_PRIMARY_QUOTA_ERROR;
    process.env.AGENT_PROVIDER = "google";
    process.env.GEMINI_API_KEY = "test_key";
    process.env.AGENT_FALLBACK_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "test_openrouter_key";

    // Non-existent merchant ID rejected upfront at merchant check
    const res = await runAgentOrchestrator({
      merchantId: "cm_invalid_merchant_id_nonexistent",
      message: "Find opportunities",
    });

    assert.equal(res.success, false);
    assert.equal(res.fallbackOccurred, false);
    assert.equal(res.attemptCount, undefined);
    assert.match(res.error || "", /Merchant not found/);
  });

  it("N: Raw provider error is not exposed to client-facing response", () => {
    const rawSecretKey = "AIzaSyD_SECRET_KEY_1234567890ABCDEF12";
    const rawErrorWithSecret = `Failed to connect to Google API with key ${rawSecretKey} at https://generativelanguage.googleapis.com`;

    const classified = classifyProviderError(new Error(rawErrorWithSecret));
    assert.ok(!classified.safeClientMessage.includes(rawSecretKey));
    assert.ok(!classified.message.includes(rawSecretKey));

    // Verify redactErrorText
    const redacted = redactErrorText(`Bearer secret_token with key ${rawSecretKey}`);
    assert.ok(!redacted.includes(rawSecretKey));
    assert.match(redacted, /\[REDACTED_GEMINI_KEY\]/);
  });

  it("O: Existing AI tools remain available", () => {
    const collector = createToolCollector();
    const tools = createAiTools(collector);

    const expectedTools = [
      "analyzeCrossSell",
      "isCustomerEligible",
      "createGrowthAction",
      "createGrowthActionsForCustomers",
      "getGrowthOpportunities",
      "inspectOpportunityEvidence",
      "resolveEligibleCustomers",
      "recommendGrowthAction",
      "prepareGrowthActions",
      "getGrowthActionStatus",
    ];

    for (const toolName of expectedTools) {
      assert.ok(toolName in tools, `Tool ${toolName} must be present in createAiTools`);
    }
    assert.equal(Object.keys(tools).length, 10);
  });

  it("P: Human approval boundary remains intact — approveGrowthAction is excluded from LLM tools", () => {
    const collector = createToolCollector();
    const tools = createAiTools(collector);

    assert.equal(
      "approveGrowthAction" in tools,
      false,
      "approveGrowthAction MUST NOT be exposed to LLM tools"
    );
    assert.equal(
      "executeGrowthAction" in tools,
      false,
      "executeGrowthAction MUST NOT be exposed to LLM tools"
    );

    // Verify SYSTEM_PROMPT reinforces the human approval rule
    assert.match(SYSTEM_PROMPT, /HUMAN CONTROL BOUNDARY/);
    assert.match(SYSTEM_PROMPT, /You MUST NOT approve or execute financial actions/);
  });
});
