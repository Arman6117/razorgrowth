"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CreditCard,
  QrCode as QrIcon,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Users,
  DollarSign,
  Package,
  Layers,
  ChevronRight,
  X,
  Bot,
  Zap,
  Info,
  LogOut,
  Key,
  Upload,
  FileText,
  Loader2,
  Mail,
} from "lucide-react";
import { QRCode } from "@/components/qr-code";
import { AuditTimeline, AuditEventItem } from "@/components/audit-timeline";
import { Button } from "@/components/ui/button";
import { AgentChatDrawer } from "@/components/agent-chat-drawer";
import {
  GrowthIntelligencePanel,
  RankedOpportunityItem,
  GrowthSnapshotData,
} from "@/components/growth-intelligence-panel";
import { AgenticGrowthPlanner } from "@/components/agentic-growth-planner";
import { AIBuyerReadinessCard } from "@/components/ai-buyer-readiness";
import { AIBuyerPreviewModal } from "@/components/ai-buyer-preview-modal";

interface MerchantInfo {
  id: string;
  name: string;
  email: string;
  currency: string;
  counts: {
    customers: number;
    products: number;
    orders: number;
    opportunities: number;
    growthActions: number;
    actionsByStatus: Record<string, number>;
    realizedRevenue?: number;
  };
}

interface OpportunityItem {
  id: string;
  merchantId: string;
  sourceProductId: string;
  sourceProductName: string;
  targetProductId: string;
  targetProductName: string;
  targetProductPrice: number;
  sourceCustomers: number;
  customersTogether: number;
  eligibleCustomerCount: number;
  eligibleCustomerIds: string[];
  crossSellRate: number;
  expectedRevenue: number;
  status: string;
  actionCount: number;
  createdAt: string;
}

interface CustomerItem {
  id: string;
  name: string;
  email: string;
  totalPaidOrders: number;
  totalSpend: number;
  existingAction: {
    id: string;
    status: string;
    type: string;
    parameters: Record<string, unknown>;
    approvedAt?: string | null;
    executedAt?: string | null;
    createdAt: string;
  } | null;
}

interface GrowthActionDetail {
  id: string;
  merchantId: string;
  opportunityId: string;
  type: string;
  status: string;
  parameters: {
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    targetProductId?: string;
    targetProductName?: string;
    sourceProductId?: string;
    amountInRupees?: number;
    amountInPaise?: number;
    currency?: string;
    paymentLinkId?: string;
    shortUrl?: string;
    paymentLinkStatus?: string;
    [key: string]: unknown;
  };
  approvedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
  opportunity: {
    id: string;
    title: string;
    sourceProduct?: { name: string; price: number };
    targetProduct?: { name: string; price: number };
  };
  auditEvents: AuditEventItem[];
}

