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
  DollarSign,
  Package,
  Layers,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-black/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  AI Buyer Discovery Simulation
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                  Agentic Commerce
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Experience how external AI shopping agents read your catalog and discover products.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Body */}
        <div className="p-5 border-b border-neutral-100 dark:border-neutral-800 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(query);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ask like an AI Buyer (e.g., 'I need a laptop sleeve under ₹2,000')..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs sm:text-sm text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <Button
              type="submit"
              disabled={searching || !query.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 h-auto cursor-pointer gap-1.5"
            >
              {searching ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Reasoning...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Discover
                </>
              )}
            </Button>
          </form>

          {/* Example query chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-neutral-400 text-[11px] font-medium mr-1">Try:</span>
            {exampleQueries.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSearch(q)}
                className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-neutral-600 dark:text-neutral-300 text-[11px] transition-colors cursor-pointer border border-neutral-200/60 dark:border-neutral-700/60"
              >
                &quot;{q}&quot;
              </button>
            ))}
          </div>
        </div>

        {/* Results Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-900 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {searchSummary && (
            <div className="text-xs font-medium text-neutral-500 flex items-center justify-between">
              <span>{searchSummary}</span>
              <span className="text-[11px] text-neutral-400">Strict database pricing enforced</span>
            </div>
          )}

          {matches.length === 0 && !searching && !error && (
            <div className="py-12 text-center space-y-2">
              <Package className="w-8 h-8 text-neutral-400 mx-auto" />
              <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Ready to match buyer requests
              </div>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Enter a shopping query above to test how AI buyers evaluate product categories, budget limits, and catalog attributes.
              </p>
            </div>
          )}

          {/* Matched products list */}
          <div className="space-y-3">
            {matches.map((match) => {
              const isSelected = selectedMatch?.productId === match.productId;

              return (
                <div
                  key={match.productId}
                  className={`p-4 rounded-xl border transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-xs"
                      : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-neutral-900 dark:text-white">
                          {match.name}
                        </span>
                        {match.category && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                            <Tag className="w-2.5 h-2.5 mr-1" />
                            {match.category}
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          {Math.round(match.matchScore * 100)}% match
                        </span>
                      </div>

                      {match.description && (
                        <p className="text-xs text-neutral-500 line-clamp-2">{match.description}</p>
                      )}

                      {/* Why it matches breakdown */}
                      <div className="pt-2">
                        <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                          Why this matches:
                        </div>
                        <ul className="space-y-0.5">
                          {match.whyItMatches.map((why, i) => (
                            <li
                              key={i}
                              className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-1.5"
                            >
                              <span className="text-indigo-600 dark:text-indigo-400 font-bold">•</span>
                              <span>{why}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Price and Intent button */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                      <div className="text-base font-extrabold text-neutral-900 dark:text-white font-mono">
                        ₹{match.price.toLocaleString("en-IN")}
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleCreateIntent(match)}
                        disabled={creatingIntent && isSelected}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 h-auto cursor-pointer gap-1 shadow-xs"
                      >
                        {creatingIntent && isSelected ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Preparing Intent...
                          </>
                        ) : (
                          <>
                            Select / Intent
                            <ArrowRight className="w-3 h-3" />
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
            <div className="mt-4 p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    Bounded Purchase Intent Created
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                  {intent.intentId}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80 border border-emerald-200/60 dark:border-emerald-900/40">
                  <div className="text-[10px] text-neutral-400 uppercase font-semibold">Product</div>
                  <div className="font-bold text-neutral-900 dark:text-white truncate">
                    {intent.productName}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80 border border-emerald-200/60 dark:border-emerald-900/40">
                  <div className="text-[10px] text-neutral-400 uppercase font-semibold">Authoritative Price</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    ₹{intent.authoritativePrice.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/80 dark:bg-neutral-900/80 border border-emerald-200/60 dark:border-emerald-900/40 col-span-2 sm:col-span-1">
                  <div className="text-[10px] text-neutral-400 uppercase font-semibold">Execution Mechanism</div>
                  <div className="font-bold text-neutral-900 dark:text-white">
                    Razorpay Payment Link
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  <strong>Financial Safety Boundary:</strong> {intent.paymentNotice}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-black/30 flex items-center justify-between text-xs text-neutral-500">
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
