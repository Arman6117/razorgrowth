import React from "react";
import {
  Clock,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type GrowthActionStatusType =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "EXECUTED"
  | "FAILED"
  | "REJECTED"
  | string;

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: GrowthActionStatusType;
  size?: "sm" | "default";
}

export function StatusBadge({ status, size = "default", className, ...props }: StatusBadgeProps) {
  const sizeClasses = size === "sm"
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2 py-0.5 text-[11px]";

  switch (status) {
    case "PENDING_APPROVAL":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 select-none",
            sizeClasses,
            className
          )}
          {...props}
        >
          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Pending Approval</span>
        </span>
      );

    case "APPROVED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 select-none",
            sizeClasses,
            className
          )}
          {...props}
        >
          <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>Approved</span>
        </span>
      );

    case "EXECUTING":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 select-none",
            sizeClasses,
            className
          )}
          {...props}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600 dark:bg-indigo-400"></span>
          </span>
          <span>Link Active</span>
        </span>
      );

    case "EXECUTED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 select-none",
            sizeClasses,
            className
          )}
          {...props}
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Paid & Executed</span>
        </span>
      );

    case "FAILED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 select-none",
            sizeClasses,
            className
          )}
          {...props}
        >
          <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>Failed</span>
        </span>
      );

    case "REJECTED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 select-none",
            sizeClasses,
            className
          )}
          {...props}
        >
          <X className="w-3 h-3 text-neutral-400 shrink-0" />
          <span>Rejected</span>
        </span>
      );

    default:
      return (
        <span
          className={cn(
            "inline-flex items-center rounded-md font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 select-none",
            sizeClasses,
            className
          )}
          {...props}
        >
          {status}
        </span>
      );
  }
}
