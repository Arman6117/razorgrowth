import React from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { ToastNotification } from "@/lib/dashboard/types";

interface ToastNotificationProps {
  toast: ToastNotification | null;
}

export function ToastNotificationBanner({ toast }: ToastNotificationProps) {
  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium transition-all duration-300 ${
        toast.type === "success"
          ? "bg-emerald-900 text-emerald-100 border-emerald-700"
          : toast.type === "error"
          ? "bg-rose-900 text-rose-100 border-rose-700"
          : "bg-neutral-900 text-neutral-100 border-neutral-700"
      }`}
    >
      {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
      {toast.type === "error" && <AlertTriangle className="w-5 h-5 text-rose-400" />}
      {toast.type === "info" && <Info className="w-5 h-5 text-blue-400" />}
      <span>{toast.message}</span>
    </div>
  );
}
