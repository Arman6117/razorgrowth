"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Code,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AIBadge } from "@/components/ui/ai-badge";
import { AIBuyerReadinessReport } from "@/lib/buyer/ai-catalog";

interface AIBuyerReadinessCardProps {
  onOpenPreview: () => void;
  onImportCsv?: () => void;
}

export function AIBuyerReadinessCard({
  onOpenPreview,
  onImportCsv,
}: AIBuyerReadinessCardProps) {
  const [report, setReport] = useState<AIBuyerReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const fetchReadiness = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch("/api/ai/readiness");
      const data = await res.json();
      if (res.ok && data.report) {
        setReport(data.report);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReadiness();
  }, []);

  if (loading) {
    return (
      <Card className="p-6 flex items-center justify-center space-x-2.5 text-muted-foreground bg-card border-border">
        <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs">Evaluating Catalog Machine-Readiness...</span>
      </Card>
    );
  }

  const score = report?.readinessScore ?? 0;
  const total = report?.totalProducts ?? 0;
  const complete = report?.completeProducts ?? 0;
  const needsAttention = report?.needsAttentionCount ?? 0;

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (s >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-rose-600 dark:text-rose-400";
  };

  const getScoreBg = (s: number) => {
    if (s >= 80) return "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/60";
    if (s >= 50) return "bg-amber-50/60 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-800/60";
    return "bg-rose-50/60 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-800/60";
  };

  return (
    <Card className="p-5 space-y-4 bg-card border-border">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                AI Buyer Catalog Readiness
              </h3>
              <AIBadge variant="subtle" icon="none">
                Machine Commerce
              </AIBadge>
            </div>
            <p className="text-xs text-muted-foreground">
              Evaluates structured metadata completeness for discovery by external AI shopping agents.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchReadiness(true)}
            disabled={refreshing}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={onOpenPreview}
            className="text-xs"
          >
            <Search className="w-3.5 h-3.5 mr-1" />
            Simulate AI Buyer
          </Button>
        </div>
      </div>

      {/* Main Score & Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 items-center">
        {/* Readiness Score Box */}
        <div className={`p-4 rounded-lg border text-center flex flex-col items-center justify-center space-y-1 ${getScoreBg(score)}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Readiness Index
          </div>
          <div className={`text-3xl font-extrabold font-mono tabular-nums tracking-tight ${getScoreColor(score)}`}>
            {score}%
          </div>
          <span className="text-[11px] font-medium text-foreground">
            {score >= 80 ? "Agent Ready" : score >= 50 ? "Partially Ready" : "Incomplete Catalog"}
          </span>
        </div>

        {/* Narrative & Metrics */}
        <div className="md:col-span-3 space-y-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {score >= 80
              ? "Catalog metadata contains authoritative prices, clear categories, and semantic descriptions required for deterministic agent matching and checkout link generation."
              : "Incomplete catalog fields detected. Adding clear categories and descriptions ensures external shopping agents match your inventory accurately."}
          </p>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Total Catalog</div>
              <div className="text-sm font-bold text-foreground mt-0.5 font-mono tabular-nums">
                {total} {total === 1 ? "Product" : "Products"}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">100% Complete</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono tabular-nums">
                {complete} {complete === 1 ? "Product" : "Products"}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Needs Attention</div>
              <div className={`text-sm font-bold mt-0.5 font-mono tabular-nums ${needsAttention > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                {needsAttention} {needsAttention === 1 ? "Product" : "Products"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Completeness Checklist */}
      {report?.checklist && (
        <div className="space-y-2 pt-1">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Machine-Readable Completeness Checklist
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <div className="flex items-center gap-1 font-semibold text-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Names</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {report.checklist.productNames.count}/{report.checklist.productNames.total} ({report.checklist.productNames.percentage}%)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <div className="flex items-center gap-1 font-semibold text-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Prices</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {report.checklist.prices.count}/{report.checklist.prices.total} ({report.checklist.prices.percentage}%)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <div className="flex items-center gap-1 font-semibold text-foreground">
                {report.checklist.categories.complete ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Categories</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {report.checklist.categories.count}/{report.checklist.categories.total} ({report.checklist.categories.percentage}%)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <div className="flex items-center gap-1 font-semibold text-foreground">
                {report.checklist.descriptions.complete ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Descriptions</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {report.checklist.descriptions.count}/{report.checklist.descriptions.total} ({report.checklist.descriptions.percentage}%)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1 font-semibold text-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Active</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {report.checklist.activeInventory.count}/{report.checklist.activeInventory.total} ({report.checklist.activeInventory.percentage}%)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Missing Metadata Warnings */}
      {report?.missingMetadataWarnings && report.missingMetadataWarnings.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Catalog Optimization Opportunities:
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
            {report.missingMetadataWarnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer & Machine API Links */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTechnicalDetails((prev) => !prev)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {showTechnicalDetails ? (
            <>
              Hide Technical Details <ChevronUp className="w-3 h-3 ml-1" />
            </>
          ) : (
            <>
              Inspect Machine Endpoints <ChevronDown className="w-3 h-3 ml-1" />
            </>
          )}
        </Button>

        <div className="flex items-center gap-2">
          <a
            href="/api/ai/catalog?includeJsonLd=true"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-[11px] font-mono transition-colors"
          >
            <Code className="w-3.5 h-3.5 text-neutral-500" />
            GET /api/ai/catalog
          </a>
        </div>
      </div>

      {/* Expanded Technical Details */}
      {showTechnicalDetails && (
        <div className="pt-3 border-t border-border/70 space-y-1.5 text-xs">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Deterministic Formula & Machine Endpoints
          </div>
          <div className="p-3 rounded-lg bg-neutral-950 text-neutral-200 text-[11px] font-mono overflow-x-auto space-y-1 border border-border">
            <div>// Readiness Formula:</div>
            <div>{report?.formula}</div>
            <div className="pt-1">// Machine Endpoints:</div>
            <div>- GET /api/ai/catalog (Standard JSON & schema.org JSON-LD)</div>
            <div>- GET /api/ai/products (Compact active products list)</div>
            <div>- POST /api/ai/discover (Natural-language AI buyer query)</div>
            <div>- POST /api/ai/purchase-intent (Bounded checkout intent)</div>
          </div>
        </div>
      )}
    </Card>
  );
}
