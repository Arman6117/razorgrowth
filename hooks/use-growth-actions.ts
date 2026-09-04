import { useState, useCallback, useEffect } from "react";
import {
  MerchantInfo,
  OpportunityItem,
  CustomerItem,
  GrowthActionDetail,
} from "@/lib/dashboard/types";
import { RankedOpportunityItem } from "@/components/growth-intelligence-panel";

interface UseGrowthActionsOptions {
  merchant: MerchantInfo | null;
  opportunities: OpportunityItem[];
  rankedOpportunities: RankedOpportunityItem[];
  showToast: (type: "success" | "error" | "info", message: string) => void;
  onRefreshDashboard: () => void;
}

export function useGrowthActions({
  merchant,
  opportunities,
  rankedOpportunities,
  showToast,
  onRefreshDashboard,
}: UseGrowthActionsOptions) {
  // Selected Opportunity & Customers drawer state
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityItem | null>(null);
  const [eligibleCustomers, setEligibleCustomers] = useState<CustomerItem[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Selected GrowthAction & Detail modal state
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionDetail, setActionDetail] = useState<GrowthActionDetail | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  // Operation action loading states
  const [creatingActionForCustomer, setCreatingActionForCustomer] = useState<string | null>(null);
  const [creatingBatchActions, setCreatingBatchActions] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [simulatingWebhook, setSimulatingWebhook] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  // Refresh Eligible Customers for open Opportunity
  const refreshOpportunityCustomers = useCallback(async (oppId: string) => {
    try {
      const res = await fetch(`/api/opportunities/${oppId}/customers?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        setEligibleCustomers(data.customers || []);
      }
    } catch (err) {
      console.error("Error refreshing customers:", err);
    }
  }, []);

  // Load Eligible Customers when an Opportunity is opened
  const handleOpenOpportunity = useCallback(async (opp: OpportunityItem) => {
    setSelectedOpportunity(opp);
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/opportunities/${opp.id}/customers?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        setEligibleCustomers(data.customers || []);
      } else {
        showToast("error", "Failed to load eligible customers for opportunity.");
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Network error fetching customers.");
    } finally {
      setLoadingCustomers(false);
    }
  }, [showToast]);

  const handleSelectOpportunityById = useCallback((opportunityId: string) => {
    const found = opportunities.find((o) => o.id === opportunityId);
    if (found) {
      handleOpenOpportunity(found);
    } else {
      const ranked = rankedOpportunities.find((o) => o.id === opportunityId);
      if (ranked && ranked.id) {
        handleOpenOpportunity({
          id: ranked.id,
          merchantId: ranked.merchantId,
          sourceProductId: ranked.sourceProductId || "",
          sourceProductName: ranked.evidence.sourceProductName || "Source Product",
          targetProductId: ranked.targetProductId,
          targetProductName: ranked.recommendedProductName,
          targetProductPrice: ranked.evidence.targetPrice || 0,
          sourceCustomers: ranked.evidence.sourceCustomers || 0,
          customersTogether: ranked.evidence.customersTogether || 0,
          eligibleCustomerCount: ranked.targetCustomerCount,
          eligibleCustomerIds: [],
          crossSellRate: ranked.confidence,
          expectedRevenue: ranked.estimatedValue,
          status: ranked.status,
          actionCount: 0,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }, [opportunities, rankedOpportunities, handleOpenOpportunity]);

  // Periodic auto-revalidation while Opportunity Review drawer is open
  useEffect(() => {
    if (!selectedOpportunity) return;
    const interval = setInterval(() => {
      refreshOpportunityCustomers(selectedOpportunity.id);
    }, 3500);
    return () => clearInterval(interval);
  }, [selectedOpportunity, refreshOpportunityCustomers]);

  // Load GrowthAction Details by ID
  const handleOpenAction = useCallback(async (actionId: string) => {
    setActiveActionId(actionId);
    setLoadingAction(true);
    try {
      if (!merchant) return;
      const res = await fetch(`/api/growth-actions/${actionId}?merchantId=${merchant.id}`);
      if (res.ok) {
        const data = await res.json();
        setActionDetail(data.action);
      } else {
        showToast("error", "Failed to load GrowthAction details.");
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Network error loading action.");
    } finally {
      setLoadingAction(false);
    }
  }, [merchant, showToast]);

  // Create GrowthAction for single Customer
  const handleCreateGrowthAction = async (customer: CustomerItem) => {
    if (!merchant || !selectedOpportunity) return;
    setCreatingActionForCustomer(customer.id);
    try {
      const res = await fetch("/api/growth-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          opportunityId: selectedOpportunity.id,
          customerId: customer.id,
          sourceProductId: selectedOpportunity.sourceProductId,
          targetProductId: selectedOpportunity.targetProductId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create GrowthAction");
      }

      showToast(
        "success",
        `GrowthAction created for ${customer.name}! Status: PENDING_APPROVAL`
      );

      await handleOpenOpportunity(selectedOpportunity);
      onRefreshDashboard();
      handleOpenAction(data.action.id);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error creating action");
    } finally {
      setCreatingActionForCustomer(null);
    }
  };

  // Create GrowthActions in Batch for All Eligible Customers
  const handleCreateBatchGrowthActions = async () => {
    if (!merchant || !selectedOpportunity) return;
    const uncreatedCustomerIds = eligibleCustomers
      .filter((c) => !c.existingAction)
      .map((c) => c.id);

    if (uncreatedCustomerIds.length === 0) {
      showToast("info", "All eligible customers already have GrowthActions created.");
      return;
    }

    setCreatingBatchActions(true);
    try {
      const res = await fetch("/api/growth-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          opportunityId: selectedOpportunity.id,
          customerIds: uncreatedCustomerIds,
          sourceProductId: selectedOpportunity.sourceProductId,
          targetProductId: selectedOpportunity.targetProductId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create batch GrowthActions");
      }

      showToast(
        "success",
        `Batch created ${data.createdCount} GrowthActions in PENDING_APPROVAL! (${data.duplicateCount} duplicates, ${data.rejectedCount} skipped)`
      );

      await refreshOpportunityCustomers(selectedOpportunity.id);
      onRefreshDashboard();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error creating batch actions");
    } finally {
      setCreatingBatchActions(false);
    }
  };

  // Merchant Approves Single GrowthAction
  const handleApproveAction = async () => {
    if (!merchant || !actionDetail) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionDetail.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: merchant.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to approve action");
      }

      showToast("success", "GrowthAction APPROVED! Action is now ready for execution.");
      await handleOpenAction(actionDetail.id);
      if (selectedOpportunity) {
        await refreshOpportunityCustomers(selectedOpportunity.id);
      }
      onRefreshDashboard();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  // Bulk Approve All PENDING_APPROVAL Actions for Selected Opportunity
  const handleBulkApprove = async () => {
    if (!merchant || !selectedOpportunity) return;
    setBulkApproving(true);
    try {
      const res = await fetch("/api/growth-actions/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          opportunityId: selectedOpportunity.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to bulk approve actions");
      }

      showToast(
        "success",
        `Successfully approved ${data.approvedCount} GrowthActions! Actions are now ready for execution.`
      );

      await refreshOpportunityCustomers(selectedOpportunity.id);
      onRefreshDashboard();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error bulk approving actions");
    } finally {
      setBulkApproving(false);
    }
  };

  // Execute GrowthAction (Generate Razorpay Payment Link)
  const handleExecuteAction = async () => {
    if (!merchant || !actionDetail) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionDetail.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          description: `Cross-sell offer: ${actionDetail.parameters.targetProductName}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to execute action via Razorpay");
      }

      showToast("success", "Razorpay Payment Link generated in Test Mode!");
      await handleOpenAction(actionDetail.id);
      if (selectedOpportunity) {
        await refreshOpportunityCustomers(selectedOpportunity.id);
      }
      onRefreshDashboard();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  // Resend Razorpay Payment Link Email Notification
  const handleResendEmail = async () => {
    if (!merchant || !actionDetail) return;
    setResendingEmail(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionDetail.id}/resend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend payment link email");
      }
      showToast("success", "Payment link email notification resent via Razorpay!");
      await handleOpenAction(actionDetail.id);
      onRefreshDashboard();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error resending email");
    } finally {
      setResendingEmail(false);
    }
  };

  // Simulate Webhook confirmation (Demo helper for instant webhook verification)
  const handleSimulateWebhook = async () => {
    if (!merchant || !actionDetail) return;
    setSimulatingWebhook(true);
    try {
      showToast("info", "Simulating verified Razorpay payment webhook...");
      const res = await fetch(`/api/growth-actions/${actionDetail.id}/simulate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: merchant.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process payment confirmation");
      }

      showToast("success", "Payment confirmed via Razorpay webhook! Status updated to EXECUTED.");
      await handleOpenAction(actionDetail.id);
      if (selectedOpportunity) {
        await refreshOpportunityCustomers(selectedOpportunity.id);
      }
      onRefreshDashboard();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error confirming payment");
    } finally {
      setSimulatingWebhook(false);
    }
  };

  return {
    selectedOpportunity,
    setSelectedOpportunity,
    eligibleCustomers,
    loadingCustomers,
    activeActionId,
    setActiveActionId,
    actionDetail,
    setActionDetail,
    loadingAction,
    creatingActionForCustomer,
    creatingBatchActions,
    bulkApproving,
    approving,
    executing,
    simulatingWebhook,
    resendingEmail,
    refreshOpportunityCustomers,
    handleOpenOpportunity,
    handleSelectOpportunityById,
    handleOpenAction,
    handleCreateGrowthAction,
    handleCreateBatchGrowthActions,
    handleApproveAction,
    handleBulkApprove,
    handleExecuteAction,
    handleResendEmail,
    handleSimulateWebhook,
  };
}
