"use client";

import React from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CreditCard,
  Bot,
  User,
  Zap,
  RefreshCw,
  Mail,
  Send,
} from "lucide-react";
import { AuditEventItem } from "@/lib/dashboard/types";
import { FinancialValue } from "@/components/ui/financial-value";
export type { AuditEventItem };

interface AuditTimelineProps {
  events: AuditEventItem[];
  className?: string;
}

export function AuditTimeline({ events, className = "" }: AuditTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-xs text-muted-foreground">
        <Clock className="w-6 h-6 text-neutral-300 dark:text-neutral-700 mb-2" />
        No audit events recorded yet for this action.
      </div>
    );
  }

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const getActorBadge = (actor: string) => {
    switch (actor?.toUpperCase()) {
      case "MERCHANT":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
            <User className="w-2.5 h-2.5" /> Merchant
          </span>
        );
      case "RAZORPAY":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
            <CreditCard className="w-2.5 h-2.5" /> Razorpay
          </span>
        );
      case "AGENT":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60">
            <Bot className="w-2.5 h-2.5" /> AI Agent
          </span>
        );
      case "SYSTEM":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
            <Zap className="w-2.5 h-2.5" /> System
          </span>
        );
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "GROWTH_ACTION_CREATED":
        return <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      case "GROWTH_ACTION_APPROVED":
        return <ShieldCheck className="w-3.5 h-3.5 text-neutral-900 dark:text-neutral-100" />;
      case "PAYMENT_LINK_CREATED":
        return <CreditCard className="w-3.5 h-3.5 text-neutral-900 dark:text-neutral-100" />;
      case "PAYMENT_LINK_DELIVERED":
        return <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
      case "PAYMENT_LINK_RESENT":
        return <Send className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      case "PAYMENT_LINK_PAID":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case "ACTION_RETRY":
        return <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
      case "GROWTH_ACTION_FAILED":
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
      case "GROWTH_ACTION_REJECTED":
        return <XCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const getEventTitle = (eventType: string) => {
    switch (eventType) {
      case "GROWTH_ACTION_CREATED":
        return "GrowthAction Created (Pending Approval)";
      case "GROWTH_ACTION_APPROVED":
        return "Merchant Approved Action";
      case "PAYMENT_LINK_CREATED":
        return "Razorpay Payment Link Generated (Test Mode)";
      case "PAYMENT_LINK_DELIVERED":
        return "Payment Link Email Sent via Razorpay";
      case "PAYMENT_LINK_RESENT":
        return "Payment Link Email Resent via Razorpay";
      case "PAYMENT_LINK_PAID":
        return "Payment Verified via Razorpay Webhook";
      case "ACTION_RETRY":
        return "Action Retry Initiated";
      case "GROWTH_ACTION_FAILED":
        return "Action Execution Failed";
      case "GROWTH_ACTION_REJECTED":
        return "Merchant Rejected Action";
      default:
        return eventType;
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="relative pl-5 border-l border-border space-y-4">
        {sortedEvents.map((evt, idx) => {
          const formattedDate = new Date(evt.createdAt).toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          const meta = (evt.metadata || {}) as Record<string, unknown>;

          return (
            <div key={evt.id || idx} className="relative group">
              {/* Timeline dot */}
              <div className="absolute -left-[27px] top-1 flex items-center justify-center w-5 h-5 rounded-md bg-card border border-border shadow-2xs">
                {getEventIcon(evt.eventType)}
              </div>

              {/* Event Content */}
              <div className="rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 p-3 border border-border text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-foreground">
                    {getEventTitle(evt.eventType)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {getActorBadge(evt.actor)}
                    <span className="text-[11px] text-muted-foreground font-mono">{formattedDate}</span>
                  </div>
                </div>

                {/* Metadata Details */}
                {Object.keys(meta).length > 0 && (
                  <div className="mt-2 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1 bg-card p-2.5 rounded-md border border-border font-mono">
                    {Boolean(meta.deliveryMedium) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Delivery Medium:</span>
                        <span className="font-medium text-foreground">
                          {String(meta.deliveryMedium)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.customerEmail) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Recipient Email:</span>
                        <span className="font-medium text-foreground">
                          {String(meta.customerEmail)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.resendCount) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Resend Attempt:</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          #{String(meta.resendCount)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.paymentLinkId) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Payment Link ID:</span>
                        <span className="font-medium text-foreground">
                          {String(meta.paymentLinkId)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.shortUrl) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">URL:</span>
                        <a
                          href={String(meta.shortUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-foreground underline hover:opacity-80"
                        >
                          {String(meta.shortUrl)} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    )}
                    {Boolean(meta.amountInRupees) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Amount:</span>
                        <FinancialValue value={Number(meta.amountInRupees)} size="xs" variant="revenue" />
                      </div>
                    )}
                    {Boolean(meta.previousStatus) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Previous Status:</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {String(meta.previousStatus)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.error) && (
                      <div className="text-rose-600 dark:text-rose-400 font-medium">
                        Error: {String(meta.error)}
                      </div>
                    )}
                    {Boolean(meta.reason) && (
                      <div className="text-amber-600 dark:text-amber-400">
                        Reason: {String(meta.reason)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
