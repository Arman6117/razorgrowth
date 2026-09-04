import { useState, useCallback, useEffect } from "react";
import {
  MerchantInfo,
  OpportunityItem,
  RazorpayConnectionInfo,
} from "@/lib/dashboard/types";
import {
  GrowthSnapshotData,
  RankedOpportunityItem,
} from "@/components/growth-intelligence-panel";

interface UseDashboardDataOptions {
  showToast: (type: "success" | "error" | "info", message: string) => void;
  onOpportunitiesLoaded?: (opportunities: OpportunityItem[]) => void;
}

export function useDashboardData({ showToast, onOpportunitiesLoaded }: UseDashboardDataOptions) {
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [connectionInfo, setConnectionInfo] = useState<RazorpayConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // AI Growth Intelligence state (Phase 3)
  const [growthSnapshot, setGrowthSnapshot] = useState<GrowthSnapshotData | null>(null);
  const [rankedOpportunities, setRankedOpportunities] = useState<RankedOpportunityItem[]>([]);
  const [analyzingGrowth, setAnalyzingGrowth] = useState(false);
  const [growthAiEnhanced, setGrowthAiEnhanced] = useState(false);

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
        const opps: OpportunityItem[] = data.opportunities || [];
        setOpportunities(opps);
        if (onOpportunitiesLoaded) {
          onOpportunitiesLoaded(opps);
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
  }, [showToast, onOpportunitiesLoaded]);

  // Run AI Growth Intelligence Analysis (Phase 3)
  const handleRunGrowthAnalysis = async (onSuccess?: (firstOppId?: string) => void) => {
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

      const firstOppId = data.opportunities && data.opportunities.length > 0 ? data.opportunities[0].id : undefined;
      if (onSuccess && firstOppId) {
        onSuccess(firstOppId);
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

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  return {
    merchant,
    setMerchant,
    opportunities,
    setOpportunities,
    connectionInfo,
    setConnectionInfo,
    loading,
    refreshing,
    growthSnapshot,
    setGrowthSnapshot,
    rankedOpportunities,
    setRankedOpportunities,
    analyzingGrowth,
    growthAiEnhanced,
    loadDashboardData,
    handleRunGrowthAnalysis,
  };
}
