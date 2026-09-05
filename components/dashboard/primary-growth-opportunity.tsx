"use client";

import React from "react";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Bot,
  Users,
  Award,
  Layers,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinancialValue } from "@/components/ui/financial-value";
import { AIBadge } from "@/components/ui/ai-badge";
import { OpportunityItem } from "@/lib/dashboard/types";
import { RankedOpportunityItem } from "@/components/growth-intelligence-panel";

interface PrimaryGrowthOpportunityProps {
  opportunity: OpportunityItem | null;
  rankedOpportunity?: RankedOpportunityItem | null;
  onOpenOpportunity: (opportunity: OpportunityItem) => void;
  onPlanOpportunity?: (opportunityId: string) => void;
}

export function PrimaryGrowthOpportunity({
  opportunity,
  rankedOpportunity,
  onOpenOpportunity,
  onPlanOpportunity,
}: PrimaryGrowthOpportunityProps) {
  if (!opportunity) {
    return (
      <Card className="p-8 text-center bg-card border-border">
        <Layers className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
        <h3 className="text-sm font-semibold text-foreground">
          No Primary Opportunity Available
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Synchronize transaction history or run the database seed to detect high-converting co-purchase opportunities.
        </p>
      </Card>
    );
  }

  const estimatedValue = rankedOpportunity?.estimatedValue ?? opportunity.expectedRevenue;
  const attachRatePercent = (
    (rankedOpportunity?.evidence?.attachRate ?? opportunity.crossSellRate) * 100
  ).toFixed(1);
  const jointCount = rankedOpportunity?.evidence?.customersTogether ?? opportunity.customersTogether;
  const sourceBuyerCount = rankedOpportunity?.evidence?.sourceCustomers ?? opportunity.sourceCustomers;
  const confidencePercent = rankedOpportunity?.confidence
    ? Math.round(rankedOpportunity.confidence * 100)
    : null;

  return (
    <Card className="border-indigo-300/80 dark:border-indigo-800/80 bg-gradient-to-br from-white to-neutral-50/70 dark:from-neutral-900 dark:to-neutral-900/60 shadow-sm overflow-hidden">
      {/* Top Banner Bar */}
      <div className="px-5 py-3 border-b border-border/80 bg-neutral-50/60 dark:bg-neutral-800/40 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 select-none">
            <Award className="w-3 h-3 text-amber-400 dark:text-amber-500" />
            Top Revenue Opportunity
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            Ranked #1 by Historical Conversion Velocity
          </span>
        </div>

        <div className="flex items-center gap-2">
          {confidencePercent !== null && (
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 select-none">
              {confidencePercent}% Confidence
            </span>
          )}
          <AIBadge variant="subtle" icon="none">
            Cross-Sell
          </AIBadge>
        </div>
      </div>

      {/* Main Hero Body */}
      <div className="p-5 sm:p-6 space-y-5">
        {/* Source -> Target Product Conversion Flow */}
        <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
          {/* Source Product Box */}
          <div className="md:col-span-5 p-4 rounded-xl bg-card border border-border space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Customers who already purchased:
            </div>
            <div className="text-base font-bold text-foreground">
              {opportunity.sourceProductName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              Observed Buyer Cohort: <strong className="text-foreground">{sourceBuyerCount} buyers</strong>
            </div>
          </div>

          {/* Arrow Flow Icon */}
          <div className="md:col-span-1 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-border flex items-center justify-center text-foreground shrink-0 shadow-2xs">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Target Product Offer Box */}
          <div className="md:col-span-5 p-4 rounded-xl bg-card border border-border space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Immediate cross-sell offer:
            </div>
            <div className="text-base font-bold text-foreground">
              {opportunity.targetProductName}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Authoritative Offer Price:</span>
              <FinancialValue value={opportunity.targetProductPrice} size="sm" variant="default" />
            </div>
          </div>
        </div>

        {/* Opportunity Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg bg-card border border-border">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Eligible Target Audience
            </div>
            <div className="text-xl font-extrabold text-foreground mt-0.5 font-mono tabular-nums">
              {opportunity.eligibleCustomerCount} Buyers
            </div>
            <span className="text-[11px] text-muted-foreground">
              Never bought {opportunity.targetProductName}
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-card border border-emerald-300/70 dark:border-emerald-800/60 bg-emerald-50/15 dark:bg-emerald-950/10">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Estimated Opportunity Value
            </div>
            <div className="mt-0.5">
              <FinancialValue value={Math.round(estimatedValue)} size="xl" variant="revenue" />
            </div>
            <span className="text-[11px] text-muted-foreground">
              Based on authoritative price × reach
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-card border border-border">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Observed Attach Rate
            </div>
            <div className="text-xl font-extrabold text-foreground mt-0.5 font-mono tabular-nums">
              {attachRatePercent}%
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">
              {jointCount} co-purchases in checkout history
            </span>
          </div>
        </div>

        {/* Empirical Grounding Evidence */}
        <div className="p-3.5 rounded-lg bg-neutral-50/80 dark:bg-neutral-900/60 border border-border space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
            <span>Authoritative Grounding Evidence</span>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {rankedOpportunity?.strategicInsight ||
              `Empirical order analysis verifies that ${attachRatePercent}% of customers who acquired "${opportunity.sourceProductName}" also purchased "${opportunity.targetProductName}". Targeting the ${opportunity.eligibleCustomerCount} unfulfilled buyers captures untapped revenue with proven purchase affinity.`}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="text-xs text-muted-foreground font-mono">
            {opportunity.actionCount > 0 ? (
              <span>{opportunity.actionCount} growth action(s) prepared or active</span>
            ) : (
              <span>Zero actions dispatched yet • Ready for customer targeting</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onPlanOpportunity && (
              <Button
                variant="outline"
                size="default"
                onClick={() => onPlanOpportunity(opportunity.id)}
                className="text-xs gap-1.5"
              >
                <Bot className="w-3.5 h-3.5 text-neutral-500" />
                Plan Campaign
              </Button>
            )}

            <Button
              variant="default"
              size="default"
              onClick={() => onOpenOpportunity(opportunity)}
              className="text-xs gap-1.5"
            >
              <span>Target {opportunity.eligibleCustomerCount} Buyers</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
