import React from "react";
import { cn } from "@/lib/utils";

export interface FinancialValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  value?: number | string | null;
  currency?: string;
  variant?: "default" | "revenue" | "opportunity" | "muted" | "warning";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  decimals?: number;
}

/**
 * Format a number using Indian numbering system (Lakhs, Crores) if compact,
 * or standard Indian locale comma separators.
 */
export function formatCurrencyValue(
  value: number,
  options?: { compact?: boolean; decimals?: number }
): string {
  if (isNaN(value)) return "0";

  const { compact = false, decimals } = options || {};

  if (compact) {
    if (Math.abs(value) >= 10000000) {
      return (value / 10000000).toFixed(decimals ?? 2) + "Cr";
    }
    if (Math.abs(value) >= 100000) {
      return (value / 100000).toFixed(decimals ?? 1) + "L";
    }
    if (Math.abs(value) >= 1000) {
      return (value / 1000).toFixed(decimals ?? 1) + "k";
    }
  }

  return value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  });
}

const sizeClasses = {
  xs: "text-xs font-medium",
  sm: "text-xs font-semibold",
  md: "text-sm font-semibold",
  lg: "text-base font-bold",
  xl: "text-xl font-bold tracking-tight",
  "2xl": "text-2xl font-extrabold tracking-tight",
};

const variantClasses = {
  default: "text-neutral-900 dark:text-neutral-100",
  revenue: "text-emerald-600 dark:text-emerald-400",
  opportunity: "text-neutral-900 dark:text-neutral-100",
  muted: "text-neutral-500 dark:text-neutral-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export function FinancialValue({
  value,
  currency = "₹",
  variant = "default",
  size = "md",
  prefix,
  suffix,
  compact = false,
  decimals,
  className,
  ...props
}: FinancialValueProps) {
  const normalizedValue = value ?? 0;
  const displayValue = typeof normalizedValue === "number"
    ? formatCurrencyValue(normalizedValue, { compact, decimals })
    : normalizedValue;

  const symbol = currency === "INR" ? "₹" : currency;

  return (
    <span
      className={cn(
        "inline-flex items-baseline tabular-nums",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {prefix && <span className="mr-0.5 opacity-80">{prefix}</span>}
      <span className="text-[0.88em] font-sans font-medium mr-0.5 opacity-70 select-none">
        {symbol}
      </span>
      <span>{displayValue}</span>
      {suffix && <span className="ml-1 text-[0.8em] font-sans font-normal opacity-70">{suffix}</span>}
    </span>
  );
}
