import React from "react";
import { X, Sparkles, RefreshCw, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { FinancialValue } from "@/components/ui/financial-value";
import { OpportunityItem, CustomerItem } from "@/lib/dashboard/types";
import { useOpportunityCustomers } from "@/hooks/use-opportunity-customers";
import { useGrowthActionCreation } from "@/hooks/use-growth-action-creation";

interface OpportunityDrawerProps {
  selectedOpportunity: OpportunityItem | null;
  merchantId?: string | null;
  onClose: () => void;
  onOpenAction: (actionId: string) => void;
  onActionCreatedOrApproved?: () => void;
  showToast?: (type: "success" | "error" | "info", message: string) => void;
}

export function OpportunityDrawer({
  selectedOpportunity,
  merchantId,
  onClose,
  onOpenAction,
  onActionCreatedOrApproved,
  showToast,
}: OpportunityDrawerProps) {
  const { eligibleCustomers, loadingCustomers, refreshOpportunityCustomers } =
    useOpportunityCustomers(selectedOpportunity?.id);

  const {
    creatingActionForCustomer,
    creatingBatchActions,
    bulkApproving,
    createGrowthAction,
    createBatchGrowthActions,
    bulkApprove,
  } = useGrowthActionCreation({
    showToast,
    onSuccess: () => {
      refreshOpportunityCustomers();
      onActionCreatedOrApproved?.();
    },
  });

  if (!selectedOpportunity) return null;

  const uncreatedCustomers = eligibleCustomers.filter((c) => !c.existingAction);
  const pendingApprovalCustomers = eligibleCustomers.filter(
    (c) => c.existingAction?.status === "PENDING_APPROVAL"
  );
  const showBatchToolbar =
    eligibleCustomers.length > 0 &&
    !loadingCustomers &&
    (uncreatedCustomers.length > 0 || pendingApprovalCustomers.length > 0);

  const handleCreateBatch = async () => {
    if (!merchantId || !selectedOpportunity) return;
    const uncreatedCustomerIds = eligibleCustomers
      .filter((c) => !c.existingAction)
      .map((c) => c.id);
    await createBatchGrowthActions({
      merchantId,
      opportunityId: selectedOpportunity.id,
      customerIds: uncreatedCustomerIds,
      sourceProductId: selectedOpportunity.sourceProductId,
      targetProductId: selectedOpportunity.targetProductId,
    });
  };

  const handleBulkApprove = async () => {
    if (!merchantId || !selectedOpportunity) return;
    await bulkApprove(selectedOpportunity.id, merchantId);
  };

  const handleCreateSingle = async (customer: CustomerItem) => {
    if (!merchantId || !selectedOpportunity) return;
    const actionId = await createGrowthAction(
      {
        merchantId,
        opportunityId: selectedOpportunity.id,
        customerId: customer.id,
        sourceProductId: selectedOpportunity.sourceProductId,
        targetProductId: selectedOpportunity.targetProductId,
      },
      customer.name
    );
    if (actionId) {
      onOpenAction(actionId);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="w-full max-w-2xl bg-card h-full shadow-2xl flex flex-col border-l border-border">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Audience Eligibility Review
            </span>
            <h3 className="text-base font-bold text-foreground mt-1">
              {selectedOpportunity.sourceProductName} → {selectedOpportunity.targetProductName}
            </h3>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
              <span>
                Target Price: <FinancialValue value={selectedOpportunity.targetProductPrice} size="xs" variant="default" />
              </span>
              <span>•</span>
              <span>
                Conversion Rate: <strong>{(selectedOpportunity.crossSellRate * 100).toFixed(1)}%</strong>
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content List */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground">
              Eligible Customers ({eligibleCustomers.length})
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Verified: Purchased {selectedOpportunity.sourceProductName}
            </span>
          </div>

          {/* Batch Action Toolbar */}
          {showBatchToolbar && (
            <div className="p-3.5 rounded-lg bg-neutral-50/80 dark:bg-neutral-900/60 border border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-neutral-500" />
                  Opportunity Batch Automation
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {uncreatedCustomers.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleCreateBatch}
                    disabled={creatingBatchActions}
                    className="text-xs"
                  >
                    {creatingBatchActions ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                        Creating Actions...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1.5" />
                        Prepare All {uncreatedCustomers.length} Actions
                      </>
                    )}
                  </Button>
                )}

                {pendingApprovalCustomers.length > 0 && (
                  <Button
                    variant="growth"
                    size="sm"
                    onClick={handleBulkApprove}
                    disabled={bulkApproving}
                    className="text-xs"
                  >
                    {bulkApproving ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                        Approving Actions...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3 h-3 mr-1.5" />
                        Approve All {pendingApprovalCustomers.length} Pending
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {loadingCustomers ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-muted-foreground" />
              Checking customer eligibility criteria...
            </div>
          ) : eligibleCustomers.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground rounded-lg bg-neutral-50 dark:bg-neutral-800/40 border border-border">
              No eligible customers remaining for this product pair.
            </div>
          ) : (
            <div className="space-y-2.5">
              {eligibleCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="p-3.5 rounded-lg border border-border bg-neutral-50/50 dark:bg-neutral-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-xs text-foreground flex items-center gap-2">
                      {customer.name}
                      {customer.existingAction && (
                        <StatusBadge status={customer.existingAction.status} size="sm" />
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{customer.email}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      History: {customer.totalPaidOrders} paid orders • Total Spend: <FinancialValue value={customer.totalSpend} size="xs" variant="muted" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {customer.existingAction ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenAction(customer.existingAction!.id)}
                        className="text-xs"
                      >
                        Inspect
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleCreateSingle(customer)}
                        disabled={creatingActionForCustomer === customer.id}
                        className="text-xs"
                      >
                        {creatingActionForCustomer === customer.id ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 mr-1" />
                            Prepare Action
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
