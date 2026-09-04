import React from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpportunityItem } from "@/lib/dashboard/types";

interface AgentToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  runningTool: boolean;
  agentOutput: string | null;
  opportunities: OpportunityItem[];
  onRunAgentTool: (toolName: string, params: Record<string, unknown>) => void;
}

export function AgentToolsModal({
  isOpen,
  onClose,
  runningTool,
  agentOutput,
  opportunities,
  onRunAgentTool,
}: AgentToolsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 h-full shadow-2xl flex flex-col border-l border-neutral-200 dark:border-neutral-800">
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              Deterministic AI Agent Tools
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-300">
            <strong>Phase 1 AI Architecture:</strong> Deterministic backend tools that expose the business logic to LLM agents without bypassing policy checks, authorization, or authoritative database pricing.
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-neutral-800 dark:text-neutral-200 text-xs uppercase tracking-wider">
              Test Deterministic Tools
            </h4>

            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={runningTool}
                onClick={() => onRunAgentTool("analyzeCrossSell", {})}
                className="justify-start text-xs font-mono"
              >
                1. tool: analyzeCrossSell()
              </Button>

              {opportunities[0] && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runningTool}
                  onClick={() =>
                    onRunAgentTool("isCustomerEligible", {
                      customerId: opportunities[0].eligibleCustomerIds[0],
                      targetProductId: opportunities[0].targetProductId,
                      sourceProductId: opportunities[0].sourceProductId,
                    })
                  }
                  className="justify-start text-xs font-mono"
                >
                  2. tool: isCustomerEligible(customerId, targetProductId)
                </Button>
              )}

              {opportunities[0] && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runningTool}
                  onClick={() =>
                    onRunAgentTool("createGrowthAction", {
                      opportunityId: opportunities[0].id,
                      customerId: opportunities[0].eligibleCustomerIds[0],
                      targetProductId: opportunities[0].targetProductId,
                      sourceProductId: opportunities[0].sourceProductId,
                    })
                  }
                  className="justify-start text-xs font-mono"
                >
                  3. tool: createGrowthAction(opportunityId, customerId)
                </Button>
              )}
            </div>
          </div>

          {/* Output Display */}
          <div className="space-y-2">
            <h4 className="font-semibold text-xs text-neutral-500 uppercase tracking-wider">
              Agent Tool Response (Structured JSON)
            </h4>
            <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-xs font-mono overflow-x-auto max-h-72 border border-neutral-800">
              {runningTool
                ? "Executing deterministic backend tool..."
                : agentOutput ||
                  "// Click a tool above to execute and view authoritative JSON response"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
