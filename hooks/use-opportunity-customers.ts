import { useState, useCallback, useEffect } from "react";
import { CustomerItem } from "@/lib/dashboard/types";

export function useOpportunityCustomers(opportunityId?: string | null) {
  const [eligibleCustomers, setEligibleCustomers] = useState<CustomerItem[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshOpportunityCustomers = useCallback(async () => {
    if (!opportunityId) {
      setEligibleCustomers([]);
      setLoadingCustomers(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/customers?_t=${Date.now()}`,
        {
          cache: "no-store",
          headers: { Pragma: "no-cache", "Cache-Control": "no-cache" },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setEligibleCustomers(data.customers || []);
        setError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Failed to load eligible customers");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error fetching customers");
    }
  }, [opportunityId]);

  // Initial load when opportunityId changes
  useEffect(() => {
    if (!opportunityId) {
      setEligibleCustomers([]);
      setLoadingCustomers(false);
      return;
    }

    let isMounted = true;
    setLoadingCustomers(true);

    fetch(`/api/opportunities/${opportunityId}/customers?_t=${Date.now()}`, {
      cache: "no-store",
      headers: { Pragma: "no-cache", "Cache-Control": "no-cache" },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Fetch failed"))))
      .then((data) => {
        if (isMounted) {
          setEligibleCustomers(data.customers || []);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Network error fetching customers");
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingCustomers(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [opportunityId]);

  // 3.5s auto-revalidation polling while drawer is open with active opportunity
  useEffect(() => {
    if (!opportunityId) return;

    const interval = setInterval(() => {
      refreshOpportunityCustomers();
    }, 3500);

    return () => clearInterval(interval);
  }, [opportunityId, refreshOpportunityCustomers]);

  return {
    eligibleCustomers,
    loadingCustomers,
    error,
    refreshOpportunityCustomers,
  };
}
