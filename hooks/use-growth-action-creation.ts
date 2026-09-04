import { useState } from "react";

interface SingleActionParams {
  merchantId: string;
  opportunityId: string;
  customerId: string;
  sourceProductId: string;
  targetProductId: string;
}

interface BatchActionParams {
  merchantId: string;
  opportunityId: string;
  customerIds: string[];
  sourceProductId: string;
  targetProductId: string;
}

interface UseGrowthActionCreationOptions {
  showToast?: (type: "success" | "error" | "info", message: string) => void;
  onSuccess?: () => void;
}

export function useGrowthActionCreation(options?: UseGrowthActionCreationOptions) {
  const { showToast, onSuccess } = options || {};
  const [creatingActionForCustomer, setCreatingActionForCustomer] = useState<string | null>(null);
  const [creatingBatchActions, setCreatingBatchActions] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  const createGrowthAction = async (
    params: SingleActionParams,
    customerName?: string
  ): Promise<string | null> => {
    setCreatingActionForCustomer(params.customerId);
    try {
      const res = await fetch("/api/growth-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create GrowthAction");
      }

      showToast?.(
        "success",
        `GrowthAction created for ${customerName || "customer"}! Status: PENDING_APPROVAL`
      );

      onSuccess?.();
      return (data.action?.id as string) || null;
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : "Error creating action");
      return null;
    } finally {
      setCreatingActionForCustomer(null);
    }
  };

  const createBatchGrowthActions = async (params: BatchActionParams): Promise<boolean> => {
    if (params.customerIds.length === 0) {
      showToast?.("info", "All eligible customers already have GrowthActions created.");
      return false;
    }

    setCreatingBatchActions(true);
    try {
      const res = await fetch("/api/growth-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create batch GrowthActions");
      }

      showToast?.(
        "success",
        `Batch created ${data.createdCount} GrowthActions in PENDING_APPROVAL! (${data.duplicateCount} duplicates, ${data.rejectedCount} skipped)`
      );

      onSuccess?.();
      return true;
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : "Error creating batch actions");
      return false;
    } finally {
      setCreatingBatchActions(false);
    }
  };

  const bulkApprove = async (opportunityId: string, merchantId: string): Promise<boolean> => {
    setBulkApproving(true);
    try {
      const res = await fetch("/api/growth-actions/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId, opportunityId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to bulk approve actions");
      }

      showToast?.(
        "success",
        `Successfully approved ${data.approvedCount} GrowthActions! Actions are now ready for execution.`
      );

      onSuccess?.();
      return true;
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : "Error bulk approving actions");
      return false;
    } finally {
      setBulkApproving(false);
    }
  };

  return {
    creatingActionForCustomer,
    creatingBatchActions,
    bulkApproving,
    createGrowthAction,
    createBatchGrowthActions,
    bulkApprove,
  };
}
