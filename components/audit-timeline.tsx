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
export type { AuditEventItem };

interface AuditTimelineProps {
  events: AuditEventItem[];
  className?: string;
}

export function AuditTimeline({ events, className = "" }: AuditTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-sm text-neutral-500">
        <Clock className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mb-2 animate-pulse" />
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            <User className="w-3 h-3" /> Merchant
          </span>
        );
      case "RAZORPAY":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CreditCard className="w-3 h-3" /> Razorpay
          </span>
        );
      case "AGENT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
            <Bot className="w-3 h-3" /> AI Agent
          </span>
        );
      case "SYSTEM":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
            <Zap className="w-3 h-3" /> System
          </span>
        );
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "GROWTH_ACTION_CREATED":
        return <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case "GROWTH_ACTION_APPROVED":
        return <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case "PAYMENT_LINK_CREATED":
        return <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      case "PAYMENT_LINK_DELIVERED":
        return <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case "PAYMENT_LINK_RESENT":
        return <Send className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case "PAYMENT_LINK_PAID":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case "ACTION_RETRY":
        return <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case "GROWTH_ACTION_FAILED":
        return <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      case "GROWTH_ACTION_REJECTED":
        return <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      default:
        return <Clock className="w-4 h-4 text-neutral-500" />;
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
      <div className="relative pl-6 border-l-2 border-neutral-200 dark:border-neutral-800 space-y-6">
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
              <div className="absolute -left-[31px] top-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-700 shadow-xs">
                {getEventIcon(evt.eventType)}
              </div>

              {/* Event Content */}
              <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900/60 p-3.5 border border-neutral-200/80 dark:border-neutral-800 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {getEventTitle(evt.eventType)}
                  </span>
                  <div className="flex items-center gap-2">
                    {getActorBadge(evt.actor)}
                    <span className="text-xs text-neutral-500">{formattedDate}</span>
                  </div>
                </div>

                {/* Metadata Details */}
                {Object.keys(meta).length > 0 && (
                  <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400 space-y-1 bg-white/70 dark:bg-black/30 p-2.5 rounded-md border border-neutral-100 dark:border-neutral-800/60 font-mono">
                    {Boolean(meta.deliveryMedium) && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Delivery Medium:</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {String(meta.deliveryMedium)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.customerEmail) && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Recipient Email:</span>
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          {String(meta.customerEmail)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.resendCount) && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Resend Attempt:</span>
                        <span className="font-semibold text-purple-600 dark:text-purple-400">
                          #{String(meta.resendCount)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.paymentLinkId) && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Payment Link ID:</span>
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          {String(meta.paymentLinkId)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.shortUrl) && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">URL:</span>
                        <a
                          href={String(meta.shortUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          {String(meta.shortUrl)} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    )}
                    {Boolean(meta.amountInRupees) && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Amount:</span>
                        <span className="font-semibold text-emerald-600">
                          ₹{Number(meta.amountInRupees).toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.previousStatus) && (
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Previous Status:</span>
                        <span className="font-semibold text-amber-600">
                          {String(meta.previousStatus)}
                        </span>
                      </div>
                    )}
                    {Boolean(meta.error) && (
                      <div className="text-rose-600 font-medium">
                        Error: {String(meta.error)}
                      </div>
                    )}
                    {Boolean(meta.reason) && (
                      <div className="text-amber-600">
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
