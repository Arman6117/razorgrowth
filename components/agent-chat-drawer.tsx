"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Sparkles,
  Send,
  X,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Trash2,
  Coins,
  Cpu,
  Layers,
  ArrowRight,
  Info,
  CornerDownLeft,
  Users,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ToolCallSummary {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface AgentResponseData {
  success: boolean;
  merchantId: string;
  merchantName?: string;
  message: string;
  summary: string;
  toolCalls: ToolCallSummary[];
  opportunitiesFound: Array<{
    sourceProductName?: string;
    targetProductName?: string;
    crossSellRate?: number;
    expectedRevenue?: number;
    eligibleCustomerIds?: string[];
    eligibleCustomerCount?: number;
    customersTogether?: number;
    sourceCustomers?: number;
    [key: string]: unknown;
  }>;
  actionsCreated: Array<{
    actionId?: string;
    id?: string;
    status?: string;
    targetProduct?: string;
    customerName?: string;
    amountInRupees?: number;
    [key: string]: unknown;
  }>;
  actionsPendingApproval: number;
  iterations?: number;
  error?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  data?: AgentResponseData;
  isError?: boolean;
}

interface AgentChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  merchantId: string | null;
  merchantName?: string;
  onRefreshDashboard?: () => void;
}

const EXAMPLE_PROMPTS = [
  "Find the best cross-sell opportunity.",
  "Which products should I cross-sell?",
  "Find the strongest cross-sell opportunity and create actions for all eligible customers.",
  "Show me the status of my pending growth actions.",
];

