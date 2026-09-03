import { tool } from "ai";
import { z } from "zod";
import {
  analyzeCrossSellTool,
  isCustomerEligibleTool,
  createGrowthActionTool,
  createGrowthActionsForCustomersTool,
  getGrowthOpportunitiesTool,
  inspectOpportunityEvidenceTool,
  resolveEligibleCustomersTool,
  recommendGrowthActionTool,
  prepareGrowthActionsTool,
  getGrowthActionStatusTool,
} from "./tools";
import type { ToolExecutionProfile } from "./types";

export interface ToolInstrumentationCollector {
  recordExecution(profile: ToolExecutionProfile): void;
  getProfiles(): ToolExecutionProfile[];
}

export function createToolCollector(): ToolInstrumentationCollector {
  const profiles: ToolExecutionProfile[] = [];
  return {
    recordExecution(p: ToolExecutionProfile) {
      profiles.push(p);
    },
    getProfiles() {
      return [...profiles];
    },
  };
}

/**
 * Creates the registry of Vercel AI SDK tools adapted from domain tools in lib/agent/tools.ts.
 *
 * SAFETY BOUNDARY:
 * approveGrowthActionTool is deliberately EXCLUDED to strictly enforce human-in-the-loop control.
 * The AI agent cannot approve or execute financial actions.
 */
export function createAiTools(collector?: ToolInstrumentationCollector) {
  return {
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
          ? res.data.reduce((acc, o) => acc + (o.eligibleCustomerCount || 0), 0)
          : 0;

        console.log(
          `[Latency Profile] Tool 'analyzeCrossSell' executed in ${dt}ms | Opps: ${oppCount} | Total Eligible: ${totalEligible} | Payload Size: ${sizeKb} KB`
        );

        collector?.recordExecution({
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

        collector?.recordExecution({
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

        collector?.recordExecution({
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
        customerIds: z
          .array(z.string())
          .optional()
          .describe("Optional explicit customer ID array. If omitted, all eligible customers are targeted automatically."),
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
        const data = res.data as { createdCount?: number; duplicateCount?: number } | undefined;
        const createdCount = data?.createdCount ?? 0;
        const duplicateCount = data?.duplicateCount ?? 0;
        const reqCount = toolInput.customerIds?.length ?? "ALL";

        console.log(
          `[Latency Profile] Tool 'createGrowthActionsForCustomers' (Bulk) executed in ${dt}ms | Requested: ${reqCount} | Created: ${createdCount} | Duplicates: ${duplicateCount}`
        );

        collector?.recordExecution({
          toolName: "createGrowthActionsForCustomers",
          durationMs: dt,
          extraInfo: `Bulk: Requested ${reqCount}, Created ${createdCount}, Dupes ${duplicateCount}`,
        });

        return res;
      },
    }),

    getGrowthOpportunities: tool({
      description:
        "Returns verified merchant growth opportunities with authoritative estimated revenues, strategies, and confidence scores.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
      }),
      execute: async (toolInput: { merchantId: string }) => {
        const t0 = performance.now();
        const res = await getGrowthOpportunitiesTool({ merchantId: toolInput.merchantId });
        const dt = Math.round(performance.now() - t0);
        collector?.recordExecution({
          toolName: "getGrowthOpportunities",
          durationMs: dt,
          extraInfo: `Opps: ${Array.isArray(res.data) ? res.data.length : 0}`,
        });
        return res;
      },
    }),

    inspectOpportunityEvidence: tool({
      description:
        "Returns deterministic co-purchase facts, attach rates, sample sizes, and authoritative prices for a selected opportunity.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
        opportunityId: z.string().describe("Opportunity identifier to inspect."),
      }),
      execute: async (toolInput: { merchantId: string; opportunityId: string }) => {
        const t0 = performance.now();
        const res = await inspectOpportunityEvidenceTool({
          merchantId: toolInput.merchantId,
          opportunityId: toolInput.opportunityId,
        });
        const dt = Math.round(performance.now() - t0);
        collector?.recordExecution({
          toolName: "inspectOpportunityEvidence",
          durationMs: dt,
          extraInfo: `Opportunity: ${toolInput.opportunityId}`,
        });
        return res;
      },
    }),

    resolveEligibleCustomers: tool({
      description:
        "Uses backend deterministic eligibility rules to resolve the real target customer population for an opportunity.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
        opportunityId: z.string().describe("Opportunity identifier."),
      }),
      execute: async (toolInput: { merchantId: string; opportunityId: string }) => {
        const t0 = performance.now();
        const res = await resolveEligibleCustomersTool({
          merchantId: toolInput.merchantId,
          opportunityId: toolInput.opportunityId,
        });
        const dt = Math.round(performance.now() - t0);
        collector?.recordExecution({
          toolName: "resolveEligibleCustomers",
          durationMs: dt,
          extraInfo: `Opportunity: ${toolInput.opportunityId}`,
        });
        return res;
      },
    }),

    recommendGrowthAction: tool({
      description:
        "Produces a structured, evidence-backed growth plan recommendation for an opportunity. Requires merchant approval before execution.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
        opportunityId: z.string().describe("Opportunity identifier to formulate recommendation for."),
      }),
      execute: async (toolInput: { merchantId: string; opportunityId: string }) => {
        const t0 = performance.now();
        const res = await recommendGrowthActionTool({
          merchantId: toolInput.merchantId,
          opportunityId: toolInput.opportunityId,
        });
        const dt = Math.round(performance.now() - t0);
        collector?.recordExecution({
          toolName: "recommendGrowthAction",
          durationMs: dt,
          extraInfo: `Opportunity: ${toolInput.opportunityId}`,
        });
        return res;
      },
    }),

    prepareGrowthActions: tool({
      description:
        "Prepares GrowthActions in PENDING_APPROVAL status for all eligible customers of an opportunity. The AI agent CANNOT approve or execute financial actions.",
      inputSchema: z.object({
        merchantId: z.string().describe("Authoritative merchant identifier."),
        opportunityId: z.string().describe("Opportunity identifier to prepare actions for."),
      }),
      execute: async (toolInput: { merchantId: string; opportunityId: string }) => {
        const t0 = performance.now();
        const res = await prepareGrowthActionsTool({
          merchantId: toolInput.merchantId,
          opportunityId: toolInput.opportunityId,
        });
        const dt = Math.round(performance.now() - t0);
        const data = res.data as { createdCount?: number } | undefined;
        collector?.recordExecution({
          toolName: "prepareGrowthActions",
          durationMs: dt,
          extraInfo: `Prepared: ${data?.createdCount ?? 0}`,
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

        collector?.recordExecution({
          toolName: "getGrowthActionStatus",
          durationMs: dt,
          extraInfo: `Action: ${toolInput.actionId}`,
        });

        return res;
      },
    }),
  };
}

export type AiTools = ReturnType<typeof createAiTools>;
