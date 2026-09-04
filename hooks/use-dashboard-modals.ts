import { useState, useCallback } from "react";
import { OpportunityItem } from "@/lib/dashboard/types";

export function useDashboardModals() {
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showAIBuyerModal, setShowAIBuyerModal] = useState(false);

  const [selectedOpportunity, setSelectedOpportunity] = useState<OpportunityItem | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [selectedPlannerOpportunityId, setSelectedPlannerOpportunityId] = useState<string | null>(null);

  const openChat = useCallback(() => setShowChatDrawer(true), []);
  const closeChat = useCallback(() => setShowChatDrawer(false), []);

  const openAgentPanel = useCallback(() => setShowAgentPanel(true), []);
  const closeAgentPanel = useCallback(() => setShowAgentPanel(false), []);

  const openConnect = useCallback(() => setShowConnectModal(true), []);
  const closeConnect = useCallback(() => setShowConnectModal(false), []);

  const openCsvImport = useCallback(() => setShowCsvModal(true), []);
  const closeCsvImport = useCallback(() => setShowCsvModal(false), []);

  const openAIBuyerPreview = useCallback(() => setShowAIBuyerModal(true), []);
  const closeAIBuyerPreview = useCallback(() => setShowAIBuyerModal(false), []);

  const openOpportunity = useCallback((opportunity: OpportunityItem) => {
    setSelectedOpportunity(opportunity);
  }, []);
  const closeOpportunity = useCallback(() => setSelectedOpportunity(null), []);

  const openAction = useCallback((actionId: string) => {
    setActiveActionId(actionId);
  }, []);
  const closeAction = useCallback(() => setActiveActionId(null), []);

  const selectPlannerOpportunity = useCallback((opportunityId: string) => {
    setSelectedPlannerOpportunityId(opportunityId);
  }, []);
  const clearPlannerOpportunity = useCallback(() => {
    setSelectedPlannerOpportunityId(null);
  }, []);

  return {
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
    clearPlannerOpportunity,
  };
}
