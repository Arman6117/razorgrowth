import React from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { ToastNotification } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

interface ToastNotificationProps {
  toast: ToastNotification | null;
}

export function ToastNotificationBanner({ toast }: ToastNotificationProps) {
  if (!toast) return null;

  return (
    <div
      role="alert"
      className={cn(
        "fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg shadow-lg border text-xs font-medium transition-all duration-200 bg-card text-foreground",
        toast.type === "success" && "border-emerald-300 dark:border-emerald-800 ring-1 ring-emerald-500/10",
        toast.type === "error" && "border-rose-300 dark:border-rose-800 ring-1 ring-rose-500/10",
        toast.type === "info" && "border-border"
      )}
    >
      {toast.type === "success" && (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
      )}
      {toast.type === "error" && (
        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
      )}
      {toast.type === "info" && (
        <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
      )}
      <span className="leading-snug">{toast.message}</span>
    </div>
  );
}