export function AgentChatDrawer({
  isOpen,
  onClose,
  merchantId,
  merchantName = "Merchant",
  onRefreshDashboard,
}: AgentChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-welcome",
      sender: "agent",
      text: `Hello! I'm your RazorGrowth AI Commerce Agent. I analyze your sales transactions, identify high-converting cross-sell opportunities, verify customer eligibility, and prepare GrowthActions in \`PENDING_APPROVAL\` status.\n\nHow can I help grow your store's revenue today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      // Auto-focus input when opened
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen, messages, loading]);

  const toggleToolDetails = (messageId: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend || inputValue).trim();
    if (!messageContent || loading || !merchantId) return;

    const userMessageId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      sender: "user",
      text: messageContent,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setLoading(true);

    try {
      // Call the authoritative existing /api/agent endpoint
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchantId,
          message: messageContent,
        }),
      });

      const data: AgentResponseData = await res.json();

      const agentMessageId = `agent-${Date.now()}`;

      if (!res.ok || !data.success) {
        const errorMessage = data.error || data.summary || "Agent failed to process your instruction.";
        setMessages((prev) => [
          ...prev,
          {
            id: agentMessageId,
            sender: "agent",
            text: errorMessage,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            isError: true,
            data,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: agentMessageId,
            sender: "agent",
            text: data.summary || "Request completed successfully.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            data,
          },
        ]);

        // Refresh dashboard statistics & opportunities if actions or discoveries were made
        if (
          (data.actionsCreated && data.actionsCreated.length > 0) ||
          (data.opportunitiesFound && data.opportunitiesFound.length > 0)
        ) {
          onRefreshDashboard?.();
        }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Network error connecting to AI agent service.";
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-err-${Date.now()}`,
          sender: "agent",
          text: `Connection Failure: ${errorText}. Please check your internet connection or backend server status.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `initial-welcome-${Date.now()}`,
        sender: "agent",
        text: `Conversation cleared. I'm ready to analyze your merchant sales data, check customer eligibility, or create growth actions for approval.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end transition-opacity animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 h-full shadow-2xl flex flex-col border-l border-neutral-200 dark:border-neutral-800">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                  RazorGrowth AI Agent
                </h3>
                <span className="text-[11px] px-2 py-0.5 font-medium rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  Autonomous Orchestrator
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Connected to: <strong className="text-neutral-700 dark:text-neutral-300">{merchantName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearHistory}
              title="Clear chat conversation"
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Safety Guardrail Policy Banner */}
        <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border-b border-blue-200 dark:border-blue-800/60 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              <strong>Financial Guardrails Active:</strong> Actions created by the agent are placed in{" "}
              <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 font-semibold text-[11px]">
                PENDING_APPROVAL
              </code>
              . Direct financial approval remains strictly merchant-controlled.
            </span>
          </div>
        </div>

        {/* Chat Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            const data = msg.data;
            const hasToolCalls = data?.toolCalls && data.toolCalls.length > 0;
            const hasOpportunities = data?.opportunitiesFound && data.opportunitiesFound.length > 0;
            const hasCreatedActions = data?.actionsCreated && data.actionsCreated.length > 0;
            const isToolsExpanded = expandedTools[msg.id];

            // Extract batch creation stats if available
            let batchCreatedCount = 0;
            let batchDuplicateCount = 0;
            let batchRejectedCount = 0;

            if (data?.toolCalls) {
              for (const tc of data.toolCalls) {
                if (tc.toolName === "createGrowthActionsForCustomers") {
                  const resObj = tc.result as { data?: { createdCount?: number; duplicateCount?: number; rejectedCount?: number } };
                  if (resObj?.data) {
                    batchCreatedCount = resObj.data.createdCount || 0;
                    batchDuplicateCount = resObj.data.duplicateCount || 0;
                    batchRejectedCount = resObj.data.rejectedCount || 0;
                  }
                }
              }
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] space-y-3 ${
                    isUser
                      ? "bg-blue-600 text-white p-3.5 rounded-2xl rounded-tr-xs shadow-sm"
                      : msg.isError
                      ? "bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 border border-rose-200 dark:border-rose-900/60 p-4 rounded-2xl rounded-tl-xs shadow-sm"
                      : "bg-neutral-100 dark:bg-neutral-800/70 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700/60 p-4 rounded-2xl rounded-tl-xs shadow-sm"
                  }`}
                >
                  {/* Message Main Body */}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                    {msg.text}
                  </div>

                  {/* High-Level Structured Batch Action Summary (Requirement 5) */}
                  {!isUser && (hasCreatedActions || batchCreatedCount > 0) && (
                    <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>
                          GrowthActions Created: {batchCreatedCount || data?.actionsCreated?.length || 0} (PENDING_APPROVAL)
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                        {batchDuplicateCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60">
                            {batchDuplicateCount} duplicate active actions skipped
                          </span>
                        )}
                        {batchRejectedCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                            {batchRejectedCount} ineligible customers filtered out
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-1">
                        All actions were initialized with authoritative pricing from the database. Review and approve them on your dashboard to proceed to Razorpay execution.
                      </p>
                    </div>
                  )}

                  {/* Discovered Opportunities Card Summary */}
                  {!isUser && hasOpportunities && !hasCreatedActions && (
                    <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs space-y-2">
                      <div className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Discovered Opportunities ({data?.opportunitiesFound.length})</span>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {data?.opportunitiesFound.slice(0, 3).map((opp, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-white dark:bg-neutral-900 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between text-[11px]"
                          >
                            <div className="font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-1">
                              <span>{opp.sourceProductName}</span>
                              <ArrowRight className="w-3 h-3 text-neutral-400" />
                              <span className="text-blue-600 dark:text-blue-400 font-bold">
                                {opp.targetProductName}
                              </span>
                            </div>
                            <div className="font-mono text-emerald-600 font-bold">
                              ₹{opp.expectedRevenue?.toLocaleString("en-IN")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deterministic Tools Executed Expander */}
                  {!isUser && hasToolCalls && (
                    <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700/60">
                      <button
                        onClick={() => toggleToolDetails(msg.id)}
                        className="flex items-center justify-between w-full text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-purple-600" />
                          Deterministic Tools Executed ({data?.toolCalls.length})
                        </span>
                        {isToolsExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {isToolsExpanded && (
                        <div className="mt-2.5 space-y-2 animate-in fade-in duration-150">
                          {data?.toolCalls.map((tc, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs font-mono"
                            >
                              <div className="flex items-center justify-between font-bold text-purple-700 dark:text-purple-400">
                                <span>{tc.toolName}()</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-sans">
                                  Step {idx + 1}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400 break-all">
                                <strong>Args:</strong> {JSON.stringify(tc.args)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div
                    className={`text-[10px] ${
                      isUser
                        ? "text-blue-200 text-right"
                        : "text-neutral-400 dark:text-neutral-500"
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex gap-3 justify-start items-start animate-in fade-in">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl rounded-tl-xs bg-neutral-100 dark:bg-neutral-800/70 border border-neutral-200 dark:border-neutral-700/60 max-w-[85%] space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-purple-700 dark:text-purple-300">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>AI Agent analyzing merchant data & running deterministic tools...</span>
                </div>
                <div className="h-1.5 w-48 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-600 rounded-full animate-pulse w-2/3"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Prompt Chips (Requirement 8) */}
        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800">
          <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500" />
            <span>Example Natural-Language Requests</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setInputValue(prompt);
                  textareaRef.current?.focus();
                }}
                disabled={loading}
                className="px-2.5 py-1 rounded-full text-xs bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 dark:hover:border-purple-700 text-neutral-700 dark:text-neutral-300 transition-all text-left truncate max-w-full cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Message Input Bar */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || !merchantId}
                placeholder={
                  merchantId
                    ? "Ask the AI agent to analyze your sales, find cross-sell opportunities, or create actions..."
                    : "Connecting to merchant profile..."
                }
                rows={2}
                className="w-full resize-none rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3 pr-10 text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-purple-500 focus:bg-white dark:focus:bg-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 disabled:opacity-50"
              />
              <div className="absolute right-2.5 bottom-2.5 hidden sm:flex items-center gap-1 text-[10px] text-neutral-400 font-mono">
                <span>Enter ↵</span>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !inputValue.trim() || !merchantId}
              className="h-11 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-md disabled:opacity-50 transition-all gap-1.5 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </>
              )}
            </Button>
          </form>
          <div className="mt-2 text-[10px] text-center text-neutral-400">
            Powered by Vercel AI SDK • Communicates authoritatively with deterministic backend tools.
          </div>
        </div>
      </div>
    </div>
  );
}
