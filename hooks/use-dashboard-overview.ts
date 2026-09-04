import { useState, useCallback, useEffect } from "react";
import { MerchantInfo, OpportunityItem } from "@/lib/dashboard/types";

interface UseDashboardOverviewOptions {
  showToast?: (type: "success" | "error" | "info", message: string) => void;
}

export function useDashboardOverview({ showToast }: UseDashboardOverviewOptions = {}) {
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setRefreshing(true);
      const [merchantRes, oppsRes] = await Promise.all([
        fetch("/api/merchant"),
        fetch("/api/opportunities"),
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
      }
    } catch (err) {
      console.error("Dashboard overview fetch error:", err);
      showToast?.("error", "Failed to load dashboard overview. Check database connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return {
    merchant,
    opportunities,
    loading,
    refreshing,
    loadOverview,
  };
}
