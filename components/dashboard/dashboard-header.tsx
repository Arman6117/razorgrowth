import React from "react";
import { Zap, Bot, RefreshCw, LogOut, MessageSquare, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MerchantInfo, RazorpayConnectionInfo } from "@/lib/dashboard/types";

interface DashboardHeaderProps {
  merchant: MerchantInfo | null;
  connectionInfo: RazorpayConnectionInfo | null;
  refreshing: boolean;
  onOpenChatDrawer: () => void;
  onOpenAgentPanel: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export function DashboardHeader({
  merchant,
  connectionInfo,
  refreshing,
  onOpenChatDrawer,
  onOpenAgentPanel,
  onRefresh,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
        {/* Brand & Product Positioning */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs">
            <Zap className="w-3.5 h-3.5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-foreground">
                RazorGrowth
              </span>
              <span className="hidden md:inline-flex text-[10px] px-1.5 py-0.2 font-medium rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-border select-none">
                Revenue Operations
              </span>
            </div>
          </div>
        </div>

        {/* Merchant & Gateway Context (Centered, replaces bulky KPI card) */}
        <div className="hidden sm:flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-border text-muted-foreground">
            <Store className="w-3 h-3 text-neutral-400" />
            <span className="font-semibold text-foreground">{merchant?.name || "TechNova Store"}</span>
            <span className="text-neutral-300 dark:text-neutral-700">•</span>
            <span className="font-mono text-[11px]">{merchant?.currency || "INR"} (₹)</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-50 dark:bg-neutral-900 text-[11px] font-mono text-muted-foreground border border-border select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {connectionInfo?.connected ? "Razorpay Gateway Connected" : "Razorpay Test Mode"}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Secondary: Developer Tools */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenAgentPanel}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <Bot className="w-3.5 h-3.5 mr-1 text-neutral-500" />
            <span className="hidden lg:inline">Tools</span>
          </Button>

          {/* Secondary: Refresh */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin text-neutral-400" : ""} sm:mr-1`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Assistant: Growth Agent Drawer */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenChatDrawer}
            className="text-xs gap-1.5"
          >
            <MessageSquare className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            <span>Growth Agent</span>
          </Button>

          {/* Tertiary: Sign Out */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-xs text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
          >
            <LogOut className="w-3 h-3" />
            <span className="hidden xl:inline ml-1">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
