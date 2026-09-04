import { useState, useCallback, useEffect, useMemo } from "react";
import { OpportunityItem } from "@/lib/dashboard/types";
import {
  GrowthSnapshotData,
  RankedOpportunityItem,
} from "@/components/growth-intelligence-panel";

export function computeDisplayRankedOpportunities(
  rankedOpportunities: RankedOpportunityItem[],
  opportunities: OpportunityItem[]
): RankedOpportunityItem[] {
  if (rankedOpportunities.length > 0) {
    return rankedOpportunities;
  }
  return opportunities.map((opp, idx) => ({
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
      formula:
        "score = (normalizedEstimatedValue * 0.5) + (evidenceStrength * 0.3) + (confidence * 0.2)",
    },
    status: opp.status,
  }));
}

interface UseGrowthIntelligenceOptions {
  opportunities: OpportunityItem[];
  showToast?: (type: "success" | "error" | "info", message: string) => void;
  onRefreshDashboard?: () => void;
}

export function useGrowthIntelligence({
  opportunities,
  showToast,
  onRefreshDashboard,
}: UseGrowthIntelligenceOptions) {
  const [growthSnapshot, setGrowthSnapshot] = useState<GrowthSnapshotData | null>(null);
  const [rankedOpportunities, setRankedOpportunities] = useState<RankedOpportunityItem[]>([]);
  const [analyzingGrowth, setAnalyzingGrowth] = useState(false);
  const [growthAiEnhanced, setGrowthAiEnhanced] = useState(false);

  const loadGrowthIntelligence = useCallback(async () => {
    try {
      const res = await fetch("/api/growth/analyze").catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.snapshot) {
          setGrowthSnapshot(data.snapshot);
        }
        if (data.opportunities) {
          setRankedOpportunities(data.opportunities);
        }
        if (data.aiEnhanced !== undefined) {
          setGrowthAiEnhanced(Boolean(data.aiEnhanced));
        }
      }
    } catch {
      // Non-critical background fetch failure
    }
  }, []);

  useEffect(() => {
    loadGrowthIntelligence();
  }, [loadGrowthIntelligence]);

  const handleRunGrowthAnalysis = async (onSuccess?: (firstOppId?: string) => void) => {
    setAnalyzingGrowth(true);
    try {
      showToast?.("info", "Running AI Growth Intelligence analysis across transactions...");
      const res = await fetch("/api/growth/analyze", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Growth analysis failed");
      }
      setGrowthSnapshot(data.snapshot);
      setRankedOpportunities(data.opportunities || []);
      setGrowthAiEnhanced(Boolean(data.aiEnhanced));

      const firstOppId =
        data.opportunities && data.opportunities.length > 0
          ? data.opportunities[0].id
          : undefined;
      if (onSuccess && firstOppId) {
        onSuccess(firstOppId);
      }

      showToast?.(
        "success",
        data.message ||
          `AI Growth Intelligence discovered ${data.opportunities?.length || 0} opportunities!`
      );
      onRefreshDashboard?.();
    } catch (err) {
      showToast?.(
        "error",
        err instanceof Error ? err.message : "Error running growth analysis"
      );
    } finally {
      setAnalyzingGrowth(false);
    }
  };

  const displayRankedOpportunities = useMemo(
    () => computeDisplayRankedOpportunities(rankedOpportunities, opportunities),
    [rankedOpportunities, opportunities]
  );

  return {
    growthSnapshot,
    rankedOpportunities,
    displayRankedOpportunities,
    analyzingGrowth,
    growthAiEnhanced,
    loadGrowthIntelligence,
    handleRunGrowthAnalysis,
  };
}
