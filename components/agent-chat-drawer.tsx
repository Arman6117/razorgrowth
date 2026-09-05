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
  Cpu,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIBadge } from "@/components/ui/ai-badge";
import { FinancialValue } from "@/components/ui/financial-value";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

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

function normalizeMarkdownContent(text: string): string {
  if (!text) return "";
  return text
    // Replace LaTeX arrows with unicode arrows
    .replace(/\$\\rightarrow\$/g, "→")
    .replace(/\$\\longrightarrow\$/g, "⟶")
    .replace(/\$\\to\$/g, "→")
    .replace(/\$\\leftarrow\$/g, "←")
    .replace(/\$\\longleftarrow\$/g, "⟵")
    .replace(/\$\\Rightarrow\$/g, "⇒")
    .replace(/\$\\Leftarrow\$/g, "⇐")
    .replace(/\$\\leftrightarrow\$/g, "↔")
    .replace(/\$\\Leftrightarrow\$/g, "⇔")
    .replace(/\$\\implies\$/g, "⇒")
    .replace(/\$\\iff\$/g, "⇔")
    .replace(/\\rightarrow\b/g, "→")
    .replace(/\\longrightarrow\b/g, "⟶")
    .replace(/\\leftarrow\b/g, "←")
    .replace(/\\longleftarrow\b/g, "⟵")
    .replace(/\\Rightarrow\b/g, "⇒")
    .replace(/\\Leftarrow\b/g, "⇐")
    .replace(/\\leftrightarrow\b/g, "↔")
    .replace(/\\Leftrightarrow\b/g, "⇔")
    .replace(/\\implies\b/g, "⇒")
    .replace(/\\iff\b/g, "⇔");
}

