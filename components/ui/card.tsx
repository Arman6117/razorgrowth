import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "subtle" | "featured";
}

export function Card({
  className,
  variant = "default",
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        variant === "default" &&
          "bg-white dark:bg-neutral-900 border-neutral-200/90 dark:border-neutral-800 shadow-xs",
        variant === "elevated" &&
          "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm",
        variant === "subtle" &&
          "bg-neutral-50/80 dark:bg-neutral-900/50 border-neutral-200/70 dark:border-neutral-800/60",
        variant === "featured" &&
          "bg-white dark:bg-neutral-900 border-indigo-300/80 dark:border-indigo-800/80 shadow-xs ring-1 ring-indigo-500/10",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1 p-5 pb-3 border-b border-neutral-100 dark:border-neutral-800/70", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-5 pt-0", className)}
      {...props}
    />
  );
}
