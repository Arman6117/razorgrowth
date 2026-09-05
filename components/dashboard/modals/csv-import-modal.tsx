import React, { useState } from "react";
import { Upload, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: "success" | "error" | "info", message: string) => void;
}

export function CsvImportModal({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}: CsvImportModalProps) {
  const [csvText, setCsvText] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);

  if (!isOpen) return null;

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) {
      showToast("error", "Please paste CSV content or select a file.");
      return;
    }

    setImportingCsv(true);
    try {
      const res = await fetch("/api/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvData: csvText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import catalog");
      }
      showToast(
        "success",
        data.message || `Catalog imported: ${data.createdCount} products created.`
      );
      setCsvText("");
      onSuccess();
      onClose();
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to import catalog"
      );
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
              <Upload className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">
              Import Product Catalog (CSV)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Provide CSV rows with authoritative product pricing. Required columns: <code className="font-mono text-[11px] px-1 rounded bg-neutral-100 dark:bg-neutral-800">name</code>, <code className="font-mono text-[11px] px-1 rounded bg-neutral-100 dark:bg-neutral-800">price</code>.
        </p>

        <form onSubmit={handleImportCsv} className="space-y-3">
          <div>
            <textarea
              rows={8}
              required
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`name,description,category,price,active\nWireless Mouse,Ergonomic wireless mouse,Accessories,1299,true\nMechanical Keyboard,RGB mechanical keyboard,Accessories,4999,true\n4K Ultra Monitor,32-inch 4K UHD display,Monitors,24999,true`}
              className="w-full px-3 py-2 bg-neutral-50/70 dark:bg-neutral-900/50 border border-border rounded-lg text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-neutral-400 resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setCsvText(
                  `name,description,category,price,active\nPro Wireless Earbuds,Active noise cancelling earbuds,Audio,3999,true\nSmart Fitness Band,Water resistant fitness tracker,Wearables,2499,true\nFast Wireless Charger,15W Qi fast charging pad,Accessories,999,true`
                )
              }
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Load Sample Template
            </Button>

            <div className="flex items-center gap-2">
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
                disabled={importingCsv}
                size="sm"
                className="text-xs"
              >
                {importingCsv ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                    Importing...
                  </>
                ) : (
                  "Import Products"
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
