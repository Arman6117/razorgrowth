import { prisma } from "../prisma";
import { analyzeCrossSell, CrossSellOpportunity } from "../analytics/cross-sell";
import {
  isCustomerEligible,
  createGrowthAction,
  createGrowthActionsForCustomers,
  approveGrowthAction,
  getGrowthAction,
  duplicateActionCheck,
} from "../actions/growth-action";
import {
  GrowthActionStatus,
  GrowthActionType,
  OpportunityType,
  OpportunityStatus,
} from "../generated/prisma/enums";

export interface AgentToolResponse<T = unknown> {
  success: boolean;
  toolName: string;
  data?: T;
  error?: string;
  message?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
        items?: { type: string };
      }
    >;
    required: string[];
  };
}

/**
 * Tool 1: analyzeCrossSellTool
 *
 * Runs the deterministic cross-sell analytics engine on verified merchant transaction data.
 * Resolves product pairs, cross-sell conversion rates, eligible customer lists, and expected revenue.
 */
export async function analyzeCrossSellTool(input: {
  merchantId: string;
}): Promise<AgentToolResponse<CrossSellOpportunity[]>> {
  if (!input.merchantId?.trim()) {
    return {
      success: false,
      toolName: "analyzeCrossSell",
      error: "merchantId parameter is required",
    };
  }

  // Validate merchant exists in authoritative DB
  const merchant = await prisma.merchant.findUnique({
    where: { id: input.merchantId },
    select: { id: true, name: true },
  });

  if (!merchant) {
    return {
      success: false,
      toolName: "analyzeCrossSell",
      error: `Merchant not found with ID: ${input.merchantId}`,
    };
  }

  const opportunities = await analyzeCrossSell(merchant.id);

  return {
    success: true,
    toolName: "analyzeCrossSell",
    data: opportunities,
    message: `Discovered ${opportunities.length} revenue opportunities from transaction patterns.`,
  };
}

/**
 * Tool 2: isCustomerEligibleTool
 *
 * Deterministically checks whether a specific customer is eligible for a cross-sell opportunity.
 * Authoritative rules:
 * - Customer must have a PAID order containing sourceProductId.
 * - Customer must NOT have any PAID order containing targetProductId.
 */
export async function isCustomerEligibleTool(input: {
  merchantId: string;
  customerId: string;
  targetProductId: string;
  sourceProductId?: string;
  opportunityId?: string;
}): Promise<AgentToolResponse<{ eligible: boolean; customerId: string; targetProductId: string }>> {
  const { merchantId, customerId, targetProductId, sourceProductId, opportunityId } = input;

  if (!merchantId?.trim() || !customerId?.trim() || !targetProductId?.trim()) {
    return {
      success: false,
      toolName: "isCustomerEligible",
      error: "merchantId, customerId, and targetProductId are required parameters",
    };
  }

  // Authoritative validation of merchant & customer ownership
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, merchantId },
    select: { id: true, name: true, email: true },
  });

  if (!customer) {
    return {
      success: false,
      toolName: "isCustomerEligible",
      error: `Customer not found or does not belong to merchant: ${customerId}`,
    };
  }

  const eligible = await isCustomerEligible({
    merchantId,
    customerId,
    sourceProductId,
    targetProductId,
    opportunityId,
  });

  return {
    success: true,
    toolName: "isCustomerEligible",
    data: {
      eligible,
      customerId,
      targetProductId,
    },
    message: eligible
      ? `Customer ${customer.name} (${customer.email}) is eligible for target product offer.`
      : `Customer ${customer.name} (${customer.email}) is NOT eligible (already purchased target product or missing prerequisite purchase).`,
  };
}

/**
 * Tool 3: createGrowthActionTool
 *
 * Creates a GrowthAction in PENDING_APPROVAL status.
 *
 * STRICT SAFETY BOUNDARIES:
 * - The LLM CANNOT invent prices or amounts. Target product price is strictly resolved from Prisma.
 * - Requires existing Opportunity and Customer in database.
 * - Validates customer eligibility server-side.
 * - Prevents duplicate active actions.
 * - Records GROWTH_ACTION_CREATED in AuditEvent.
 */
