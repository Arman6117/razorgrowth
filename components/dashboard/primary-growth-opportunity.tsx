"use client";

import React from "react";
import {
  ArrowRight,
  ShieldCheck,
  Bot,
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
          Run Growth Analysis to identify transaction-backed revenue opportunities.
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

  return (
    <Card className="border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-br from-white via-white to-indigo-50/20 dark:from-neutral-900 dark:via-neutral-900 dark:to-indigo-950/10 shadow-xs overflow-hidden">
      {/* Compact Top Banner Bar */}
      <div className="px-4 sm:px-5 py-2 border-b border-border/80 bg-neutral-50/70 dark:bg-neutral-800/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 select-none">
            <Award className="w-3 h-3 text-amber-400 dark:text-amber-500" />
            Top Revenue Opportunity
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Top-ranked opportunity based on purchase history
          </span>
        </div>

        <AIBadge variant="subtle" icon="none">
          Cross-Sell
        </AIBadge>
      </div>

      {/* Main Hero Body */}
      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Top Row: Conversion Track (Left) + Value & Reach Metrics (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
          {/* 1. SOURCE -> TARGET CONVERSION TRACK (col-span-7) */}
          <div className="lg:col-span-7 p-3.5 rounded-xl bg-card border border-border flex flex-col justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Recommended Product Cross-Sell
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {/* Source Product */}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Purchased
                </span>
                <div
                  className="text-sm sm:text-base font-bold text-foreground truncate"
                  title={opportunity.sourceProductName}
                >
                  {opportunity.sourceProductName}
                </div>
                <span className="text-xs text-muted-foreground">
                  {sourceBuyerCount} past buyers
                </span>
              </div>

              {/* Desktop Arrow */}
              <div className="hidden sm:flex items-center justify-center px-1 text-muted-foreground shrink-0">
                <ArrowRight className="w-4 h-4 text-neutral-400" />
              </div>

              {/* Mobile Direction Indicator */}
              <div className="flex sm:hidden items-center gap-1 text-xs text-muted-foreground py-0.5">
                <ArrowRight className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-medium">Cross-sell offer</span>
              </div>

              {/* Target Product */}
              <div className="flex-1 min-w-0 sm:text-right">
                <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block font-medium">
                  Recommend Offer
                </span>
                <div
                  className="text-sm sm:text-base font-bold text-foreground truncate"
                  title={opportunity.targetProductName}
                >
                  {opportunity.targetProductName}
                </div>
                <div className="text-xs text-muted-foreground sm:justify-end flex items-center gap-1">
                  <span>Price:</span>
                  <FinancialValue value={opportunity.targetProductPrice} size="sm" variant="default" />
                </div>
              </div>
            </div>
          </div>

          {/* 2 & 3. OPPORTUNITY VALUE & ELIGIBLE AUDIENCE (col-span-5) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-2.5">
            {/* Opportunity Value */}
            <div className="p-3.5 rounded-xl bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-300/80 dark:border-emerald-800/70 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Potential Revenue
              </span>
              <div className="my-1">
                <FinancialValue value={Math.round(estimatedValue)} size="xl" variant="revenue" />
              </div>
              <span className="text-[11px] text-muted-foreground">
                Price × reach
              </span>
            </div>

            {/* Eligible Reach */}
            <div className="p-3.5 rounded-xl bg-card border border-border flex flex-col justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Eligible Audience
              </span>
              <div className="my-1">
                <span className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
                  {opportunity.eligibleCustomerCount}
                </span>
                <span className="text-xs text-muted-foreground ml-1">buyers</span>
              </div>
              <span className="text-[11px] text-muted-foreground truncate">
                Zero target purchases
              </span>
            </div>
          </div>
        </div>

        {/* 4 & 5. OBSERVED ATTACH RATE & GROUNDING EVIDENCE (Compact horizontal strip) */}
        <div className="p-3 rounded-lg bg-neutral-50/80 dark:bg-neutral-800/40 border border-border flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-bold text-foreground tabular-nums">
                {attachRatePercent}%
              </span>
              <span className="text-xs font-semibold text-foreground">
                Observed attach rate
              </span>
            </div>
            <span className="text-neutral-300 dark:text-neutral-700 hidden sm:inline">•</span>
            <span className="text-xs text-muted-foreground">
              {jointCount} historical co-purchases
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground text-xs leading-snug md:text-right">
            <ShieldCheck className="w-3.5 h-3.5 text-neutral-400 shrink-0 hidden sm:inline" />
            <p className="line-clamp-2 sm:line-clamp-1">
              {rankedOpportunity?.strategicInsight ||
                `${attachRatePercent}% of "${opportunity.sourceProductName}" buyers also bought "${opportunity.targetProductName}". Targeting ${opportunity.eligibleCustomerCount} unfulfilled buyers captures proven co-purchase demand.`}
            </p>
          </div>
        </div>

        {/* 6. ACTIONS BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
          <div className="text-xs text-muted-foreground">
            {opportunity.actionCount > 0 ? (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                {opportunity.actionCount} growth action(s) prepared or active
              </span>
            ) : (
              <span>No active campaigns • Ready for customer outreach</span>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {onPlanOpportunity && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPlanOpportunity(opportunity.id)}
                className="text-xs text-muted-foreground hover:text-foreground border-border h-8"
              >
                <Bot className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                Plan Campaign
              </Button>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={() => onOpenOpportunity(opportunity)}
              className="text-xs gap-1 font-semibold h-8"
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
