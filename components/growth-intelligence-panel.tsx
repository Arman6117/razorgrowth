"use client";

import React, { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Award,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinancialValue } from "@/components/ui/financial-value";
import { AIBadge } from "@/components/ui/ai-badge";

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
  onPlanOpportunity?: (opportunityId: string) => void;
  aiEnhanced?: boolean;
}

export function GrowthIntelligencePanel({
  opportunities,
  snapshot,
  analyzing,
  onRunAnalysis,
  onSelectOpportunity,
  onPlanOpportunity,
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
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 select-none">
            Cross-Sell
          </span>
        );
      case "UPSELL":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 select-none">
            Upsell
          </span>
        );
      case "REACTIVATION":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 select-none">
            Reactivation
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 select-none">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <Card className="p-5 bg-card border-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                Revenue Intelligence Engine
              </h2>
              <AIBadge variant="subtle">
                {aiEnhanced ? "Deterministic + LLM" : "Deterministic Graph"}
              </AIBadge>
            </div>
            <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
              Discovers evidence-backed cross-sells, upsells, and customer reactivations computed directly from historical checkout behavior.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="default"
              size="sm"
              onClick={onRunAnalysis}
              disabled={analyzing}
              className="text-xs"
            >
              {analyzing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Analyzing Orders...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Run Growth Analysis
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Snapshot Summary Metrics */}
        {snapshot && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-border/70">
            <div className="p-3 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Historical Paid Orders</span>
              <div className="text-base font-bold text-foreground mt-0.5 font-mono tabular-nums">
                {snapshot.orders.paid} Orders
              </div>
              <span className="text-[11px] text-muted-foreground">
                Avg Order: <FinancialValue value={snapshot.orders.averageOrderValue} size="xs" variant="muted" />
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Repeat Buyer Rate</span>
              <div className="text-base font-bold text-foreground mt-0.5 font-mono tabular-nums">
                {snapshot.customers.withPurchases > 0
                  ? `${((snapshot.customers.repeatBuyers / snapshot.customers.withPurchases) * 100).toFixed(1)}%`
                  : "0%"}
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {snapshot.customers.repeatBuyers} repeat customers
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Dormant Audience (&gt;30d)</span>
              <div className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5 font-mono tabular-nums">
                {snapshot.customers.dormantCount} Buyers
              </div>
              <span className="text-[11px] text-muted-foreground">Reactivation target</span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">Indexed Catalog</span>
              <div className="text-base font-bold text-foreground mt-0.5 font-mono tabular-nums">
                {snapshot.products.length} Products
              </div>
              <span className="text-[11px] text-muted-foreground">Active for co-purchase</span>
            </div>
          </div>
        )}
      </Card>

      {/* Ranked Opportunities List */}
      <div className="space-y-3">
        {opportunities.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border">
            <Sparkles className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-60" />
            <h3 className="text-sm font-semibold text-foreground">
              No Growth Opportunities Generated Yet
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Run the deterministic growth analysis across your transaction history to generate ranked, evidence-backed campaigns.
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={onRunAnalysis}
              disabled={analyzing}
              className="mt-4 text-xs"
            >
              Analyze Store Data Now
            </Button>
          </Card>
        ) : (
          opportunities.map((opp, idx) => {
            const oppKey = opp.id || `${opp.type}-${opp.targetProductId}-${idx}`;
            const isExpanded = expandedEvidenceId === oppKey;
            const isTop = idx === 0;

            return (
              <Card
                key={oppKey}
                variant={isTop ? "featured" : "default"}
                className={`p-4 transition-colors ${isTop ? "border-indigo-300 dark:border-indigo-800" : ""}`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Metadata & Story */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isTop && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 select-none">
                          <Award className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Top Opportunity
                        </span>
                      )}
                      {getTypeBadge(opp.type)}
                      <span className="text-[11px] font-mono font-medium text-muted-foreground">
                        Score: {(opp.score * 100).toFixed(0)}/100
                      </span>
                      <span className="text-muted-foreground text-xs">•</span>
                      <span className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        {((opp.confidence || 0) * 100).toFixed(0)}% Confidence
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-foreground">
                      {opp.title}
                    </h3>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {opp.explanation}
                    </p>

                    {/* AI Strategic Guidance */}
                    {opp.strategicInsight && (
                      <div className="p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-950 dark:text-indigo-200 flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-semibold">AI Strategic Guidance:</span>{" "}
                          {opp.strategicInsight}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Value & Actions */}
                  <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-3 lg:border-l lg:border-border/70 lg:pl-5 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Estimated Opportunity
                      </span>
                      <div>
                        <FinancialValue
                          value={Math.round(opp.estimatedValue)}
                          variant="revenue"
                          size="xl"
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {opp.targetCustomerCount} Eligible {opp.targetCustomerCount === 1 ? "Buyer" : "Buyers"}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleEvidence(oppKey)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <>
                            <span>Evidence</span>
                            <ChevronUp className="w-3 h-3 ml-1" />
                          </>
                        ) : (
                          <>
                            <span>Evidence</span>
                            <ChevronDown className="w-3 h-3 ml-1" />
                          </>
                        )}
                      </Button>

                      {opp.id && onPlanOpportunity && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onPlanOpportunity(opp.id!)}
                          className="text-xs"
                        >
                          <Bot className="w-3 h-3 mr-1 text-neutral-500" />
                          Plan
                        </Button>
                      )}

                      {opp.id && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => onSelectOpportunity(opp.id!)}
                          className="text-xs"
                        >
                          Target Buyers
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Technical Evidence Details */}
                {isExpanded && (
                  <div className="mt-3.5 pt-3.5 border-t border-border/70 space-y-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
                      Authoritative Grounding Metrics
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-neutral-50/80 dark:bg-neutral-900/60 p-3 rounded-lg border border-border text-xs font-mono">
                      {opp.evidence.sourceCustomers !== undefined && (
                        <div>
                          <div className="text-muted-foreground text-[10px]">Source Product Buyers</div>
                          <div className="font-bold text-foreground">
                            {opp.evidence.sourceCustomers}
                          </div>
                        </div>
                      )}

                      {opp.evidence.customersTogether !== undefined && (
                        <div>
                          <div className="text-muted-foreground text-[10px]">Co-Purchasers (A + B)</div>
                          <div className="font-bold text-foreground">
                            {opp.evidence.customersTogether}
                          </div>
                        </div>
                      )}

                      {opp.evidence.attachRate !== undefined && (
                        <div>
                          <div className="text-muted-foreground text-[10px]">Attach Rate</div>
                          <div className="font-bold text-indigo-600 dark:text-indigo-400">
                            {(opp.evidence.attachRate * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}

                      {opp.evidence.targetPrice !== undefined && (
                        <div>
                          <div className="text-muted-foreground text-[10px]">Authoritative Price</div>
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">
                            <FinancialValue value={opp.evidence.targetPrice} size="xs" variant="revenue" />
                          </div>
                        </div>
                      )}

                      {opp.evidence.dormantCustomerCount !== undefined && (
                        <div>
                          <div className="text-muted-foreground text-[10px]">Dormant Buyers</div>
                          <div className="font-bold text-amber-600 dark:text-amber-400">
                            {opp.evidence.dormantCustomerCount}
                          </div>
                        </div>
                      )}

                      {opp.evidence.repeatPurchaseRate !== undefined && (
                        <div>
                          <div className="text-muted-foreground text-[10px]">Repeat Rate</div>
                          <div className="font-bold text-foreground">
                            {(opp.evidence.repeatPurchaseRate * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-muted-foreground font-mono">
                      Formula: {opp.scoringBreakdown?.formula || "score = (normalizedEstimatedValue * 0.5) + (evidenceStrength * 0.3) + (confidence * 0.2)"}
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
