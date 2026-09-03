"use client";

import React, { useState } from "react";
import {
  Sparkles,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  RefreshCw,
  Users,
  DollarSign,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface GrowthEvidence {
  sourceProductName?: string;
  targetProductName: string;
  sourcePrice?: number;
  targetPrice: number;
  sourceCustomers?: number;
  customersTogether?: number;
  eligibleCustomerCount: number;
  attachRate?: number;
  upgradeRate?: number;
  dormantCustomerCount?: number;
  repeatPurchaseRate?: number;
  sampleSize: number;
  [key: string]: unknown;
}

export interface RankedOpportunityItem {
  id?: string;
  merchantId: string;
  type: "CROSS_SELL" | "UPSELL" | "REACTIVATION";
  title: string;
  explanation: string;
  strategicInsight?: string;
  sourceProductId?: string;
  targetProductId: string;
  recommendedProductName: string;
  targetCustomerCount: number;
  estimatedValue: number;
  confidence: number;
  evidence: GrowthEvidence;
  score: number;
  scoringBreakdown: {
    normalizedEstimatedValue: number;
    evidenceStrength: number;
    confidence: number;
    formula: string;
  };
  status: string;
}

export interface GrowthSnapshotData {
  customers: {
    total: number;
    withPurchases: number;
    repeatBuyers: number;
    oneTimeBuyers: number;
    dormantCount: number;
  };
  orders: {
    total: number;
    paid: number;
    failedOrCancelled: number;
    totalRealizedRevenue: number;
    averageOrderValue: number;
  };
  products: Array<{
    id: string;
    name: string;
    category: string;
    price: number;
    paidOrdersCount: number;
    unitsSold: number;
    revenue: number;
  }>;
}

interface GrowthIntelligencePanelProps {
  opportunities: RankedOpportunityItem[];
  snapshot: GrowthSnapshotData | null;
  analyzing: boolean;
  onRunAnalysis: () => Promise<void>;
  onSelectOpportunity: (opportunityId: string) => void;
  aiEnhanced?: boolean;
}

export function GrowthIntelligencePanel({
  opportunities,
  snapshot,
  analyzing,
  onRunAnalysis,
  onSelectOpportunity,
  aiEnhanced = false,
}: GrowthIntelligencePanelProps) {
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);

  const toggleEvidence = (id: string) => {
    setExpandedEvidenceId((prev) => (prev === id ? null : id));
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "CROSS_SELL":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
            Cross-Sell
          </span>
        );
      case "UPSELL":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
            Upsell
          </span>
        );
      case "REACTIVATION":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            Reactivation
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-blue-900/10 border border-indigo-200 dark:border-indigo-800/60 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
              AI Growth Intelligence
            </h2>
            {aiEnhanced && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60">
                LLM Grounded
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Deterministic transaction analysis coupled with LLM reasoning. Discovers evidence-backed cross-sells, upsells, and reactivations from actual customer orders.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={onRunAnalysis}
            disabled={analyzing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs cursor-pointer gap-1.5"
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Analyzing Store Data...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Analyze Growth
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Snapshot Summary Bar if available */}
      {snapshot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs">
            <span className="text-neutral-500 font-medium">Historical Paid Orders</span>
            <div className="text-lg font-bold text-neutral-900 dark:text-white mt-0.5">
              {snapshot.orders.paid} Orders
            </div>
            <span className="text-[11px] text-neutral-400">
              Avg Order: ₹{snapshot.orders.averageOrderValue}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs">
            <span className="text-neutral-500 font-medium">Customer Repeat Rate</span>
            <div className="text-lg font-bold text-neutral-900 dark:text-white mt-0.5">
              {snapshot.customers.withPurchases > 0
                ? `${((snapshot.customers.repeatBuyers / snapshot.customers.withPurchases) * 100).toFixed(1)}%`
                : "0%"}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">
              {snapshot.customers.repeatBuyers} Repeat Buyers
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs">
            <span className="text-neutral-500 font-medium">Dormant Reach (&gt;30d)</span>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {snapshot.customers.dormantCount} Customers
            </div>
            <span className="text-[11px] text-neutral-400">Reactivation Candidates</span>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs">
            <span className="text-neutral-500 font-medium">Catalog Depth</span>
            <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
              {snapshot.products.length} Active Products
            </div>
            <span className="text-[11px] text-neutral-400">Indexed for Co-purchase</span>
          </div>
        </div>
      )}

      {/* Ranked Opportunities List */}
      <div className="space-y-4">
        {opportunities.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl">
            <Sparkles className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              No Growth Opportunities Generated Yet
            </h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
              Click &quot;Analyze Growth&quot; to run the deterministic AI growth engine across your historical orders and customer catalog.
            </p>
            <Button
              onClick={onRunAnalysis}
              disabled={analyzing}
              size="sm"
              className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
            >
              Analyze Store Data Now
            </Button>
          </div>
        ) : (
          opportunities.map((opp, idx) => {
            const oppKey = opp.id || `${opp.type}-${opp.targetProductId}-${idx}`;
            const isExpanded = expandedEvidenceId === oppKey;
            const isTop = idx === 0;

            return (
              <div
                key={oppKey}
                className={`p-5 rounded-2xl border transition-all ${
                  isTop
                    ? "bg-white dark:bg-neutral-900 border-indigo-300 dark:border-indigo-700/80 shadow-md ring-1 ring-indigo-500/20"
                    : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs hover:border-neutral-300 dark:hover:border-neutral-700"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isTop && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60">
                          <Award className="w-3 h-3 text-amber-600" /> #1 Top Opportunity
                        </span>
                      )}
                      {getTypeBadge(opp.type)}
                      <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                        Score: {(opp.score * 100).toFixed(0)}/100
                      </span>
                      <span className="text-xs text-neutral-400">•</span>
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {((opp.confidence || 0) * 100).toFixed(0)}% Confidence
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                      {opp.title}
                    </h3>

                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {opp.explanation}
                    </p>

                    {/* AI Strategic Insight if available */}
                    {opp.strategicInsight && (
                      <div className="p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-300 flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-semibold">AI Strategic Insight:</span>{" "}
                          {opp.strategicInsight}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Value & Action Panel */}
                  <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-3 lg:border-l lg:border-neutral-100 dark:lg:border-neutral-800 lg:pl-5 shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Estimated Value
                      </span>
                      <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                        ₹{Math.round(opp.estimatedValue).toLocaleString("en-IN")}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {opp.targetCustomerCount} Eligible Buyers
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleEvidence(oppKey)}
                        className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white gap-1"
                      >
                        {isExpanded ? (
                          <>
                            Less Evidence <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            View Evidence <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </Button>

                      {opp.id && (
                        <Button
                          size="sm"
                          onClick={() => onSelectOpportunity(opp.id!)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs gap-1 cursor-pointer"
                        >
                          Target Customers
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Deterministic Evidence Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      Authoritative Database Evidence
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 dark:bg-black/40 p-3 rounded-xl border border-neutral-200/60 dark:border-neutral-800 text-xs font-mono">
                      {opp.evidence.sourceCustomers !== undefined && (
                        <div>
                          <div className="text-neutral-400 text-[10px]">Source Product Buyers</div>
                          <div className="font-bold text-neutral-800 dark:text-neutral-200">
                            {opp.evidence.sourceCustomers}
                          </div>
                        </div>
                      )}

                      {opp.evidence.customersTogether !== undefined && (
                        <div>
                          <div className="text-neutral-400 text-[10px]">Co-Purchasers (A + B)</div>
                          <div className="font-bold text-neutral-800 dark:text-neutral-200">
                            {opp.evidence.customersTogether}
                          </div>
                        </div>
                      )}

                      {opp.evidence.attachRate !== undefined && (
                        <div>
                          <div className="text-neutral-400 text-[10px]">Observed Attach Rate</div>
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">
                            {(opp.evidence.attachRate * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}

                      {opp.evidence.targetPrice !== undefined && (
                        <div>
                          <div className="text-neutral-400 text-[10px]">Authoritative Price</div>
                          <div className="font-bold text-emerald-600">
                            ₹{opp.evidence.targetPrice.toLocaleString("en-IN")}
                          </div>
                        </div>
                      )}

                      {opp.evidence.dormantCustomerCount !== undefined && (
                        <div>
                          <div className="text-neutral-400 text-[10px]">Dormant Customers</div>
                          <div className="font-bold text-amber-600">
                            {opp.evidence.dormantCustomerCount}
                          </div>
                        </div>
                      )}

                      {opp.evidence.repeatPurchaseRate !== undefined && (
                        <div>
                          <div className="text-neutral-400 text-[10px]">Repeat Rate</div>
                          <div className="font-bold text-indigo-600">
                            {(opp.evidence.repeatPurchaseRate * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-neutral-500 italic">
                      Ranking formula: {opp.scoringBreakdown?.formula || "score = (normalizedEstimatedValue * 0.5) + (evidenceStrength * 0.3) + (confidence * 0.2)"}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
