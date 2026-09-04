import { useState, useCallback, useEffect } from "react";
import { GrowthActionDetail } from "@/lib/dashboard/types";

interface UseGrowthActionOptions {
  merchantId?: string | null;
  showToast?: (type: "success" | "error" | "info", message: string) => void;
  onActionUpdated?: () => void;
}

export function useGrowthAction(
  actionId?: string | null,
  options?: UseGrowthActionOptions
) {
  const { merchantId, showToast, onActionUpdated } = options || {};
  const [action, setAction] = useState<GrowthActionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [resending, setResending] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAction = useCallback(async () => {
    if (!actionId || !merchantId) {
      setAction(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionId}?merchantId=${merchantId}`);
      if (res.ok) {
        const data = await res.json();
        setAction(data.action || null);
        setError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Failed to load GrowthAction details");
        showToast?.("error", "Failed to load GrowthAction details.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error loading action");
      showToast?.("error", "Network error loading action.");
    } finally {
      setLoading(false);
    }
  }, [actionId, merchantId, showToast]);

  useEffect(() => {
    loadAction();
  }, [loadAction]);

  const approve = async (): Promise<boolean> => {
    if (!actionId || !merchantId) return false;
    setApproving(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to approve action");
      }

      showToast?.("success", "GrowthAction APPROVED! Action is now ready for execution.");
      await loadAction();
      onActionUpdated?.();
      return true;
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : "Approval failed");
      return false;
    } finally {
      setApproving(false);
    }
  };

  const execute = async (description?: string): Promise<boolean> => {
    if (!actionId || !merchantId || !action) return false;
    setExecuting(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId,
          description:
            description || `Cross-sell offer: ${action.parameters.targetProductName}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to execute action via Razorpay");
      }

      showToast?.("success", "Razorpay Payment Link generated in Test Mode!");
      await loadAction();
      onActionUpdated?.();
      return true;
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : "Execution failed");
      return false;
    } finally {
      setExecuting(false);
    }
  };

  const resendEmail = async (): Promise<boolean> => {
    if (!actionId) return false;
    setResending(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionId}/resend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend payment link email");
      }

      showToast?.("success", "Payment link email notification resent via Razorpay!");
      await loadAction();
      onActionUpdated?.();
      return true;
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : "Error resending email");
      return false;
    } finally {
      setResending(false);
    }
  };

  const simulatePayment = async (): Promise<boolean> => {
    if (!actionId || !merchantId) return false;
    setSimulating(true);
    try {
      showToast?.("info", "Simulating verified Razorpay payment webhook...");
      const res = await fetch(`/api/growth-actions/${actionId}/simulate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process payment confirmation");
      }

      showToast?.(
        "success",
        "Payment confirmed via Razorpay webhook! Status updated to EXECUTED."
      );
      await loadAction();
      onActionUpdated?.();
      return true;
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : "Error confirming payment");
      return false;
    } finally {
      setSimulating(false);
    }
  };

  return {
    action,
    loading,
    approving,
    executing,
    resending,
    simulating,
    error,
    approve,
    execute,
    resendEmail,
    simulatePayment,
    refresh: loadAction,
  };
}
