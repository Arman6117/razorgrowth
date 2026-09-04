import React from "react";
import { Button } from "@/components/ui/button";
import { QRCode } from "@/components/qr-code";

interface QrModalProps {
  isOpen: boolean;
  shortUrl?: string | null;
  onClose: () => void;
}

export function QrModal({ isOpen, shortUrl, onClose }: QrModalProps) {
  if (!isOpen || !shortUrl) return null;

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-neutral-200 dark:border-neutral-800 text-center space-y-4">
        <h4 className="font-bold text-neutral-900 dark:text-white text-base">
          Scan to Pay (Razorpay Test Mode)
        </h4>
        <div className="flex justify-center py-2">
          <QRCode value={shortUrl} size={180} />
        </div>
        <p className="text-xs text-neutral-500 break-all font-mono">
          {shortUrl}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="w-full text-xs font-semibold"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
