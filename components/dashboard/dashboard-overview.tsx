import React from "react";
import { TrendingUp, CheckCircle2, Users, ShieldCheck, Store } from "lucide-react";
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {/* Active Merchant Profile Card */}
      <Card className="sm:col-span-2 lg:col-span-1 p-4 flex flex-col justify-between bg-card border-border">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Merchant Account
            </span>
            <Store className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <h2 className="text-base font-bold mt-1 text-foreground truncate">
            {merchant?.name || "TechNova Store"}
          </h2>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {merchant?.email || "merchant@technovastore.com"}
          </p>
        </div>

        <div className="mt-3 pt-3 border-t border-border/70 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{merchant?.currency || "INR"} (₹)</span>
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Verified Live
          </span>
        </div>
      </Card>

      {/* Realized Revenue (Outcome / Hero Metric) */}
      <Card className="p-4 flex flex-col justify-between border-emerald-300/70 dark:border-emerald-800/60 bg-emerald-50/20 dark:bg-emerald-950/10">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Realized Revenue
          </span>
          <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div>
            <FinancialValue
              value={realizedRevenue}
              variant="revenue"
              size="2xl"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Confirmed from {executedCount} paid {executedCount === 1 ? "action" : "actions"}
          </p>
        </div>
      </Card>

      {/* Total Pipeline Opportunity Value */}
      <Card className="p-4 flex flex-col justify-between bg-card border-border">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pipeline Opportunity
          </span>
          <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div>
            <FinancialValue
              value={totalEstimatedRevenue}
              variant="default"
              size="2xl"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Identified across {opportunities.length} {opportunities.length === 1 ? "opportunity" : "opportunities"}
          </p>
        </div>
      </Card>

      {/* Eligible Customer Reach */}
      <Card className="p-4 flex flex-col justify-between bg-card border-border">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Eligible Customer Reach
          </span>
          <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-2xl font-extrabold tracking-tight text-foreground font-mono tabular-nums">
            {totalEligibleCustomers.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Pre-validated historical buyers
          </p>
        </div>
      </Card>

      {/* Growth Actions Pipeline Summary */}
      <Card className="p-4 flex flex-col justify-between bg-card border-border">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Growth Actions
          </span>
          <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-foreground font-mono tabular-nums">
              {merchant?.counts.growthActions || 0}
            </span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {executedCount} Paid
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
            <span>{pendingCount} Pending</span>
            <span>•</span>
            <span>{executingCount} Active</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
