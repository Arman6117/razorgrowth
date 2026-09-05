"use client";

import React, { useState } from "react";
import {
  Bot,
  Search,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  X,
  Tag,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinancialValue } from "@/components/ui/financial-value";
import { AIBadge } from "@/components/ui/ai-badge";
import { ProductDiscoveryMatch, PurchaseIntentResponse } from "@/lib/buyer/ai-catalog";

interface AIBuyerPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency?: string;
}

export function AIBuyerPreviewModal({
  isOpen,
  onClose,
  currency = "INR",
}: AIBuyerPreviewModalProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<ProductDiscoveryMatch[]>([]);
  const [searchSummary, setSearchSummary] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<ProductDiscoveryMatch | null>(null);
  const [intent, setIntent] = useState<PurchaseIntentResponse | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const exampleQueries = [
    "Laptop accessories under ₹2,000",
    "High performance products",
    "Accessories for work",
    "Show all available items",
  ];

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setQuery(searchQuery);
    setSearching(true);
    setError(null);
    setSelectedMatch(null);
    setIntent(null);

    try {
      const res = await fetch("/api/ai/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to discover products");
      }

      setMatches(data.matches || []);
      setSearchSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search error");
      setMatches([]);
    } finally {
      setSearching(false);
    }
  };

  const handleCreateIntent = async (match: ProductDiscoveryMatch) => {
    setSelectedMatch(match);
    setCreatingIntent(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/purchase-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: match.productId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create purchase intent");
      }

      setIntent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error preparing purchase intent");
      setIntent(null);
    } finally {
      setCreatingIntent(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-card border border-border w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  AI Buyer Discovery Simulation
                </h3>
                <AIBadge variant="subtle" icon="none">
                  Machine Commerce
                </AIBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                Simulate how external AI shopping agents read your catalog and discover products.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input Body */}
        <div className="p-4 sm:p-5 border-b border-border space-y-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(query);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ask as an AI Buyer (e.g., 'Laptop accessories under ₹2,000')..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-neutral-50/70 dark:bg-neutral-900/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-neutral-400"
              />
            </div>
            <Button
              type="submit"
              variant="default"
              size="default"
              disabled={searching || !query.trim()}
              className="text-xs h-9 px-3.5"
            >
              {searching ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                  Reasoning...
                </>
              ) : (
                <>
                  <Search className="w-3 h-3 mr-1" />
                  Discover
                </>
              )}
            </Button>
          </form>

          {/* Example query chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider mr-1">Examples:</span>
            {exampleQueries.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSearch(q)}
                className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-foreground text-[11px] transition-colors cursor-pointer border border-border"
              >
                &quot;{q}&quot;
              </button>
            ))}
          </div>
        </div>

        {/* Results Area */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-900 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {searchSummary && (
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>{searchSummary}</span>
              <span className="text-[10px] text-muted-foreground font-mono">Authoritative DB prices</span>
            </div>
          )}

          {matches.length === 0 && !searching && !error && (
            <div className="py-12 text-center space-y-2">
              <Package className="w-7 h-7 text-muted-foreground mx-auto opacity-60" />
              <div className="text-xs font-semibold text-foreground">
                Ready to match shopping requests
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Enter a query above to evaluate how AI shopping agents evaluate product categories, budgets, and catalog attributes.
              </p>
            </div>
          )}

          {/* Matched products */}
          <div className="space-y-2.5">
            {matches.map((match) => {
              const isSelected = selectedMatch?.productId === match.productId;

              return (
                <div
                  key={match.productId}
                  className={`p-3.5 rounded-lg border transition-all ${
                    isSelected
                      ? "border-neutral-900 dark:border-neutral-100 bg-neutral-50/50 dark:bg-neutral-900/50 shadow-xs"
                      : "border-border bg-card hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-foreground">
                          {match.name}
                        </span>
                        {match.category && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-muted-foreground">
                            <Tag className="w-2.5 h-2.5 mr-0.5" />
                            {match.category}
                          </span>
                        )}
                        <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                          {Math.round(match.matchScore * 100)}% match
                        </span>
                      </div>

                      {match.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{match.description}</p>
                      )}

                      {/* Why it matches */}
                      <div className="pt-1.5">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                          Match Justification:
                        </div>
                        <ul className="space-y-0.5">
                          {match.whyItMatches.map((why, i) => (
                            <li
                              key={i}
                              className="text-xs text-foreground flex items-start gap-1.5"
                            >
                              <span className="text-muted-foreground font-bold">•</span>
                              <span>{why}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Price and Intent button */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                      <div>
                        <FinancialValue value={match.price} size="md" variant="default" />
                      </div>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleCreateIntent(match)}
                        disabled={creatingIntent && isSelected}
                        className="text-xs gap-1"
                      >
                        {creatingIntent && isSelected ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Preparing...
                          </>
                        ) : (
                          <>
                            Select Intent
                            <ArrowRight className="w-3 h-3 ml-0.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Prepared Purchase Intent Card */}
          {intent && (
            <div className="mt-3.5 p-3.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    Bounded Purchase Intent Prepared
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                  {intent.intentId}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded-md bg-card border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Product</div>
                  <div className="font-bold text-foreground truncate mt-0.5">
                    {intent.productName}
                  </div>
                </div>
                <div className="p-2 rounded-md bg-card border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Authoritative Price</div>
                  <div className="mt-0.5">
                    <FinancialValue value={intent.authoritativePrice} size="sm" variant="revenue" />
                  </div>
                </div>
                <div className="p-2 rounded-md bg-card border border-border col-span-2 sm:col-span-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Mechanism</div>
                  <div className="font-bold text-foreground mt-0.5">
                    Razorpay Payment Link
                  </div>
                </div>
              </div>

              <div className="p-2 rounded-md bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  <strong>Financial Safety Boundary:</strong> {intent.paymentNotice}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-border bg-neutral-50/50 dark:bg-neutral-900/50 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Authoritative DB Grounding (No LLM Price Hallucination)</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
