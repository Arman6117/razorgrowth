import React from "react";
import { DollarSign, CheckCircle2, Users, ShieldCheck } from "lucide-react";
import { MerchantInfo, OpportunityItem } from "@/lib/dashboard/types";

interface DashboardOverviewProps {
  merchant: MerchantInfo | null;
  opportunities: OpportunityItem[];
}

export function DashboardOverview({ merchant, opportunities }: DashboardOverviewProps) {
  const totalEstimatedRevenue = opportunities.reduce((sum, o) => sum + o.expectedRevenue, 0);
  const totalEligibleCustomers = opportunities.reduce((sum, o) => sum + o.eligibleCustomerCount, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Active Merchant Card */}
      <div className="sm:col-span-2 lg:col-span-1 p-5 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white shadow-lg flex flex-col justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Active Merchant
          </span>
          <h2 className="text-xl font-bold mt-1 text-white">{merchant?.name || "TechNova Store"}</h2>
          <p className="text-xs text-neutral-400 mt-0.5">{merchant?.email || "merchant@technovastore.com"}</p>
        </div>
        <div className="mt-4 pt-4 border-t border-neutral-700/60 flex items-center justify-between text-xs text-neutral-300">
          <span>Currency: {merchant?.currency || "INR"} (₹)</span>
          <span className="text-emerald-400 font-medium">● Verified Live</span>
        </div>
      </div>

      {/* Total Pipeline Value */}
      <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-500">Total Pipeline Value</span>
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-2xl font-extrabold text-neutral-900 dark:text-white">
            ₹{totalEstimatedRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
          <p className="text-xs text-neutral-500 mt-1">Potential across {opportunities.length} opportunities</p>
        </div>
      </div>

      {/* Realized Revenue */}
      <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-emerald-200/80 dark:border-emerald-900/60 shadow-sm flex flex-col justify-between bg-gradient-to-b from-emerald-50/30 to-transparent dark:from-emerald-950/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
            Realized Revenue
          </span>
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            ₹{(merchant?.counts?.realizedRevenue || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Confirmed from {merchant?.counts?.actionsByStatus?.EXECUTED || 0} paid actions
          </p>
        </div>
      </div>

      {/* Eligible Customer Reach */}
      <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-500">Eligible Customer Reach</span>
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-2xl font-extrabold text-neutral-900 dark:text-white">
            {totalEligibleCustomers} Customers
          </div>
          <p className="text-xs text-neutral-500 mt-1">Pre-validated historical buyers</p>
        </div>
      </div>

      {/* Growth Actions Summary */}
      <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-500">Growth Actions</span>
          <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-neutral-900 dark:text-white">
              {merchant?.counts.growthActions || 0}
            </span>
            <span className="text-xs text-emerald-600 font-medium">
              {merchant?.counts.actionsByStatus?.EXECUTED || 0} Paid
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
            <span>{merchant?.counts.actionsByStatus?.PENDING_APPROVAL || 0} Pending</span>
            <span>•</span>
            <span>{merchant?.counts.actionsByStatus?.EXECUTING || 0} Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
