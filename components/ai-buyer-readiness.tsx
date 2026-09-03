"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Bot,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Tag,
  FileText,
  DollarSign,
  Package,
  Layers,
  Code,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex items-center justify-center space-x-3 text-neutral-500">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
        <span className="text-xs">Evaluating AI Buyer Readiness...</span>
      </div>
    );
  }

  const score = report?.readinessScore ?? 0;
  const total = report?.totalProducts ?? 0;
  const complete = report?.completeProducts ?? 0;
  const needsAttention = report?.needsAttentionCount ?? 0;

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-emerald-600 dark:text-emerald-400 border-emerald-500";
    if (s >= 50) return "text-amber-600 dark:text-amber-400 border-amber-500";
    return "text-rose-600 dark:text-rose-400 border-rose-500";
  };

  const getScoreBg = (s: number) => {
    if (s >= 80) return "bg-emerald-50 dark:bg-emerald-950/40";
    if (s >= 50) return "bg-amber-50 dark:bg-amber-950/40";
    return "bg-rose-50 dark:bg-rose-950/40";
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-indigo-200 dark:border-indigo-800/60 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                AI Buyer Readiness
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                Machine-Readable Catalog
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Evaluates structured metadata quality for autonomous AI buyer discovery and semantic shopping.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchReadiness(true)}
            disabled={refreshing}
            className="text-xs h-8 px-2.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={onOpenPreview}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-1.5 h-8 gap-1.5 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Preview AI Buyer
          </Button>
        </div>
      </div>

      {/* Main Score & Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
        {/* Readiness Score Ring/Badge */}
        <div className={`p-4 rounded-xl ${getScoreBg(score)} border border-neutral-200/80 dark:border-neutral-800 text-center flex flex-col items-center justify-center space-y-1`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Readiness Score
          </div>
          <div className={`text-3xl font-extrabold ${getScoreColor(score)}`}>
            {score}%
          </div>
          <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
            {score >= 80 ? "AI Buyer Ready" : score >= 50 ? "Partially Ready" : "Needs Optimization"}
          </span>
        </div>

        {/* Narrative Description & Metrics */}
        <div className="md:col-span-3 space-y-3">
          <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
            {score >= 80
              ? "Your catalog contains structured product names, authoritative prices, categories, and descriptions suitable for high-confidence AI-assisted product discovery."
              : "Some catalog items are missing categories or descriptions. Completing these fields helps external shopping agents accurately recommend your products."}
          </p>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-black/30 border border-neutral-200/60 dark:border-neutral-800">
              <div className="text-[10px] text-neutral-400 uppercase font-semibold">Total Catalog</div>
              <div className="text-base font-bold text-neutral-900 dark:text-white mt-0.5">
                {total} {total === 1 ? "Product" : "Products"}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-black/30 border border-neutral-200/60 dark:border-neutral-800">
              <div className="text-[10px] text-neutral-400 uppercase font-semibold">100% Complete</div>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {complete} {complete === 1 ? "Product" : "Products"}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-black/30 border border-neutral-200/60 dark:border-neutral-800">
              <div className="text-[10px] text-neutral-400 uppercase font-semibold">Needs Attention</div>
              <div className={`text-base font-bold mt-0.5 ${needsAttention > 0 ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"}`}>
                {needsAttention} {needsAttention === 1 ? "Item" : "Items"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Completeness Checklist */}
      {report?.checklist && (
        <div className="space-y-2 pt-1">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Machine-Readable Completeness Checklist
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-neutral-50/80 dark:bg-black/20 border border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Names</span>
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                {report.checklist.productNames.count}/{report.checklist.productNames.total} ({report.checklist.productNames.percentage}%)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-50/80 dark:bg-black/20 border border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Prices</span>
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                {report.checklist.prices.count}/{report.checklist.prices.total} ({report.checklist.prices.percentage}%)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-50/80 dark:bg-black/20 border border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200">
                {report.checklist.categories.complete ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Categories</span>
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                {report.checklist.categories.count}/{report.checklist.categories.total} ({report.checklist.categories.percentage}%)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-50/80 dark:bg-black/20 border border-neutral-200/60 dark:border-neutral-800">
              <div className="flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200">
                {report.checklist.descriptions.complete ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Descriptions</span>
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                {report.checklist.descriptions.count}/{report.checklist.descriptions.total} ({report.checklist.descriptions.percentage}%)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-50/80 dark:bg-black/20 border border-neutral-200/60 dark:border-neutral-800 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Active</span>
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                {report.checklist.activeInventory.count}/{report.checklist.activeInventory.total} ({report.checklist.activeInventory.percentage}%)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Missing Metadata Warnings */}
      {report?.missingMetadataWarnings && report.missingMetadataWarnings.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
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
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white gap-1"
        >
          {showTechnicalDetails ? (
            <>
              Hide Technical Details <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Inspect Machine Endpoint (JSON & JSON-LD) <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </Button>

        <div className="flex items-center gap-2">
          <a
            href="/api/ai/catalog?includeJsonLd=true"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold transition-colors"
          >
            <Code className="w-3.5 h-3.5 text-indigo-500" />
            GET /api/ai/catalog
          </a>
        </div>
      </div>

      {/* Expanded Technical Details */}
      {showTechnicalDetails && (
        <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2 text-xs">
          <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Deterministic Formula & Schema Information
          </div>
          <div className="p-3 rounded-xl bg-neutral-900 text-neutral-200 text-[11px] font-mono overflow-x-auto space-y-1">
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
    </div>
  );
}