const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="text-sm font-bold mt-2.5 mb-1 text-foreground first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xs font-bold mt-2 mb-1 text-foreground first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-xs font-semibold mt-1.5 mb-0.5 text-foreground first:mt-0" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-2 last:mb-0 leading-relaxed text-xs" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-4 my-1.5 space-y-0.5 text-xs" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-4 my-1.5 space-y-0.5 text-xs" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 dark:text-indigo-400 underline hover:opacity-80 break-all"
      {...props}
    >
      {children}
    </a>
  ),
  pre: ({ children, ...props }) => (
    <pre
      className="p-2.5 my-1.5 rounded-md bg-neutral-950 text-neutral-200 font-mono text-[11px] overflow-x-auto border border-border"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="px-1 py-0.5 rounded bg-neutral-200/70 dark:bg-neutral-800 font-mono text-[11px] text-foreground"
        {...props}
      >
        {children}
      </code>
    );
  },
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-indigo-500 pl-2.5 my-1.5 italic text-muted-foreground text-xs"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: ({ ...props }) => (
    <hr className="my-2.5 border-border" {...props} />
  ),
};

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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end transition-opacity animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-card h-full shadow-2xl flex flex-col border-l border-border">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-foreground">
                  Growth Agent
                </h3>
                <AIBadge variant="subtle" icon="none">
                  Autonomous
                </AIBadge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Merchant: <strong className="text-foreground">{merchantName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleClearHistory}
              title="Clear conversation"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Safety Guardrail Policy Banner */}
        <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-900 border-b border-border flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          <span>
            Financial guardrails active: Actions initialize in <code className="font-mono text-[10px] px-1 rounded bg-neutral-200/70 dark:bg-neutral-800">PENDING_APPROVAL</code>.
          </span>
        </div>

        {/* Chat Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            const data = msg.data;
            const hasToolCalls = data?.toolCalls && data.toolCalls.length > 0;
            const hasOpportunities = data?.opportunitiesFound && data.opportunitiesFound.length > 0;
            const hasCreatedActions = data?.actionsCreated && data.actionsCreated.length > 0;
            const isToolsExpanded = expandedTools[msg.id];

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
                className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center shrink-0 mt-0.5 border border-border">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] space-y-2.5 ${
                    isUser
                      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 p-3 rounded-xl shadow-xs"
                      : msg.isError
                      ? "bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100 border border-rose-200 dark:border-rose-900/50 p-3.5 rounded-xl shadow-xs"
                      : "bg-neutral-50/80 dark:bg-neutral-900/60 text-foreground border border-border p-3.5 rounded-xl shadow-xs"
                  }`}
                >
                  {/* Message Body */}
                  {isUser ? (
                    <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
                      {msg.text}
                    </div>
                  ) : (
                    <div className="text-xs leading-relaxed font-sans">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={markdownComponents}
                      >
                        {normalizeMarkdownContent(msg.text)}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Actions Created Summary */}
                  {!isUser && (hasCreatedActions || batchCreatedCount > 0) && (
                    <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          GrowthActions Prepared: {batchCreatedCount || data?.actionsCreated?.length || 0} (PENDING_APPROVAL)
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-300 font-mono">
                        {batchDuplicateCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60">
                            {batchDuplicateCount} active duplicates skipped
                          </span>
                        )}
                        {batchRejectedCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                            {batchRejectedCount} ineligible excluded
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Discovered Opportunities Card Summary */}
                  {!isUser && hasOpportunities && !hasCreatedActions && (
                    <div className="p-2.5 rounded-lg bg-card border border-border text-xs space-y-1.5">
                      <div className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                        <Sparkles className="w-3 h-3 text-indigo-500" />
                        <span>Discovered Opportunities ({data?.opportunitiesFound.length})</span>
                      </div>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {data?.opportunitiesFound.slice(0, 3).map((opp, idx) => (
                          <div
                            key={idx}
                            className="p-1.5 rounded-md bg-neutral-50 dark:bg-neutral-800/60 border border-border flex items-center justify-between text-[11px]"
                          >
                            <div className="font-medium text-foreground flex items-center gap-1">
                              <span>{opp.sourceProductName}</span>
                              <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                              <span className="font-semibold">{opp.targetProductName}</span>
                            </div>
                            <div>
                              <FinancialValue value={opp.expectedRevenue || 0} size="xs" variant="revenue" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deterministic Tools Executed Expander */}
                  {!isUser && hasToolCalls && (
                    <div className="pt-2 border-t border-border/70">
                      <button
                        onClick={() => toggleToolDetails(msg.id)}
                        className="flex items-center justify-between w-full text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 font-mono">
                          <Cpu className="w-3 h-3 text-neutral-500" />
                          Deterministic Tools ({data?.toolCalls.length})
                        </span>
                        {isToolsExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>

                      {isToolsExpanded && (
                        <div className="mt-2 space-y-1.5">
                          {data?.toolCalls.map((tc, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-md bg-card border border-border text-[11px] font-mono"
                            >
                              <div className="flex items-center justify-between font-semibold text-foreground">
                                <span>{tc.toolName}()</span>
                                <span className="text-[10px] text-muted-foreground">Step {idx + 1}</span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground break-all">
                                {JSON.stringify(tc.args)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div
                    className={`text-[10px] font-mono ${
                      isUser
                        ? "text-neutral-300 dark:text-neutral-600 text-right"
                        : "text-muted-foreground"
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
            <div className="flex gap-2.5 justify-start items-start">
              <div className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center shrink-0 border border-border">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-3 rounded-xl bg-neutral-50/80 dark:bg-neutral-900/60 border border-border max-w-[85%] space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Analyzing merchant sales & running tools...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Prompt Chips */}
        <div className="p-3 bg-neutral-50/70 dark:bg-neutral-900/50 border-t border-border">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-neutral-400" />
            <span>Example Instructions</span>
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
                className="px-2.5 py-1 rounded-md text-[11px] bg-card border border-border hover:border-neutral-400 text-foreground transition-all text-left truncate max-w-full cursor-pointer shadow-2xs"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Message Input Bar */}
        <div className="p-3.5 border-t border-border bg-card">
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
                    ? "Ask the AI agent to analyze sales, check eligibility, or prepare actions..."
                    : "Connecting to merchant profile..."
                }
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-neutral-50/60 dark:bg-neutral-900/60 p-2.5 pr-10 text-xs text-foreground placeholder:text-muted-foreground focus:border-neutral-400 focus:bg-card focus:outline-none disabled:opacity-50"
              />
              <div className="absolute right-2 bottom-2 hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                <span>Enter ↵</span>
              </div>
            </div>

            <Button
              type="submit"
              variant="default"
              size="default"
              disabled={loading || !inputValue.trim() || !merchantId}
              className="h-10 px-3.5"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1" />
                  <span>Send</span>
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
