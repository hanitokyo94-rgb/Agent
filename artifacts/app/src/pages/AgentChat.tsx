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
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { FileModal } from "@/components/FileModal";
import { SecretsPanel } from "@/components/SecretsPanel";
import { FileTree, type FileEntry } from "@/components/FileTree";
import { cn } from "@/lib/utils";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinkingSteps?: string[] | null;
  streaming?: boolean;
  createdAt: string;
}

interface ToolEvent {
  name: string;
  args: Record<string, any>;
  status: "running" | "done";
  result?: string;
  notify?: string;
}

// ── Tool display config ─────────────────────────────────────────────
const TOOL_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  file_write:         { label: "Writing file",         icon: "✏️",  color: "blue" },
  file_read:          { label: "Reading file",          icon: "📖", color: "slate" },
  file_str_replace:   { label: "Editing file",          icon: "🔧", color: "amber" },
  file_find_by_name:  { label: "Finding files",         icon: "🔍", color: "slate" },
  file_find_in_content:{ label: "Searching content",    icon: "🔎", color: "slate" },
  file_list:          { label: "Listing files",         icon: "📂", color: "slate" },
  file_delete:        { label: "Deleting file",         icon: "🗑️", color: "red" },
  shell_exec:         { label: "Running command",       icon: "⚡", color: "violet" },
  install_packages:   { label: "Installing packages",   icon: "📦", color: "orange" },
  fetch_url:          { label: "Fetching URL",          icon: "🌐", color: "cyan" },
  web_search:         { label: "Searching web",         icon: "🔍", color: "cyan" },
  set_secret:         { label: "Storing secret",        icon: "🔐", color: "yellow" },
  get_secrets:        { label: "Reading secrets",       icon: "🔑", color: "yellow" },
  deploy_to_vercel:   { label: "Deploying to Vercel",   icon: "🚀", color: "emerald" },
  message_notify:     { label: "Notification",          icon: "💬", color: "blue" },
  task_done:          { label: "Task complete",         icon: "✅", color: "emerald" },
};

