import React from "react";
import { Layers, RefreshCw, Package, ArrowRight, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinancialValue } from "@/components/ui/financial-value";
import { OpportunityItem } from "@/lib/dashboard/types";

interface OpportunitiesCatalogProps {
  opportunities: OpportunityItem[];
  loading: boolean;
  onOpenOpportunity: (opportunity: OpportunityItem) => void;
}

export function OpportunitiesCatalog({
  opportunities,
  loading,
  onOpenOpportunity,
}: OpportunitiesCatalogProps) {
  return (
    <section className="space-y-3">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-neutral-500" />
            Discovered Opportunities Catalog
          </h3>
          <p className="text-xs text-muted-foreground">
            Derived deterministically by the cross-sell analytics engine from customer transaction history.
          </p>
        </div>
      </div>

      {loading ? (
        <Card className="p-10 text-center bg-card border-border">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Analyzing transaction pairs and customer graph...</p>
        </Card>
      ) : opportunities.length === 0 ? (
        <Card className="p-10 text-center bg-card border-border">
          <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-60" />
          <h4 className="text-xs font-semibold text-foreground">No opportunities detected</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Run the database seed script to populate sample transactions.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/90 dark:bg-neutral-900/80 text-muted-foreground text-[10px] uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="py-3 px-4">Opportunity (Source → Target)</th>
                  <th className="py-3 px-4">Target Price</th>
                  <th className="py-3 px-4">Cross-Sell Rate</th>
                  <th className="py-3 px-4">Eligible Reach</th>
                  <th className="py-3 px-4">Estimated Value</th>
                  <th className="py-3 px-4">Actions</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {opportunities.map((opp) => {
                  const crossSellPercent = (opp.crossSellRate * 100).toFixed(1);
                  return (
                    <tr
                      key={opp.id}
                      className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors"
                    >
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
                        <span className="text-[11px] text-muted-foreground">
                          {opp.customersTogether} co-purchases from {opp.sourceCustomers} source buyers
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <FinancialValue value={opp.targetProductPrice} size="sm" variant="default" />
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-semibold text-foreground">
                            {crossSellPercent}%
                          </span>
                          <div className="w-14 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-neutral-900 dark:bg-neutral-100 rounded-full"
                              style={{ width: `${Math.min(opp.crossSellRate * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 font-mono text-foreground">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          {opp.eligibleCustomerCount} buyers
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <FinancialValue value={opp.expectedRevenue} size="sm" variant="revenue" />
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-muted-foreground">
                          {opp.actionCount} created
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenOpportunity(opp)}
                          className="text-xs gap-1"
                        >
                          View Buyers
                          <ChevronRight className="w-3 h-3" />
                        </Button>
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
