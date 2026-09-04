import React from "react";
import { Layers, RefreshCw, Package, ArrowRight, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500" />
            Discovered Opportunities Catalog
          </h3>
          <p className="text-sm text-neutral-500">
            Derived deterministically by the cross-sell analytics engine from customer transaction history.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
          <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Analyzing transaction pairs and customer graph...</p>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
          <Package className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
          <h4 className="font-semibold text-neutral-700 dark:text-neutral-300">No opportunities detected</h4>
          <p className="text-sm text-neutral-500 mt-1">Run the database seed script to populate sample transactions.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50/80 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wider font-semibold border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="py-3.5 px-4">Opportunity (Source → Target)</th>
                  <th className="py-3.5 px-4">Target Price</th>
                  <th className="py-3.5 px-4">Cross-Sell Rate</th>
                  <th className="py-3.5 px-4">Eligible Reach</th>
                  <th className="py-3.5 px-4">Estimated Revenue</th>
                  <th className="py-3.5 px-4">Actions</th>
                  <th className="py-3.5 px-4 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {opportunities.map((opp) => {
                  const crossSellPercent = (opp.crossSellRate * 100).toFixed(1);
                  return (
                    <tr
                      key={opp.id}
                      className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">
                            {opp.sourceProductName}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {opp.targetProductName}
                          </span>
                        </div>
                        <span className="text-xs text-neutral-500">
                          {opp.customersTogether} co-purchases from {opp.sourceCustomers} source buyers
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono font-medium">
                        ₹{opp.targetProductPrice.toLocaleString("en-IN")}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {crossSellPercent}%
                          </span>
                          <div className="w-16 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(opp.crossSellRate * 100, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1 font-medium text-neutral-700 dark:text-neutral-300">
                          <Users className="w-3.5 h-3.5 text-neutral-400" />
                          {opp.eligibleCustomerCount} customers
                        </span>
                      </td>
                      <td className="py-4 px-4 font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        ₹{opp.expectedRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                          {opp.actionCount} created
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenOpportunity(opp)}
                          className="gap-1 text-xs font-semibold hover:border-blue-500 hover:text-blue-600"
                        >
                          View Customers
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
