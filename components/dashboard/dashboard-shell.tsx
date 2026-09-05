"use client";

import React, { useRef, useEffect } from "react";
import { ToastNotificationBanner } from "@/components/dashboard/toast-notification";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { PrimaryGrowthOpportunity } from "@/components/dashboard/primary-growth-opportunity";
import { GrowthActionLifecycle } from "@/components/dashboard/growth-action-lifecycle";
import { StoreIntegration } from "@/components/dashboard/store-integration";
import { OpportunitiesCatalog } from "@/components/dashboard/opportunities-catalog";
import { OpportunityDrawer } from "@/components/dashboard/modals/opportunity-drawer";
import { ActionDetailModal } from "@/components/dashboard/modals/action-detail-modal";
import { AgentToolsModal } from "@/components/dashboard/modals/agent-tools-modal";
import { RazorpayConnectModal } from "@/components/dashboard/modals/razorpay-connect-modal";
import { CsvImportModal } from "@/components/dashboard/modals/csv-import-modal";
import { AgentChatDrawer } from "@/components/agent-chat-drawer";
import { AIBuyerReadinessCard } from "@/components/ai-buyer-readiness";
import { AIBuyerPreviewModal } from "@/components/ai-buyer-preview-modal";

import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useDashboardOverview } from "@/hooks/use-dashboard-overview";
import { useGrowthIntelligence } from "@/hooks/use-growth-intelligence";
import { useRazorpay } from "@/hooks/use-razorpay";
import { useDashboardModals } from "@/hooks/use-dashboard-modals";