export async function createGrowthActionTool(input: {
  merchantId: string;
  opportunityId: string;
  customerId: string;
  sourceProductId?: string;
  targetProductId?: string;
}): Promise<AgentToolResponse> {
  const { merchantId, opportunityId, customerId, sourceProductId, targetProductId } = input;

  if (!merchantId?.trim() || !opportunityId?.trim() || !customerId?.trim()) {
    return {
      success: false,
      toolName: "createGrowthAction",
      error: "merchantId, opportunityId, and customerId are required parameters",
    };
  }

  try {
    const action = await createGrowthAction({
      merchantId,
      opportunityId,
      customerId,
      sourceProductId,
      targetProductId,
    });

    const params = action.parameters as Record<string, unknown>;

    return {
      success: true,
      toolName: "createGrowthAction",
      data: {
        actionId: action.id,
        opportunityId: action.opportunityId,
        status: action.status,
        type: action.type,
        targetProduct: params.targetProductName,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        amountInRupees: params.amountInRupees,
        amountInPaise: params.amountInPaise,
      },
      message: `GrowthAction created with status '${action.status}'. Financial actions require merchant approval before execution.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "createGrowthAction",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 3b: createGrowthActionsForCustomersTool
 *
 * Creates GrowthActions in bulk for a list of eligible customers in PENDING_APPROVAL status.
 *
 * STRICT SAFETY BOUNDARIES:
 * - Authoritative target product price is strictly resolved from Prisma DB.
 * - Customer eligibility is deterministically checked for each customer.
 * - Duplicate protection prevents multiple in-flight actions or duplicate billing for EXECUTED actions.
 * - Records individual GROWTH_ACTION_CREATED AuditEvents.
 */
export async function createGrowthActionsForCustomersTool(input: {
  merchantId: string;
  opportunityId: string;
  customerIds: string[];
  sourceProductId?: string;
  targetProductId?: string;
}): Promise<AgentToolResponse> {
  const { merchantId, opportunityId, customerIds, sourceProductId, targetProductId } = input;

  if (!merchantId?.trim() || !opportunityId?.trim()) {
    return {
      success: false,
      toolName: "createGrowthActionsForCustomers",
      error: "merchantId and opportunityId are required parameters",
    };
  }

  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return {
      success: false,
      toolName: "createGrowthActionsForCustomers",
      error: "customerIds must be a non-empty array of customer IDs",
    };
  }

  try {
    const result = await createGrowthActionsForCustomers({
      merchantId,
      opportunityId,
      customerIds,
      sourceProductId,
      targetProductId,
    });

    return {
      success: true,
      toolName: "createGrowthActionsForCustomers",
      data: {
        createdCount: result.createdCount,
        duplicateCount: result.duplicateCount,
        rejectedCount: result.rejectedCount,
        actionIds: result.actionIds,
        skippedCustomers: result.skippedCustomers,
        createdActions: result.createdActions.map((a) => {
          const params = a.parameters as Record<string, unknown>;
          return {
            actionId: a.id,
            opportunityId: a.opportunityId,
            status: a.status,
            type: a.type,
            targetProduct: params.targetProductName,
            customerName: params.customerName,
            customerEmail: params.customerEmail,
            amountInRupees: params.amountInRupees,
            amountInPaise: params.amountInPaise,
          };
        }),
      },
      message: `Bulk creation completed: ${result.createdCount} GrowthActions created in 'PENDING_APPROVAL' status, ${result.duplicateCount} duplicates skipped, ${result.rejectedCount} rejected/skipped. Actions require merchant approval before execution.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "createGrowthActionsForCustomers",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 4: approveGrowthActionTool
 *
 * Approves a PENDING_APPROVAL GrowthAction on behalf of the merchant.
 *
 * STRICT SAFETY BOUNDARIES:
 * - Enforces state transition guardrail: PENDING_APPROVAL → APPROVED.
 * - Records GROWTH_ACTION_APPROVED in AuditEvent with AuditActor.MERCHANT.
 * - Does NOT execute the payment action (execution remains separate).
 */
export async function approveGrowthActionTool(input: {
  merchantId: string;
  actionId: string;
}): Promise<AgentToolResponse> {
  const { merchantId, actionId } = input;

  if (!merchantId?.trim() || !actionId?.trim()) {
    return {
      success: false,
      toolName: "approveGrowthAction",
      error: "merchantId and actionId are required parameters",
    };
  }

  try {
    const action = await approveGrowthAction({
      merchantId,
      actionId,
    });

    return {
      success: true,
      toolName: "approveGrowthAction",
      data: {
        actionId: action.id,
        status: action.status,
        approvedAt: action.approvedAt,
      },
      message: `GrowthAction ${action.id} successfully approved. Status is now '${action.status}'.`,
    };
  } catch (error) {
    return {
      success: false,
      toolName: "approveGrowthAction",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Tool 5: getGrowthActionStatusTool
 *
 * Retrieves current status, payment link information, and audit timeline for an action.
 */
export async function getGrowthActionStatusTool(input: {
  merchantId: string;
  actionId: string;
}): Promise<AgentToolResponse> {
  const { merchantId, actionId } = input;

  if (!merchantId?.trim() || !actionId?.trim()) {
    return {
      success: false,
      toolName: "getGrowthActionStatus",
      error: "merchantId and actionId are required parameters",
    };
  }

  const action = await getGrowthAction({ merchantId, actionId });
  if (!action) {
    return {
      success: false,
      toolName: "getGrowthActionStatus",
      error: `GrowthAction '${actionId}' not found for merchant`,
    };
  }

  return {
    success: true,
    toolName: "getGrowthActionStatus",
    data: {
      actionId: action.id,
      status: action.status,
      type: action.type,
      opportunityTitle: action.opportunity.title,
      parameters: action.parameters,
      approvedAt: action.approvedAt,
      executedAt: action.executedAt,
      auditTrail: action.auditEvents.map((evt) => ({
        eventType: evt.eventType,
        actor: evt.actor,
        timestamp: evt.createdAt,
      })),
    },
    message: `GrowthAction ${action.id} status is '${action.status}'.`,
  };
}

/**
 * Standard JSON Schema declarations for LLM Function / Tool Calling.
 */
export const agentToolDefinitions: ToolDefinition[] = [
  {
    name: "analyzeCrossSell",
    description:
      "Analyzes merchant transactions to discover cross-sell opportunities, calculate cross-sell rates, identify eligible customers, and estimate potential revenue.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier in RazorGrowth.",
        },
      },
      required: ["merchantId"],
    },
  },
  {
    name: "isCustomerEligible",
    description:
      "Checks whether a specific customer is eligible for a cross-sell opportunity (customer bought source product, but has not bought target product).",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        customerId: {
          type: "string",
          description: "Authoritative customer identifier.",
        },
        targetProductId: {
          type: "string",
          description: "Target product to offer.",
        },
        sourceProductId: {
          type: "string",
          description: "Source product customer previously purchased (optional).",
        },
        opportunityId: {
          type: "string",
          description: "Opportunity identifier to resolve product relations (optional).",
        },
      },
      required: ["merchantId", "customerId", "targetProductId"],
    },
  },
  {
    name: "createGrowthAction",
    description:
      "Creates a GrowthAction (CREATE_PAYMENT_LINK) in PENDING_APPROVAL status for an eligible customer. Prices are resolved authoritatively from the database.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        opportunityId: {
          type: "string",
          description: "Discovered opportunity identifier.",
        },
        customerId: {
          type: "string",
          description: "Eligible customer identifier.",
        },
        targetProductId: {
          type: "string",
          description: "Target product identifier (optional if opportunity specified).",
        },
        sourceProductId: {
          type: "string",
          description: "Source product identifier (optional if opportunity specified).",
        },
      },
      required: ["merchantId", "opportunityId", "customerId"],
    },
  },
  {
    name: "createGrowthActionsForCustomers",
    description:
      "Creates GrowthActions in bulk (CREATE_PAYMENT_LINK) in PENDING_APPROVAL status for a list of eligible customers of an opportunity. Prices are resolved authoritatively from DB. The AI CANNOT approve or execute financial actions.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        opportunityId: {
          type: "string",
          description: "Discovered opportunity identifier.",
        },
        customerIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of eligible customer IDs.",
        },
        targetProductId: {
          type: "string",
          description: "Target product identifier (optional if opportunity specified).",
        },
        sourceProductId: {
          type: "string",
          description: "Source product identifier (optional if opportunity specified).",
        },
      },
      required: ["merchantId", "opportunityId", "customerIds"],
    },
  },
  {
    name: "approveGrowthAction",
    description:
      "Records merchant approval for a PENDING_APPROVAL GrowthAction, transitioning it to APPROVED status.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        actionId: {
          type: "string",
          description: "GrowthAction identifier to approve.",
        },
      },
      required: ["merchantId", "actionId"],
    },
  },
  {
    name: "getGrowthActionStatus",
    description:
      "Retrieves the current status, payment link information, and audit timeline for a GrowthAction.",
    parameters: {
      type: "object",
      properties: {
        merchantId: {
          type: "string",
          description: "Authoritative merchant identifier.",
        },
        actionId: {
          type: "string",
          description: "GrowthAction identifier.",
        },
      },
      required: ["merchantId", "actionId"],
    },
  },
];

