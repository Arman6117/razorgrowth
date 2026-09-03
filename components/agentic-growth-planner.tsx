"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Package,
  Layers,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center">
        <Bot className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
          AI Growth Planner
        </h3>
        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
          Select an opportunity from the list above to generate a grounded, actionable growth campaign.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-neutral-900 border border-indigo-200 dark:border-indigo-800/60 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
        <RefreshCw className="w-7 h-7 text-indigo-600 dark:text-indigo-400 animate-spin" />
        <div>
          <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
            Agent Evaluating Opportunity & Eligibility...
          </h4>
          <p className="text-xs text-neutral-500 mt-0.5">
            Querying backend order patterns, co-purchase rates, and resolving eligible customer accounts.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-900 dark:text-rose-300">
        <div className="flex items-center gap-2 font-bold mb-1">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          Planning Failed
        </div>
        <p>{error}</p>
      </div>
    );
  }

  if (!plan) return null;

  const isPrepared = preparedSuccess !== null && preparedSuccess > 0;

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-indigo-300 dark:border-indigo-700/70 shadow-md ring-1 ring-indigo-500/10 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                AI Growth Planner
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                {plan.strategy}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Autonomous campaign planning backed by deterministic sales evidence.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            {Math.round(plan.confidence * 100)}% Confidence
          </span>
        </div>
      </div>

      {/* Opportunity Title & Why / Explanation */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          Opportunity
        </div>
        <h4 className="text-lg font-bold text-neutral-900 dark:text-white">
          &quot;{plan.title}&quot;
        </h4>
        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-black/30 border border-neutral-200/80 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
          <div className="font-semibold text-neutral-900 dark:text-white mb-1">
            Why this action:
          </div>
          {plan.reason}
        </div>

        {plan.strategicInsight && (
          <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-950 dark:text-indigo-200 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">AI Strategic Guidance:</span> {plan.strategicInsight}
            </div>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-black/30 border border-neutral-200/60 dark:border-neutral-800 text-xs">
          <div className="text-neutral-400 text-[10px] uppercase font-semibold">Target Audience</div>
          <div className="text-lg font-extrabold text-neutral-900 dark:text-white mt-0.5">
            {plan.eligibleCustomerCount} Customers
          </div>
          <span className="text-[11px] text-neutral-500">Verified eligible</span>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-black/30 border border-neutral-200/60 dark:border-neutral-800 text-xs">
          <div className="text-neutral-400 text-[10px] uppercase font-semibold">Recommended Offer</div>
          <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate" title={plan.targetProductName}>
            {plan.targetProductName}
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">₹{plan.targetProductPrice.toLocaleString("en-IN")}</span>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-black/30 border border-neutral-200/60 dark:border-neutral-800 text-xs">
          <div className="text-neutral-400 text-[10px] uppercase font-semibold">Estimated Value</div>
          <div className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
            ₹{Math.round(plan.estimatedValue).toLocaleString("en-IN")}
          </div>
          <span className="text-[11px] text-neutral-500">Authoritative price</span>
        </div>

        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-black/30 border border-neutral-200/60 dark:border-neutral-800 text-xs">
          <div className="text-neutral-400 text-[10px] uppercase font-semibold">Action Mechanism</div>
          <div className="text-sm font-bold text-neutral-900 dark:text-white mt-0.5">
            Payment Links
          </div>
          <span className="text-[11px] text-neutral-500">Native Razorpay email</span>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
        <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div>
          <span className="font-bold">Merchant approval mandatory.</span> No payment links will be created or delivered, and no customer will be charged until you explicitly approve the prepared actions.
        </div>
      </div>

      {/* Action Preparation & Review Workflow */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEvidenceDetails((prev) => !prev)}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white gap-1"
        >
          {showEvidenceDetails ? (
            <>
              Hide Technical Evidence <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Inspect Backend Evidence <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </Button>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {isPrepared ? (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  {preparedSuccess} {preparedSuccess === 1 ? "action" : "actions"} awaiting approval
                </span>
              </div>

              <Button
                onClick={() => onReviewActions(plan.opportunityId)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs gap-1.5 cursor-pointer"
              >
                Review Actions
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              onClick={handlePrepareActions}
              disabled={preparing || plan.eligibleCustomerCount === 0}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs gap-1.5 cursor-pointer"
            >
              {preparing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Preparing Growth Actions...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Prepare Growth Actions ({plan.eligibleCustomerCount})
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Technical Evidence */}
      {showEvidenceDetails && (
        <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2 text-xs">
          <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Deterministic Grounding Facts
          </div>
          <pre className="p-3 rounded-xl bg-neutral-900 text-neutral-200 text-[11px] font-mono overflow-x-auto">
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
    </div>
  );
}
