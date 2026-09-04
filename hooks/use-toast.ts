import { useState, useCallback } from "react";
import { ToastNotification } from "@/lib/dashboard/types";

export function useToast() {
  const [toast, setToast] = useState<ToastNotification | null>(null);

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  return {
    toast,
    showToast,
    clearToast,
  };
}
