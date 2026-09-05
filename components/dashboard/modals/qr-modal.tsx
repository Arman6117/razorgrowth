import React from "react";
import { Button } from "@/components/ui/button";
import { QRCode } from "@/components/qr-code";
import { X, QrCode as QrIcon } from "lucide-react";

interface QrModalProps {
  isOpen: boolean;
  shortUrl?: string | null;
  onClose: () => void;
}

export function QrModal({ isOpen, shortUrl, onClose }: QrModalProps) {
  if (!isOpen || !shortUrl) return null;

  return (
    <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card p-5 rounded-xl max-w-sm w-full shadow-2xl border border-border text-center space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrIcon className="w-4 h-4 text-neutral-500" />
            <h4 className="font-bold text-foreground text-sm">
              Scan Payment Link
            </h4>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-center p-4 bg-white rounded-lg border border-border">
          <QRCode value={shortUrl} size={180} />
        </div>

        <p className="text-[11px] text-muted-foreground break-all font-mono">
          {shortUrl}
        </p>

        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="w-full text-xs"
        >
          Close
        </Button>
      </div>
    </div>
  );
}