/**
 * Universal Tool Dispatcher.
 */
export async function executeAgentTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<AgentToolResponse> {
  switch (toolName) {
    case "analyzeCrossSell":
      return analyzeCrossSellTool({
        merchantId: toolInput.merchantId as string,
      });

    case "isCustomerEligible":
      return isCustomerEligibleTool({
        merchantId: toolInput.merchantId as string,
        customerId: toolInput.customerId as string,
        targetProductId: toolInput.targetProductId as string,
        sourceProductId: toolInput.sourceProductId as string | undefined,
        opportunityId: toolInput.opportunityId as string | undefined,
      });

    case "createGrowthAction":
      return createGrowthActionTool({
        merchantId: toolInput.merchantId as string,
        opportunityId: toolInput.opportunityId as string,
        customerId: toolInput.customerId as string,
        sourceProductId: toolInput.sourceProductId as string | undefined,
        targetProductId: toolInput.targetProductId as string | undefined,
      });

    case "createGrowthActionsForCustomers":
      return createGrowthActionsForCustomersTool({
        merchantId: toolInput.merchantId as string,
        opportunityId: toolInput.opportunityId as string,
        customerIds: toolInput.customerIds as string[],
        sourceProductId: toolInput.sourceProductId as string | undefined,
        targetProductId: toolInput.targetProductId as string | undefined,
      });

    case "approveGrowthAction":
      return approveGrowthActionTool({
        merchantId: toolInput.merchantId as string,
        actionId: toolInput.actionId as string,
      });

    case "getGrowthActionStatus":
      return getGrowthActionStatusTool({
        merchantId: toolInput.merchantId as string,
        actionId: toolInput.actionId as string,
      });

    default:
      return {
        success: false,
        toolName,
        error: `Unknown tool: '${toolName}'. Supported tools: ${agentToolDefinitions.map((t) => t.name).join(", ")}`,
      };
  }
}
