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
import { MyFiles } from "@/components/MyFiles";
import { cn } from "@/lib/utils";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  thinkingSteps?: string[] | null;
  streaming?: boolean;
  createdAt: string;
}

interface Attachment {
  name: string;
  type: string;
  url?: string;
  content?: string;
}

interface ToolEvent {
  name: string;
  args: Record<string, any>;
  status: "running" | "done";
  result?: string;
}

interface FileOp {
  type: "write" | "replace" | "delete" | "read";
  file: string;
  added: number;
  removed: number;
  content?: string;
}

interface SecretRequest {
  key: string;
  description: string;
  msgId: string;
}

const TOOL_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  file_write:           { label: "Writing",       icon: "✏️",  color: "blue" },
  file_read:            { label: "Reading",        icon: "📖", color: "slate" },
  file_str_replace:     { label: "Editing",        icon: "🔧", color: "amber" },
  file_find_by_name:    { label: "Finding files",  icon: "🔍", color: "slate" },
  file_find_in_content: { label: "Searching",      icon: "🔎", color: "slate" },
  file_list:            { label: "Listing files",  icon: "📂", color: "slate" },
  file_delete:          { label: "Deleting",       icon: "🗑️", color: "red" },
  shell_exec:           { label: "Running",        icon: "⚡", color: "violet" },
  install_packages:     { label: "Installing",     icon: "📦", color: "orange" },
  fetch_url:            { label: "Fetching",       icon: "🌐", color: "cyan" },
  web_search:           { label: "Searching web",  icon: "🔍", color: "cyan" },
  set_secret:           { label: "Storing secret", icon: "🔐", color: "yellow" },
  get_secrets:          { label: "Reading secrets",icon: "🔑", color: "yellow" },
  request_secret:       { label: "Needs key",      icon: "🔑", color: "orange" },
  deploy_to_vercel:     { label: "Deploying",      icon: "🚀", color: "emerald" },
  message_notify:       { label: "Notify",         icon: "💬", color: "blue" },
  task_done:            { label: "Complete",        icon: "✅", color: "emerald" },
};

const EXAMPLES = [
  "Build a REST API with Express + TypeScript",
  "Create a full-stack todo app with React + SQLite",
  "Build a Telegram bot with command handling",
  "Make a web scraper for product prices",
  "Create a CLI tool with commander.js",
  "Explain how JWT authentication works",
];

function getFileOp(tool: ToolEvent): FileOp | null {
  if (tool.name === "file_write") {
    const lines = tool.args.content ? tool.args.content.split("\n").length : 0;
    return { type: "write", file: tool.args.file ?? "", added: lines, removed: 0, content: tool.args.content };
  }
  if (tool.name === "file_str_replace") {
    const added = tool.args.new_str ? tool.args.new_str.split("\n").length : 0;
    const removed = tool.args.old_str ? tool.args.old_str.split("\n").length : 0;
    return { type: "replace", file: tool.args.file ?? "", added, removed, content: tool.args.new_str };
  }
  if (tool.name === "file_delete") {
    return { type: "delete", file: tool.args.file ?? "", added: 0, removed: 0 };
  }
  if (tool.name === "file_read") {
    return { type: "read", file: tool.args.file ?? "", added: 0, removed: 0, content: tool.result };
  }
  return null;
}

function shortFilename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function fileTypeIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx"].includes(ext)) return "🔷";
  if (["js", "jsx"].includes(ext)) return "🟡";
  if (["json"].includes(ext)) return "{}";
  if (["css", "scss"].includes(ext)) return "🎨";
  if (["html"].includes(ext)) return "🌐";
  if (["md"].includes(ext)) return "📝";
  if (["py"].includes(ext)) return "🐍";
  if (["sh", "bash"].includes(ext)) return "⚡";
  if (["env"].includes(ext)) return "🔐";
  return "📄";
}

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