export default function MerchantDashboard() {
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected Opportunity & Customers drawer state
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityItem | null>(null);
  const [eligibleCustomers, setEligibleCustomers] = useState<CustomerItem[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Selected GrowthAction & Detail modal state
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionDetail, setActionDetail] = useState<GrowthActionDetail | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  // Operation action states (creating, approving, executing, simulating webhook)
  const [creatingActionForCustomer, setCreatingActionForCustomer] = useState<string | null>(null);
  const [creatingBatchActions, setCreatingBatchActions] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [simulatingWebhook, setSimulatingWebhook] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  // Notification / Toast message
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Merchant Conversational AI Agent state
  const [showChatDrawer, setShowChatDrawer] = useState(false);

  // AI Agent tool testing modal state
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [agentOutput, setAgentOutput] = useState<string | null>(null);
  const [runningTool, setRunningTool] = useState(false);

  // AI Growth Intelligence state (Phase 3)
  const [growthSnapshot, setGrowthSnapshot] = useState<GrowthSnapshotData | null>(null);
  const [rankedOpportunities, setRankedOpportunities] = useState<RankedOpportunityItem[]>([]);
  const [analyzingGrowth, setAnalyzingGrowth] = useState(false);
  const [growthAiEnhanced, setGrowthAiEnhanced] = useState(false);

  // AI Agentic Growth Planner state (Phase 4)
  const [selectedPlannerOpportunityId, setSelectedPlannerOpportunityId] = useState<string | null>(null);

  // AI Buyer Readiness state (Phase 5)
  const [showAIBuyerModal, setShowAIBuyerModal] = useState(false);

  const handlePlanOpportunity = (opportunityId: string) => {
    setSelectedPlannerOpportunityId(opportunityId);
    setTimeout(() => {
      const el = document.getElementById("growth-planner-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  };

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const [connectionInfo, setConnectionInfo] = useState<{
    connected: boolean;
    connection?: { keyId: string; mode: string; connectedAt: string; lastSyncedAt?: string | null } | null;
  } | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectKeyId, setConnectKeyId] = useState("");
  const [connectKeySecret, setConnectKeySecret] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);

  const [syncingType, setSyncingType] = useState<"customers" | "orders" | "all" | null>(null);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  // 1. Load Merchant and Opportunities
  const loadDashboardData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [merchantRes, oppsRes, connRes, growthRes] = await Promise.all([
        fetch("/api/merchant"),
        fetch("/api/opportunities"),
        fetch("/api/razorpay/connection"),
        fetch("/api/growth/analyze").catch(() => null),
      ]);

      if (merchantRes.status === 401 || oppsRes.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (merchantRes.ok) {
        const data = await merchantRes.json();
        setMerchant(data.merchant);
      }

      if (oppsRes.ok) {
        const data = await oppsRes.json();
        setOpportunities(data.opportunities || []);
        if (data.opportunities && data.opportunities.length > 0) {
          setSelectedPlannerOpportunityId((prev) => prev || data.opportunities[0]?.id || null);
        }
      }

      if (connRes.ok) {
        const data = await connRes.json();
        setConnectionInfo(data);
      }

      if (growthRes && growthRes.ok) {
        const data = await growthRes.json();
        if (data.snapshot) {
          setGrowthSnapshot(data.snapshot);
        }
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      showToast("error", "Failed to load dashboard data. Check database connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 1b. Run AI Growth Intelligence Analysis (Phase 3)
  const handleRunGrowthAnalysis = async () => {
    setAnalyzingGrowth(true);
    try {
      showToast("info", "Running AI Growth Intelligence analysis across transactions...");
      const res = await fetch("/api/growth/analyze", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Growth analysis failed");
      }
      setGrowthSnapshot(data.snapshot);
      setRankedOpportunities(data.opportunities || []);
      setGrowthAiEnhanced(Boolean(data.aiEnhanced));
      if (data.opportunities && data.opportunities.length > 0) {
        setSelectedPlannerOpportunityId(data.opportunities[0].id);
      }
      showToast(
        "success",
        data.message || `AI Growth Intelligence discovered ${data.opportunities?.length || 0} opportunities!`
      );
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error running growth analysis");
    } finally {
      setAnalyzingGrowth(false);
    }
  };

  const handleConnectRazorpay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectKeyId.trim() || !connectKeySecret.trim()) {
      showToast("error", "Please provide both Razorpay Key ID and Key Secret.");
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch("/api/razorpay/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyId: connectKeyId.trim(),
          keySecret: connectKeySecret.trim(),
          mode: "TEST",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to validate Razorpay credentials");
      }
      showToast("success", "Razorpay Test Mode connected successfully!");
      setShowConnectModal(false);
      setConnectKeyId("");
      setConnectKeySecret("");
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to connect Razorpay");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectRazorpay = async () => {
    if (!confirm("Are you sure you want to disconnect Razorpay?")) return;
    try {
      const res = await fetch("/api/razorpay/connect", { method: "DELETE" });
      if (res.ok) {
        showToast("info", "Razorpay account disconnected.");
        loadDashboardData();
      }
    } catch {
      showToast("error", "Failed to disconnect Razorpay");
    }
  };

  const handleSyncData = async (type: "customers" | "orders" | "all") => {
    setSyncingType(type);
    try {
      const endpoint =
        type === "customers"
          ? "/api/razorpay/sync/customers"
          : type === "orders"
          ? "/api/razorpay/sync/orders"
          : "/api/razorpay/sync";

      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to sync ${type}`);
      }

      if (type === "customers") {
        showToast("success", `Customers synced: ${data.syncedCount} new, ${data.updatedCount} updated (${data.totalFound} found).`);
      } else if (type === "orders") {
        showToast("success", `Orders synced: ${data.syncedCount} new (${data.totalFound} found).`);
      } else {
        showToast("success", `Data sync complete: ${data.customers?.totalFound || 0} customers, ${data.orders?.totalFound || 0} orders.`);
      }

      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : `Failed to sync ${type}`);
    } finally {
      setSyncingType(null);
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) {
      showToast("error", "Please paste CSV content or select a file.");
      return;
    }

    setImportingCsv(true);
    try {
      const res = await fetch("/api/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvData: csvText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import catalog");
      }
      showToast("success", data.message || `Catalog imported: ${data.createdCount} products created.`);
      setShowCsvModal(false);
      setCsvText("");
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to import catalog");
    } finally {
      setImportingCsv(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // 2a. Refresh Eligible Customers for open Opportunity
  const refreshOpportunityCustomers = useCallback(async (oppId: string) => {
    try {
      const res = await fetch(`/api/opportunities/${oppId}/customers?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        setEligibleCustomers(data.customers || []);
      }
    } catch (err) {
      console.error("Error refreshing customers:", err);
    }
  }, []);

  // 2b. Load Eligible Customers when an Opportunity is opened
  const handleOpenOpportunity = async (opp: OpportunityItem) => {
    setSelectedOpportunity(opp);
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/opportunities/${opp.id}/customers?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        setEligibleCustomers(data.customers || []);
      } else {
        showToast("error", "Failed to load eligible customers for opportunity.");
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Network error fetching customers.");
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleSelectOpportunityById = (opportunityId: string) => {
    const found = opportunities.find((o) => o.id === opportunityId);
    if (found) {
      handleOpenOpportunity(found);
    } else {
      const ranked = rankedOpportunities.find((o) => o.id === opportunityId);
      if (ranked && ranked.id) {
        handleOpenOpportunity({
          id: ranked.id,
          merchantId: ranked.merchantId,
          sourceProductId: ranked.sourceProductId || "",
          sourceProductName: ranked.evidence.sourceProductName || "Source Product",
          targetProductId: ranked.targetProductId,
          targetProductName: ranked.recommendedProductName,
          targetProductPrice: ranked.evidence.targetPrice || 0,
          sourceCustomers: ranked.evidence.sourceCustomers || 0,
          customersTogether: ranked.evidence.customersTogether || 0,
          eligibleCustomerCount: ranked.targetCustomerCount,
          eligibleCustomerIds: [],
          crossSellRate: ranked.confidence,
          expectedRevenue: ranked.estimatedValue,
          status: ranked.status,
          actionCount: 0,
          createdAt: new Date().toISOString(),
        });
      }
    }
  };

  // 2c. Periodic auto-revalidation while Opportunity Review drawer is open
  useEffect(() => {
    if (!selectedOpportunity) return;
    const interval = setInterval(() => {
      refreshOpportunityCustomers(selectedOpportunity.id);
    }, 3500);
    return () => clearInterval(interval);
  }, [selectedOpportunity, refreshOpportunityCustomers]);

  // 3. Load GrowthAction Details by ID
  const handleOpenAction = async (actionId: string) => {
    setActiveActionId(actionId);
    setLoadingAction(true);
    try {
      if (!merchant) return;
      const res = await fetch(`/api/growth-actions/${actionId}?merchantId=${merchant.id}`);
      if (res.ok) {
        const data = await res.json();
        setActionDetail(data.action);
      } else {
        showToast("error", "Failed to load GrowthAction details.");
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Network error loading action.");
    } finally {
      setLoadingAction(false);
    }
  };

  // 4. Create GrowthAction for Customer
  const handleCreateGrowthAction = async (customer: CustomerItem) => {
    if (!merchant || !selectedOpportunity) return;
    setCreatingActionForCustomer(customer.id);
    try {
      const res = await fetch("/api/growth-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          opportunityId: selectedOpportunity.id,
          customerId: customer.id,
          sourceProductId: selectedOpportunity.sourceProductId,
          targetProductId: selectedOpportunity.targetProductId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create GrowthAction");
      }

      showToast(
        "success",
        `GrowthAction created for ${customer.name}! Status: PENDING_APPROVAL`
      );

      // Refresh customers list and merchant stats
      await handleOpenOpportunity(selectedOpportunity);
      loadDashboardData();

      // Open the action details
      handleOpenAction(data.action.id);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error creating action");
    } finally {
      setCreatingActionForCustomer(null);
    }
  };

  // 4b. Create GrowthActions in Batch for All Eligible Customers
  const handleCreateBatchGrowthActions = async () => {
    if (!merchant || !selectedOpportunity) return;
    const uncreatedCustomerIds = eligibleCustomers
      .filter((c) => !c.existingAction)
      .map((c) => c.id);

    if (uncreatedCustomerIds.length === 0) {
      showToast("info", "All eligible customers already have GrowthActions created.");
      return;
    }

    setCreatingBatchActions(true);
    try {
      const res = await fetch("/api/growth-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          opportunityId: selectedOpportunity.id,
          customerIds: uncreatedCustomerIds,
          sourceProductId: selectedOpportunity.sourceProductId,
          targetProductId: selectedOpportunity.targetProductId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create batch GrowthActions");
      }

      showToast(
        "success",
        `Batch created ${data.createdCount} GrowthActions in PENDING_APPROVAL! (${data.duplicateCount} duplicates, ${data.rejectedCount} skipped)`
      );

      await refreshOpportunityCustomers(selectedOpportunity.id);
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error creating batch actions");
    } finally {
      setCreatingBatchActions(false);
    }
  };

  // 5. Merchant Approves Single GrowthAction
  const handleApproveAction = async () => {
    if (!merchant || !actionDetail) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionDetail.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: merchant.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to approve action");
      }

      showToast("success", "GrowthAction APPROVED! Action is now ready for execution.");
      await handleOpenAction(actionDetail.id);
      if (selectedOpportunity) {
        await refreshOpportunityCustomers(selectedOpportunity.id);
      }
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  // 5b. Bulk Approve All PENDING_APPROVAL Actions for Selected Opportunity
  const handleBulkApprove = async () => {
    if (!merchant || !selectedOpportunity) return;
    setBulkApproving(true);
    try {
      const res = await fetch("/api/growth-actions/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          opportunityId: selectedOpportunity.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to bulk approve actions");
      }

      showToast(
        "success",
        `Successfully approved ${data.approvedCount} GrowthActions! Actions are now ready for execution.`
      );

      await refreshOpportunityCustomers(selectedOpportunity.id);
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error bulk approving actions");
    } finally {
      setBulkApproving(false);
    }
  };

  // 6. Execute GrowthAction (Generate Razorpay Payment Link)
  const handleExecuteAction = async () => {
    if (!merchant || !actionDetail) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionDetail.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          description: `Cross-sell offer: ${actionDetail.parameters.targetProductName}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to execute action via Razorpay");
      }

      showToast("success", "Razorpay Payment Link generated in Test Mode!");
      await handleOpenAction(actionDetail.id);
      if (selectedOpportunity) {
        await refreshOpportunityCustomers(selectedOpportunity.id);
      }
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  // 6b. Resend Razorpay Payment Link Email Notification
  const handleResendEmail = async () => {
    if (!merchant || !actionDetail) return;
    setResendingEmail(true);
    try {
      const res = await fetch(`/api/growth-actions/${actionDetail.id}/resend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend payment link email");
      }
      showToast("success", "Payment link email notification resent via Razorpay!");
      await handleOpenAction(actionDetail.id);
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error resending email");
    } finally {
      setResendingEmail(false);
    }
  };

  // 7. Simulate Webhook confirmation (Demo helper for instant webhook verification)
  const handleSimulateWebhook = async () => {
    if (!merchant || !actionDetail) return;
    setSimulatingWebhook(true);
    try {
      showToast("info", "Simulating verified Razorpay payment webhook...");
      const res = await fetch(`/api/growth-actions/${actionDetail.id}/simulate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: merchant.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process payment confirmation");
      }

      showToast("success", "Payment confirmed via Razorpay webhook! Status updated to EXECUTED.");
      await handleOpenAction(actionDetail.id);
      if (selectedOpportunity) {
        await refreshOpportunityCustomers(selectedOpportunity.id);
      }
      loadDashboardData();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Error confirming payment");
    } finally {
      setSimulatingWebhook(false);
    }
  };

  // 8. Run AI Agent Tool Demo
  const handleRunAgentTool = async (toolName: string, params: Record<string, unknown>) => {
    if (!merchant) return;
    setRunningTool(true);
    setAgentOutput(null);
    try {
      const res = await fetch("/api/agent/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName,
          parameters: { merchantId: merchant.id, ...params },
        }),
      });

      const data = await res.json();
      setAgentOutput(JSON.stringify(data, null, 2));
      loadDashboardData();
    } catch (err) {
      setAgentOutput(JSON.stringify({ error: String(err) }, null, 2));
    } finally {
      setRunningTool(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING_APPROVAL":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> Pending Approval
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            <ShieldCheck className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case "EXECUTING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
            <CreditCard className="w-3.5 h-3.5 animate-spin" /> Link Active (Executing)
          </span>
        );
      case "EXECUTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Paid & Executed
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <AlertTriangle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
            <X className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
            {status}
          </span>
        );
    }
  };

  const totalEstimatedRevenue = opportunities.reduce((sum, o) => sum + o.expectedRevenue, 0);
  const totalEligibleCustomers = opportunities.reduce((sum, o) => sum + o.eligibleCustomerCount, 0);

  const displayRankedOpportunities: RankedOpportunityItem[] =
    rankedOpportunities.length > 0
      ? rankedOpportunities
      : opportunities.map((opp, idx) => ({
          id: opp.id,
          merchantId: opp.merchantId,
          type: "CROSS_SELL" as const,
          title: `Cross-sell: ${opp.sourceProductName} → ${opp.targetProductName}`,
          explanation: `${opp.customersTogether} historical co-purchases from ${opp.sourceCustomers} buyers (${(opp.crossSellRate * 100).toFixed(1)}% attach rate). Recommending ${opp.targetProductName} to ${opp.eligibleCustomerCount} eligible buyers.`,
          sourceProductId: opp.sourceProductId,
          targetProductId: opp.targetProductId,
          recommendedProductName: opp.targetProductName,
          targetCustomerCount: opp.eligibleCustomerCount,
          estimatedValue: opp.expectedRevenue,
          confidence: opp.crossSellRate,
          evidence: {
            sourceProductName: opp.sourceProductName,
            targetProductName: opp.targetProductName,
            targetPrice: opp.targetProductPrice,
            sourceCustomers: opp.sourceCustomers,
            customersTogether: opp.customersTogether,
            eligibleCustomerCount: opp.eligibleCustomerCount,
            attachRate: opp.crossSellRate,
            sampleSize: opp.sourceCustomers,
          },
          score: Number((1 - idx * 0.1).toFixed(2)),
          scoringBreakdown: {
            normalizedEstimatedValue: 1.0,
            evidenceStrength: 0.8,
            confidence: opp.crossSellRate,
            formula: "score = (normalizedEstimatedValue * 0.5) + (evidenceStrength * 0.3) + (confidence * 0.2)",
          },
          status: opp.status,
        }));

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Toast Notification */}
      {toast && (
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
      )}

      {/* Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent">
                  RazorGrowth
                </span>
                <span className="text-xs px-2 py-0.5 font-medium rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Razorpay Buildathon 2026
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                AI Growth & Agentic Commerce Track
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Razorpay API: Test Mode Active
            </div>

            <Button
              size="sm"
              onClick={() => setShowChatDrawer(true)}
              className="gap-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold shadow-md shadow-indigo-500/20 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>AI Growth Agent</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAgentPanel(true)}
              className="gap-1.5 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/50 cursor-pointer"
            >
              <Bot className="w-4 h-4 text-purple-600" />
              <span className="hidden sm:inline">Developer Tools</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={loadDashboardData}
              disabled={refreshing}
              className="gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-1.5 border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Merchant Welcome Banner & Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="sm:col-span-2 lg:col-span-1 p-5 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white shadow-lg flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Active Merchant
              </span>
              <h2 className="text-xl font-bold mt-1 text-white">{merchant?.name || "TechNova Store"}</h2>
              <p className="text-xs text-neutral-400 mt-0.5">{merchant?.email || "merchant@technovastore.com"}</p>
            </div>
            <div className="mt-4 pt-4 border-t border-neutral-700/60 flex items-center justify-between text-xs text-neutral-300">
              <span>Currency: {merchant?.currency || "INR"} (₹)</span>
              <span className="text-emerald-400 font-medium">● Verified Live</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Total Pipeline Value</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-neutral-900 dark:text-white">
                ₹{totalEstimatedRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <p className="text-xs text-neutral-500 mt-1">Potential across {opportunities.length} opportunities</p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-emerald-200/80 dark:border-emerald-900/60 shadow-sm flex flex-col justify-between bg-gradient-to-b from-emerald-50/30 to-transparent dark:from-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Realized Revenue
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                ₹{(merchant?.counts?.realizedRevenue || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Confirmed from {merchant?.counts?.actionsByStatus?.EXECUTED || 0} paid actions
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Eligible Customer Reach</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-neutral-900 dark:text-white">
                {totalEligibleCustomers} Customers
              </div>
              <p className="text-xs text-neutral-500 mt-1">Pre-validated historical buyers</p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Growth Actions</span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-neutral-900 dark:text-white">
                  {merchant?.counts.growthActions || 0}
                </span>
                <span className="text-xs text-emerald-600 font-medium">
                  {merchant?.counts.actionsByStatus?.EXECUTED || 0} Paid
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
                <span>{merchant?.counts.actionsByStatus?.PENDING_APPROVAL || 0} Pending</span>
                <span>•</span>
                <span>{merchant?.counts.actionsByStatus?.EXECUTING || 0} Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Conversational AI Agent Quick Action Banner */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-blue-900/10 border border-indigo-200 dark:border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-neutral-900 dark:text-white">
                  Autonomous AI Commerce Agent
                </h4>
                <span className="text-[10px] px-2 py-0.5 font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Active & Ready
                </span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                Instruct the AI agent to analyze cross-sell opportunities, verify customer eligibility, and prepare batch GrowthActions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => setShowChatDrawer(true)}
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold text-xs shadow-sm gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Chat with AI Agent
            </Button>
          </div>
        </div>

        {/* Merchant Store Data & Razorpay Integration Section */}
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-500" />
                Store Integration & Data Ingestion
              </h3>
              <p className="text-xs text-neutral-500">
                Connect Razorpay Test Mode and synchronize transaction history or import product catalog.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                Customers: <strong>{merchant?.counts.customers || 0}</strong>
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                Orders: <strong>{merchant?.counts.orders || 0}</strong>
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                Products: <strong>{merchant?.counts.products || 0}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Razorpay Connection Card */}
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    Razorpay Gateway
                  </span>
                  {connectionInfo?.connected ? (
                    <span className="text-[10px] px-2 py-0.5 font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Connected (Test)
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 font-semibold rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                      Not Connected
                    </span>
                  )}
                </div>
                <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                  {connectionInfo?.connected ? (
                    <>
                      <p className="font-mono text-neutral-800 dark:text-neutral-200">
                        {connectionInfo.connection?.keyId.slice(0, 12)}...
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Last Synced: {connectionInfo.connection?.lastSyncedAt ? new Date(connectionInfo.connection.lastSyncedAt).toLocaleString() : "Never"}
                      </p>
                    </>
                  ) : (
                    <p className="text-neutral-400">
                      Connect your Razorpay Test Key ID & Secret to sync live orders and send payment links.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                {connectionInfo?.connected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnectRazorpay}
                    className="w-full text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 cursor-pointer"
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setShowConnectModal(true)}
                    className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  >
                    Connect Razorpay
                  </Button>
                )}
              </div>
            </div>

            {/* Data Sync Card */}
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Razorpay Data Sync
                </span>
                <p className="mt-1 text-xs text-neutral-500">
                  Fetch customer records and transaction orders directly from Razorpay APIs.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncingType !== null}
                  onClick={() => handleSyncData("customers")}
                  className="text-xs px-2 cursor-pointer"
                >
                  {syncingType === "customers" ? "Syncing..." : "Customers"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncingType !== null}
                  onClick={() => handleSyncData("orders")}
                  className="text-xs px-2 cursor-pointer"
                >
                  {syncingType === "orders" ? "Syncing..." : "Orders"}
                </Button>
                <Button
                  size="sm"
                  disabled={syncingType !== null}
                  onClick={() => handleSyncData("all")}
                  className="text-xs px-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 cursor-pointer"
                >
                  {syncingType === "all" ? "Syncing..." : "Sync All"}
                </Button>
              </div>
            </div>

            {/* Product Catalog Import Card */}
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Product Catalog
                </span>
                <p className="mt-1 text-xs text-neutral-500">
                  Import products with prices and categories using simple CSV ingestion.
                </p>
              </div>

              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCsvModal(true)}
                  className="w-full text-xs gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Product CSV
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Buyer Readiness Section (Phase 5) */}
        <AIBuyerReadinessCard
          onOpenPreview={() => setShowAIBuyerModal(true)}
          onImportCsv={() => setShowCsvModal(true)}
        />

        {/* AI Growth Intelligence Section (Phase 3) */}
        <GrowthIntelligencePanel
          opportunities={displayRankedOpportunities}
          snapshot={growthSnapshot}
          analyzing={analyzingGrowth}
          onRunAnalysis={handleRunGrowthAnalysis}
          onSelectOpportunity={handleSelectOpportunityById}
          onPlanOpportunity={handlePlanOpportunity}
          aiEnhanced={growthAiEnhanced}
        />

        {/* AI Agentic Growth Planner Section (Phase 4) */}
        {selectedPlannerOpportunityId && (
          <div id="growth-planner-section" className="scroll-mt-6">
            <AgenticGrowthPlanner
              opportunityId={selectedPlannerOpportunityId}
              onReviewActions={(oppId) => {
                handleSelectOpportunityById(oppId);
              }}
              onPreparationComplete={() => {
                loadDashboardData();
                showToast("success", "Growth plan actions prepared in PENDING_APPROVAL status.");
              }}
            />
          </div>
        )}

        {/* Opportunities Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" />
                Discovered Opportunities Catalog
              </h3>
              <p className="text-sm text-neutral-500">
                Derived deterministically by the cross-sell analytics engine from customer transaction history.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <RefreshCw className="w-8 h-8 text-neutral-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-neutral-500">Analyzing transaction pairs and customer graph...</p>
            </div>
          ) : opportunities.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <Package className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
              <h4 className="font-semibold text-neutral-700 dark:text-neutral-300">No opportunities detected</h4>
              <p className="text-sm text-neutral-500 mt-1">Run the database seed script to populate sample transactions.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50/80 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 text-xs uppercase tracking-wider font-semibold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="py-3.5 px-4">Opportunity (Source → Target)</th>
                      <th className="py-3.5 px-4">Target Price</th>
                      <th className="py-3.5 px-4">Cross-Sell Rate</th>
                      <th className="py-3.5 px-4">Eligible Reach</th>
                      <th className="py-3.5 px-4">Estimated Revenue</th>
                      <th className="py-3.5 px-4">Actions</th>
                      <th className="py-3.5 px-4 text-right">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {opportunities.map((opp) => {
                      const crossSellPercent = (opp.crossSellRate * 100).toFixed(1);
                      return (
                        <tr
                          key={opp.id}
                          className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition-colors"
                        >
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                                {opp.sourceProductName}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                              <span className="font-semibold text-blue-600 dark:text-blue-400">
                                {opp.targetProductName}
                              </span>
                            </div>
                            <span className="text-xs text-neutral-500">
                              {opp.customersTogether} co-purchases from {opp.sourceCustomers} source buyers
                            </span>
                          </td>
                          <td className="py-4 px-4 font-mono font-medium">
                            ₹{opp.targetProductPrice.toLocaleString("en-IN")}
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                                {crossSellPercent}%
                              </span>
                              <div className="w-16 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${Math.min(opp.crossSellRate * 100, 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center gap-1 font-medium text-neutral-700 dark:text-neutral-300">
                              <Users className="w-3.5 h-3.5 text-neutral-400" />
                              {opp.eligibleCustomerCount} customers
                            </span>
                          </td>
                          <td className="py-4 px-4 font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            ₹{opp.expectedRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-xs px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                              {opp.actionCount} created
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenOpportunity(opp)}
                              className="gap-1 text-xs font-semibold hover:border-blue-500 hover:text-blue-600"
                            >
                              View Customers
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Eligible Customers Drawer */}
      {selectedOpportunity && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs flex justify-end transition-opacity">
          <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 h-full shadow-2xl flex flex-col border-l border-neutral-200 dark:border-neutral-800">
            {/* Header */}
            <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-start justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Opportunity Review
                </span>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
                  {selectedOpportunity.sourceProductName} → {selectedOpportunity.targetProductName}
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Target Offer Price: <strong className="text-neutral-900 dark:text-white">₹{selectedOpportunity.targetProductPrice}</strong> • Cross-sell Conversion Rate: <strong>{(selectedOpportunity.crossSellRate * 100).toFixed(1)}%</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedOpportunity(null)}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content List */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  Eligible Customers ({eligibleCustomers.length})
                </h4>
                <span className="text-xs text-neutral-500">
                  Verified: Bought {selectedOpportunity.sourceProductName}, never bought {selectedOpportunity.targetProductName}
                </span>
              </div>

              {/* Batch Action Toolbar */}
              {eligibleCustomers.length > 0 && !loadingCustomers && (() => {
                const uncreatedCustomers = eligibleCustomers.filter((c) => !c.existingAction);
                const pendingApprovalCustomers = eligibleCustomers.filter(
                  (c) => c.existingAction?.status === "PENDING_APPROVAL"
                );

                if (uncreatedCustomers.length === 0 && pendingApprovalCustomers.length === 0) {
                  return null;
                }

                return (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        Opportunity Batch Automation
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {uncreatedCustomers.length > 0 && (
                        <Button
                          onClick={handleCreateBatchGrowthActions}
                          disabled={creatingBatchActions}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
                        >
                          {creatingBatchActions ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                              Creating Actions...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                              Create Actions for All {uncreatedCustomers.length} Eligible Customers
                            </>
                          )}
                        </Button>
                      )}

                      {pendingApprovalCustomers.length > 0 && (
                        <Button
                          onClick={handleBulkApprove}
                          disabled={bulkApproving}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
                        >
                          {bulkApproving ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                              Approving Actions...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                              Approve All {pendingApprovalCustomers.length} Pending Actions
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {loadingCustomers ? (
                <div className="py-12 text-center text-neutral-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Checking customer eligibility criteria...
                </div>
              ) : eligibleCustomers.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 rounded-xl bg-neutral-50 dark:bg-neutral-800/40">
                  No eligible customers remaining for this product pair.
                </div>
              ) : (
                <div className="space-y-3">
                  {eligibleCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                          {customer.name}
                          {customer.existingAction && getStatusBadge(customer.existingAction.status)}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">{customer.email}</div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                          History: {customer.totalPaidOrders} paid orders • Total Spend: ₹{customer.totalSpend.toLocaleString("en-IN")}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {customer.existingAction ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenAction(customer.existingAction!.id)}
                            className="text-xs font-semibold"
                          >
                            Open Action
                            <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleCreateGrowthAction(customer)}
                            disabled={creatingActionForCustomer === customer.id}
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                          >
                            {creatingActionForCustomer === customer.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                                Creating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 mr-1" />
                                Create GrowthAction
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GrowthAction Detail & Execution Modal */}
      {activeActionId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                    GrowthAction Overview
                  </h3>
                  {actionDetail && getStatusBadge(actionDetail.status)}
                </div>
                <p className="text-xs text-neutral-500 font-mono mt-0.5">
                  Action ID: {activeActionId}
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveActionId(null);
                  setActionDetail(null);
                  if (selectedOpportunity) {
                    refreshOpportunityCustomers(selectedOpportunity.id);
                  }
                  loadDashboardData();
                }}
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
                          onClick={handleApproveAction}
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
                          onClick={handleExecuteAction}
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
                            onClick={handleExecuteAction}
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
                              onClick={() => copyToClipboard(actionDetail.parameters.shortUrl!)}
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
                              onClick={() => setShowQrModal(true)}
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
                                onClick={handleResendEmail}
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
                                onClick={handleSimulateWebhook}
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
      )}

      {/* QR Code Modal */}
      {showQrModal && actionDetail?.parameters.shortUrl && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-neutral-200 dark:border-neutral-800 text-center space-y-4">
            <h4 className="font-bold text-neutral-900 dark:text-white text-base">
              Scan to Pay (Razorpay Test Mode)
            </h4>
            <div className="flex justify-center py-2">
              <QRCode value={actionDetail.parameters.shortUrl} size={180} />
            </div>
            <p className="text-xs text-neutral-500 break-all font-mono">
              {actionDetail.parameters.shortUrl}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQrModal(false)}
              className="w-full text-xs font-semibold"
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* AI Agent Tool Demonstration Panel */}
      {showAgentPanel && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white dark:bg-neutral-900 h-full shadow-2xl flex flex-col border-l border-neutral-200 dark:border-neutral-800">
            <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                  Deterministic AI Agent Tools
                </h3>
              </div>
              <button
                onClick={() => setShowAgentPanel(false)}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-300">
                <strong>Phase 1 AI Architecture:</strong> Deterministic backend tools that expose the business logic to LLM agents without bypassing policy checks, authorization, or authoritative database pricing.
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-neutral-800 dark:text-neutral-200 text-xs uppercase tracking-wider">
                  Test Deterministic Tools
                </h4>

                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={runningTool}
                    onClick={() => handleRunAgentTool("analyzeCrossSell", {})}
                    className="justify-start text-xs font-mono"
                  >
                    1. tool: analyzeCrossSell()
                  </Button>

                  {opportunities[0] && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={runningTool}
                      onClick={() =>
                        handleRunAgentTool("isCustomerEligible", {
                          customerId: opportunities[0].eligibleCustomerIds[0],
                          targetProductId: opportunities[0].targetProductId,
                          sourceProductId: opportunities[0].sourceProductId,
                        })
                      }
                      className="justify-start text-xs font-mono"
                    >
                      2. tool: isCustomerEligible(customerId, targetProductId)
                    </Button>
                  )}

                  {opportunities[0] && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={runningTool}
                      onClick={() =>
                        handleRunAgentTool("createGrowthAction", {
                          opportunityId: opportunities[0].id,
                          customerId: opportunities[0].eligibleCustomerIds[0],
                          targetProductId: opportunities[0].targetProductId,
                          sourceProductId: opportunities[0].sourceProductId,
                        })
                      }
                      className="justify-start text-xs font-mono"
                    >
                      3. tool: createGrowthAction(opportunityId, customerId)
                    </Button>
                  )}
                </div>
              </div>

              {/* Output Display */}
              <div className="space-y-2">
                <h4 className="font-semibold text-xs text-neutral-500 uppercase tracking-wider">
                  Agent Tool Response (Structured JSON)
                </h4>
                <pre className="p-4 rounded-xl bg-neutral-900 text-neutral-100 text-xs font-mono overflow-x-auto max-h-72 border border-neutral-800">
                  {runningTool ? "Executing deterministic backend tool..." : agentOutput || "// Click a tool above to execute and view authoritative JSON response"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connect Razorpay Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
                  <Key className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                  Connect Razorpay Test Mode
                </h3>
              </div>
              <button
                onClick={() => setShowConnectModal(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Provide your Razorpay Test Key ID and Key Secret. Credentials are encrypted at rest using AES-256-GCM.
            </p>

            <form onSubmit={handleConnectRazorpay} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                  Key ID
                </label>
                <input
                  type="text"
                  required
                  value={connectKeyId}
                  onChange={(e) => setConnectKeyId(e.target.value)}
                  placeholder="rzp_test_..."
                  className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                  Key Secret
                </label>
                <input
                  type="password"
                  required
                  value={connectKeySecret}
                  onChange={(e) => setConnectKeySecret(e.target.value)}
                  placeholder="••••••••••••••••••••"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConnectModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={connecting}
                  size="sm"
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Validating with Razorpay...
                    </>
                  ) : (
                    "Save & Connect"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Product CSV Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                  <Upload className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                  Import Product Catalog (CSV)
                </h3>
              </div>
              <button
                onClick={() => setShowCsvModal(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Paste your CSV content below or load a template. Required columns: <code>name</code>, <code>price</code>.
            </p>

            <form onSubmit={handleImportCsv} className="space-y-3">
              <div>
                <textarea
                  rows={8}
                  required
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={`name,description,category,price,active\nWireless Mouse,Ergonomic wireless mouse,Accessories,1299,true\nMechanical Keyboard,RGB mechanical keyboard,Accessories,4999,true\n4K Ultra Monitor,32-inch 4K UHD display,Monitors,24999,true`}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCsvText(
                      `name,description,category,price,active\nPro Wireless Earbuds,Active noise cancelling earbuds,Audio,3999,true\nSmart Fitness Band,Water resistant fitness tracker,Wearables,2499,true\nFast Wireless Charger,15W Qi fast charging pad,Accessories,999,true`
                    )
                  }
                  className="text-[11px] text-neutral-500"
                >
                  Load Sample Template
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCsvModal(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={importingCsv}
                    size="sm"
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    {importingCsv ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      "Import Products"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merchant-Facing Conversational AI Agent Drawer */}
      <AgentChatDrawer
        isOpen={showChatDrawer}
        onClose={() => setShowChatDrawer(false)}
        merchantId={merchant?.id || null}
        merchantName={merchant?.name}
        onRefreshDashboard={loadDashboardData}
      />

      {/* AI Buyer Preview & Discovery Modal (Phase 5) */}
      <AIBuyerPreviewModal
        isOpen={showAIBuyerModal}
        onClose={() => setShowAIBuyerModal(false)}
        currency={merchant?.currency || "INR"}
      />
    </div>
  );
}
