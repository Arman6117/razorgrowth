import React from "react";
import { X, Sparkles, RefreshCw, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { OpportunityItem, CustomerItem } from "@/lib/dashboard/types";

interface OpportunityDrawerProps {
  selectedOpportunity: OpportunityItem | null;
  eligibleCustomers: CustomerItem[];
  loadingCustomers: boolean;
  creatingBatchActions: boolean;
  bulkApproving: boolean;
  creatingActionForCustomer: string | null;
  onClose: () => void;
  onCreateBatchGrowthActions: () => void;
  onBulkApprove: () => void;
  onCreateGrowthAction: (customer: CustomerItem) => void;
  onOpenAction: (actionId: string) => void;
}

export function OpportunityDrawer({
  selectedOpportunity,
  eligibleCustomers,
  loadingCustomers,
  creatingBatchActions,
  bulkApproving,
  creatingActionForCustomer,
  onClose,
  onCreateBatchGrowthActions,
  onBulkApprove,
  onCreateGrowthAction,
  onOpenAction,
}: OpportunityDrawerProps) {
  if (!selectedOpportunity) return null;

  const uncreatedCustomers = eligibleCustomers.filter((c) => !c.existingAction);
  const pendingApprovalCustomers = eligibleCustomers.filter(
    (c) => c.existingAction?.status === "PENDING_APPROVAL"
  );
  const showBatchToolbar =
    eligibleCustomers.length > 0 &&
    !loadingCustomers &&
    (uncreatedCustomers.length > 0 || pendingApprovalCustomers.length > 0);

  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 h-full shadow-2xl flex flex-col border-l border-neutral-200 dark:border-neutral-800">
        {/* Header */}
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-start justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Opportunity Review
            </span>
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
              {selectedOpportunity.sourceProductName} → {selectedOpportunity.targetProductName}
            </h3>
            <p className="text-xs text-neutral-500 mt-1">
              Target Offer Price:{" "}
              <strong className="text-neutral-900 dark:text-white">
                ₹{selectedOpportunity.targetProductPrice}
              </strong>{" "}
              • Cross-sell Conversion Rate:{" "}
              <strong>{(selectedOpportunity.crossSellRate * 100).toFixed(1)}%</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Eligible Customers ({eligibleCustomers.length})
            </h4>
            <span className="text-xs text-neutral-500">
              Verified: Bought {selectedOpportunity.sourceProductName}, never bought{" "}
              {selectedOpportunity.targetProductName}
            </span>
          </div>

          {/* Batch Action Toolbar */}
          {showBatchToolbar && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Opportunity Batch Automation
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {uncreatedCustomers.length > 0 && (
                  <Button
                    onClick={onCreateBatchGrowthActions}
                    disabled={creatingBatchActions}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
                  >
                    {creatingBatchActions ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Creating Actions...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        Create Actions for All {uncreatedCustomers.length} Eligible Customers
                      </>
                    )}
                  </Button>
                )}

                {pendingApprovalCustomers.length > 0 && (
                  <Button
                    onClick={onBulkApprove}
                    disabled={bulkApproving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
                  >
                    {bulkApproving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Approving Actions...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                        Approve All {pendingApprovalCustomers.length} Pending Actions
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {loadingCustomers ? (
            <div className="py-12 text-center text-neutral-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Checking customer eligibility criteria...
            </div>
          ) : eligibleCustomers.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 rounded-xl bg-neutral-50 dark:bg-neutral-800/40">
              No eligible customers remaining for this product pair.
            </div>
          ) : (
            <div className="space-y-3">
              {eligibleCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                      {customer.name}
                      {customer.existingAction && (
                        <StatusBadge status={customer.existingAction.status} />
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">{customer.email}</div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                      History: {customer.totalPaidOrders} paid orders • Total Spend: ₹
                      {customer.totalSpend.toLocaleString("en-IN")}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {customer.existingAction ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenAction(customer.existingAction!.id)}
                        className="text-xs font-semibold"
                      >
                        Open Action
                        <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => onCreateGrowthAction(customer)}
                        disabled={creatingActionForCustomer === customer.id}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                      >
                        {creatingActionForCustomer === customer.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 mr-1" />
                            Create GrowthAction
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
