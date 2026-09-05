import React from "react";
import { Sparkles, Bot, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AIBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "subtle" | "outline" | "solid";
  icon?: "sparkles" | "bot" | "cpu" | "none";
  children?: React.ReactNode;
}

export function AIBadge({
  variant = "subtle",
  icon = "sparkles",
  children = "Intelligence",
  className,
  ...props
}: AIBadgeProps) {
  const IconComponent = icon === "sparkles" ? Sparkles : icon === "bot" ? Bot : icon === "cpu" ? Cpu : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight select-none",
        variant === "subtle" &&
          "bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50",
        variant === "outline" &&
          "bg-transparent text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800",
        variant === "solid" &&
          "bg-indigo-600 text-white shadow-xs font-semibold",
        className
      )}
      {...props}
    >
      {IconComponent && <IconComponent className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />}
      <span>{children}</span>
    </span>
  );
}
