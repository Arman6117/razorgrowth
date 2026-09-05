import React from "react";
import { Zap, Bot, RefreshCw, LogOut, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  refreshing: boolean;
  onOpenChatDrawer: () => void;
  onOpenAgentPanel: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export function DashboardHeader({
  refreshing,
  onOpenChatDrawer,
  onOpenAgentPanel,
  onRefresh,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand & Product Positioning */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs">
            <Zap className="w-4 h-4 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-foreground">
                RazorGrowth
              </span>
              <span className="hidden sm:inline-flex text-[10px] px-2 py-0.5 font-medium rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 select-none">
                Revenue Operations
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Commerce Intelligence & Opportunity Engine
            </p>
          </div>
        </div>

        {/* Status Indicators & Action Hierarchy */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-neutral-100/80 dark:bg-neutral-800/80 text-[11px] font-mono text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Razorpay Test Mode
          </div>

          {/* Secondary: Developer Tools */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAgentPanel}
            className="text-xs"
          >
            <Bot className="w-3.5 h-3.5 text-neutral-500" />
            <span className="hidden sm:inline">Tools</span>
          </Button>

          {/* Secondary: Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="text-xs"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin text-neutral-400" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Primary Action: Growth Copilot Drawer */}
          <Button
            variant="ai"
            size="sm"
            onClick={onOpenChatDrawer}
            className="text-xs"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Growth Agent</span>
          </Button>

          {/* Tertiary / Destructive: Logout */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-xs text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
