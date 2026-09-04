"use client";

import React, { useState, useRef, useEffect } from "react";
import { ToastNotificationBanner } from "@/components/dashboard/toast-notification";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { StoreIntegration } from "@/components/dashboard/store-integration";
import { OpportunitiesCatalog } from "@/components/dashboard/opportunities-catalog";
import { OpportunityDrawer } from "@/components/dashboard/modals/opportunity-drawer";
import { ActionDetailModal } from "@/components/dashboard/modals/action-detail-modal";
import { AgentToolsModal } from "@/components/dashboard/modals/agent-tools-modal";
import { RazorpayConnectModal } from "@/components/dashboard/modals/razorpay-connect-modal";
import { CsvImportModal } from "@/components/dashboard/modals/csv-import-modal";
import { AgentChatDrawer } from "@/components/agent-chat-drawer";
import { GrowthIntelligencePanel } from "@/components/growth-intelligence-panel";
import { AgenticGrowthPlanner } from "@/components/agentic-growth-planner";
import { AIBuyerReadinessCard } from "@/components/ai-buyer-readiness";
import { AIBuyerPreviewModal } from "@/components/ai-buyer-preview-modal";

import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useDashboardOverview } from "@/hooks/use-dashboard-overview";
import { useGrowthIntelligence } from "@/hooks/use-growth-intelligence";
import { useRazorpay } from "@/hooks/use-razorpay";
import { OpportunityItem } from "@/lib/dashboard/types";

export default function DashboardPage() {
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

  const handleRefreshAll = () => {
    loadOverview();
    loadConnection();
  };

  // User interaction selections & modal toggles
  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityItem | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [selectedPlannerOpportunityId, setSelectedPlannerOpportunityId] = useState<string | null>(null);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showAIBuyerModal, setShowAIBuyerModal] = useState(false);

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
      setSelectedOpportunity(found);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Toast Notification */}
      <ToastNotificationBanner toast={toast} />

      {/* Navigation Header */}
      <DashboardHeader
        refreshing={refreshing}
        onOpenChatDrawer={() => setShowChatDrawer(true)}
        onOpenAgentPanel={() => setShowAgentPanel(true)}
        onRefresh={handleRefreshAll}
        onLogout={logout}
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
          onPlanOpportunity={(oppId) => setSelectedPlannerOpportunityId(oppId)}
          aiEnhanced={growthAiEnhanced}
        />

        {/* AI Agentic Growth Planner Section (Phase 4) */}
        {selectedPlannerOpportunityId && (
          <div ref={plannerSectionRef} id="growth-planner-section" className="scroll-mt-6">
            <AgenticGrowthPlanner
              opportunityId={selectedPlannerOpportunityId}
              onReviewActions={handleSelectOpportunityById}
              onPreparationComplete={() => {
                handleRefreshAll();
                showToast("success", "Growth plan actions prepared in PENDING_APPROVAL status.");
              }}
            />
          </div>
        )}

        {/* Opportunities Catalog Section */}
        <OpportunitiesCatalog
          opportunities={opportunities}
          loading={loading}
          onOpenOpportunity={(opp) => setSelectedOpportunity(opp)}
        />
      </main>

      {/* Eligible Customers Drawer */}
      <OpportunityDrawer
        selectedOpportunity={selectedOpportunity}
        merchantId={merchant?.id}
        onClose={() => setSelectedOpportunity(null)}
        onOpenAction={(actionId) => setActiveActionId(actionId)}
        onActionCreatedOrApproved={handleRefreshAll}
        showToast={showToast}
      />

      {/* GrowthAction Detail & Execution Modal (QR code modal self-contained inside) */}
      <ActionDetailModal
        activeActionId={activeActionId}
        merchantId={merchant?.id}
        onClose={() => {
          setActiveActionId(null);
          handleRefreshAll();
        }}
        onActionUpdated={handleRefreshAll}
        showToast={showToast}
      />

      {/* AI Agent Tool Demonstration Panel */}
      <AgentToolsModal
        isOpen={showAgentPanel}
        onClose={() => setShowAgentPanel(false)}
        merchantId={merchant?.id}
        opportunities={opportunities}
        onToolExecuted={handleRefreshAll}
      />

      {/* Connect Razorpay Modal */}
      <RazorpayConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        onSuccess={handleRefreshAll}
        showToast={showToast}
      />

      {/* Import Product CSV Modal */}
      <CsvImportModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onSuccess={handleRefreshAll}
        showToast={showToast}
      />

      {/* Merchant-Facing Conversational AI Agent Drawer */}
      <AgentChatDrawer
        isOpen={showChatDrawer}
        onClose={() => setShowChatDrawer(false)}
        merchantId={merchant?.id || null}
        merchantName={merchant?.name}
        onRefreshDashboard={handleRefreshAll}
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
