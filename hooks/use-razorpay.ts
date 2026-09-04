import React, { useState } from "react";

interface UseRazorpayOptions {
  showToast: (type: "success" | "error" | "info", message: string) => void;
  onRefresh: () => void;
}

export function useRazorpay({ showToast, onRefresh }: UseRazorpayOptions) {
  const [connectKeyId, setConnectKeyId] = useState("");
  const [connectKeySecret, setConnectKeySecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncingType, setSyncingType] = useState<"customers" | "orders" | "all" | null>(null);

  const handleConnectRazorpay = async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();
    if (!connectKeyId.trim() || !connectKeySecret.trim()) {
      showToast("error", "Please provide both Razorpay Key ID and Key Secret.");
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch("/api/razorpay/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyId: connectKeyId.trim(),
          keySecret: connectKeySecret.trim(),
          mode: "TEST",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to validate Razorpay credentials");
      }
      showToast("success", "Razorpay Test Mode connected successfully!");
      setConnectKeyId("");
      setConnectKeySecret("");
      if (onSuccess) {
        onSuccess();
      }
      onRefresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to connect Razorpay");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectRazorpay = async () => {
    if (!confirm("Are you sure you want to disconnect Razorpay?")) return;
    try {
      const res = await fetch("/api/razorpay/connect", { method: "DELETE" });
      if (res.ok) {
        showToast("info", "Razorpay account disconnected.");
        onRefresh();
      }
    } catch {
      showToast("error", "Failed to disconnect Razorpay");
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
        showToast("success", `Customers synced: ${data.syncedCount} new, ${data.updatedCount} updated (${data.totalFound} found).`);
      } else if (type === "orders") {
        showToast("success", `Orders synced: ${data.syncedCount} new (${data.totalFound} found).`);
      } else {
        showToast("success", `Data sync complete: ${data.customers?.totalFound || 0} customers, ${data.orders?.totalFound || 0} orders.`);
      }

      onRefresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : `Failed to sync ${type}`);
    } finally {
      setSyncingType(null);
    }
  };

  return {
    connectKeyId,
    setConnectKeyId,
    connectKeySecret,
    setConnectKeySecret,
    connecting,
    syncingType,
    handleConnectRazorpay,
    handleDisconnectRazorpay,
    handleSyncData,
  };
}
