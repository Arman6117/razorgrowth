"use client";

import React from "react";
import {
  Clock,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { FinancialValue } from "@/components/ui/financial-value";
import { Button } from "@/components/ui/button";
import { MerchantInfo, OpportunityItem } from "@/lib/dashboard/types";
import { AgenticGrowthPlanner } from "@/components/agentic-growth-planner";

interface GrowthActionLifecycleProps {
  merchant: MerchantInfo | null;
  opportunities: OpportunityItem[];
  selectedPlannerOpportunityId?: string | null;
  plannerSectionRef?: React.RefObject<HTMLDivElement | null>;
  onReviewActions?: (opportunityId: string) => void;
  onPreparationComplete?: () => void;
  onOpenOpportunity?: (opportunity: OpportunityItem) => void;
}

export function GrowthActionLifecycle({
  merchant,
  opportunities,
  selectedPlannerOpportunityId,
  plannerSectionRef,
  onReviewActions,
  onPreparationComplete,
  onOpenOpportunity,
}: GrowthActionLifecycleProps) {
  const pendingCount = merchant?.counts?.actionsByStatus?.PENDING_APPROVAL || 0;
  const approvedCount = merchant?.counts?.actionsByStatus?.APPROVED || 0;
  const executingCount = merchant?.counts?.actionsByStatus?.EXECUTING || 0;
  const executedCount = merchant?.counts?.actionsByStatus?.EXECUTED || 0;
  const realizedRevenue = merchant?.counts?.realizedRevenue || 0;
  const pipelineRevenue = opportunities.reduce((sum, o) => sum + o.expectedRevenue, 0);

  // Find opportunity that has pending actions if merchant wants to review
  const firstOppWithPending = opportunities.find((o) => o.actionCount > 0) || opportunities[0];

  return (
    <section className="space-y-3.5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-neutral-500" />
            Growth Action Execution Lifecycle
          </h2>
          <p className="text-xs text-muted-foreground">
            Controlled automation flow — every customer contact and payment link requires explicit merchant approval.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Potential: <FinancialValue value={pipelineRevenue} size="xs" variant="muted" /></span>
          <span>→</span>
          <span>Confirmed: <FinancialValue value={realizedRevenue} size="xs" variant="revenue" /></span>
        </div>
      </div>

      {/* 5-Step Lifecycle Stepper Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* Step 1: Prepared */}
        <Card className="p-3 bg-card border-border relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              1. Prepared
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground tabular-nums">{pendingCount}</span>
            <span className="text-[10px] text-muted-foreground">actions</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Pending merchant review
          </p>
        </Card>

        {/* Step 2: Approved */}
        <Card className="p-3 bg-card border-border relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              2. Approved
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground tabular-nums">{approvedCount}</span>
            <span className="text-[10px] text-muted-foreground">ready</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Authorized for link issue
          </p>
        </Card>

        {/* Step 3: Payment Link Issued */}
        <Card className="p-3 bg-card border-border relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              3. Payment Link
            </span>
            <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-xl font-bold text-foreground tabular-nums">{executingCount}</span>
            <span className="text-[10px] text-muted-foreground">active</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Razorpay link live
          </p>
        </Card>

        {/* Step 4: Paid */}
        <Card className="p-3 bg-card border-border relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              4. Paid
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{executedCount}</span>
            <span className="text-[10px] text-muted-foreground">settled</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Verified HMAC webhook
          </p>
        </Card>

        {/* Step 5: Realized Revenue */}
        <Card className="p-3 border-emerald-300/80 dark:border-emerald-800/70 bg-emerald-50/25 dark:bg-emerald-950/15 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              5. Realized
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-1.5">
            <FinancialValue value={realizedRevenue} size="lg" variant="revenue" />
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            In merchant bank account
          </p>
        </Card>
      </div>

      {/* Pending Approval Merchant Gate Callout */}
      {pendingCount > 0 && (
        <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Merchant Approval Gate:</strong> {pendingCount} growth actions are awaiting your approval. RazorGrowth will not charge or contact any customer without your authorization.
            </span>
          </div>

          {firstOppWithPending && onOpenOpportunity && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onOpenOpportunity(firstOppWithPending)}
              className="text-xs shrink-0"
            >
              Review Actions ({pendingCount})
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Embedded Campaign Planner (when active) */}
      {selectedPlannerOpportunityId && (
        <div ref={plannerSectionRef} id="growth-planner-section" className="scroll-mt-6 pt-1">
          <AgenticGrowthPlanner
            opportunityId={selectedPlannerOpportunityId}
            onReviewActions={onReviewActions || (() => {})}
            onPreparationComplete={onPreparationComplete}
          />
        </div>
      )}
    </section>
  );
}
