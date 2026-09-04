"use client";

import React, { useState } from "react";
import { ToastNotificationBanner } from "@/components/dashboard/toast-notification";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { StoreIntegration } from "@/components/dashboard/store-integration";
import { OpportunitiesCatalog } from "@/components/dashboard/opportunities-catalog";
import { OpportunityDrawer } from "@/components/dashboard/modals/opportunity-drawer";
import { ActionDetailModal } from "@/components/dashboard/modals/action-detail-modal";
import { QrModal } from "@/components/dashboard/modals/qr-modal";
import { AgentToolsModal } from "@/components/dashboard/modals/agent-tools-modal";
import { RazorpayConnectModal } from "@/components/dashboard/modals/razorpay-connect-modal";
import { CsvImportModal } from "@/components/dashboard/modals/csv-import-modal";
import { AgentChatDrawer } from "@/components/agent-chat-drawer";
import {
  GrowthIntelligencePanel,
  RankedOpportunityItem,
} from "@/components/growth-intelligence-panel";
import { AgenticGrowthPlanner } from "@/components/agentic-growth-planner";
import { AIBuyerReadinessCard } from "@/components/ai-buyer-readiness";
import { AIBuyerPreviewModal } from "@/components/ai-buyer-preview-modal";

import { useToast } from "@/hooks/use-toast";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useRazorpay } from "@/hooks/use-razorpay";
import { useGrowthActions } from "@/hooks/use-growth-actions";

export default function DashboardPage() {
  const { toast, showToast } = useToast();

  const {
    merchant,
    opportunities,
    connectionInfo,
    loading,
    refreshing,
    growthSnapshot,
    rankedOpportunities,
    growthAiEnhanced,
    analyzingGrowth,
    loadDashboardData,
    handleRunGrowthAnalysis,
  } = useDashboardData({ showToast });

  const {
    connectKeyId,
    setConnectKeyId,
    connectKeySecret,
    setConnectKeySecret,
    connecting,
    syncingType,
    handleConnectRazorpay,
    handleDisconnectRazorpay,
    handleSyncData,
  } = useRazorpay({
    showToast,
    onRefresh: loadDashboardData,
  });

  const {
    selectedOpportunity,
    setSelectedOpportunity,
    eligibleCustomers,
    loadingCustomers,
    activeActionId,
    setActiveActionId,
    actionDetail,
    setActionDetail,
    loadingAction,
    creatingActionForCustomer,
    creatingBatchActions,
    bulkApproving,
    approving,
    executing,
    simulatingWebhook,
    resendingEmail,
    refreshOpportunityCustomers,
    handleOpenOpportunity,
    handleSelectOpportunityById,
    handleOpenAction,
    handleCreateGrowthAction,
    handleCreateBatchGrowthActions,
    handleApproveAction,
    handleBulkApprove,
    handleExecuteAction,
    handleResendEmail,
    handleSimulateWebhook,
  } = useGrowthActions({
    merchant,
    opportunities,
    rankedOpportunities,
    showToast,
    onRefreshDashboard: loadDashboardData,
  });

  // Modal and drawer state
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showAIBuyerModal, setShowAIBuyerModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [selectedPlannerOpportunityId, setSelectedPlannerOpportunityId] = useState<string | null>(null);

  // Agent tools drawer state
  const [runningTool, setRunningTool] = useState(false);
  const [agentOutput, setAgentOutput] = useState<string | null>(null);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handlePlanOpportunity = (opportunityId: string) => {
    setSelectedPlannerOpportunityId(opportunityId);
    setTimeout(() => {
      const el = document.getElementById("growth-planner-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

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
      <ToastNotificationBanner toast={toast} />

      {/* Navigation Header */}
      <DashboardHeader
        refreshing={refreshing}
        onOpenChatDrawer={() => setShowChatDrawer(true)}
        onOpenAgentPanel={() => setShowAgentPanel(true)}
        onRefresh={loadDashboardData}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Merchant Welcome Banner & Stats */}
        <DashboardOverview merchant={merchant} opportunities={opportunities} />

        {/* Integration Hub Card */}
        <StoreIntegration
          merchant={merchant}
          connectionInfo={connectionInfo}
          syncingType={syncingType}
          onOpenConnectModal={() => setShowConnectModal(true)}
          onDisconnectRazorpay={handleDisconnectRazorpay}
          onSyncData={handleSyncData}
          onOpenCsvModal={() => setShowCsvModal(true)}
        />

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

        {/* Opportunities Catalog Section */}
        <OpportunitiesCatalog
          opportunities={opportunities}
          loading={loading}
          onOpenOpportunity={handleOpenOpportunity}
        />
      </main>

      {/* Eligible Customers Drawer */}
      <OpportunityDrawer
        selectedOpportunity={selectedOpportunity}
        eligibleCustomers={eligibleCustomers}
        loadingCustomers={loadingCustomers}
        creatingBatchActions={creatingBatchActions}
        bulkApproving={bulkApproving}
        creatingActionForCustomer={creatingActionForCustomer}
        onClose={() => setSelectedOpportunity(null)}
        onCreateBatchGrowthActions={handleCreateBatchGrowthActions}
        onBulkApprove={handleBulkApprove}
        onCreateGrowthAction={handleCreateGrowthAction}
        onOpenAction={handleOpenAction}
      />

      {/* GrowthAction Detail & Execution Modal */}
      <ActionDetailModal
        activeActionId={activeActionId}
        actionDetail={actionDetail}
        loadingAction={loadingAction}
        approving={approving}
        executing={executing}
        resendingEmail={resendingEmail}
        simulatingWebhook={simulatingWebhook}
        copiedUrl={copiedUrl}
        onClose={() => {
          setActiveActionId(null);
          setActionDetail(null);
          if (selectedOpportunity) {
            refreshOpportunityCustomers(selectedOpportunity.id);
          }
          loadDashboardData();
        }}
        onApprove={handleApproveAction}
        onExecute={handleExecuteAction}
        onResendEmail={handleResendEmail}
        onSimulateWebhook={handleSimulateWebhook}
        onCopyUrl={copyToClipboard}
        onShowQr={() => setShowQrModal(true)}
      />

      {/* QR Code Modal */}
      <QrModal
        isOpen={showQrModal}
        shortUrl={actionDetail?.parameters.shortUrl}
        onClose={() => setShowQrModal(false)}
      />

      {/* AI Agent Tool Demonstration Panel */}
      <AgentToolsModal
        isOpen={showAgentPanel}
        onClose={() => setShowAgentPanel(false)}
        runningTool={runningTool}
        agentOutput={agentOutput}
        opportunities={opportunities}
        onRunAgentTool={handleRunAgentTool}
      />

      {/* Connect Razorpay Modal */}
      <RazorpayConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        connectKeyId={connectKeyId}
        setConnectKeyId={setConnectKeyId}
        connectKeySecret={connectKeySecret}
        setConnectKeySecret={setConnectKeySecret}
        connecting={connecting}
        onConnect={(e) => handleConnectRazorpay(e, () => setShowConnectModal(false))}
      />

      {/* Import Product CSV Modal */}
      <CsvImportModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onSuccess={loadDashboardData}
        showToast={showToast}
      />

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
