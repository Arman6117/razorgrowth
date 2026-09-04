import React, { useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
              <Upload className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-base text-neutral-900 dark:text-white">
              Import Product Catalog (CSV)
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
          Paste your CSV content below or load a template. Required columns: <code>name</code>, <code>price</code>.
        </p>

        <form onSubmit={handleImportCsv} className="space-y-3">
          <div>
            <textarea
              rows={8}
              required
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`name,description,category,price,active\nWireless Mouse,Ergonomic wireless mouse,Accessories,1299,true\nMechanical Keyboard,RGB mechanical keyboard,Accessories,4999,true\n4K Ultra Monitor,32-inch 4K UHD display,Monitors,24999,true`}
              className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCsvText(
                  `name,description,category,price,active\nPro Wireless Earbuds,Active noise cancelling earbuds,Audio,3999,true\nSmart Fitness Band,Water resistant fitness tracker,Wearables,2499,true\nFast Wireless Charger,15W Qi fast charging pad,Accessories,999,true`
                )
              }
              className="text-[11px] text-neutral-500"
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
                disabled={importingCsv}
                size="sm"
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {importingCsv ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