export function DashboardShell() {
  const { toast, showToast } = useToast();
  const { logout } = useAuthSession();

  const {
    merchant,
    opportunities,
    loading,
    refreshing,
    loadOverview,
  } = useDashboardOverview({ showToast });

  const {
    displayRankedOpportunities,
    growthSnapshot,
    analyzingGrowth,
    growthAiEnhanced,
    handleRunGrowthAnalysis,
  } = useGrowthIntelligence({
    opportunities,
    showToast,
    onRefreshDashboard: loadOverview,
  });

  const {
    connectionInfo,
    syncingType,
    handleDisconnectRazorpay,
    handleSyncData,
    loadConnection,
  } = useRazorpay({
    showToast,
    onRefresh: loadOverview,
  });

  const {
    showChatDrawer,
    showAgentPanel,
    showConnectModal,
    showCsvModal,
    showAIBuyerModal,
    selectedOpportunity,
    activeActionId,
    selectedPlannerOpportunityId,
    openChat,
    closeChat,
    openAgentPanel,
    closeAgentPanel,
    openConnect,
    closeConnect,
    openCsvImport,
    closeCsvImport,
    openAIBuyerPreview,
    closeAIBuyerPreview,
    openOpportunity,
    closeOpportunity,
    openAction,
    closeAction,
    selectPlannerOpportunity,
  } = useDashboardModals();

  const handleRefreshAll = () => {
    loadOverview();
    loadConnection();
  };

  // Smooth scroll ref for Agentic Growth Planner section
  const plannerSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPlannerOpportunityId && plannerSectionRef.current) {
      plannerSectionRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedPlannerOpportunityId]);

  const handleSelectOpportunityById = (opportunityId: string) => {
    const found = opportunities.find((o) => o.id === opportunityId);
    if (found) {
      openOpportunity(found);
    }
  };

  const primaryRankedOpp = displayRankedOpportunities[0] || null;
  const primaryOpp = primaryRankedOpp
    ? opportunities.find((o) => o.id === primaryRankedOpp.id) || opportunities[0] || null
    : opportunities[0] || null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Toast Notification */}
      <ToastNotificationBanner toast={toast} />

      {/* Navigation Header */}
      <DashboardHeader
        refreshing={refreshing}
        merchant={merchant}
        connectionInfo={connectionInfo}
        onOpenChatDrawer={openChat}
        onOpenAgentPanel={openAgentPanel}
        onRefresh={handleRefreshAll}
        onLogout={logout}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* 1. Revenue Snapshot */}
        <DashboardOverview merchant={merchant} opportunities={opportunities} />

        {/* 2. Primary Growth Opportunity Hero */}
        <PrimaryGrowthOpportunity
          opportunity={primaryOpp}
          rankedOpportunity={primaryRankedOpp}
          onOpenOpportunity={openOpportunity}
          onPlanOpportunity={selectPlannerOpportunity}
        />

        {/* 3. Revenue Opportunity Pipeline */}
        <OpportunitiesCatalog
          opportunities={opportunities}
          loading={loading}
          onOpenOpportunity={openOpportunity}
          onPlanOpportunity={selectPlannerOpportunity}
          onRunAnalysis={handleRunGrowthAnalysis}
          analyzing={analyzingGrowth}
          snapshot={growthSnapshot}
          aiEnhanced={growthAiEnhanced}
        />

        {/* 4. Growth Action Execution Lifecycle */}
        <GrowthActionLifecycle
          merchant={merchant}
          opportunities={opportunities}
          selectedPlannerOpportunityId={selectedPlannerOpportunityId}
          plannerSectionRef={plannerSectionRef}
          onReviewActions={handleSelectOpportunityById}
          onPreparationComplete={() => {
            handleRefreshAll();
            showToast("success", "Growth plan actions prepared in PENDING_APPROVAL status.");
          }}
          onOpenOpportunity={openOpportunity}
        />

        {/* 5. AI Buyer Readiness Section */}
        <AIBuyerReadinessCard
          onOpenPreview={openAIBuyerPreview}
          onImportCsv={openCsvImport}
        />

        {/* 6. Integration Hub & Store Infrastructure */}
        <StoreIntegration
          merchant={merchant}
          connectionInfo={connectionInfo}
          syncingType={syncingType}
          onOpenConnectModal={openConnect}
          onDisconnectRazorpay={handleDisconnectRazorpay}
          onSyncData={handleSyncData}
          onOpenCsvModal={openCsvImport}
        />
      </main>

      {/* Eligible Customers Drawer */}
      <OpportunityDrawer
        selectedOpportunity={selectedOpportunity}
        merchantId={merchant?.id}
        onClose={closeOpportunity}
        onOpenAction={openAction}
        onActionCreatedOrApproved={handleRefreshAll}
        showToast={showToast}
      />

      {/* GrowthAction Detail & Execution Modal (QR code modal self-contained inside) */}
      <ActionDetailModal
        activeActionId={activeActionId}
        merchantId={merchant?.id}
        onClose={() => {
          closeAction();
          handleRefreshAll();
        }}
        onActionUpdated={handleRefreshAll}
        showToast={showToast}
      />

      {/* AI Agent Tool Demonstration Panel */}
      <AgentToolsModal
        isOpen={showAgentPanel}
        onClose={closeAgentPanel}
        merchantId={merchant?.id}
        opportunities={opportunities}
        onToolExecuted={handleRefreshAll}
      />

      {/* Connect Razorpay Modal */}
      <RazorpayConnectModal
        isOpen={showConnectModal}
        onClose={closeConnect}
        onSuccess={handleRefreshAll}
        showToast={showToast}
      />

      {/* Import Product CSV Modal */}
      <CsvImportModal
        isOpen={showCsvModal}
        onClose={closeCsvImport}
        onSuccess={handleRefreshAll}
        showToast={showToast}
      />

      {/* Merchant-Facing Conversational AI Agent Drawer */}
      <AgentChatDrawer
        isOpen={showChatDrawer}
        onClose={closeChat}
        merchantId={merchant?.id || null}
        merchantName={merchant?.name}
        onRefreshDashboard={handleRefreshAll}
      />

      {/* AI Buyer Preview & Discovery Modal (Phase 5) */}
      <AIBuyerPreviewModal
        isOpen={showAIBuyerModal}
        onClose={closeAIBuyerPreview}
        currency={merchant?.currency || "INR"}
      />
    </div>
  );
}