const COLOR_CLASSES: Record<string, string> = {
  blue:    "bg-blue-500/10 text-blue-600 border-blue-500/20",
  slate:   "bg-slate-500/10 text-slate-600 border-slate-500/20",
  amber:   "bg-amber-500/10 text-amber-600 border-amber-500/20",
  red:     "bg-red-500/10 text-red-600 border-red-500/20",
  violet:  "bg-violet-500/10 text-violet-600 border-violet-500/20",
  orange:  "bg-orange-500/10 text-orange-600 border-orange-500/20",
  cyan:    "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  yellow:  "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

// ── Example prompts ────────────────────────────────────────────────
const EXAMPLES = [
  "Build a REST API with Express + TypeScript and Swagger docs",
  "Create a full-stack todo app with React + SQLite",
  "Build a Telegram bot with command handling",
  "Make a web scraper for product prices",
  "Create a CLI tool with commander.js",
  "What are the differences between React and Vue?",
  "Explain how JWT authentication works",
  "Build a Discord bot with slash commands",
];

export function AgentChat() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [streamingMessages, setStreamingMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolEvents, setToolEvents] = useState<Record<string, ToolEvent[]>>({});
  const [notifyBanners, setNotifyBanners] = useState<Record<string, string[]>>({});
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [showFileModal, setShowFileModal] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deployBanner, setDeployBanner] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
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

  useEffect(() => { loadDeployInfo(); }, [projectId]);
  useEffect(() => { loadFiles(); }, [projectId]);

  useEffect(() => {
    if (savedMessages.length > 0 && !isStreaming) {
      setStreamingMessages(
        (savedMessages as any[]).map((m) => ({
          id: m.id, role: m.role, content: m.content,
          thinkingSteps: m.thinkingSteps, streaming: false, createdAt: m.createdAt,
        }))
      );
    }
  }, [savedMessages, isStreaming]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingMessages, toolEvents, notifyBanners]);

  async function loadFiles() {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const d = await res.json(); setFiles(d.files ?? []); }
    } catch {}
  }

  async function loadDeployInfo() {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/deploy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const d = await res.json(); if (d.vercelUrl) setDeployUrl(d.vercelUrl); }
    } catch {}
  }

  async function manualDeploy() {
    const token = localStorage.getItem("token");
    setDeployBanner("deploying");
    try {
      const res = await fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const d = await res.json();
        setDeployUrl(d.url);
        setDeployBanner(d.url);
      } else {
        setDeployBanner(null);
      }
    } catch { setDeployBanner(null); }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px";
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: StreamMessage = {
      id: `user-${Date.now()}`, role: "user", content: text,
      streaming: false, createdAt: new Date().toISOString(),
    };
    setStreamingMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const token = localStorage.getItem("token");
    abortRef.current = new AbortController();
    const aiMsgId = `ai-${Date.now()}`;
    let aiContent = "";

    setStreamingMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "assistant", content: "", streaming: true, createdAt: new Date().toISOString() },
    ]);
    setToolEvents((prev) => ({ ...prev, [aiMsgId]: [] }));
    setNotifyBanners((prev) => ({ ...prev, [aiMsgId]: [] }));

    try {
      const res = await fetch(`/api/projects/${projectId}/agent/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: text }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);

              switch (eventType) {
                case "chunk":
                  if (data.delta !== undefined) {
                    aiContent += data.delta;
                    setStreamingMessages((prev) =>
                      prev.map((m) => m.id === aiMsgId ? { ...m, content: aiContent, streaming: true } : m)
                    );
                  }
                  break;

                case "notify":
                  // Agent sent a notification — show as inline banner
                  setNotifyBanners((prev) => ({
                    ...prev,
                    [aiMsgId]: [...(prev[aiMsgId] ?? []), data.text],
                  }));
                  break;

                case "task_done":
                  // Agent completed the task — update content if summary provided
                  if (data.summary) {
                    aiContent = aiContent ? aiContent + "\n\n" + data.summary : data.summary;
                    setStreamingMessages((prev) =>
                      prev.map((m) => m.id === aiMsgId ? { ...m, content: aiContent, streaming: true } : m)
                    );
                  }
                  break;

                case "tool_call":
                  if (data.name !== "message_notify" && data.name !== "task_done") {
                    setToolEvents((prev) => ({
                      ...prev,
                      [aiMsgId]: [...(prev[aiMsgId] ?? []), { name: data.name, args: data.args, status: "running" }],
                    }));
                  }
                  break;

                case "tool_result":
                  if (data.name !== "message_notify" && data.name !== "task_done") {
                    setToolEvents((prev) => {
                      const tools = [...(prev[aiMsgId] ?? [])];
                      const idx = [...tools].reverse().findIndex((t) => t.name === data.name && t.status === "running");
                      const realIdx = idx !== -1 ? tools.length - 1 - idx : -1;
                      if (realIdx !== -1) tools[realIdx] = { ...tools[realIdx], status: "done", result: data.result };
                      return { ...prev, [aiMsgId]: tools };
                    });
                    loadFiles();
                  }
                  break;

                case "deploy_done":
                  setDeployUrl(data.url);
                  setDeployBanner(data.url);
                  break;

                case "done":
                  if (data.role !== undefined) {
                    setStreamingMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId
                          ? { ...m, id: data.id ?? aiMsgId, content: data.content ?? aiContent, streaming: false }
                          : m
                      )
                    );
                  }
                  break;
              }
            } catch {}
            eventType = "";
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStreamingMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: "An error occurred. Please try again.", streaming: false } : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      loadFiles();
      loadDeployInfo();
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

  const fileCount = files.filter((f) => !f.isDir).length;

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={projectId} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Main column */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Header */}
          <header className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0 bg-background/95 backdrop-blur z-10">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <button
              onClick={() => setLocation("/dashboard")}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <p className="text-sm font-medium truncate flex-1 min-w-0">{project?.name ?? "..."}</p>

            <div className="flex items-center gap-1 shrink-0">
              {/* AI badge */}
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/8 border border-primary/15">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-medium text-primary">AI Agent</span>
              </div>

              {/* Deploy button */}
              {fileCount > 0 && (
                <button
                  onClick={manualDeploy}
                  disabled={deployBanner === "deploying"}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 transition-colors font-medium disabled:opacity-50"
                >
                  {deployBanner === "deploying"
                    ? <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <span>🚀</span>
                  }
                  {deployUrl ? "Redeploy" : "Deploy"}
                </button>
              )}

              {/* Live URL */}
              {deployUrl && (
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors font-medium"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="hidden sm:inline">Live</span>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              )}

              {/* Files */}
              {fileCount > 0 && (
                <button
                  onClick={() => setShowFileModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/70 transition-colors font-medium"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  <span>{fileCount}</span>
                </button>
              )}

              {/* Secrets */}
              <button
                onClick={() => setShowSecrets(true)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Environment variables"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </button>
            </div>
          </header>

          {/* Deploy banner */}
          {deployBanner && deployBanner !== "deploying" && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">🚀</span>
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Deployed!</span>
                <a
                  href={deployBanner}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-600 underline underline-offset-2 hover:text-emerald-500 truncate"
                >
                  {deployBanner}
                </a>
              </div>
              <button onClick={() => setDeployBanner(null)} className="text-emerald-600/50 hover:text-emerald-600 shrink-0 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {isLoading && streamingMessages.length === 0 && (
                <div className="flex justify-center py-12">
                  <svg className="animate-spin w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              )}

              {streamingMessages.length === 0 && !isLoading && (
                <EmptyState projectName={project?.name} onExample={setInput} />
              )}

              {streamingMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  tools={toolEvents[msg.id] ?? []}
                  notifies={notifyBanners[msg.id] ?? []}
                  expanded={expandedTools.has(msg.id)}
                  expandedResults={expandedResults}
                  onToggleTools={() =>
                    setExpandedTools((prev) => {
                      const next = new Set(prev);
                      next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                      return next;
                    })
                  }
                  onToggleResult={(key: string) =>
                    setExpandedResults((prev) => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    })
                  }
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-border px-4 py-3 shrink-0 bg-background">
            <div className="max-w-3xl mx-auto">
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything or describe what to build — the AI knows what to do..."
                  rows={1}
                  disabled={isStreaming}
                  className="w-full px-4 py-3.5 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground disabled:opacity-60 max-h-[220px]"
                />
                <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground hidden sm:block">⌘+Enter to send</span>
                    {isStreaming && (
                      <span className="text-xs text-primary/70 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Thinking...
                      </span>
                    )}
                  </div>
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
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="1"/>
                        </svg>
                        Stop
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="22" y1="2" x2="11" y2="13"/>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
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

        {/* File tree side panel */}
        {fileCount > 0 && (
          <div className="hidden lg:flex flex-col w-56 border-l border-border overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Files</span>
              <button
                onClick={() => setShowFileModal(true)}
                className="text-xs text-primary hover:underline"
              >
                Open
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              <FileTree files={files} onSelect={() => setShowFileModal(true)} />
            </div>
            {deployUrl && (
              <div className="border-t border-border p-3">
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-emerald-600 hover:underline"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live on Vercel
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {showFileModal && (
        <FileModal projectId={projectId} files={files} onRefresh={loadFiles} onClose={() => setShowFileModal(false)} />
      )}
      {showSecrets && (
        <SecretsPanel projectId={projectId} onClose={() => setShowSecrets(false)} />
      )}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────
function EmptyState({ projectName, onExample }: { projectName?: string; onExample: (v: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-5 shadow-sm">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M8 12h8M12 8v8"/>
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-1">{projectName ?? "AI Agent"}</h3>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
        Ask anything — get answers, write code, build full projects, or deploy apps to Vercel. The AI adapts automatically.
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => onExample(ex)}
            className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors border border-border/50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Message bubble ──────────────────────────────────────────────────
function MessageBubble({
  msg,
  tools,
  notifies,
  expanded,
  expandedResults,
  onToggleTools,
  onToggleResult,
}: {
  msg: StreamMessage;
  tools: ToolEvent[];
  notifies: string[];
  expanded: boolean;
  expandedResults: Set<string>;
  onToggleTools: () => void;
  onToggleResult: (key: string) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-br-sm bg-primary text-primary-foreground text-sm leading-relaxed shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  const hasDeploy = tools.some((t) => t.name === "deploy_to_vercel" && t.status === "done" && t.result?.includes("✅"));
  const deployResult = hasDeploy ? tools.find((t) => t.name === "deploy_to_vercel")?.result : null;
  const liveUrl = deployResult ? extractUrl(deployResult) : null;

  const visibleTools = tools.filter((t) => t.name !== "message_notify" && t.name !== "task_done");

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Notify banners */}
        {notifies.map((text, i) => (
          <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-500/8 border border-blue-500/15 text-sm text-blue-700 dark:text-blue-300">
            <span className="shrink-0 mt-0.5">💬</span>
            <span className="leading-relaxed">{text}</span>
          </div>
        ))}

        {/* Tool calls */}
        {visibleTools.length > 0 && (
          <div className="space-y-1.5">
            {/* Summary row */}
            <button
              onClick={onToggleTools}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <div className="flex items-center -space-x-1">
                {[...new Set(visibleTools.map((t) => t.name))].slice(0, 4).map((name, i) => {
                  const cfg = TOOL_CONFIG[name];
                  return (
                    <span key={i} className="text-sm">{cfg?.icon ?? "🔧"}</span>
                  );
                })}
              </div>
              <span>
                {visibleTools.filter((t) => t.status === "running").length > 0
                  ? `Running ${visibleTools.filter((t) => t.status === "running").length} action${visibleTools.filter((t) => t.status === "running").length > 1 ? "s" : ""}...`
                  : `${visibleTools.length} action${visibleTools.length !== 1 ? "s" : ""} taken`}
              </span>
              <svg
                width="12" height="12"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={cn("transition-transform group-hover:text-foreground", expanded ? "rotate-180" : "")}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {/* Expanded tools */}
            {expanded && (
              <div className="space-y-1.5 pl-1">
                {visibleTools.map((tool, i) => {
                  const cfg = TOOL_CONFIG[tool.name] ?? { label: tool.name, icon: "🔧", color: "slate" };
                  const colorClass = COLOR_CLASSES[cfg.color] ?? COLOR_CLASSES.slate;
                  const resultKey = `${msg.id}-${i}`;
                  const hasResult = tool.result && tool.result !== "[Task marked complete]" && tool.result !== "[Notification sent to user]";
                  const isResultExpanded = expandedResults.has(resultKey);

                  return (
                    <div key={i} className={cn("rounded-lg border px-3 py-2 text-xs", colorClass)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cfg.icon}</span>
                        <span className="font-medium">{cfg.label}</span>
                        {/* Show tool arg preview */}
                        {tool.args.file && (
                          <code className="ml-auto opacity-70 font-mono truncate max-w-[160px]">{tool.args.file}</code>
                        )}
                        {tool.args.command && (
                          <code className="ml-auto opacity-70 font-mono truncate max-w-[160px]">{tool.args.command}</code>
                        )}
                        {tool.args.url && (
                          <code className="ml-auto opacity-70 font-mono truncate max-w-[160px]">{tool.args.url}</code>
                        )}
                        {tool.args.query && (
                          <code className="ml-auto opacity-70 font-mono truncate max-w-[160px]">{tool.args.query}</code>
                        )}
                        {tool.status === "running" ? (
                          <svg className="animate-spin w-3 h-3 ml-auto shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 ml-auto">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>

                      {/* Result toggle */}
                      {hasResult && tool.status === "done" && (
                        <div className="mt-1.5">
                          <button
                            onClick={() => onToggleResult(resultKey)}
                            className="text-xs opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
                          >
                            {isResultExpanded ? "Hide output" : "Show output"}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("transition-transform", isResultExpanded ? "rotate-180" : "")}>
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </button>
                          {isResultExpanded && (
                            <pre className="mt-1.5 p-2 bg-black/10 dark:bg-white/5 rounded text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                              {tool.result}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Live deploy card */}
        {liveUrl && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <span className="text-xl shrink-0">🚀</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Deployed successfully!</p>
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-600 hover:underline truncate block"
              >
                {liveUrl}
              </a>
            </div>
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shrink-0"
            >
              Open →
            </a>
          </div>
        )}

        {/* Message content */}
        {msg.content && (
          <div className="text-sm leading-relaxed">
            {msg.streaming && !msg.content ? (
              <span className="inline-block w-2 h-4 bg-primary/60 rounded animate-pulse" />
            ) : (
              <MarkdownRenderer content={msg.content} />
            )}
            {msg.streaming && msg.content && (
              <span className="inline-block w-1.5 h-3.5 bg-primary/60 rounded ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Streaming placeholder */}
        {msg.streaming && !msg.content && notifies.length === 0 && visibleTools.length === 0 && (
          <div className="flex gap-1 py-1">
            <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        )}
      </div>
    </div>
  );
}

function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/);
  return m ? m[0] : null;
}
