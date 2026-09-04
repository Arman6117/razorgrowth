import React, { useState } from "react";
import { Key, X, Loader2 } from "lucide-react";
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
              <Key className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-white">
              Connect Razorpay Test Mode
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-neutral-500">
          Provide your Razorpay Test Key ID and Key Secret. Credentials are encrypted at rest using AES-256-GCM.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
              Key ID
            </label>
            <input
              type="text"
              required
              value={connectKeyId}
              onChange={(e) => setConnectKeyId(e.target.value)}
              placeholder="rzp_test_..."
              className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
              Key Secret
            </label>
            <input
              type="password"
              required
              value={connectKeySecret}
              onChange={(e) => setConnectKeySecret(e.target.value)}
              placeholder="••••••••••••••••••••"
              className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
              disabled={connecting}
              size="sm"
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Validating with Razorpay...
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
