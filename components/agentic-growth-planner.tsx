"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinancialValue } from "@/components/ui/financial-value";
import { AIBadge } from "@/components/ui/ai-badge";

export interface GrowthPlanData {
  opportunityId: string;
  merchantId: string;
  strategy: string;
  title: string;
  reason: string;
  sourceProductId?: string | null;
  sourceProductName?: string | null;
  targetProductId: string;
  targetProductName: string;
  targetProductPrice: number;
  eligibleCustomerCount: number;
  estimatedValue: number;
  confidence: number;
  recommendedAction: {
    type: string;
    targetProductId: string;
    targetProductName: string;
    targetProductPrice: number;
    amountInRupees: number;
    amountInPaise: number;
    currency: string;
  };
  requiresApproval: true;
  evidence: Record<string, unknown>;
  explanation: string;
  strategicInsight?: string;
  eligibleCustomerIds: string[];
  actionsPendingApproval: number;
  planCreatedAt: string;
  status: "PLANNED" | "PREPARED";
}

interface AgenticGrowthPlannerProps {
  opportunityId: string | null;
  opportunityTitle?: string;
  onReviewActions: (opportunityId: string) => void;
  onPreparationComplete?: () => void;
}

export function AgenticGrowthPlanner({
  opportunityId,
  opportunityTitle,
  onReviewActions,
  onPreparationComplete,
}: AgenticGrowthPlannerProps) {
  const [plan, setPlan] = useState<GrowthPlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparedSuccess, setPreparedSuccess] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEvidenceDetails, setShowEvidenceDetails] = useState(false);

  // Load / generate plan when opportunityId changes
  useEffect(() => {
    if (!opportunityId) {
      setPlan(null);
      setPreparedSuccess(null);
      setError(null);
      return;
    }

    let isMounted = true;
    const fetchPlan = async () => {
      setLoading(true);
      setError(null);
      setPreparedSuccess(null);

      try {
        const res = await fetch("/api/growth/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load growth plan");
        }

        if (isMounted) {
          setPlan(data.plan);
          if (data.plan.actionsPendingApproval > 0) {
            setPreparedSuccess(data.plan.actionsPendingApproval);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Error generating growth plan");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPlan();

    return () => {
      isMounted = false;
    };
  }, [opportunityId]);

  const handlePrepareActions = async () => {
    if (!opportunityId) return;

    setPreparing(true);
    setError(null);

    try {
      const res = await fetch("/api/growth/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId,
          prepareActions: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to prepare GrowthActions");
      }

      const totalPending = data.actionsPendingApproval || data.createdCount || 0;
      setPreparedSuccess(totalPending);

      if (plan) {
        setPlan({
          ...plan,
          status: "PREPARED",
          actionsPendingApproval: totalPending,
        });
      }

      if (onPreparationComplete) {
        onPreparationComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error preparing GrowthActions");
    } finally {
      setPreparing(false);
    }
  };

  if (!opportunityId) {
    return (
      <Card className="p-6 text-center bg-card border-border">
        <Bot className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-60" />
        <h3 className="text-sm font-semibold text-foreground">
          Autonomous Campaign Planner
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Select any opportunity above to formulate a targeted conversion plan with pre-validated customer eligibility.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-8 border-border shadow-xs flex flex-col items-center justify-center text-center space-y-3 bg-card">
        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        <div>
          <h4 className="text-sm font-bold text-foreground">
            Evaluating Campaign Eligibility...
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Querying backend order patterns, historical attach rates, and resolving unfulfilled customer accounts.
          </p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-900 dark:text-rose-300">
        <div className="flex items-center gap-2 font-bold mb-1">
          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          Planning Failed
        </div>
        <p>{error}</p>
      </div>
    );
  }

  if (!plan) return null;

  const isPrepared = preparedSuccess !== null && preparedSuccess > 0;

  return (
    <Card variant="featured" className="p-5 space-y-4 border-indigo-200 dark:border-indigo-900/60 bg-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Campaign Execution Plan
              </h3>
              <AIBadge variant="subtle" icon="none">
                {plan.strategy}
              </AIBadge>
            </div>
            <p className="text-xs text-muted-foreground">
              Autonomous campaign planning backed by deterministic sales evidence.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 select-none">
            {Math.round(plan.confidence * 100)}% Confidence
          </span>
        </div>
      </div>

      {/* Opportunity Title & Reason */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Targeted Opportunity
        </div>
        <h4 className="text-base font-bold text-foreground">
          &quot;{plan.title}&quot;
        </h4>
        <div className="p-3 rounded-lg bg-neutral-50/80 dark:bg-neutral-900/60 border border-border text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
          <div className="font-semibold text-foreground mb-1">
            Why this action:
          </div>
          {plan.reason}
        </div>

        {plan.strategicInsight && (
          <div className="p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-950 dark:text-indigo-200 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">AI Guidance:</span> {plan.strategicInsight}
            </div>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border text-xs">
          <div className="text-muted-foreground text-[10px] uppercase font-semibold">Target Audience</div>
          <div className="text-base font-bold text-foreground mt-0.5 font-mono tabular-nums">
            {plan.eligibleCustomerCount} Buyers
          </div>
          <span className="text-[11px] text-muted-foreground">Verified eligible</span>
        </div>

        <div className="p-3 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border text-xs">
          <div className="text-muted-foreground text-[10px] uppercase font-semibold">Recommended Offer</div>
          <div className="text-xs font-bold text-foreground mt-0.5 truncate" title={plan.targetProductName}>
            {plan.targetProductName}
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            <FinancialValue value={plan.targetProductPrice} size="xs" variant="muted" />
          </span>
        </div>

        <div className="p-3 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border text-xs">
          <div className="text-muted-foreground text-[10px] uppercase font-semibold">Estimated Value</div>
          <div className="mt-0.5">
            <FinancialValue value={Math.round(plan.estimatedValue)} size="lg" variant="revenue" />
          </div>
          <span className="text-[11px] text-muted-foreground">Authoritative price</span>
        </div>

        <div className="p-3 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border text-xs">
          <div className="text-muted-foreground text-[10px] uppercase font-semibold">Delivery Medium</div>
          <div className="text-xs font-bold text-foreground mt-0.5">
            Payment Links
          </div>
          <span className="text-[11px] text-muted-foreground">Razorpay Test Mode</span>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
        <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div>
          <strong>Merchant approval mandatory:</strong> Actions are prepared in <code className="font-mono text-[11px] px-1 rounded bg-amber-100 dark:bg-amber-900/60 font-semibold">PENDING_APPROVAL</code> status. No customer is contacted and no link is issued until you review and approve.
        </div>
      </div>

      {/* Action Controls */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEvidenceDetails((prev) => !prev)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {showEvidenceDetails ? (
            <>
              Hide Technical Details <ChevronUp className="w-3 h-3 ml-1" />
            </>
          ) : (
            <>
              Inspect Grounding Evidence <ChevronDown className="w-3 h-3 ml-1" />
            </>
          )}
        </Button>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {isPrepared ? (
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 select-none">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {preparedSuccess} {preparedSuccess === 1 ? "action" : "actions"} awaiting approval
                </span>
              </div>

              <Button
                variant="growth"
                size="sm"
                onClick={() => onReviewActions(plan.opportunityId)}
                className="text-xs"
              >
                Review Actions
                <ArrowRight className="w-3 h-3 ml-1.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handlePrepareActions}
              disabled={preparing || plan.eligibleCustomerCount === 0}
              className="w-full sm:w-auto text-xs"
            >
              {preparing ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                  Preparing Actions...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Prepare Growth Actions ({plan.eligibleCustomerCount})
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Technical Details */}
      {showEvidenceDetails && (
        <div className="pt-3 border-t border-border/70 space-y-1.5 text-xs">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Deterministic Grounding Payload
          </div>
          <pre className="p-3 rounded-lg bg-neutral-950 text-neutral-200 text-[11px] font-mono overflow-x-auto border border-border">
            {JSON.stringify(
              {
                opportunityId: plan.opportunityId,
                targetProductId: plan.targetProductId,
                targetProductPrice: plan.targetProductPrice,
                eligibleCustomerCount: plan.eligibleCustomerCount,
                confidence: plan.confidence,
                estimatedValue: plan.estimatedValue,
                evidence: plan.evidence,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
    </Card>
  );
}
