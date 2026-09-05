import React, { useState } from "react";
import { Bot, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpportunityItem } from "@/lib/dashboard/types";

interface AgentToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  merchantId?: string | null;
  opportunities: OpportunityItem[];
  onToolExecuted?: () => void;
}

export function AgentToolsModal({
  isOpen,
  onClose,
  merchantId,
  opportunities,
  onToolExecuted,
}: AgentToolsModalProps) {
  const [runningTool, setRunningTool] = useState(false);
  const [agentOutput, setAgentOutput] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunAgentTool = async (toolName: string, params: Record<string, unknown>) => {
    if (!merchantId) return;
    setRunningTool(true);
    setAgentOutput(null);
    try {
      const res = await fetch("/api/agent/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName,
          parameters: { merchantId, ...params },
        }),
      });

      const data = await res.json();
      setAgentOutput(JSON.stringify(data, null, 2));
      onToolExecuted?.();
    } catch (err) {
      setAgentOutput(JSON.stringify({ error: String(err) }, null, 2));
    } finally {
      setRunningTool(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-card h-full shadow-2xl flex flex-col border-l border-border">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              Deterministic Tool Interfaces
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/50 text-indigo-950 dark:text-indigo-200 leading-relaxed">
            <strong>Deterministic Infrastructure:</strong> Backend execution tools callable by autonomous LLM agents with strictly enforced policy checks, tenant isolation, and authoritative pricing.
          </div>

          <div className="space-y-2.5">
            <h4 className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
              Execute Tool Endpoints
            </h4>

            <div className="grid grid-cols-1 gap-2 font-mono">
              <Button
                variant="outline"
                size="sm"
                disabled={runningTool}
                onClick={() => handleRunAgentTool("analyzeCrossSell", {})}
                className="justify-start text-xs font-mono h-9"
              >
                1. tool: analyzeCrossSell()
              </Button>

              {opportunities[0] && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runningTool}
                  onClick={() =>
                    handleRunAgentTool("isCustomerEligible", {
                      customerId: opportunities[0].eligibleCustomerIds[0],
                      targetProductId: opportunities[0].targetProductId,
                      sourceProductId: opportunities[0].sourceProductId,
                    })
                  }
                  className="justify-start text-xs font-mono h-9"
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
                    handleRunAgentTool("createGrowthAction", {
                      opportunityId: opportunities[0].id,
                      customerId: opportunities[0].eligibleCustomerIds[0],
                      targetProductId: opportunities[0].targetProductId,
                      sourceProductId: opportunities[0].sourceProductId,
                    })
                  }
                  className="justify-start text-xs font-mono h-9"
                >
                  3. tool: createGrowthAction(opportunityId, customerId)
                </Button>
              )}
            </div>
          </div>

          {/* Output Display */}
          <div className="space-y-1.5">
            <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
              Tool Output Response (Authoritative JSON)
            </h4>
            <pre className="p-3.5 rounded-lg bg-neutral-950 text-neutral-200 text-[11px] font-mono overflow-x-auto max-h-72 border border-border">
              {runningTool ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Executing backend tool...
                </span>
              ) : (
                agentOutput || "// Click a tool interface above to inspect response"
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
