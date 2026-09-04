import { useState, useCallback, useEffect } from "react";
import { RazorpayConnectionInfo } from "@/lib/dashboard/types";

interface UseRazorpayOptions {
  showToast?: (type: "success" | "error" | "info", message: string) => void;
  onRefresh?: () => void;
}

export function useRazorpay(options: UseRazorpayOptions = {}) {
  const { showToast, onRefresh } = options;
  const [connectionInfo, setConnectionInfo] = useState<RazorpayConnectionInfo | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [syncingType, setSyncingType] = useState<"customers" | "orders" | "all" | null>(null);

  const loadConnection = useCallback(async () => {
    try {
      setLoadingConnection(true);
      const res = await fetch("/api/razorpay/connection");
      if (res.ok) {
        const data = await res.json();
        setConnectionInfo(data);
      }
    } catch {
      // Non-critical background fetch failure
    } finally {
      setLoadingConnection(false);
    }
  }, []);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  const handleDisconnectRazorpay = async () => {
    if (!confirm("Are you sure you want to disconnect Razorpay?")) return;
    try {
      const res = await fetch("/api/razorpay/connect", { method: "DELETE" });
      if (res.ok) {
        showToast?.("info", "Razorpay account disconnected.");
        loadConnection();
        onRefresh?.();
      }
    } catch {
      showToast?.("error", "Failed to disconnect Razorpay");
    }
  };

  const handleSyncData = async (type: "customers" | "orders" | "all") => {
    setSyncingType(type);
    try {
      const endpoint =
        type === "customers"
          ? "/api/razorpay/sync/customers"
          : type === "orders"
          ? "/api/razorpay/sync/orders"
          : "/api/razorpay/sync";

      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to sync ${type}`);
      }

      if (type === "customers") {
        showToast?.(
          "success",
          `Customers synced: ${data.syncedCount} new, ${data.updatedCount} updated (${data.totalFound} found).`
        );
      } else if (type === "orders") {
        showToast?.(
          "success",
          `Orders synced: ${data.syncedCount} new (${data.totalFound} found).`
        );
      } else {
        showToast?.(
          "success",
          `Data sync complete: ${data.customers?.totalFound || 0} customers, ${data.orders?.totalFound || 0} orders.`
        );
      }

      loadConnection();
      onRefresh?.();
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : `Failed to sync ${type}`);
    } finally {
      setSyncingType(null);
    }
  };

  return {
    connectionInfo,
    loadingConnection,
    loadConnection,
    syncingType,
    handleDisconnectRazorpay,
    handleSyncData,
  };
}
