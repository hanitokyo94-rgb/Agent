import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useListMessages,
  getGetProjectQueryKey,
  getListMessagesQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { Sidebar } from "@/components/Sidebar";
import { Logo } from "@/components/Logo";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { Message } from "@workspace/api-client-react";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinkingSteps?: string[] | null;
  streaming?: boolean;
  currentThinking?: string;
  createdAt: string;
}

type SummaryStep = { label: string; status: "pending" | "running" | "done" };

export function Chat() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [streamingMessages, setStreamingMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [summarySteps, setSummarySteps] = useState<SummaryStep[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const [expandedLong, setExpandedLong] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const { data: project } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: savedMessages = [], isLoading } = useListMessages(projectId, {
    query: { queryKey: getListMessagesQueryKey(projectId) },
  });

  // Sync saved messages with streaming messages
  useEffect(() => {
    if (savedMessages.length > 0 && !isStreaming) {
      setStreamingMessages(
        (savedMessages as Message[]).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          thinkingSteps: m.thinkingSteps,
          streaming: false,
          createdAt: m.createdAt,
        }))
      );
    }
  }, [savedMessages, isStreaming]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingMessages, summarySteps]);

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  }

  function toggleExpand(id: string) {
    setExpandedLong((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: StreamMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      streaming: false,
      createdAt: new Date().toISOString(),
    };
    setStreamingMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setShowSteps(true);

    const token = localStorage.getItem("token");
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/projects/${projectId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: text }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("Stream failed");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let aiMsgId = `ai-${Date.now()}`;
      let aiContent = "";
      const thinkingStepsList: string[] = [];

      // Add placeholder AI message
      setStreamingMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          role: "assistant",
          content: "",
          streaming: true,
          thinkingSteps: null,
          createdAt: new Date().toISOString(),
        },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (line.includes("thinking") || dataStr.includes('"step"')) {
              const step: string = data.step;
              thinkingStepsList.push(step);
              setSummarySteps((prev) => {
                const next = [...prev];
                if (next.length > 0) next[next.length - 1].status = "done";
                next.push({ label: step, status: "running" });
                return next;
              });
            } else if (dataStr.includes('"delta"')) {
              const delta: string = data.delta;
              if (data.msgId) aiMsgId = data.msgId;
              aiContent += delta;
              setStreamingMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId || m.streaming
                    ? { ...m, id: data.msgId ?? aiMsgId, content: aiContent, streaming: true }
                    : m
                )
              );
            } else if (dataStr.includes('"role"')) {
              // Done event with final message
              setSummarySteps((prev) =>
                prev.map((s) => ({ ...s, status: "done" as const }))
              );
              const finalMsg = data as StreamMessage;
              setStreamingMessages((prev) =>
                prev.map((m) =>
                  m.streaming
                    ? {
                        ...finalMsg,
                        role: "assistant" as const,
                        streaming: false,
                        thinkingSteps: finalMsg.thinkingSteps ?? thinkingStepsList,
                      }
                    : m
                )
              );
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStreamingMessages((prev) =>
          prev.map((m) =>
            m.streaming
              ? { ...m, content: "Sorry, an error occurred. Please try again.", streaming: false }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      setTimeout(() => setShowSteps(false), 2000);
      setSummarySteps([]);
      // Refresh saved messages
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    }
  }, [input, isStreaming, projectId, queryClient]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  }

  const displayMessages = streamingMessages.length > 0 ? streamingMessages : [];

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={projectId} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setLocation("/dashboard")} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <p className="text-sm font-medium text-foreground truncate">{project?.name ?? "Loading..."}</p>
          </div>
        </div>

        {/* Steps summary bar */}
        {showSteps && summarySteps.length > 0 && (
          <div className="border-b border-border px-4 py-2 bg-muted/40 flex items-center gap-3 overflow-x-auto shrink-0">
            {summarySteps.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 shrink-0">
                {s.status === "done" ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : s.status === "running" ? (
                  <svg className="animate-spin w-3 h-3 text-primary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <div className="w-3 h-3 rounded-full bg-muted border border-border" />
                )}
                <span className={cn(
                  "text-xs",
                  s.status === "done" ? "text-muted-foreground" :
                  s.status === "running" ? "text-foreground font-medium" : "text-muted-foreground/60"
                )}>{s.label}</span>
                {i < summarySteps.length - 1 && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {isLoading && displayMessages.length === 0 && (
              <div className="flex justify-center py-12">
                <svg className="animate-spin w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            )}

            {displayMessages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                </div>
                <h3 className="text-base font-semibold mb-1">{project?.name ?? "New Project"}</h3>
                <p className="text-sm text-muted-foreground max-w-xs">Start a conversation to build your project. Describe what you need and I'll help you create it.</p>
              </div>
            )}

            {displayMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                expanded={expandedLong.has(msg.id)}
                onToggleExpand={() => toggleExpand(msg.id)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything or describe what to build..."
                rows={1}
                disabled={isStreaming}
                className="w-full px-4 py-3.5 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground disabled:opacity-60 max-h-48"
                style={{ height: "auto" }}
              />
              <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Cmd+Enter to send</span>
                <button
                  onClick={isStreaming ? () => abortRef.current?.abort() : sendMessage}
                  disabled={!isStreaming && !input.trim()}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                    isStreaming
                      ? "bg-destructive text-destructive-foreground hover:opacity-90"
                      : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
                  )}
                >
                  {isStreaming ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="1"/>
                      </svg>
                      Stop
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                      Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  expanded,
  onToggleExpand,
}: {
  msg: StreamMessage;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const LONG_THRESHOLD = 800;
  const isLong = msg.content.length > LONG_THRESHOLD;
  const shouldTruncate = isLong && !expanded && !msg.streaming;

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-foreground text-background px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
        <Logo className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        {/* Content */}
        <div className="relative">
          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              shouldTruncate ? "max-h-64" : "max-h-none"
            )}
          >
            {msg.content ? (
              <MarkdownRenderer content={msg.content} streaming={msg.streaming} />
            ) : msg.streaming ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            ) : null}
          </div>

          {/* Gradient fade for truncated */}
          {shouldTruncate && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          )}
        </div>

        {/* Expand/collapse for long messages */}
        {isLong && !msg.streaming && (
          <button
            onClick={onToggleExpand}
            className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
          >
            {expanded ? (
              <>
                Show less
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </>
            ) : (
              <>
                Show full response
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </>
            )}
          </button>
        )}

        {/* Timestamp */}
        {!msg.streaming && (
          <p className="text-xs text-muted-foreground mt-2">{formatRelativeTime(msg.createdAt)}</p>
        )}
      </div>
    </div>
  );
}
