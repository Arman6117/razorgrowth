import React, { useState } from "react";
import { Key, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RazorpayConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  showToast?: (type: "success" | "error" | "info", message: string) => void;
}

export function RazorpayConnectModal({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}: RazorpayConnectModalProps) {
  const [connectKeyId, setConnectKeyId] = useState("");
  const [connectKeySecret, setConnectKeySecret] = useState("");
  const [connecting, setConnecting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectKeyId.trim() || !connectKeySecret.trim()) {
      showToast?.("error", "Please provide both Razorpay Key ID and Key Secret.");
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
      showToast?.("success", "Razorpay Test Mode connected successfully!");
      setConnectKeyId("");
      setConnectKeySecret("");
      onSuccess?.();
      onClose();
    } catch (err) {
      showToast?.("error", err instanceof Error ? err.message : "Failed to connect Razorpay");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
              <Key className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">
              Connect Razorpay Gateway
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Provide your Razorpay Test Key ID and Key Secret. Credentials are encrypted at rest using AES-256-GCM.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Key ID
            </label>
            <input
              type="text"
              required
              value={connectKeyId}
              onChange={(e) => setConnectKeyId(e.target.value)}
              placeholder="rzp_test_..."
              className="w-full px-3 py-2 bg-neutral-50/70 dark:bg-neutral-900/50 border border-border rounded-lg text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Key Secret
            </label>
            <input
              type="password"
              required
              value={connectKeySecret}
              onChange={(e) => setConnectKeySecret(e.target.value)}
              placeholder="••••••••••••••••••••"
              className="w-full px-3 py-2 bg-neutral-50/70 dark:bg-neutral-900/50 border border-border rounded-lg text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-neutral-400"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={connecting}
              size="sm"
              className="text-xs"
            >
              {connecting ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                  Validating...
                </>
              ) : (
                "Save & Connect"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
