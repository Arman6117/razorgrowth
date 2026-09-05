import React, { useState, useMemo } from "react";
import {
  Layers,
  RefreshCw,
  Package,
  ArrowRight,
  Users,
  ChevronRight,
  Sparkles,
  Bot,
  ShieldCheck,
  Search,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinancialValue } from "@/components/ui/financial-value";
import { AIBadge } from "@/components/ui/ai-badge";
import { OpportunityItem } from "@/lib/dashboard/types";
import { GrowthSnapshotData } from "@/components/growth-intelligence-panel";

interface OpportunitiesCatalogProps {
  opportunities: OpportunityItem[];
  loading: boolean;
  onOpenOpportunity: (opportunity: OpportunityItem) => void;
  onPlanOpportunity?: (opportunityId: string) => void;
  onRunAnalysis?: () => Promise<void>;
  analyzing?: boolean;
  snapshot?: GrowthSnapshotData | null;
  aiEnhanced?: boolean;
}

export function OpportunitiesCatalog({
  opportunities,
  loading,
  onOpenOpportunity,
  onPlanOpportunity,
  onRunAnalysis,
  analyzing = false,
  snapshot,
  aiEnhanced = false,
}: OpportunitiesCatalogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"value" | "attachRate" | "reach">("value");

  const filteredAndSortedOpportunities = useMemo(() => {
    let result = [...opportunities];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (o) =>
          o.sourceProductName.toLowerCase().includes(query) ||
          o.targetProductName.toLowerCase().includes(query)
      );
    }

    result.sort((a, b) => {
      if (sortBy === "value") {
        return b.expectedRevenue - a.expectedRevenue;
      }
      if (sortBy === "attachRate") {
        return b.crossSellRate - a.crossSellRate;
      }
      if (sortBy === "reach") {
        return b.eligibleCustomerCount - a.eligibleCustomerCount;
      }
      return 0;
    });

    return result;
  }, [opportunities, searchQuery, sortBy]);
  return (
    <section className="space-y-3.5">
      {/* Section Header with Pipeline Analytics Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-neutral-500" />
              Revenue Opportunity Pipeline ({opportunities.length})
            </h2>
            <AIBadge variant="subtle">
              {aiEnhanced ? "Deterministic + LLM" : "Deterministic Graph"}
            </AIBadge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ranked co-purchase affinities answering: What to sell, to Whom, for How much, and Why.
          </p>
        </div>

        {onRunAnalysis && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRunAnalysis}
            disabled={analyzing}
            className="text-xs gap-1.5 self-start sm:self-auto"
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Analyzing Store Data...
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-indigo-500" />
                Run Growth Analysis
              </>
            )}
          </Button>
        )}
      </div>

      {/* Filter and Sort Toolbar */}
      {opportunities.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
          {/* Search filter */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter products..."
              className="w-full pl-8 pr-3 py-1.5 rounded-md text-xs bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-neutral-400"
            />
          </div>

          {/* Sort pills */}
          <div className="flex items-center gap-1 self-end sm:self-auto text-xs">
            <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Sort:
            </span>
            <button
              type="button"
              onClick={() => setSortBy("value")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                sortBy === "value"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-foreground"
              }`}
            >
              Highest Value
            </button>
            <button
              type="button"
              onClick={() => setSortBy("attachRate")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                sortBy === "attachRate"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-foreground"
              }`}
            >
              Attach Rate
            </button>
            <button
              type="button"
              onClick={() => setSortBy("reach")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                sortBy === "reach"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-foreground"
              }`}
            >
              Reach
            </button>
          </div>
        </div>
      )}

      {/* Snapshot Summary Chips if Available */}
      {snapshot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">Paid Order Cohort</span>
            <div className="text-sm font-bold text-foreground mt-0.5 font-mono tabular-nums">
              {snapshot.orders.paid} Orders
            </div>
            <span className="text-[10px] text-muted-foreground">
              Avg: <FinancialValue value={snapshot.orders.averageOrderValue} size="xs" variant="muted" />
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">Repeat Buyer Affinity</span>
            <div className="text-sm font-bold text-foreground mt-0.5 font-mono tabular-nums">
              {snapshot.customers.withPurchases > 0
                ? `${((snapshot.customers.repeatBuyers / snapshot.customers.withPurchases) * 100).toFixed(1)}%`
                : "0%"}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {snapshot.customers.repeatBuyers} repeat customers
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">Dormant Audience (&gt;30d)</span>
            <div className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5 font-mono tabular-nums">
              {snapshot.customers.dormantCount} Buyers
            </div>
            <span className="text-[10px] text-muted-foreground">Reactivation target</span>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">Indexed Catalog</span>
            <div className="text-sm font-bold text-foreground mt-0.5 font-mono tabular-nums">
              {snapshot.products.length} Products
            </div>
            <span className="text-[10px] text-muted-foreground">Active for co-purchase</span>
          </div>
        </div>
      )}

      {/* Main Scannable Table */}
      {loading ? (
        <Card className="p-10 text-center bg-card border-border">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Analyzing transaction graph and customer eligibility...</p>
        </Card>
      ) : opportunities.length === 0 ? (
        <Card className="p-10 text-center bg-card border-border">
          <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-60" />
          <h4 className="text-xs font-semibold text-foreground">No opportunities detected</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Run the database seed script to populate sample transactions.</p>
        </Card>
      ) : filteredAndSortedOpportunities.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <p className="text-xs text-muted-foreground">No opportunities match &quot;{searchQuery}&quot;.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/90 dark:bg-neutral-900/80 text-muted-foreground text-[10px] uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="py-3 px-4">What? (Source → Target)</th>
                  <th className="py-3 px-4">Offer Price</th>
                  <th className="py-3 px-4">Who? (Reach)</th>
                  <th className="py-3 px-4">How Much? (Value)</th>
                  <th className="py-3 px-4">Why? (Empirical Evidence)</th>
                  <th className="py-3 px-4 text-right">What Can I Do?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredAndSortedOpportunities.map((opp) => {
                  const crossSellPercent = (opp.crossSellRate * 100).toFixed(1);
                  return (
                    <tr
                      key={opp.id}
                      className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      {/* WHAT: Product Pair */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {opp.sourceProductName}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className="font-semibold text-foreground">
                            {opp.targetProductName}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono">Cross-Sell</span>
                          {opp.actionCount > 0 && (
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                              • {opp.actionCount} action(s) prepared
                            </span>
                          )}
                        </div>
                      </td>

                      {/* OFFER PRICE */}
                      <td className="py-3.5 px-4">
                        <FinancialValue value={opp.targetProductPrice} size="sm" variant="default" />
                      </td>

                      {/* WHO: Eligible Reach */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1 font-mono font-medium text-foreground">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          <span>{opp.eligibleCustomerCount} buyers</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">Pre-validated</div>
                      </td>

                      {/* HOW MUCH: Estimated Value */}
                      <td className="py-3.5 px-4">
                        <FinancialValue value={opp.expectedRevenue} size="sm" variant="revenue" />
                        <div className="text-[10px] text-muted-foreground">Potential</div>
                      </td>

                      {/* WHY: Co-purchase rate & evidence */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-semibold text-foreground">
                            {crossSellPercent}%
                          </span>
                          <div className="w-12 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-neutral-900 dark:bg-neutral-100 rounded-full"
                              style={{ width: `${Math.min(opp.crossSellRate * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {opp.customersTogether} co-purchases from {opp.sourceCustomers} buyers
                        </span>
                      </td>

                      {/* WHAT CAN I DO: Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onPlanOpportunity && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onPlanOpportunity(opp.id)}
                              className="text-xs"
                              title="Plan campaign actions"
                            >
                              <Bot className="w-3 h-3 text-neutral-500" />
                              <span className="hidden md:inline ml-1">Plan</span>
                            </Button>
                          )}

                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => onOpenOpportunity(opp)}
                            className="text-xs gap-1"
                          >
                            <span>Target</span>
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
