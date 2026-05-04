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
import { FileModal } from "@/components/FileModal";
import { SecretsPanel } from "@/components/SecretsPanel";
import { FileTree, type FileEntry } from "@/components/FileTree";
import { formatRelativeTime, cn } from "@/lib/utils";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinkingSteps?: string[] | null;
  streaming?: boolean;
  createdAt: string;
}

interface ToolCall {
  name: string;
  args: Record<string, any>;
  status: "running" | "done";
  result?: string;
}

const TOOL_LABELS: Record<string, string> = {
  write_file: "Writing file",
  read_file: "Reading file",
  list_files: "Listing files",
  run_command: "Running command",
  install_packages: "Installing packages",
  fetch_url: "Fetching URL",
  set_secret: "Storing secret",
  run_project: "Running project",
  deploy_to_vercel: "Deploying to Vercel",
};

const TOOL_ICONS: Record<string, string> = {
  write_file: "📝",
  read_file: "👁️",
  list_files: "📂",
  run_command: "⚡",
  install_packages: "📦",
  fetch_url: "🌐",
  set_secret: "🔐",
  run_project: "▶️",
  deploy_to_vercel: "🚀",
};

export function AgentChat() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [streamingMessages, setStreamingMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolEvents, setToolEvents] = useState<Record<string, ToolCall[]>>({});
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [showFileModal, setShowFileModal] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [agentMode, setAgentMode] = useState(true);
  const [runOutput, setRunOutput] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [activeDeployBanner, setActiveDeployBanner] = useState<string | null>(null);
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

  // Load deploy info
  useEffect(() => {
    loadDeployInfo();
  }, [projectId]);

  useEffect(() => {
    if (savedMessages.length > 0 && !isStreaming) {
      setStreamingMessages(
        (savedMessages as any[]).map((m) => ({
          id: m.id,
          role: m.role,
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
  }, [streamingMessages, toolEvents]);

  useEffect(() => { loadFiles(); }, [projectId]);

  async function loadFiles() {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files ?? []);
      }
    } catch {}
  }

  async function loadDeployInfo() {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/deploy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.vercelUrl) setDeployUrl(data.vercelUrl);
      }
    } catch {}
  }

  async function manualDeploy() {
    setDeploying(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setDeployUrl(data.url);
        setActiveDeployBanner(data.url);
      }
    } catch {}
    setDeploying(false);
  }

  async function runProject() {
    setRunLoading(true);
    setRunOutput(null);
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/projects/${projectId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      setRunOutput([data.stdout, data.stderr].filter(Boolean).join("\n") || "(no output)");
    }
    setRunLoading(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
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

    const token = localStorage.getItem("token");
    abortRef.current = new AbortController();

    const aiMsgId = `ai-${Date.now()}`;
    let aiContent = "";

    setStreamingMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "assistant", content: "", streaming: true, createdAt: new Date().toISOString() },
    ]);
    setToolEvents((prev) => ({ ...prev, [aiMsgId]: [] }));

    const endpoint = agentMode
      ? `/api/projects/${projectId}/agent/stream`
      : `/api/projects/${projectId}/messages/stream`;

    try {
      const res = await fetch(endpoint, {
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

              if (eventType === "chunk" && data.delta !== undefined) {
                aiContent += data.delta;
                setStreamingMessages((prev) =>
                  prev.map((m) => m.id === aiMsgId ? { ...m, content: aiContent, streaming: true } : m)
                );
              } else if (eventType === "tool_call") {
                setToolEvents((prev) => ({
                  ...prev,
                  [aiMsgId]: [...(prev[aiMsgId] ?? []), { name: data.name, args: data.args, status: "running" }],
                }));
              } else if (eventType === "tool_result") {
                setToolEvents((prev) => {
                  const tools = [...(prev[aiMsgId] ?? [])];
                  const idx = tools.findLastIndex((t) => t.name === data.name && t.status === "running");
                  if (idx !== -1) tools[idx] = { ...tools[idx], status: "done", result: data.result };
                  return { ...prev, [aiMsgId]: tools };
                });
                loadFiles();
              } else if (eventType === "deploy_done") {
                setDeployUrl(data.url);
                setActiveDeployBanner(data.url);
              } else if (eventType === "done" && data.role !== undefined) {
                setStreamingMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? { ...m, id: data.id ?? aiMsgId, content: data.content ?? aiContent, streaming: false }
                      : m
                  )
                );
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
  }, [input, isStreaming, projectId, agentMode, queryClient]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  }

  const fileCount = files.filter((f) => !f.isDir).length;
  const displayMessages = streamingMessages;

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={projectId} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0 bg-background/95 backdrop-blur">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <button onClick={() => setLocation("/dashboard")} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <p className="text-sm font-medium truncate flex-1 min-w-0">{project?.name ?? "..."}</p>

            <div className="flex items-center gap-1 shrink-0">
              {/* Mode toggle */}
              <button
                onClick={() => setAgentMode(!agentMode)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                  agentMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                {agentMode ? "Agent" : "Chat"}
              </button>

              {/* Run */}
              {agentMode && fileCount > 0 && (
                <button
                  onClick={runProject}
                  disabled={runLoading}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors font-medium"
                >
                  {runLoading
                    ? <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  }
                  Run
                </button>
              )}

              {/* Deploy */}
              {agentMode && fileCount > 0 && (
                <button
                  onClick={manualDeploy}
                  disabled={deploying}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 transition-colors font-medium"
                >
                  {deploying
                    ? <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : "🚀"
                  }
                  {deployUrl ? "Redeploy" : "Deploy"}
                </button>
              )}

              {/* Live URL badge */}
              {deployUrl && (
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors font-medium max-w-[140px]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="truncate">Live</span>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              )}

              {/* Files */}
              {agentMode && (
                <button
                  onClick={() => setShowFileModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/70 transition-colors font-medium"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  {fileCount > 0 ? fileCount : "Files"}
                </button>
              )}

              {/* Secrets */}
              {agentMode && (
                <button onClick={() => setShowSecrets(true)} className="p-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors text-sm" title="Secrets">
                  🔐
                </button>
              )}
            </div>
          </div>

          {/* Deploy banner */}
          {activeDeployBanner && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-emerald-600 text-sm">🚀</span>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Deployed successfully!</span>
                <a
                  href={activeDeployBanner}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-600 underline underline-offset-2 hover:text-emerald-500 truncate"
                >
                  {activeDeployBanner}
                </a>
              </div>
              <button onClick={() => setActiveDeployBanner(null)} className="text-emerald-600/60 hover:text-emerald-600 shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* Run output */}
          {runOutput !== null && (
            <div className="border-b border-border bg-gray-950 px-4 py-3 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-emerald-400 font-mono font-medium">▶ Output</span>
                <button onClick={() => setRunOutput(null)} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
              </div>
              <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap max-h-36 overflow-y-auto">{runOutput}</pre>
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
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold mb-2">{project?.name ?? "Agent Builder"}</h3>
                  <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                    {agentMode
                      ? "Describe what to build. The agent writes code, installs packages, runs it, and deploys to a live Vercel URL automatically."
                      : "Start a conversation with the AI."}
                  </p>
                  {agentMode && (
                    <div className="flex flex-wrap gap-2 mt-5 justify-center">
                      {[
                        "Build a REST API with Express + TypeScript",
                        "Create a Discord bot with slash commands",
                        "Build a Telegram bot",
                        "Make a web scraper with cheerio",
                        "Create a React landing page",
                        "Build a CLI tool with commander.js",
                      ].map((ex) => (
                        <button
                          key={ex}
                          onClick={() => setInput(ex)}
                          className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {displayMessages.map((msg) => (
                <AgentMessage
                  key={msg.id}
                  msg={msg}
                  tools={toolEvents[msg.id] ?? []}
                  expanded={expandedTools.has(msg.id)}
                  onToggleTools={() =>
                    setExpandedTools((prev) => {
                      const next = new Set(prev);
                      if (next.has(msg.id)) next.delete(msg.id);
                      else next.add(msg.id);
                      return next;
                    })
                  }
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-border px-4 py-3 shrink-0 bg-background">
            <div className="max-w-3xl mx-auto">
              {agentMode && (
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-primary font-medium">Agent Mode — builds, runs & deploys automatically</span>
                </div>
              )}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={agentMode
                    ? "Describe what to build — the agent writes, runs, and deploys it..."
                    : "Ask anything..."}
                  rows={1}
                  disabled={isStreaming}
                  className="w-full px-4 py-3.5 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground disabled:opacity-60 max-h-48"
                />
                <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground hidden sm:block">⌘+Enter to send</span>
                  <button
                    onClick={isStreaming ? () => abortRef.current?.abort() : sendMessage}
                    disabled={!isStreaming && !input.trim()}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ml-auto",
                      isStreaming
                        ? "bg-destructive text-destructive-foreground hover:opacity-90"
                        : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    )}
                  >
                    {isStreaming ? (
                      <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Stop</>
                    ) : (
                      <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* File tree side panel (desktop) */}
        {agentMode && fileCount > 0 && (
          <div className="hidden lg:flex flex-col w-52 border-l border-border overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Files</p>
              <button onClick={() => setShowFileModal(true)} className="text-xs text-primary hover:underline">Open</button>
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

// ── AgentMessage ────────────────────────────────────────────────────
function AgentMessage({
  msg,
  tools,
  expanded,
  onToggleTools,
}: {
  msg: StreamMessage;
  tools: ToolCall[];
  expanded: boolean;
  onToggleTools: () => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-foreground text-background px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }

  const hasDeployTool = tools.some((t) => t.name === "deploy_to_vercel");
  const deployResult = tools.find((t) => t.name === "deploy_to_vercel" && t.status === "done");
  const deployUrlFromTool = deployResult?.result?.match(/🔗 Live URL: (https?:\/\/[^\n]+)/)?.[1]?.trim();

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Logo className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {/* Tool calls */}
        {tools.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={onToggleTools}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                {tools.slice(0, expanded ? tools.length : 5).map((t, i) => (
                  <span
                    key={i}
                    className={cn(
                      "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
                      t.name === "deploy_to_vercel" && t.status === "done"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : t.status === "running"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    <span>{TOOL_ICONS[t.name] ?? "🔧"}</span>
                    <span>{TOOL_LABELS[t.name] ?? t.name}</span>
                    {t.status === "running" ? (
                      <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-500">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </span>
                ))}
                {!expanded && tools.length > 5 && (
                  <span className="text-xs text-muted-foreground">+{tools.length - 5} more</span>
                )}
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={cn("shrink-0 ml-2 text-muted-foreground transition-transform", expanded && "rotate-180")}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {expanded && (
              <div className="divide-y divide-border/50">
                {tools.map((t, i) => (
                  <div key={i} className="px-3 py-2">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span>{TOOL_ICONS[t.name] ?? "🔧"}</span>
                      <span className="text-xs font-medium">{TOOL_LABELS[t.name] ?? t.name}</span>
                      {t.args.path && <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-primary">{t.args.path}</code>}
                      {t.args.command && <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground max-w-48 truncate">{t.args.command}</code>}
                      {t.args.url && <span className="text-xs text-muted-foreground truncate max-w-40">{t.args.url}</span>}
                      {t.args.packages && <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{(t.args.packages as string[]).join(", ")}</code>}
                    </div>
                    {t.result && (
                      <pre className="text-xs font-mono text-muted-foreground bg-muted/50 rounded-lg px-2 py-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words">
                        {t.result}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Deploy success card */}
        {deployUrlFromTool && (
          <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
            <span className="text-2xl shrink-0">🚀</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Live on Vercel!</p>
              <a
                href={deployUrlFromTool}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-600 hover:underline truncate block"
              >
                {deployUrlFromTool}
              </a>
            </div>
            <a
              href={deployUrlFromTool}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              Open →
            </a>
          </div>
        )}

        {/* Message content */}
        {(msg.content || msg.streaming) && (
          <div>
            {msg.content ? (
              <MarkdownRenderer content={msg.content} streaming={msg.streaming} />
            ) : msg.streaming ? (
              <div className="flex items-center gap-1.5 py-2">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            ) : null}
            {!msg.streaming && msg.content && (
              <p className="text-xs text-muted-foreground mt-2">{formatRelativeTime(msg.createdAt)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
