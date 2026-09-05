import React from "react";
import { TrendingUp, CheckCircle2, Users, ShieldCheck } from "lucide-react";
import { MerchantInfo, OpportunityItem } from "@/lib/dashboard/types";
import { Card } from "@/components/ui/card";
import { FinancialValue } from "@/components/ui/financial-value";

interface DashboardOverviewProps {
  merchant: MerchantInfo | null;
  opportunities: OpportunityItem[];
}

export function DashboardOverview({ merchant, opportunities }: DashboardOverviewProps) {
  const totalEstimatedRevenue = opportunities.reduce((sum, o) => sum + o.expectedRevenue, 0);
  const totalEligibleCustomers = opportunities.reduce((sum, o) => sum + o.eligibleCustomerCount, 0);
  const realizedRevenue = merchant?.counts?.realizedRevenue || 0;
  const executedCount = merchant?.counts?.actionsByStatus?.EXECUTED || 0;
  const pendingCount = merchant?.counts?.actionsByStatus?.PENDING_APPROVAL || 0;
  const executingCount = merchant?.counts?.actionsByStatus?.EXECUTING || 0;
  const totalGrowthActions = merchant?.counts?.growthActions || 0;

  return (
    <section className="space-y-2.5">
      {/* Section Label */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Revenue Snapshot
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Live Store & Payment Metrics
        </span>
      </div>

      {/* 4-Metric Financial Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. Realized Revenue (Confirmed Money) */}
        <Card className="p-4 flex flex-col justify-between border-emerald-300/80 dark:border-emerald-800/70 bg-emerald-50/25 dark:bg-emerald-950/15 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Realized Revenue
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                Confirmed
              </span>
            </div>
            <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div>
              <FinancialValue
                value={realizedRevenue}
                variant="revenue"
                size="2xl"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Collected from {executedCount} paid {executedCount === 1 ? "action" : "actions"}
            </p>
          </div>
        </Card>

        {/* 2. Pipeline Opportunity (Potential Money) */}
        <Card className="p-4 flex flex-col justify-between bg-card border-border shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pipeline Opportunity
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                Potential
              </span>
            </div>
            <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div>
              <FinancialValue
                value={totalEstimatedRevenue}
                variant="default"
                size="2xl"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Untapped value across {opportunities.length} {opportunities.length === 1 ? "opportunity" : "opportunities"}
            </p>
          </div>
        </Card>

        {/* 3. Eligible Customer Reach */}
        <Card className="p-4 flex flex-col justify-between bg-card border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Eligible Customer Reach
            </span>
            <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
              {totalEligibleCustomers.toLocaleString("en-IN")}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pre-validated buyers with zero co-purchase
            </p>
          </div>
        </Card>

        {/* 4. Active Growth Actions */}
        <Card className="p-4 flex flex-col justify-between bg-card border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Actions in Lifecycle
            </span>
            <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
                {totalGrowthActions}
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                {executedCount} Paid
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
              <span>{pendingCount} Pending Approval</span>
              <span>•</span>
              <span>{executingCount} Active</span>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
