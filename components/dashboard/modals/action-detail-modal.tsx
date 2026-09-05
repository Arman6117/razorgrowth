import React, { useState } from "react";
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
import { FinancialValue } from "@/components/ui/financial-value";
import { AuditTimeline } from "@/components/audit-timeline";
import { QrModal } from "@/components/dashboard/modals/qr-modal";
import { useGrowthAction } from "@/hooks/use-growth-action";

interface ActionDetailModalProps {
  activeActionId: string | null;
  merchantId?: string | null;
  onClose: () => void;
  onActionUpdated?: () => void;
  showToast?: (type: "success" | "error" | "info", message: string) => void;
}

export function ActionDetailModal({
  activeActionId,
  merchantId,
  onClose,
  onActionUpdated,
  showToast,
}: ActionDetailModalProps) {
  const {
    action,
    loading,
    approving,
    executing,
    resending,
    simulating,
    approve,
    execute,
    resendEmail,
    simulatePayment,
  } = useGrowthAction(activeActionId, {
    merchantId,
    showToast,
    onActionUpdated,
  });

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  if (!activeActionId) return null;

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-card rounded-xl shadow-2xl border border-border max-h-[90vh] flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  GrowthAction Inspection
                </h3>
                {action && <StatusBadge status={action.status} />}
              </div>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                Action ID: {activeActionId}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {loading || !action ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                Loading GrowthAction details and audit trail...
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target Customer</span>
                    <div className="font-semibold text-xs text-foreground mt-1 truncate">
                      {action.parameters.customerName || "Customer"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                      {action.parameters.customerEmail}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Target Offer Product</span>
                    <div className="font-semibold text-xs text-foreground mt-1 truncate">
                      {action.parameters.targetProductName}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Price: <FinancialValue value={action.parameters.amountInRupees ?? 0} size="xs" variant="default" />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-neutral-50/70 dark:bg-neutral-900/50 border border-border">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action Mechanism</span>
                    <div className="font-semibold text-xs text-foreground mt-1">
                      {action.type}
                    </div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                      Razorpay Test Mode
                    </div>
                  </div>
                </div>

                {/* Guardrail Controls */}
                <div className="p-4 rounded-lg border border-border bg-neutral-50/70 dark:bg-neutral-900/50 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-neutral-500" />
                      Merchant Financial Guardrail Controls
                    </span>
                  </div>

                  {/* State 1: PENDING_APPROVAL */}
                  {action.status === "PENDING_APPROVAL" && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50">
                      <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                        <strong>Approval Required:</strong> Review product and authoritative price (₹{action.parameters.amountInRupees}) before approving for execution.
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => approve()}
                        disabled={approving}
                        className="whitespace-nowrap text-xs"
                      >
                        {approving ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                            Approve Action
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* State 2: APPROVED */}
                  {action.status === "APPROVED" && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50">
                      <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                        <strong>Action Approved:</strong> Execute to generate and deliver a verified Razorpay Payment Link in test mode.
                      </div>
                      <Button
                        variant="growth"
                        size="sm"
                        onClick={() => execute()}
                        disabled={executing}
                        className="whitespace-nowrap text-xs"
                      >
                        {executing ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                            Calling Gateway...
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-3.5 h-3.5 mr-1" />
                            Execute & Issue Link
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* State: FAILED (Retry Execution) */}
                  {action.status === "FAILED" && (
                    <div className="flex flex-col gap-3 p-3.5 rounded-lg bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900 dark:text-rose-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            Execution Failed — Retry Available
                          </div>
                          <div className="text-[11px] text-rose-800 dark:text-rose-300">
                            {((action.parameters as Record<string, unknown>)?.lastFailureReason as string) ||
                              (((action.auditEvents?.find((e) => e.eventType === "GROWTH_ACTION_FAILED")?.metadata as Record<string, unknown>)?.error as string) ||
                              "Execution failed. You can re-attempt execution below.")}
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => execute()}
                          disabled={executing}
                          className="whitespace-nowrap text-xs"
                        >
                          {executing ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                              Retrying...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 mr-1" />
                              Retry Execution
                            </>
                          )}
                        </Button>
                      </div>

                      {String(
                        (action.parameters as Record<string, unknown>)?.lastFailureReason ||
                        (action.auditEvents?.find((e) => e.eventType === "GROWTH_ACTION_FAILED")?.metadata as Record<string, unknown>)?.error ||
                        ""
                      ).toLowerCase().includes("maximum") && (
                        <div className="text-[11px] text-rose-700 dark:text-rose-400 bg-card p-2 rounded border border-rose-200 dark:border-rose-900/40 leading-relaxed font-mono">
                          Razorpay Test Mode limits individual payment links to ₹50,000. Database pricing remains authoritative.
                        </div>
                      )}
                    </div>
                  )}

                  {/* State 3: EXECUTING / EXECUTED Payment Link */}
                  {(action.status === "EXECUTING" || action.status === "EXECUTED") && action.parameters.shortUrl && (
                    <div className="p-3.5 rounded-lg bg-card border border-border space-y-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                            Razorpay Payment Link (Test Mode)
                          </span>
                          <div className="font-mono text-xs font-bold text-foreground break-all">
                            {action.parameters.shortUrl}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Link ID: <span className="font-mono">{action.parameters.paymentLinkId}</span> • Amount: <FinancialValue value={action.parameters.amountInRupees ?? 0} size="xs" variant="revenue" />
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(action.parameters.shortUrl!)}
                            className="text-xs"
                          >
                            {copiedUrl ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500 mr-1" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 mr-1" />
                                Copy Link
                              </>
                            )}
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowQrModal(true)}
                            className="text-xs"
                          >
                            <QrIcon className="w-3 h-3 mr-1" />
                            QR
                          </Button>

                          <a
                            href={action.parameters.shortUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs hover:opacity-90"
                          >
                            Checkout
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </a>

                          {action.status === "EXECUTING" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resendEmail()}
                              disabled={resending}
                              className="text-xs"
                            >
                              {resending ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                  Resending...
                                </>
                              ) : (
                                <>
                                  <Mail className="w-3 h-3 mr-1" />
                                  Resend Email
                                </>
                              )}
                            </Button>
                          )}

                          {action.status === "EXECUTING" && (
                            <Button
                              variant="growth"
                              size="sm"
                              onClick={() => simulatePayment()}
                              disabled={simulating}
                              className="text-xs"
                            >
                              {simulating ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                  Verifying...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Simulate Payment
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      {action.status === "EXECUTED" && (
                        <div className="p-2.5 rounded-md bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Payment verified via HMAC signature webhook. Action marked EXECUTED.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Audit Trail Timeline */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    Auditable Lifecycle Timeline
                  </h4>
                  <AuditTimeline events={action.auditEvents || []} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <QrModal
        isOpen={showQrModal}
        shortUrl={action?.parameters.shortUrl}
        onClose={() => setShowQrModal(false)}
      />
    </>
  );
}