const PENDING_KEY = (id: string) => `agent-pending-${id}`;

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
  const [showMyFiles, setShowMyFiles] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deployBanner, setDeployBanner] = useState<string | null>(null);
  const [codeViewFile, setCodeViewFile] = useState<{ path: string; content: string } | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [secretRequests, setSecretRequests] = useState<SecretRequest[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: project } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: savedMessages = [], isLoading } = useListMessages(projectId, {
    query: { queryKey: getListMessagesQueryKey(projectId) },
  });

  // Persist messages to localStorage
  useEffect(() => {
    if (streamingMessages.length > 0) {
      try {
        const toSave = streamingMessages.filter((m) => !m.streaming);
        localStorage.setItem(`chat-messages-${projectId}`, JSON.stringify(toSave));
      } catch {}
    }
  }, [streamingMessages, projectId]);

  // Load messages from server or localStorage
  useEffect(() => {
    if (!isStreaming) {
      if (savedMessages.length > 0) {
        setStreamingMessages(
          (savedMessages as any[]).map((m) => ({
            id: m.id, role: m.role, content: m.content,
            thinkingSteps: m.thinkingSteps, streaming: false, createdAt: m.createdAt,
          }))
        );
      } else {
        try {
          const cached = localStorage.getItem(`chat-messages-${projectId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setStreamingMessages(parsed);
            }
          }
        } catch {}
      }
    }
  }, [savedMessages, isStreaming, projectId]);

  // Background task persistence: resume if pending
  useEffect(() => {
    const pending = localStorage.getItem(PENDING_KEY(projectId));
    if (pending && !isStreaming) {
      try {
        const { content, timestamp } = JSON.parse(pending);
        const age = Date.now() - timestamp;
        if (age < 1000 * 60 * 10) { // within 10 minutes
          localStorage.removeItem(PENDING_KEY(projectId));
          setTimeout(() => {
            setInput(content);
          }, 500);
        } else {
          localStorage.removeItem(PENDING_KEY(projectId));
        }
      } catch {
        localStorage.removeItem(PENDING_KEY(projectId));
      }
    }
  }, [projectId]);

  useEffect(() => { loadDeployInfo(); }, [projectId]);
  useEffect(() => { loadFiles(); }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingMessages, toolEvents, notifyBanners]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

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
    setShowMenu(false);
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
      } else { setDeployBanner(null); }
    } catch { setDeployBanner(null); }
  }

  async function saveSecretValue(req: SecretRequest, value: string) {
    const token = localStorage.getItem("token");
    try {
      await fetch(`/api/projects/${projectId}/secrets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ secrets: { [req.key]: value } }),
      });
    } catch {}
    setSecretRequests((prev) => prev.filter((r) => r.key !== req.key || r.msgId !== req.msgId));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px";
  }

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const text = (overrideContent ?? input).trim();
    if ((!text && pendingAttachments.length === 0) || isStreaming) return;
    if (!overrideContent) {
      setInput("");
      setPendingAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    // Save pending to localStorage for background persistence
    localStorage.setItem(PENDING_KEY(projectId), JSON.stringify({ content: text, timestamp: Date.now() }));

    const userMsg: StreamMessage = {
      id: `user-${Date.now()}`, role: "user", content: text,
      attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
      streaming: false, createdAt: new Date().toISOString(),
    };
    setStreamingMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setConnectionStatus("streaming");

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
                  setNotifyBanners((prev) => ({
                    ...prev, [aiMsgId]: [...(prev[aiMsgId] ?? []), data.text],
                  }));
                  break;
                case "task_done":
                  if (data.summary) {
                    aiContent = aiContent ? aiContent + "\n\n---\n\n" + data.summary : data.summary;
                    setStreamingMessages((prev) =>
                      prev.map((m) => m.id === aiMsgId ? { ...m, content: aiContent, streaming: true } : m)
                    );
                  }
                  break;
                case "request_secret":
                  setSecretRequests((prev) => [...prev, { key: data.key, description: data.description, msgId: aiMsgId }]);
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
      localStorage.removeItem(PENDING_KEY(projectId));
      setConnectionStatus("idle");
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setConnectionStatus("error");
        setStreamingMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: aiContent || "Connection lost. Your progress is saved — try sending again.", streaming: false }
              : m
          )
        );
      } else {
        setConnectionStatus("idle");
        setStreamingMessages((prev) =>
          prev.map((m) => m.id === aiMsgId ? { ...m, streaming: false } : m)
        );
      }
      localStorage.removeItem(PENDING_KEY(projectId));
    } finally {
      setIsStreaming(false);
      loadFiles();
      loadDeployInfo();
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    }
  }, [input, isStreaming, projectId, queryClient, pendingAttachments]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleFileAttach(files: Attachment[]) {
    setPendingAttachments((prev) => [...prev, ...files]);
    setShowMyFiles(false);
  }

  const fileCount = files.filter((f) => !f.isDir).length;

  const menuItems = [
    {
      label: "My Files",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
      ),
      onClick: () => { setShowFileModal(true); setShowMenu(false); },
      disabled: fileCount === 0,
    },
    {
      label: "Run Project",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      ),
      onClick: () => {
        setInput("Run the project and show me the output");
        setShowMenu(false);
        setTimeout(() => sendMessage("Run the project and show me the output"), 100);
      },
    },
    {
      label: "Shell",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
      ),
      onClick: () => {
        setInput("Open a shell and show the project structure");
        setShowMenu(false);
      },
    },
    {
      label: "Deploy",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      ),
      onClick: manualDeploy,
    },
    { separator: true },
    {
      label: "Databobo",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
        </svg>
      ),
      onClick: () => {
        setInput("Set up Databobo database integration for this project");
        setShowMenu(false);
      },
      badge: "100MB",
    },
    {
      label: "Authbobo",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      onClick: () => {
        setInput("Set up Authbobo authentication for this project");
        setShowMenu(false);
      },
    },
    {
      label: "Git",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
          <path d="M6 9v6M15.4 6.4L8.6 17.6"/>
        </svg>
      ),
      onClick: () => {
        setInput("Show git status and recent commits");
        setShowMenu(false);
      },
    },
    { separator: true },
    {
      label: "API Keys",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      ),
      onClick: () => { setShowSecrets(true); setShowMenu(false); },
    },
  ];

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
          <header className="flex items-center gap-2 px-3 h-12 border-b border-border/60 shrink-0 bg-background/95 backdrop-blur z-10">
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
            <p className="text-sm font-medium truncate flex-1 min-w-0 text-foreground/90">{project?.name ?? "..."}</p>

            <div className="flex items-center gap-1.5 shrink-0">
              {connectionStatus === "streaming" && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/8 border border-primary/15">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-primary font-medium">Working</span>
                </div>
              )}
              {connectionStatus === "error" && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/8 border border-destructive/20 text-destructive text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  Error
                </div>
              )}

              {deployUrl && (
                <a href={deployUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="hidden sm:inline">Live</span>
                </a>
              )}

              {fileCount > 0 && (
                <button onClick={() => setShowFileModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/70 transition-colors font-medium">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  <span>{fileCount}</span>
                </button>
              )}

              {/* 3-dot menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu((v) => !v)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground",
                    showMenu ? "bg-muted text-foreground" : "hover:bg-muted"
                  )}
                  title="More options"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/>
                  </svg>
                </button>

                {showMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
                    <div className="py-1">
                      {menuItems.map((item, i) => {
                        if ((item as any).separator) {
                          return <div key={i} className="h-px bg-border mx-2 my-1" />;
                        }
                        return (
                          <button
                            key={i}
                            onClick={(item as any).onClick}
                            disabled={(item as any).disabled}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span className="text-muted-foreground shrink-0">{(item as any).icon}</span>
                            <span className="flex-1 text-left">{(item as any).label}</span>
                            {(item as any).badge && (
                              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                {(item as any).badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Deploy banner */}
          {deployBanner && deployBanner !== "deploying" && (
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">🚀</span>
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Deployed!</span>
                <a href={deployBanner} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-emerald-600 underline underline-offset-2 hover:text-emerald-500 truncate">{deployBanner}</a>
              </div>
              <button onClick={() => setDeployBanner(null)} className="text-emerald-600/50 hover:text-emerald-600 shrink-0 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* Secret request banners */}
          {secretRequests.map((req) => (
            <SecretRequestBanner
              key={`${req.msgId}-${req.key}`}
              request={req}
              onSubmit={(val) => saveSecretValue(req, val)}
              onDismiss={() => setSecretRequests((prev) => prev.filter((r) => r.key !== req.key || r.msgId !== req.msgId))}
            />
          ))}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
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
                  onOpenCode={(p, c) => setCodeViewFile({ path: p, content: c })}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-border/60 px-4 py-3 shrink-0 bg-background">
            <div className="max-w-2xl mx-auto space-y-2">
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-muted border border-border text-xs">
                      <span>{a.type.startsWith("image/") ? "🖼️" : "📎"}</span>
                      <span className="max-w-[120px] truncate">{a.name}</span>
                      <button onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-foreground ml-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-card border border-border/80 rounded-2xl shadow-sm overflow-hidden focus-within:border-border transition-all">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything or describe what to build..."
                  rows={1}
                  disabled={isStreaming}
                  className="w-full px-4 pt-3.5 pb-2 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/70 disabled:opacity-60 max-h-[220px]"
                />
                <div className="flex items-center justify-between px-3 pb-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowMyFiles(true)}
                      disabled={isStreaming}
                      className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
                      title="Attach files"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                      </svg>
                    </button>
                    {isStreaming && (
                      <div className="flex items-center gap-1.5 ml-1">
                        <div className="flex gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-xs text-primary/70">Working...</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={isStreaming ? () => abortRef.current?.abort() : () => sendMessage()}
                    disabled={!isStreaming && !input.trim() && pendingAttachments.length === 0}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-xl text-sm font-medium transition-all",
                      isStreaming
                        ? "bg-foreground/10 text-foreground hover:bg-foreground/20"
                        : "bg-foreground text-background hover:opacity-90 disabled:opacity-30"
                    )}
                  >
                    {isStreaming ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="1"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground/40">AI can make mistakes. ⌘+Enter to send</p>
            </div>
          </div>
        </div>

        {/* File tree side panel */}
        {fileCount > 0 && (
          <div className="hidden lg:flex flex-col w-52 border-l border-border/60 overflow-hidden shrink-0 bg-muted/10">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
              <span className="text-xs font-medium text-muted-foreground">Files</span>
              <button onClick={() => setShowFileModal(true)} className="text-xs text-primary/70 hover:text-primary">Open</button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              <FileTree files={files} onSelect={() => setShowFileModal(true)} />
            </div>
            {deployUrl && (
              <div className="border-t border-border/60 p-2.5">
                <a href={deployUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-emerald-600 hover:underline">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
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
      {showMyFiles && (
        <MyFiles projectId={projectId} onAttach={handleFileAttach} onClose={() => setShowMyFiles(false)} />
      )}
      {codeViewFile && (
        <CodeViewModal file={codeViewFile} onClose={() => setCodeViewFile(null)} />
      )}
    </div>
  );
}

// ── Secret request banner ────────────────────────────────────────────
function SecretRequestBanner({
  request, onSubmit, onDismiss
}: {
  request: SecretRequest;
  onSubmit: (value: string) => void;
  onDismiss: () => void;
}) {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!value.trim()) return;
    setSubmitted(true);
    onSubmit(value.trim());
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 shrink-0 animate-in slide-in-from-top-2">
      <span className="text-lg shrink-0">🔑</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{request.key} required</p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">{request.description}</p>
        {!submitted ? (
          <div className="flex gap-2">
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={`Enter ${request.key}...`}
              className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-amber-300 bg-white dark:bg-amber-900/30 dark:border-amber-600 outline-none focus:border-amber-500"
            />
            <button
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-40"
            >
              Save
            </button>
            <button onClick={onDismiss} className="text-xs px-3 py-1.5 rounded-lg bg-transparent border border-amber-300 hover:bg-amber-100 transition-colors text-amber-700">
              Skip
            </button>
          </div>
        ) : (
          <p className="text-xs text-emerald-600 font-medium">✓ Saved securely</p>
        )}
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────
function EmptyState({ projectName, onExample }: { projectName?: string; onExample: (v: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h2 className="text-2xl font-semibold mb-2 tracking-tight">
        {projectName ? `Working on "${projectName}"` : "What can I help with?"}
      </h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-sm">
        {projectName ? "Describe what you need — I'll build it step by step." : "Ask anything — code, builds, deployments, or answers."}
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => onExample(ex)}
            className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors border border-border/50">
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Steps Summary Modal (Claude-style timeline) ───────────────────────
function StepsSummaryModal({
  tools, notifies, onClose, onOpenCode,
}: {
  tools: ToolEvent[];
  notifies: string[];
  onClose: () => void;
  onOpenCode: (path: string, content: string) => void;
}) {
  const FILE_TOOL_NAMES = ["file_write", "file_str_replace", "file_delete", "file_read"];

  // Build timeline items from notifies + all tool events
  type TimelineItem =
    | { kind: "notify"; text: string }
    | { kind: "tool"; tool: ToolEvent; op: (FileOp & { isDone: boolean }) | null };

  const items: TimelineItem[] = [];
  for (const text of notifies) items.push({ kind: "notify", text });
  for (const tool of tools) {
    if (tool.name === "message_notify" || tool.name === "request_secret") continue;
    const op = FILE_TOOL_NAMES.includes(tool.name)
      ? (() => { const o = getFileOp(tool); return o ? { ...o, isDone: tool.status === "done" } : null; })()
      : null;
    items.push({ kind: "tool", tool, op });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background w-full sm:max-w-md max-h-[75dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-muted-foreground/25 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 shrink-0">
          <h3 className="font-semibold text-sm text-foreground">Summary</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[9px] top-3 bottom-3 w-px bg-border/60" />
            <div className="space-y-0">
              {items.map((item, i) => {
                const isLast = i === items.length - 1;
                if (item.kind === "notify") {
                  return (
                    <div key={i} className="flex items-start gap-3 py-2.5">
                      <div className="shrink-0 w-[18px] h-[18px] rounded-full border-2 border-border bg-background mt-0.5 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                      </div>
                      <p className="text-sm text-muted-foreground leading-snug pt-0.5">{item.text}</p>
                    </div>
                  );
                }
                const { tool, op } = item;
                const cfg = TOOL_CONFIG[tool.name] ?? { label: tool.name, icon: "🔧", color: "slate" };
                const isRunning = tool.status === "running";
                const isFile = op !== null;
                const title = isFile
                  ? `${cfg.label} ${shortFilename(op!.file)}`
                  : cfg.label;
                const detail = tool.args.command
                  ? String(tool.args.command).slice(0, 80)
                  : tool.args.url
                  ? tool.args.url
                  : tool.args.query
                  ? tool.args.query
                  : null;

                return (
                  <div key={i} className="flex items-start gap-3 py-2.5">
                    {/* Icon node */}
                    <div className={cn(
                      "shrink-0 w-[18px] h-[18px] rounded-sm border bg-background mt-0.5 flex items-center justify-center text-[10px]",
                      isRunning ? "border-primary animate-pulse" : "border-border/70"
                    )}>
                      {isRunning
                        ? <svg className="animate-spin w-2.5 h-2.5 text-primary" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        : <span>{cfg.icon}</span>
                      }
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {isFile && op?.content && op.isDone ? (
                        <button
                          onClick={() => { onOpenCode(op!.file, op!.content!); onClose(); }}
                          className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left leading-snug"
                        >
                          {title}
                        </button>
                      ) : (
                        <p className={cn("text-sm font-medium leading-snug", isRunning ? "text-primary" : "text-foreground")}>
                          {title}
                        </p>
                      )}
                      {detail && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">{detail}</p>
                      )}
                      {isFile && op && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {op.added > 0 && <span className="text-[11px] text-emerald-600 font-medium">+{op.added} lines</span>}
                          {op.removed > 0 && <span className="text-[11px] text-destructive font-medium">-{op.removed} lines</span>}
                          {op.type === "delete" && <span className="text-[11px] text-destructive font-medium">deleted</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No steps recorded.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────
function MessageBubble({
  msg, tools, notifies, onOpenCode,
}: {
  msg: StreamMessage;
  tools: ToolEvent[];
  notifies: string[];
  onOpenCode: (path: string, content: string) => void;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] space-y-2">
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {msg.attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-muted text-xs border border-border">
                  <span>{a.type.startsWith("image/") ? "🖼️" : "📎"}</span>
                  <span className="max-w-[140px] truncate">{a.name}</span>
                </div>
              ))}
            </div>
          )}
          <div className="bg-muted/70 border border-border/40 px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed text-foreground whitespace-pre-wrap">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant message ──
  const FILE_TOOL_NAMES = ["file_write", "file_str_replace", "file_delete", "file_read"];
  const visibleTools = tools.filter(
    (t) => t.name !== "message_notify" && t.name !== "task_done" && t.name !== "request_secret"
  );
  const fileTools = visibleTools.filter((t) => FILE_TOOL_NAMES.includes(t.name));
  const fileOps = fileTools
    .map((t) => { const op = getFileOp(t); return op ? { ...op, isDone: t.status === "done" } : null; })
    .filter(Boolean) as Array<FileOp & { isDone: boolean }>;
  const deployResult = tools.find((t) => t.name === "deploy_to_vercel" && t.status === "done");
  const liveUrl = deployResult ? extractUrl(deployResult.result ?? "") : null;
  const runningTool = visibleTools.find((t) => t.status === "running");
  const totalSteps = visibleTools.length + notifies.length;
  const hasSteps = totalSteps > 0;

  // Last notify as the "thinking" label
  const lastNotify = notifies[notifies.length - 1];
  const runningLabel = runningTool
    ? `${TOOL_CONFIG[runningTool.name]?.label ?? runningTool.name}${runningTool.args.file ? ` — ${shortFilename(runningTool.args.file)}` : runningTool.args.command ? ` — ${String(runningTool.args.command).slice(0, 40)}` : ""}`
    : lastNotify ?? null;

  return (
    <div className="space-y-2.5">

      {/* ── Claude-style thinking row ── */}
      {hasSteps && (
        <div className="space-y-1.5">
          {/* Active running indicator */}
          {runningTool && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground select-none">
              <div className="flex gap-[3px] shrink-0">
                <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "120ms" }} />
                <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "240ms" }} />
              </div>
              <span className="truncate max-w-[340px]">{runningLabel}</span>
            </div>
          )}

          {/* Collapsible summary trigger (Claude style: "> text") */}
          {!runningTool && totalSteps > 0 && (
            <button
              onClick={() => setStepsOpen((v) => !v)}
              className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors group"
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className={cn("transition-transform shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground", stepsOpen ? "rotate-90" : "")}
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span className="truncate max-w-[340px]">
                {lastNotify ?? `${totalSteps} step${totalSteps !== 1 ? "s" : ""} taken`}
              </span>
            </button>
          )}

          {/* Expanded inline steps list */}
          {stepsOpen && !runningTool && (
            <div className="ml-[22px] border border-border/50 rounded-xl overflow-hidden bg-muted/20">
              <div className="px-4 py-3 space-y-2.5">
                {notifies.map((text, i) => (
                  <div key={`n-${i}`} className="flex items-start gap-2.5">
                    <div className="shrink-0 w-2 h-2 rounded-full bg-muted-foreground/30 mt-1.5" />
                    <span className="text-xs text-muted-foreground leading-relaxed">{text}</span>
                  </div>
                ))}
                {visibleTools.map((tool, i) => {
                  const cfg = TOOL_CONFIG[tool.name] ?? { label: tool.name, icon: "🔧", color: "slate" };
                  const op = FILE_TOOL_NAMES.includes(tool.name) ? getFileOp(tool) : null;
                  const title = op ? `${cfg.label} ${shortFilename(op.file)}` : cfg.label;
                  return (
                    <div key={`t-${i}`} className="flex items-start gap-2.5">
                      <span className="shrink-0 w-[18px] h-[18px] rounded-sm border border-border/60 bg-background text-[10px] flex items-center justify-center mt-0.5">
                        {cfg.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground leading-snug">{title}</p>
                        {(tool.args.command || tool.args.url || tool.args.query) && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate font-mono max-w-[240px]">
                            {tool.args.command ?? tool.args.url ?? tool.args.query}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalSteps > 2 && (
                <button
                  onClick={() => setShowSummary(true)}
                  className="w-full text-[12px] text-primary/80 hover:text-primary px-4 py-2 border-t border-border/40 text-center transition-colors hover:bg-muted/30"
                >
                  View full summary →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── File operation chips ── */}
      {fileOps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fileOps.map((op, i) => (
            <button
              key={`${op.file}-${i}`}
              onClick={() => op.content && op.isDone ? onOpenCode(op.file, op.content) : undefined}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition-colors",
                op.isDone
                  ? "bg-background border-border/60 hover:bg-muted cursor-pointer shadow-sm"
                  : "bg-muted/30 border-border/30 opacity-50 cursor-default",
              )}
            >
              <span className="text-[10px] opacity-70">{fileTypeIcon(op.file)}</span>
              <span className="text-foreground/80 max-w-[130px] truncate">{shortFilename(op.file)}</span>
              {op.type === "delete" ? (
                <span className="text-destructive font-medium text-[10px] ml-0.5">del</span>
              ) : (
                <span className="text-muted-foreground/60 text-[10px] ml-0.5">
                  {op.added > 0 && <span className="text-emerald-600">+{op.added}</span>}
                  {op.added > 0 && op.removed > 0 && " "}
                  {op.removed > 0 && <span className="text-rose-500">-{op.removed}</span>}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Live deploy card ── */}
      {liveUrl && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50">
          <span className="text-xl shrink-0">🚀</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Deployed!</p>
            <a href={liveUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-emerald-600 hover:underline truncate block">{liveUrl}</a>
          </div>
          <a href={liveUrl} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shrink-0">Open →</a>
        </div>
      )}

      {/* ── Message content ── */}
      {(msg.content || (msg.streaming && !msg.content)) && (
        <div className="text-sm leading-relaxed text-foreground">
          {msg.content ? (
            <>
              <MarkdownRenderer content={msg.content} streaming={msg.streaming} />
              {msg.streaming && (
                <span className="inline-block w-1.5 h-3.5 bg-foreground/40 rounded ml-0.5 animate-pulse align-middle" />
              )}
            </>
          ) : msg.streaming ? (
            <div className="flex gap-1.5 py-1">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : null}
        </div>
      )}

      {/* ── Summary Modal ── */}
      {showSummary && (
        <StepsSummaryModal
          tools={visibleTools}
          notifies={notifies}
          onClose={() => setShowSummary(false)}
          onOpenCode={onOpenCode}
        />
      )}
    </div>
  );
}

// ── Code view modal ──────────────────────────────────────────────────
function CodeViewModal({ file, onClose }: { file: { path: string; content: string }; onClose: () => void }) {
  function getLang(p: string): string {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      json: "json", html: "html", css: "css", md: "markdown", sh: "bash", py: "python",
    };
    return map[ext] ?? "text";
  }
  const lineCount = file.content.split("\n").length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background w-full sm:max-w-2xl max-h-[80dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-mono font-medium truncate">{file.path.split("/").pop()}</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{getLang(file.path)}</span>
            <span className="text-xs text-muted-foreground">{lineCount} lines</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigator.clipboard.writeText(file.content)}
              className="text-xs px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors">Copy</button>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-4">
          <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
            <code>{file.content}</code>
          </pre>
        </div>
        <div className="px-4 py-2 border-t border-border bg-muted/20 shrink-0">
          <p className="text-xs text-muted-foreground font-mono">{file.path}</p>
        </div>
      </div>
    </div>
  );
}
