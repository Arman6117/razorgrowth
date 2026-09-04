import React from "react";
import {
  X,
  RefreshCw,
  ShieldCheck,
  CreditCard,
  AlertTriangle,
  Check,
  Copy,
  QrCode as QrIcon,
  ExternalLink,
  Mail,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { AuditTimeline } from "@/components/audit-timeline";
import { GrowthActionDetail } from "@/lib/dashboard/types";

interface ActionDetailModalProps {
  activeActionId: string | null;
  actionDetail: GrowthActionDetail | null;
  loadingAction: boolean;
  approving: boolean;
  executing: boolean;
  resendingEmail: boolean;
  simulatingWebhook: boolean;
  copiedUrl: boolean;
  onClose: () => void;
  onApprove: () => void;
  onExecute: () => void;
  onResendEmail: () => void;
  onSimulateWebhook: () => void;
  onCopyUrl: (url: string) => void;
  onShowQr: () => void;
}

export function ActionDetailModal({
  activeActionId,
  actionDetail,
  loadingAction,
  approving,
  executing,
  resendingEmail,
  simulatingWebhook,
  copiedUrl,
  onClose,
  onApprove,
  onExecute,
  onResendEmail,
  onSimulateWebhook,
  onCopyUrl,
  onShowQr,
}: ActionDetailModalProps) {
  if (!activeActionId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                GrowthAction Overview
              </h3>
              {actionDetail && <StatusBadge status={actionDetail.status} />}
            </div>
            <p className="text-xs text-neutral-500 font-mono mt-0.5">
              Action ID: {activeActionId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loadingAction || !actionDetail ? (
            <div className="py-12 text-center text-neutral-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              Loading GrowthAction authoritative details and audit trail...
            </div>
          ) : (
            <>
              {/* Action Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800">
                  <span className="text-xs text-neutral-500">Target Customer</span>
                  <div className="font-semibold text-neutral-900 dark:text-white mt-1">
                    {actionDetail.parameters.customerName || "Customer"}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">
                    {actionDetail.parameters.customerEmail}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800">
                  <span className="text-xs text-neutral-500">Target Offer Product</span>
                  <div className="font-semibold text-neutral-900 dark:text-white mt-1">
                    {actionDetail.parameters.targetProductName}
                  </div>
                  <div className="text-xs text-neutral-500 font-mono">
                    Authoritative DB Price: ₹{actionDetail.parameters.amountInRupees}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800">
                  <span className="text-xs text-neutral-500">Action Type</span>
                  <div className="font-semibold text-neutral-900 dark:text-white mt-1">
                    {actionDetail.type}
                  </div>
                  <div className="text-xs text-emerald-600 font-medium">
                    Razorpay Test Mode
                  </div>
                </div>
              </div>

              {/* Merchant Action Control Panel */}
              <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/30 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Merchant Financial Guardrail Controls
                  </span>
                </div>

                {/* State 1: PENDING_APPROVAL */}
                {actionDetail.status === "PENDING_APPROVAL" && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                      <strong>Merchant Approval Required:</strong> AI Agent prepared this action. Review product and price (₹{actionDetail.parameters.amountInRupees}) before approving.
                    </div>
                    <Button
                      onClick={onApprove}
                      disabled={approving}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs whitespace-nowrap"
                    >
                      {approving ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 mr-1.5" />
                          Approve GrowthAction
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* State 2: APPROVED */}
                {actionDetail.status === "APPROVED" && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60">
                    <div className="text-xs text-blue-900 dark:text-blue-200">
                      <strong>Action Approved!</strong> Click below to execute and generate a verified Razorpay Payment Link in test mode.
                    </div>
                    <Button
                      onClick={onExecute}
                      disabled={executing}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs whitespace-nowrap"
                    >
                      {executing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          Calling Razorpay...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-1.5" />
                          Execute & Generate Link
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* State: FAILED (Retry Execution) */}
                {actionDetail.status === "FAILED" && (
                  <div className="flex flex-col gap-3 p-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900 dark:text-rose-200">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          Execution Failed — Retry Available
                        </div>
                        <div className="text-xs text-rose-800 dark:text-rose-300">
                          {((actionDetail.parameters as Record<string, unknown>)?.lastFailureReason as string) ||
                            (((actionDetail.auditEvents?.find((e) => e.eventType === "GROWTH_ACTION_FAILED")?.metadata as Record<string, unknown>)?.error as string) ||
                            "Execution failed. You can re-attempt execution below.")}
                        </div>
                      </div>
                      <Button
                        onClick={onExecute}
                        disabled={executing}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs whitespace-nowrap shadow-xs"
                      >
                        {executing ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                            Retrying Execution...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                            Retry Execution
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Explicit Razorpay test mode limitation banner */}
                    {String(
                      (actionDetail.parameters as Record<string, unknown>)?.lastFailureReason ||
                      (actionDetail.auditEvents?.find((e) => e.eventType === "GROWTH_ACTION_FAILED")?.metadata as Record<string, unknown>)?.error ||
                      ""
                    ).toLowerCase().includes("maximum") && (
                      <div className="text-[11px] text-rose-700 dark:text-rose-400 bg-white/70 dark:bg-black/30 p-2.5 rounded border border-rose-200/60 dark:border-rose-900/40 leading-relaxed">
                        <strong>Razorpay Test Mode Limitation:</strong> Razorpay Test Mode restricts individual payment links to a maximum of ₹50,000. Higher-priced products (like Pro Laptop at ₹60,000) exceed this test limit unless upgraded on the payment gateway. Database price remains authoritative.
                      </div>
                    )}
                  </div>
                )}

                {/* State 3: EXECUTING / Active Payment Link */}
                {(actionDetail.status === "EXECUTING" || actionDetail.status === "EXECUTED") && actionDetail.parameters.shortUrl && (
                  <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-xs text-neutral-500 font-semibold uppercase">
                          Razorpay Payment Link (Test Mode)
                        </span>
                        <div className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400 break-all">
                          {actionDetail.parameters.shortUrl}
                        </div>
                        <div className="text-xs text-neutral-500">
                          Payment Link ID: <span className="font-mono">{actionDetail.parameters.paymentLinkId}</span> • Amount: <strong>₹{actionDetail.parameters.amountInRupees}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCopyUrl(actionDetail.parameters.shortUrl!)}
                          className="text-xs"
                        >
                          {copiedUrl ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500 mr-1" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1" />
                              Copy Link
                            </>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onShowQr}
                          className="text-xs"
                        >
                          <QrIcon className="w-3.5 h-3.5 mr-1" />
                          Show QR
                        </Button>

                        <a
                          href={actionDetail.parameters.shortUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                        >
                          Open Checkout
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        {actionDetail.status === "EXECUTING" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={onResendEmail}
                            disabled={resendingEmail}
                            className="text-xs border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
                          >
                            {resendingEmail ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                                Resending...
                              </>
                            ) : (
                              <>
                                <Mail className="w-3.5 h-3.5 mr-1 text-indigo-500" />
                                Resend Email
                              </>
                            )}
                          </Button>
                        )}

                        {actionDetail.status === "EXECUTING" && (
                          <Button
                            size="sm"
                            onClick={onSimulateWebhook}
                            disabled={simulatingWebhook}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                          >
                            {simulatingWebhook ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                                Verifying...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Simulate Payment (Test)
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* If EXECUTED */}
                    {actionDetail.status === "EXECUTED" && (
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>Payment confirmed via verified Razorpay Webhook HMAC signature. Action marked EXECUTED.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Audit Trail Timeline */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-neutral-500" />
                  Auditable Trail Timeline
                </h4>
                <AuditTimeline events={actionDetail.auditEvents || []} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
