import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, useSearch } from "wouter";
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
  expo_snack:           { label: "Uploading to Expo", icon: "📱", color: "emerald" },
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

// ── Skills system ─────────────────────────────────────────────────────
interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
  category: "builtin" | "custom";
  source?: string;
  createdAt?: string;
}

const BUILT_IN_SKILLS: Skill[] = [
  {
    id: "plan",
    name: "plan",
    description: "Create a detailed plan before building",
    icon: "📋",
    prompt: "PLAN_MODE: Before writing any code or executing any commands, present a complete numbered plan of what you will do. Describe each step clearly, including files to create, packages to install, and commands to run. End your plan with: '✅ Plan ready — reply with **go** to start building, or tell me what to change.' Do NOT execute any tools until the user approves.\n\nUser request: ",
    category: "builtin",
  },
  {
    id: "fix",
    name: "fix",
    description: "Diagnose and fix all bugs and errors",
    icon: "🔧",
    prompt: "Review the entire project and fix all bugs, errors, and issues. Check: console errors, TypeScript errors, broken imports, missing dependencies, incorrect logic. Show each fix clearly.",
    category: "builtin",
  },
  {
    id: "explain",
    name: "explain",
    description: "Explain the codebase architecture and logic",
    icon: "💡",
    prompt: "Explain the current project in detail: overall architecture, file structure, how the main components work, data flow, and key design decisions. Be thorough but clear.",
    category: "builtin",
  },
  {
    id: "deploy",
    name: "deploy",
    description: "Deploy the project to Vercel",
    icon: "🚀",
    prompt: "Deploy this project to Vercel. Ensure it's production-ready (remove debug logs, check env vars, verify build succeeds) then deploy and return the live URL.",
    category: "builtin",
  },
  {
    id: "optimize",
    name: "optimize",
    description: "Optimize performance and code quality",
    icon: "⚡",
    prompt: "Optimize this project for: bundle size, load performance, code quality, and maintainability. Check for unused imports, large dependencies, performance bottlenecks, and code duplication. Apply fixes.",
    category: "builtin",
  },
  {
    id: "test",
    name: "test",
    description: "Write comprehensive tests",
    icon: "🧪",
    prompt: "Write comprehensive tests for this project using the appropriate testing framework. Include unit tests, integration tests, and edge cases. Aim for high coverage of critical paths.",
    category: "builtin",
  },
  {
    id: "document",
    name: "document",
    description: "Add documentation, comments and README",
    icon: "📝",
    prompt: "Add proper documentation to this project: JSDoc/TSDoc comments on all functions and classes, a comprehensive README.md with setup instructions, usage examples, and API docs.",
    category: "builtin",
  },
  {
    id: "refactor",
    name: "refactor",
    description: "Refactor for cleaner structure",
    icon: "♻️",
    prompt: "Refactor this project for better structure, readability, and maintainability. Apply clean code principles, break large files into smaller modules, extract reusable utilities, and improve naming.",
    category: "builtin",
  },
  {
    id: "debug",
    name: "debug",
    description: "Step-by-step debugging session",
    icon: "🐛",
    prompt: "Help me debug this project step by step. Check all logs, trace the execution flow, identify the root cause of issues, and propose targeted fixes.",
    category: "builtin",
  },
  {
    id: "security",
    name: "security",
    description: "Security audit and hardening",
    icon: "🔒",
    prompt: "Perform a security audit of this project. Check for: exposed secrets, SQL injection, XSS, CSRF, insecure dependencies, missing auth guards, input validation issues. Fix all vulnerabilities found.",
    category: "builtin",
  },
];

const SKILLS_STORAGE_KEY = "user-skills-v1";

function loadUserSkills(): Skill[] {
  try {
    const raw = localStorage.getItem(SKILLS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Skill[];
  } catch {}
  return [];
}

function saveUserSkills(skills: Skill[]) {
  try {
    localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(skills));
  } catch {}
}

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
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [agentMode, setAgentMode] = useState<"plan" | "build">(
    () => (localStorage.getItem("agentMode") as "plan" | "build") ?? "build"
  );
  const [slashQuery, setSlashQuery] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [userSkills, setUserSkills] = useState<Skill[]>(() => loadUserSkills());
  const [showSkillsManager, setShowSkillsManager] = useState(false);
  const [customAIConfig] = useState<{ baseUrl: string; apiKey: string; model: string; enabled: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem("custom-ai-config") ?? "{}"); } catch { return { baseUrl: "", apiKey: "", model: "", enabled: false }; }
  });
  const [useCustomAI, setUseCustomAI] = useState<boolean>(() => {
    try { const cfg = JSON.parse(localStorage.getItem("custom-ai-config") ?? "{}"); return !!cfg.enabled && !!cfg.apiKey; } catch { return false; }
  });
  const [showBuildLog, setShowBuildLog] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubPushStatus, setGithubPushStatus] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const [githubPushResult, setGithubPushResult] = useState<{ url?: string; error?: string } | null>(null);
  const [githubRepo, setGithubRepo] = useState<string>(() => {
    try { const cfg = JSON.parse(localStorage.getItem("github-config") ?? "{}"); return cfg.defaultRepo ?? ""; } catch { return ""; }
  });
  const [githubCommitMsg, setGithubCommitMsg] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [aiSourceLabel, setAiSourceLabel] = useState<string | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCursorInfo, setMentionCursorInfo] = useState<{ start: number; end: number } | null>(null);
  const [expoSnacks, setExpoSnacks] = useState<Record<string, { url: string; qrUrl: string; snackId: string }>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(`preview-url-${projectId}`) ?? null; } catch { return null; }
  });
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const prevIsStreamingRef = useRef(false);
  const queryClient = useQueryClient();

  const { data: project } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: savedMessages = [], isLoading } = useListMessages(projectId, {
    query: { queryKey: getListMessagesQueryKey(projectId) },
  });

  // Persist messages to localStorage (include streaming ones for real-time recovery)
  useEffect(() => {
    if (streamingMessages.length > 0) {
      try {
        localStorage.setItem(`chat-messages-${projectId}`, JSON.stringify(streamingMessages));
      } catch {}
    }
  }, [streamingMessages, projectId]);

  // Recover incomplete streaming message after page refresh
  useEffect(() => {
    const streamKey = `chat-stream-${projectId}`;
    const recovered = localStorage.getItem(streamKey);
    if (recovered) {
      try {
        const { id, content, ts } = JSON.parse(recovered);
        if (Date.now() - ts < 30 * 60 * 1000) {
          setStreamingMessages((prev) => {
            if (prev.find((m) => m.id === id)) return prev;
            return [
              ...prev,
              { id, role: "assistant" as const, content: content + "\n\n*[Recovered after disconnection]*", streaming: false, createdAt: new Date().toISOString() },
            ];
          });
        }
      } catch {}
      localStorage.removeItem(streamKey);
    }
  }, [projectId]);

  // Load messages from server or localStorage
  useEffect(() => {
    if (!isStreaming) {
      if (savedMessages.length > 0) {
        setStreamingMessages((prev) => {
          const serverCount = (savedMessages as any[]).length;
          const localFinished = prev.filter((m) => !m.streaming).length;
          // Don't override if local has more finalized messages (streaming just finished)
          if (prev.length > 0 && localFinished >= serverCount) return prev;
          return (savedMessages as any[]).map((m) => ({
            id: m.id, role: m.role, content: m.content,
            thinkingSteps: m.thinkingSteps, streaming: false, createdAt: m.createdAt,
          }));
        });
        // Restore tool events, notify banners and expo snacks from localStorage for each message
        const te: Record<string, ToolEvent[]> = {};
        const nb: Record<string, string[]> = {};
        const es: Record<string, { url: string; qrUrl: string; snackId: string }> = {};
        for (const m of savedMessages as any[]) {
          try { const v = localStorage.getItem(`te-${projectId}-${m.id}`); if (v) te[m.id] = JSON.parse(v) as ToolEvent[]; } catch {}
          try { const v = localStorage.getItem(`nb-${projectId}-${m.id}`); if (v) nb[m.id] = JSON.parse(v); } catch {}
          try { const v = localStorage.getItem(`es-${projectId}-${m.id}`); if (v) es[m.id] = JSON.parse(v); } catch {}
        }
        if (Object.keys(te).length > 0) setToolEvents((prev) => ({ ...te, ...prev }));
        if (Object.keys(nb).length > 0) setNotifyBanners((prev) => ({ ...nb, ...prev }));
        if (Object.keys(es).length > 0) setExpoSnacks((prev) => ({ ...es, ...prev }));
      } else {
        try {
          const cached = localStorage.getItem(`chat-messages-${projectId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setStreamingMessages(parsed.map((m: any) => ({ ...m, streaming: false })));
            }
          }
        } catch {}
      }

      // Recover streamed tool events/notify banners from mid-stream disconnect
      try {
        const streamTe = localStorage.getItem(`te-stream-${projectId}`);
        if (streamTe) {
          const parsed = JSON.parse(streamTe) as Record<string, ToolEvent[]>;
          setToolEvents((prev) => ({ ...parsed, ...prev }));
          localStorage.removeItem(`te-stream-${projectId}`);
        }
        const streamNb = localStorage.getItem(`nb-stream-${projectId}`);
        if (streamNb) {
          const parsed = JSON.parse(streamNb) as Record<string, string[]>;
          setNotifyBanners((prev) => ({ ...parsed, ...prev }));
          localStorage.removeItem(`nb-stream-${projectId}`);
        }
      } catch {}
    }
  }, [savedMessages, isStreaming, projectId]);

  // Auto-send description passed from Dashboard via ?desc= query param
  const searchString = useSearch();
  const autoSentDescRef = useRef(false);
  useEffect(() => {
    // Guard: only fire once per mount, not on every state change
    if (autoSentDescRef.current) return;
    if (!searchString || isLoading) return;
    const params = new URLSearchParams(searchString);
    const desc = params.get("desc");
    if (!desc) return;
    // Remove the query param from URL without reload
    window.history.replaceState(null, "", `/chat/${projectId}`);
    // Only auto-send if there are no existing messages and not already streaming
    if (savedMessages.length === 0 && !isStreaming) {
      autoSentDescRef.current = true;
      setTimeout(() => sendMessage(desc), 400);
    }
  }, [isLoading, isStreaming, savedMessages.length, searchString, projectId]);

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

  // Mobile detection
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Persist tool events + notify banners incrementally during streaming (recovery after disconnect)
  useEffect(() => {
    if (isStreaming && Object.keys(toolEvents).length > 0) {
      try {
        localStorage.setItem(`te-stream-${projectId}`, JSON.stringify(toolEvents));
      } catch {}
    }
  }, [toolEvents, isStreaming, projectId]);

  useEffect(() => {
    if (isStreaming && Object.keys(notifyBanners).length > 0) {
      try {
        localStorage.setItem(`nb-stream-${projectId}`, JSON.stringify(notifyBanners));
      } catch {}
    }
  }, [notifyBanners, isStreaming, projectId]);

  useEffect(() => { loadDeployInfo(); }, [projectId]);
  useEffect(() => { loadFiles(); }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingMessages, toolEvents, notifyBanners]);

  // Auto-send queued messages when streaming finishes
  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming && messageQueue.length > 0) {
      const [next, ...rest] = messageQueue;
      setMessageQueue(rest);
      setTimeout(() => sendMessage(next), 600);
    }
    prevIsStreamingRef.current = isStreaming;
  }, [isStreaming]);

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
    const val = e.target.value;
    const cursorPos = e.target.selectionStart ?? val.length;
    setInput(val);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px";

    const textBefore = val.slice(0, cursorPos);
    const mentionMatch = textBefore.match(/@([\w./]*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionCursorInfo({ start: cursorPos - mentionMatch[0].length, end: cursorPos });
      setShowMentionMenu(true);
      setShowSlashMenu(false);
      return;
    }
    setShowMentionMenu(false);

    // Detect slash command — show menu when input starts with "/" and has no space yet
    if (val.startsWith("/") && !val.includes(" ") && !activeSkill) {
      setSlashQuery(val.slice(1));
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
  }

  function selectMentionFile(filePath: string) {
    if (!mentionCursorInfo) return;
    const before = input.slice(0, mentionCursorInfo.start);
    const after = input.slice(mentionCursorInfo.end);
    const newInput = before + `@${filePath}` + (after.startsWith(" ") || after === "" ? "" : " ") + after;
    setInput(newInput);
    setShowMentionMenu(false);
    setMentionCursorInfo(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = mentionCursorInfo.start + filePath.length + 1;
        textareaRef.current.setSelectionRange(pos, pos);
        textareaRef.current.focus();
      }
    }, 20);
  }

  function selectSkill(skill: Skill) {
    setActiveSkill(skill);
    setInput("");
    setShowSlashMenu(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function clearActiveSkill() {
    setActiveSkill(null);
    setInput("");
  }

  function addUserSkill(skill: Skill) {
    const updated = [...userSkills.filter((s) => s.id !== skill.id), skill];
    setUserSkills(updated);
    saveUserSkills(updated);
  }

  function deleteUserSkill(id: string) {
    const updated = userSkills.filter((s) => s.id !== id);
    setUserSkills(updated);
    saveUserSkills(updated);
  }

  const allSkills = [...BUILT_IN_SKILLS, ...userSkills];

  function copyMessage(content: string, id: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    });
  }

  async function pushToGitHub() {
    const githubCfg = (() => { try { return JSON.parse(localStorage.getItem("github-config") ?? "{}"); } catch { return {}; } })();
    const token = githubCfg.token;
    if (!token) { setGithubPushResult({ error: "No GitHub token found. Add it in Settings → Connectors." }); setGithubPushStatus("error"); return; }
    const repo = githubRepo || githubCfg.defaultRepo;
    if (!repo) { setGithubPushResult({ error: "Enter a repository (e.g. username/myrepo)" }); setGithubPushStatus("error"); return; }

    setGithubPushStatus("pushing");
    setGithubPushResult(null);
    const authToken = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/github/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ token, repo, message: githubCommitMsg || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        setGithubPushResult({ url: json.url });
        setGithubPushStatus("done");
      } else {
        setGithubPushResult({ error: json.error ?? "Push failed" });
        setGithubPushStatus("error");
      }
    } catch (e: any) {
      setGithubPushResult({ error: e.message ?? "Network error" });
      setGithubPushStatus("error");
    }
  }

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const text = (overrideContent ?? input).trim();
    if (!text && pendingAttachments.length === 0) return;

    // If streaming and this is a new user-typed message, add to queue
    if (isStreaming && !overrideContent) {
      setMessageQueue((prev) => [...prev, text]);
      setInput("");
      setPendingAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }

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

    const streamKey = `chat-stream-${projectId}`;
    // Build final text: active skill prompt → plan prefix → user text
    let finalText = text;
    if (activeSkill) {
      finalText = activeSkill.id === "plan"
        ? activeSkill.prompt + text
        : text
          ? `${activeSkill.prompt}\n\nUser request: ${text}`
          : activeSkill.prompt;
      setActiveSkill(null);
    } else if (agentMode === "plan") {
      const planPrefix = "PLAN_MODE: Before writing any code or executing any commands, present a complete numbered plan of what you will do. Describe each step clearly. End your plan with: '✅ Plan ready — reply with **go** to start building, or tell me what to change.' Do NOT execute any tools until the user approves.\n\nUser request: ";
      finalText = planPrefix + text;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/agent/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content: finalText,
          mode: agentMode,
          ...(useCustomAI && customAIConfig.apiKey ? {
            customAI: { baseUrl: customAIConfig.baseUrl, apiKey: customAIConfig.apiKey, model: customAIConfig.model },
          } : {}),
        }),
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
                case "ai_source":
                  setAiSourceLabel(data.source === "custom" ? `Custom · ${data.model ?? ""}` : `Platform · ${data.model ?? ""}`);
                  break;
                case "chunk":
                  if (data.delta !== undefined) {
                    aiContent += data.delta;
                    // Save every chunk to localStorage for real-time recovery
                    try {
                      localStorage.setItem(streamKey, JSON.stringify({ id: aiMsgId, content: aiContent, ts: Date.now() }));
                    } catch {}
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
                    // Incrementally build thinkingSteps so they're saved even before completion
                    setStreamingMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId
                          ? { ...m, thinkingSteps: [...(m.thinkingSteps ?? []), data.name] }
                          : m
                      )
                    );
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
                case "preview_ready":
                  setPreviewUrl(data.url);
                  setShowPreviewPanel(true);
                  setIframeKey((k) => k + 1);
                  try { localStorage.setItem(`preview-url-${projectId}`, data.url); } catch {}
                  break;
                case "expo_snack":
                  setExpoSnacks((prev) => ({
                    ...prev,
                    [aiMsgId]: { url: data.url, qrUrl: data.qrUrl, snackId: data.snackId },
                  }));
                  break;
                case "done":
                  if (data.role !== undefined) {
                    const finalMsgId = data.id ?? aiMsgId;
                    setStreamingMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId
                          ? {
                              ...m,
                              id: finalMsgId,
                              content: data.content ?? aiContent,
                              thinkingSteps: data.thinkingSteps ?? m.thinkingSteps ?? null,
                              streaming: false,
                            }
                          : m
                      )
                    );
                    // Re-key tool events to the server-assigned ID and persist to localStorage
                    setToolEvents((prev) => {
                      const next: typeof prev = {};
                      for (const [k, v] of Object.entries(prev)) {
                        next[k === aiMsgId ? finalMsgId : k] = v;
                      }
                      const events = prev[aiMsgId];
                      if (events?.length) {
                        try { localStorage.setItem(`te-${projectId}-${finalMsgId}`, JSON.stringify(events)); } catch {}
                      }
                      return next;
                    });
                    // Re-key notify banners and persist
                    setNotifyBanners((prev) => {
                      const next: typeof prev = {};
                      for (const [k, v] of Object.entries(prev)) {
                        next[k === aiMsgId ? finalMsgId : k] = v;
                      }
                      const banners = prev[aiMsgId];
                      if (banners?.length) {
                        try { localStorage.setItem(`nb-${projectId}-${finalMsgId}`, JSON.stringify(banners)); } catch {}
                      }
                      return next;
                    });
                    // Re-key expo snacks and persist
                    setExpoSnacks((prev) => {
                      const next: typeof prev = {};
                      for (const [k, v] of Object.entries(prev)) {
                        next[k === aiMsgId ? finalMsgId : k] = v;
                      }
                      const snack = prev[aiMsgId];
                      if (snack) {
                        try { localStorage.setItem(`es-${projectId}-${finalMsgId}`, JSON.stringify(snack)); } catch {}
                      }
                      return next;
                    });
                  }
                  break;
              }
            } catch {}
            eventType = "";
          }
        }
      }
      localStorage.removeItem(PENDING_KEY(projectId));
      localStorage.removeItem(streamKey);
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
      localStorage.removeItem(streamKey);
    } finally {
      setIsStreaming(false);
      loadFiles();
      loadDeployInfo();
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    }
  }, [input, isStreaming, projectId, queryClient, pendingAttachments]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (showMentionMenu) { setShowMentionMenu(false); e.preventDefault(); return; }
      if (showSlashMenu) { setShowSlashMenu(false); e.preventDefault(); return; }
    }
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
        setInput("Build and run the project — if it's a web app use build_preview to show a live preview, if it's a backend/CLI run it and show the output");
        setShowMenu(false);
        setTimeout(() => sendMessage("Build and run the project — if it's a web app use build_preview to show a live preview, if it's a backend/CLI run it and show the output"), 100);
      },
    },
    {
      label: previewUrl ? (showPreviewPanel ? "Hide Preview" : "Show Preview") : "Build Preview",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      ),
      onClick: () => {
        if (previewUrl) {
          setShowPreviewPanel((v) => !v);
          setShowMenu(false);
        } else {
          setInput("Build the project preview so I can see it live");
          setShowMenu(false);
          setTimeout(() => sendMessage("Build the project and create a preview so I can see it live"), 100);
        }
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
      label: "Build Mobile App",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
          <line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
      ),
      onClick: () => {
        setInput("Build a React Native mobile app with Expo. Create a well-designed app with multiple screens, navigation, and upload it to Expo Snack so I can scan the QR code with Expo Go on my phone.");
        setShowMenu(false);
      },
      badge: "Expo",
    },
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
            <button onClick={() => setLocation("/dashboard")} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0" title="Back to dashboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <p className="text-sm font-medium truncate flex-1 min-w-0 text-foreground/90">{project?.name ?? "..."}</p>
            <button
              onClick={() => setLocation("/dashboard")}
              title="New chat"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>

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

              {/* AI source toggle */}
              {customAIConfig.apiKey && customAIConfig.enabled && (
                <button
                  onClick={() => setUseCustomAI((v) => !v)}
                  title={useCustomAI ? "Using your AI — click to switch to platform AI" : "Using platform AI — click to switch to your AI"}
                  className={cn(
                    "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors",
                    useCustomAI
                      ? "bg-violet-500/10 text-violet-600 border-violet-500/20 hover:bg-violet-500/20"
                      : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
                  )}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a2 2 0 012 2v2a2 2 0 01-4 0V4a2 2 0 012-2zm0 16a2 2 0 012 2v2a2 2 0 01-4 0v-2a2 2 0 012-2zM2 12a2 2 0 012-2h2a2 2 0 010 4H4a2 2 0 01-2-2zm16 0a2 2 0 012-2h2a2 2 0 010 4h-2a2 2 0 01-2-2z"/>
                  </svg>
                  {useCustomAI ? "My AI" : "Platform"}
                </button>
              )}

              {/* GitHub push button */}
              {fileCount > 0 && (
                <button
                  onClick={() => { setShowGithubModal(true); setGithubPushStatus("idle"); setGithubPushResult(null); }}
                  title="Push to GitHub"
                  className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border border-border bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                  GitHub
                </button>
              )}

              {aiSourceLabel && connectionStatus === "streaming" && (
                <span className="hidden md:inline text-[10px] text-muted-foreground/60 font-mono">{aiSourceLabel}</span>
              )}

              {previewUrl && (
                <button
                  onClick={() => setShowPreviewPanel((v) => !v)}
                  title={showPreviewPanel ? "Hide preview" : "Show app preview"}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors font-medium",
                    showPreviewPanel
                      ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                      : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
                  )}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                    <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                  <span className="hidden sm:inline">Preview</span>
                </button>
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

          {/* Live Build Log floating button — visible only during streaming */}
          {isStreaming && (
            <div className="fixed bottom-24 right-6 z-40">
              <button
                onClick={() => setShowBuildLog(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-foreground text-background shadow-lg hover:opacity-90 transition-all text-xs font-medium"
              >
                <span className="flex gap-[3px] shrink-0">
                  <span className="w-[4px] h-[4px] rounded-full bg-background/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-[4px] h-[4px] rounded-full bg-background/60 animate-bounce" style={{ animationDelay: "100ms" }} />
                  <span className="w-[4px] h-[4px] rounded-full bg-background/60 animate-bounce" style={{ animationDelay: "200ms" }} />
                </span>
                Live Build
              </button>
            </div>
          )}

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
                  onCopy={(content, id) => copyMessage(content, id)}
                  copiedId={copiedMsgId}
                  expoSnack={expoSnacks[msg.id]}
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

              {/* Active skill badge */}
              {activeSkill && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-sm">
                    <span className="text-base leading-none">{activeSkill.icon}</span>
                    <span className="font-medium text-primary">/{activeSkill.name}</span>
                    <span className="text-primary/60 text-xs hidden sm:inline">— {activeSkill.description}</span>
                    <button
                      onClick={clearActiveSkill}
                      className="ml-1 text-primary/50 hover:text-primary transition-colors"
                      title="Remove skill"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Message queue indicator */}
              {messageQueue.length > 0 && (
                <div className="flex items-center gap-2 px-1">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/60 border border-border/50 text-xs text-muted-foreground">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                    <span>{messageQueue.length} queued — will send when agent finishes</span>
                    <button
                      onClick={() => setMessageQueue([])}
                      className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              <div className="relative">
                {/* Slash command menu — floats above input */}
                {showSlashMenu && (
                  <div ref={slashMenuRef} className="absolute bottom-full left-0 right-0 mb-2 z-50">
                    <SlashCommandMenu
                      query={slashQuery}
                      allSkills={allSkills}
                      onSelect={selectSkill}
                      onManage={() => { setShowSlashMenu(false); setShowSkillsManager(true); }}
                    />
                  </div>
                )}

                {/* @ mention file picker — floats above input */}
                {showMentionMenu && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
                    <div className="bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
                        <span className="text-xs font-medium text-muted-foreground">@ mention file</span>
                        <span className="ml-auto text-[10px] text-muted-foreground/50">Esc to close</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {files
                          .filter((f) => !f.isDir && (mentionQuery === "" || f.path.toLowerCase().includes(mentionQuery.toLowerCase())))
                          .slice(0, 12)
                          .map((f) => (
                            <button
                              key={f.path}
                              onMouseDown={(e) => { e.preventDefault(); selectMentionFile(f.path); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors"
                            >
                              <span className="text-xs opacity-60">{f.path.endsWith(".tsx") || f.path.endsWith(".ts") ? "📘" : f.path.endsWith(".json") ? "📋" : f.path.endsWith(".css") ? "🎨" : "📄"}</span>
                              <span className="text-xs font-mono text-foreground truncate">{f.path}</span>
                            </button>
                          ))}
                        {files.filter((f) => !f.isDir && (mentionQuery === "" || f.path.toLowerCase().includes(mentionQuery.toLowerCase()))).length === 0 && (
                          <p className="text-xs text-muted-foreground px-3 py-2">No matching files</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              <div className="bg-card border border-border/80 rounded-2xl shadow-sm overflow-hidden focus-within:border-border transition-all">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    activeSkill
                      ? `Describe what you want to ${activeSkill.name}... (optional)`
                      : isStreaming
                      ? "Type to queue next message..."
                      : "Ask anything · / for skills · @ to mention a file"
                  }
                  rows={1}
                  className="w-full px-4 pt-3.5 pb-2 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground/70 max-h-[220px]"
                />
                <div className="flex items-center justify-between px-3 pb-2.5">
                  <div className="flex items-center gap-1.5">
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

                    {/* Plan / Build mode toggle */}
                    <div className="flex items-center bg-muted/60 rounded-lg p-0.5">
                      <button
                        onClick={() => {
                          setAgentMode("plan");
                          localStorage.setItem("agentMode", "plan");
                        }}
                        title="Plan mode: agent proposes a plan before executing"
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all",
                          agentMode === "plan"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                          <line x1="8" y1="18" x2="21" y2="18"/>
                          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
                          <line x1="3" y1="18" x2="3.01" y2="18"/>
                        </svg>
                        Plan
                      </button>
                      <button
                        onClick={() => {
                          setAgentMode("build");
                          localStorage.setItem("agentMode", "build");
                        }}
                        title="Build mode: agent executes immediately"
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all",
                          agentMode === "build"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Build
                      </button>
                    </div>

                    {isStreaming && (
                      <div className="flex gap-0.5 ml-0.5">
                        <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1 h-1 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )}
                  </div>
                  {isStreaming ? (
                    <div className="flex items-center gap-1">
                      {input.trim() && (
                        <button
                          onClick={() => sendMessage()}
                          className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                          title="Queue message"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => abortRef.current?.abort()}
                        className="flex items-center justify-center w-8 h-8 rounded-xl bg-foreground/10 text-foreground hover:bg-foreground/20 transition-all"
                        title="Stop"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="1"/>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => sendMessage()}
                      disabled={!input.trim() && pendingAttachments.length === 0}
                      className="flex items-center justify-center w-8 h-8 rounded-xl bg-foreground text-background hover:opacity-90 disabled:opacity-30 transition-all"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              </div>{/* end .relative slash wrapper */}
              <p className="text-center text-xs text-muted-foreground/40">AI can make mistakes. ⌘+Enter to send</p>
            </div>
          </div>
        </div>

        {/* App Browser Preview Panel — desktop side panel */}
        {showPreviewPanel && previewUrl && !isMobile && (
          <div className="flex flex-col border-l border-border bg-background shrink-0 overflow-hidden" style={{ width: 520 }}>
            {/* Browser chrome */}
            <div className="flex items-center gap-1 px-2 h-10 bg-muted/50 border-b border-border shrink-0">
              <div className="flex items-center gap-1 mr-1">
                <button
                  onClick={() => setShowPreviewPanel(false)}
                  className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors flex items-center justify-center group"
                  title="Close preview"
                >
                  <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="opacity-0 group-hover:opacity-100">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <button
                onClick={() => setIframeKey((k) => k + 1)}
                className="p-1 rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                title="Reload preview"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                </svg>
              </button>
              <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1 mx-1 rounded-lg bg-background border border-border/70 text-[11px] text-muted-foreground font-mono truncate">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground/60">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                </svg>
                <span className="truncate">{typeof window !== "undefined" ? window.location.host : ""}{previewUrl}</span>
              </div>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded-md hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                title="Open in new tab"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            </div>
            <iframe
              key={iframeKey}
              src={previewUrl}
              className="flex-1 w-full border-none bg-white"
              title="App Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        )}

        {/* App Preview Modal — mobile/iOS full-screen modal */}
        {showPreviewPanel && previewUrl && isMobile && (
          <div className="fixed inset-0 z-[80] flex flex-col bg-background animate-in slide-in-from-bottom-4 duration-300">
            {/* Mobile browser chrome */}
            <div className="flex items-center gap-2 px-3 h-12 bg-muted/60 border-b border-border shrink-0 safe-area-top">
              <button
                onClick={() => setShowPreviewPanel(false)}
                className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
                title="Close preview"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <div className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background border border-border/70 text-[11px] text-muted-foreground font-mono truncate">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground/60">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                </svg>
                <span className="truncate">{previewUrl}</span>
              </div>
              <button
                onClick={() => setIframeKey((k) => k + 1)}
                className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
                title="Reload"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                </svg>
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
                title="Open in browser"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            </div>
            {/* iframe fills the screen */}
            <iframe
              key={iframeKey}
              src={previewUrl}
              className="flex-1 w-full border-none bg-white"
              title="App Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
              allow="camera; microphone; geolocation"
            />
          </div>
        )}

        {/* File tree side panel */}
        {fileCount > 0 && !showPreviewPanel && (
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
      {showSkillsManager && (
        <SkillsManagerModal
          allSkills={allSkills}
          userSkills={userSkills}
          onSelect={(skill) => { selectSkill(skill); setShowSkillsManager(false); }}
          onAdd={addUserSkill}
          onDelete={deleteUserSkill}
          onClose={() => setShowSkillsManager(false)}
        />
      )}

      {/* Live Build Log Modal */}
      {showBuildLog && (() => {
        const streamingMsg = streamingMessages.find((m) => m.streaming);
        const liveTools = streamingMsg ? (toolEvents[streamingMsg.id] ?? []) : [];
        const liveNotifies = streamingMsg ? (notifyBanners[streamingMsg.id] ?? []) : [];
        return (
          <LiveBuildLogModal
            tools={liveTools}
            notifies={liveNotifies}
            isStreaming={isStreaming}
            onClose={() => setShowBuildLog(false)}
            onOpenCode={(p, c) => { setCodeViewFile({ path: p, content: c }); setShowBuildLog(false); }}
          />
        );
      })()}

      {/* ── GitHub Push Modal ── */}
      {showGithubModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (githubPushStatus !== "pushing") setShowGithubModal(false); }} />
          <div className="relative bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                <h3 className="font-semibold text-sm">Push to GitHub</h3>
              </div>
              <button onClick={() => setShowGithubModal(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {githubPushStatus === "done" ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Pushed successfully!</p>
                    {githubPushResult?.url && (
                      <a href={githubPushResult.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline">{githubPushResult.url}</a>
                    )}
                  </div>
                  <button onClick={() => setShowGithubModal(false)}
                    className="px-5 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all">
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Repository</label>
                    <input
                      type="text"
                      value={githubRepo}
                      onChange={(e) => setGithubRepo(e.target.value)}
                      placeholder="username/repository"
                      className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Repository will be created if it doesn't exist (with your token's permissions)</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Commit message <span className="font-normal">(optional)</span></label>
                    <input
                      type="text"
                      value={githubCommitMsg}
                      onChange={(e) => setGithubCommitMsg(e.target.value)}
                      placeholder="Update from AI Builder"
                      className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                  {githubPushResult?.error && (
                    <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-xl px-3.5 py-2.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-destructive shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p className="text-xs text-destructive">{githubPushResult.error}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={pushToGitHub}
                      disabled={githubPushStatus === "pushing"}
                      className="flex-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {githubPushStatus === "pushing" ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M21 12a9 9 0 01-9-9"/>
                          </svg>
                          Pushing...
                        </>
                      ) : "Push to GitHub"}
                    </button>
                    <button onClick={() => setShowGithubModal(false)}
                      className="px-4 py-2.5 rounded-xl text-sm border border-border hover:bg-muted transition-colors">
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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
  tools, notifies, onClose, onOpenCode, onSelectTool,
}: {
  tools: ToolEvent[];
  notifies: string[];
  onClose: () => void;
  onOpenCode: (path: string, content: string) => void;
  onSelectTool?: (tool: ToolEvent) => void;
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

                const isDetailClickable = !isFile && !isRunning && tool.status === "done" && tool.result && onSelectTool;
                return (
                  <div
                    key={i}
                    onClick={() => isDetailClickable ? onSelectTool!(tool) : undefined}
                    className={cn(
                      "flex items-start gap-3 py-2.5 rounded-lg px-2 -mx-2 transition-colors",
                      isDetailClickable ? "cursor-pointer hover:bg-muted/50" : ""
                    )}
                  >
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
                        <p className={cn("text-sm font-medium leading-snug", isRunning ? "text-primary" : isDetailClickable ? "text-foreground" : "text-foreground")}>
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
                    {isDetailClickable && (
                      <svg className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    )}
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

// ── Skeleton animation while tool runs ───────────────────────────────
function ToolActivitySkeleton({ toolName, args }: { toolName: string; args: Record<string, any> }) {
  const isFileOp = ["file_write", "file_str_replace", "file_read"].includes(toolName);
  const isShell = toolName === "shell_exec";
  const isSearch = ["web_search", "fetch_url"].includes(toolName);
  const isPkg = toolName === "install_packages";

  const bar = (w: number, delay: number) => (
    <div
      key={delay}
      className="h-2 rounded-full bg-muted-foreground/10 animate-pulse"
      style={{ width: `${w}%`, animationDelay: `${delay}ms` }}
    />
  );

  return (
    <div className="space-y-2 py-1 max-w-xs">
      {isFileOp && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded bg-muted-foreground/8 animate-pulse" />
            <div className="h-2 rounded-full bg-muted-foreground/10 animate-pulse w-32" />
          </div>
          {[92, 100, 78, 88, 65, 100, 55].map((w, i) => bar(w, i * 80))}
        </>
      )}
      {isShell && (
        <div className="rounded-xl bg-muted/40 border border-border/40 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-emerald-500/50 font-mono text-xs">$</span>
            <div className="h-2 rounded-full bg-muted-foreground/15 animate-pulse w-36" style={{ animationDelay: "0ms" }} />
          </div>
          {[70, 85, 50].map((w, i) => bar(w, i * 100))}
        </div>
      )}
      {isSearch && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-2.5" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="w-8 h-8 rounded-lg bg-muted-foreground/8 animate-pulse shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 rounded-full bg-muted-foreground/12 animate-pulse w-3/4" style={{ animationDelay: `${i * 120 + 60}ms` }} />
                <div className="h-1.5 rounded-full bg-muted-foreground/8 animate-pulse w-full" style={{ animationDelay: `${i * 120 + 90}ms` }} />
                <div className="h-1.5 rounded-full bg-muted-foreground/6 animate-pulse w-4/5" style={{ animationDelay: `${i * 120 + 120}ms` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {isPkg && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="w-3 h-3 rounded-sm bg-muted-foreground/15 animate-pulse shrink-0" />
              <div className="h-2 rounded-full bg-muted-foreground/10 animate-pulse" style={{ width: `${[60, 80, 50][i]}%`, animationDelay: `${i * 100 + 50}ms` }} />
            </div>
          ))}
        </div>
      )}
      {!isFileOp && !isShell && !isSearch && !isPkg && (
        <div className="space-y-2">
          {[75, 100, 60, 88].map((w, i) => bar(w, i * 90))}
        </div>
      )}
    </div>
  );
}

// ── Tool detail modal helpers ─────────────────────────────────────────
interface SearchResult { title: string; url: string; snippet: string }

function parseSearchResults(raw: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length >= 2) {
      const m = lines[0].match(/^\*\*(.*?)\*\*$/);
      if (m) {
        results.push({ title: m[1].trim(), url: lines[1].trim(), snippet: lines.slice(2).join(" ").trim() });
      }
    }
  }
  return results;
}

function getDomain(url: string): string {
  try { return new URL(url.startsWith("http") ? url : "https://" + url).hostname.replace("www.", ""); }
  catch { return url.slice(0, 30); }
}

function faviconBg(url: string): string {
  const palette = ["bg-blue-500","bg-rose-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-cyan-500","bg-pink-500","bg-orange-500"];
  let h = 0; for (let i = 0; i < url.length; i++) h = url.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

// ── Search Results Modal (iOS bottom sheet) ───────────────────────────
function SearchResultsModal({ tool, onClose }: { tool: ToolEvent; onClose: () => void }) {
  const query = tool.args.query ?? "";
  const results = parseSearchResults(tool.result ?? "");
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background w-full sm:max-w-lg max-h-[85dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-muted-foreground/25 rounded-full" />
        </div>
        <div className="flex items-start justify-between px-5 py-3 border-b border-border/60 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base">🔍</span>
              <h3 className="font-semibold text-sm text-foreground">Web Search</h3>
              {results.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground font-medium">{results.length} results</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs">"{query}"</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors shrink-0 ml-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {results.length > 0 ? results.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
              className="flex gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group border border-transparent hover:border-border/40">
              <div className={`w-9 h-9 rounded-xl ${faviconBg(r.url)} shrink-0 flex items-center justify-center text-white text-sm font-bold mt-0.5 uppercase`}>
                {getDomain(r.url)[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">{r.title}</p>
                <p className="text-[11px] text-cyan-600 dark:text-cyan-400 mt-0.5 truncate">{getDomain(r.url)}</p>
                {r.snippet && <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{r.snippet}</p>}
              </div>
              <svg className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
            </a>
          )) : (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed px-1 py-2">{(tool.result ?? "").slice(0, 3000)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shell Output Modal (centered terminal) ────────────────────────────
function ShellOutputModal({ tool, onClose }: { tool: ToolEvent; onClose: () => void }) {
  const command = tool.args.command ?? (Array.isArray(tool.args.packages) ? tool.args.packages.join(" ") : "");
  const output = tool.result ?? "(no output)";
  const isError = output.startsWith("Exit ") || output.toLowerCase().startsWith("install error");
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0d1117] w-full max-w-2xl max-h-[72dvh] rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-white/8">
        {/* macOS title bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#161b22] border-b border-white/8 shrink-0">
          <div className="flex gap-1.5">
            <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="flex-1 text-center text-[11px] text-white/30 font-mono select-none">Terminal</span>
          {isError && <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-mono">error</span>}
        </div>
        {/* Command row */}
        <div className="flex items-start gap-2 px-4 py-2.5 bg-[#0d1117] border-b border-white/5 shrink-0 font-mono">
          <span className="text-emerald-400 text-sm mt-0.5 shrink-0">$</span>
          <span className="text-white/90 text-sm leading-relaxed break-all">{command}</span>
        </div>
        {/* Output */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <pre className={`text-sm leading-relaxed whitespace-pre-wrap break-words font-mono ${isError ? "text-red-300" : "text-white/75"}`}>{output}</pre>
        </div>
      </div>
    </div>
  );
}

// ── Generic tool result modal ─────────────────────────────────────────
function GenericToolModal({ tool, onClose }: { tool: ToolEvent; onClose: () => void }) {
  const cfg = TOOL_CONFIG[tool.name] ?? { label: tool.name, icon: "🔧", color: "slate" };
  const detail = tool.args.url || tool.args.file || tool.args.path || "";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background w-full max-w-lg max-h-[70dvh] rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{cfg.icon}</span>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{cfg.label}</h3>
              {detail && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs font-mono">{detail}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap leading-relaxed">{tool.result?.slice(0, 5000) || "(running…)"}</pre>
        </div>
      </div>
    </div>
  );
}

// ── Tool detail dispatcher ────────────────────────────────────────────
function ToolDetailModal({ tool, onClose }: { tool: ToolEvent; onClose: () => void }) {
  if (tool.name === "web_search") return <SearchResultsModal tool={tool} onClose={onClose} />;
  if (tool.name === "shell_exec" || tool.name === "install_packages") return <ShellOutputModal tool={tool} onClose={onClose} />;
  return <GenericToolModal tool={tool} onClose={onClose} />;
}

// ── Expo Snack QR card ────────────────────────────────────────────────
function ExpoSnackCard({ snack }: { snack: { url: string; qrUrl: string; snackId: string } }) {
  return (
    <div className="mt-2 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl overflow-hidden bg-emerald-50/40 dark:bg-emerald-900/10">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-200 dark:border-emerald-800/60">
        <span className="text-base">📱</span>
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Live on Expo Snack</span>
        <span className="ml-auto text-[11px] text-emerald-600/70 dark:text-emerald-400/60">Test on your phone</span>
      </div>
      <div className="flex items-center gap-5 p-4">
        <img
          src={snack.qrUrl}
          alt="QR Code for Expo Go"
          className="w-28 h-28 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-white shrink-0"
        />
        <div className="space-y-3 min-w-0">
          <div>
            <p className="text-sm font-medium text-foreground mb-0.5">Scan to open in Expo Go</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Install <strong>Expo Go</strong> on your phone (iOS/Android), then scan the QR code to launch the app instantly.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={snack.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
              Open in browser
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(snack.url)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted transition-colors text-muted-foreground"
            >
              Copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────
function MessageBubble({
  msg, tools, notifies, onOpenCode, onCopy, copiedId, expoSnack,
}: {
  msg: StreamMessage;
  tools: ToolEvent[];
  notifies: string[];
  onOpenCode: (path: string, content: string) => void;
  onCopy?: (content: string, id: string) => void;
  copiedId?: string | null;
  expoSnack?: { url: string; qrUrl: string; snackId: string };
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [selectedTool, setSelectedTool] = useState<ToolEvent | null>(null);
  const isCopied = copiedId === msg.id;

  if (msg.role === "user") {
    return (
      <div className="flex justify-end group">
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
          <div className="relative">
            <div className="bg-muted/70 border border-border/40 px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {msg.content}
            </div>
            {onCopy && msg.content && (
              <button
                onClick={() => onCopy(msg.content, msg.id)}
                className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-background border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                title="Copy"
              >
                {isCopied ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                )}
              </button>
            )}
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
                  const isClickable = tool.status === "done" && tool.result;
                  return (
                    <button
                      key={`t-${i}`}
                      onClick={() => isClickable ? setSelectedTool(tool) : undefined}
                      className={cn(
                        "flex items-start gap-2.5 w-full text-left rounded-lg px-1.5 -mx-1.5 py-1 -my-1 transition-colors",
                        isClickable ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"
                      )}
                    >
                      <span className="shrink-0 w-[18px] h-[18px] rounded-sm border border-border/60 bg-background text-[10px] flex items-center justify-center mt-0.5">
                        {cfg.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-xs font-medium leading-snug", isClickable ? "text-foreground group-hover:text-primary" : "text-foreground")}>{title}</p>
                        {(tool.args.command || tool.args.url || tool.args.query) && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate font-mono max-w-[240px]">
                            {tool.args.command ?? tool.args.url ?? tool.args.query}
                          </p>
                        )}
                      </div>
                      {isClickable && (
                        <svg className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                      )}
                    </button>
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

      {/* ── Expo Snack QR card ── */}
      {expoSnack && <ExpoSnackCard snack={expoSnack} />}

      {/* ── Skeleton activity while tool runs and no content yet ── */}
      {msg.streaming && !msg.content && runningTool && (
        <ToolActivitySkeleton toolName={runningTool.name} args={runningTool.args} />
      )}

      {/* ── Message content ── */}
      {(msg.content || (msg.streaming && !msg.content && !runningTool)) && (
        <div className="text-sm leading-relaxed text-foreground group/msg relative">
          {msg.content ? (
            <>
              <MarkdownRenderer content={msg.content} streaming={msg.streaming} />
              {msg.streaming && (
                <span className="inline-block w-1.5 h-3.5 bg-foreground/40 rounded ml-0.5 animate-pulse align-middle" />
              )}
              {!msg.streaming && onCopy && (
                <button
                  onClick={() => onCopy(msg.content, msg.id)}
                  className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground border border-border/50 bg-muted/50 hover:bg-muted opacity-0 group-hover/msg:opacity-100 transition-opacity"
                  title="Copy message"
                >
                  {isCopied ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
                      <span className="text-emerald-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      Copy
                    </>
                  )}
                </button>
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
          onSelectTool={(t) => { setShowSummary(false); setSelectedTool(t); }}
        />
      )}

      {/* ── Tool detail modal ── */}
      {selectedTool && (
        <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} />
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

// ── Slash Command Menu ────────────────────────────────────────────────
function SlashCommandMenu({
  query,
  allSkills,
  onSelect,
  onManage,
}: {
  query: string;
  allSkills: Skill[];
  onSelect: (s: Skill) => void;
  onManage: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const filtered = allSkills.filter(
    (s) =>
      !query ||
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && filtered[activeIdx]) { e.preventDefault(); onSelect(filtered[activeIdx]); }
      if (e.key === "Escape") { onManage(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtered, activeIdx, onSelect, onManage]);

  return (
    <div className="bg-popover border border-border rounded-2xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <p className="text-xs font-semibold text-muted-foreground">Skills</p>
        <span className="text-[10px] text-muted-foreground/60 hidden sm:block">↑↓ navigate · Enter select · Esc manage</span>
      </div>
      <div className="max-h-60 overflow-y-auto py-1">
        {filtered.map((skill, i) => (
          <button
            key={skill.id}
            onClick={() => onSelect(skill)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
              i === activeIdx ? "bg-muted" : "hover:bg-muted/60"
            )}
          >
            <span className="text-lg shrink-0 leading-none">{skill.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">/{skill.name}</p>
              <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
            </div>
            {skill.category === "custom" && (
              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-medium shrink-0">Custom</span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center px-4">
            <p className="text-sm text-muted-foreground">No skills match "{query}"</p>
            <button onClick={onManage} className="text-xs text-primary mt-2 hover:underline">
              Import from GitHub →
            </button>
          </div>
        )}
      </div>
      <div className="border-t border-border/50 px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{filtered.length} skills</span>
        <button
          onClick={onManage}
          className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
        >
          + Manage skills
        </button>
      </div>
    </div>
  );
}

// ── Skills Manager Modal ───────────────────────────────────────────────
function SkillsManagerModal({
  allSkills,
  userSkills,
  onSelect,
  onAdd,
  onDelete,
  onClose,
}: {
  allSkills: Skill[];
  userSkills: Skill[];
  onSelect: (s: Skill) => void;
  onAdd: (s: Skill) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"all" | "import">("all");
  const [githubUrl, setGithubUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [importDesc, setImportDesc] = useState("");
  const [importIcon, setImportIcon] = useState("⚡");
  const [importPrompt, setImportPrompt] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 280);
  }

  async function fetchFromGithub() {
    if (!githubUrl.trim()) return;
    setFetching(true);
    setFetchError("");
    try {
      // Convert github.com URL to raw.githubusercontent.com
      let rawUrl = githubUrl.trim();
      if (rawUrl.includes("github.com") && !rawUrl.includes("raw.githubusercontent.com")) {
        rawUrl = rawUrl
          .replace("github.com", "raw.githubusercontent.com")
          .replace("/blob/", "/");
      }
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setImportPrompt(text);

      // Auto-fill name from URL
      if (!importName) {
        const parts = rawUrl.split("/");
        const filename = parts[parts.length - 1].replace(/\.[^.]+$/, "");
        setImportName(filename.replace(/[-_]/g, " "));
      }
    } catch (e: any) {
      setFetchError("Failed to fetch — make sure it's a valid raw GitHub URL or file link");
    } finally {
      setFetching(false);
    }
  }

  function saveImport() {
    if (!importName.trim() || !importPrompt.trim()) return;
    const skill: Skill = {
      id: `custom-${Date.now()}`,
      name: importName.toLowerCase().replace(/\s+/g, "-"),
      description: importDesc || `Custom skill: ${importName}`,
      icon: importIcon,
      prompt: importPrompt,
      category: "custom",
      source: githubUrl || undefined,
      createdAt: new Date().toISOString(),
    };
    onAdd(skill);
    setGithubUrl(""); setImportName(""); setImportDesc(""); setImportPrompt(""); setImportIcon("⚡");
    setTab("all");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className={cn("fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-280", visible ? "opacity-100" : "opacity-0")}
        onClick={close}
      />
      <div className={cn(
        "relative bg-background w-full sm:max-w-lg sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden transition-all duration-280 ease-out max-h-[90dvh]",
        visible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-full sm:translate-y-0 opacity-0 sm:scale-95"
      )}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            <h2 className="font-semibold text-[15px]">Skills</h2>
          </div>
          <button onClick={close} className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0">
          <button
            onClick={() => setTab("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === "all" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            All Skills ({allSkills.length})
          </button>
          <button
            onClick={() => setTab("import")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === "import" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            + Import from GitHub
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "all" && (
            <div className="py-3">
              {/* Built-in */}
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-5 mb-2">Built-in</p>
              {BUILT_IN_SKILLS.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => onSelect(skill)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/60 transition-colors text-left"
                >
                  <span className="text-xl shrink-0 leading-none">{skill.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">/{skill.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">Use →</span>
                </button>
              ))}

              {/* Custom */}
              {userSkills.length > 0 && (
                <>
                  <div className="px-5 pt-4 pb-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">My Skills</p>
                  </div>
                  {userSkills.map((skill) => (
                    <div key={skill.id} className="flex items-center gap-1 px-3">
                      <button
                        onClick={() => onSelect(skill)}
                        className="flex-1 flex items-center gap-3 px-2 py-3 hover:bg-muted/60 rounded-xl transition-colors text-left"
                      >
                        <span className="text-xl shrink-0 leading-none">{skill.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">/{skill.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
                          {skill.source && (
                            <p className="text-[10px] text-primary/60 truncate mt-0.5">{skill.source}</p>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => onDelete(skill.id)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        title="Delete skill"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </>
              )}

              {userSkills.length === 0 && (
                <div className="px-5 pt-4 pb-2">
                  <div className="border border-dashed border-border rounded-2xl p-5 text-center">
                    <p className="text-sm text-muted-foreground mb-2">No custom skills yet</p>
                    <button
                      onClick={() => setTab("import")}
                      className="text-xs text-primary hover:underline"
                    >
                      Import your first skill from GitHub →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "import" && (
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">GitHub file URL</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Paste a link to any GitHub file containing agent instructions. Works with github.com or raw links.
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/user/repo/blob/main/skill.md"
                    className="flex-1 px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary transition-all"
                  />
                  <button
                    onClick={fetchFromGithub}
                    disabled={fetching || !githubUrl.trim()}
                    className="px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all shrink-0 active:scale-95"
                  >
                    {fetching ? "..." : "Fetch"}
                  </button>
                </div>
                {fetchError && (
                  <p className="text-xs text-destructive mt-2">{fetchError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1.5">Name</label>
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    placeholder="my-skill"
                    className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">Icon</label>
                  <input
                    type="text"
                    value={importIcon}
                    onChange={(e) => setImportIcon(e.target.value)}
                    placeholder="⚡"
                    className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Description</label>
                <input
                  type="text"
                  value={importDesc}
                  onChange={(e) => setImportDesc(e.target.value)}
                  placeholder="What does this skill do?"
                  className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Prompt / Instructions</label>
                <textarea
                  value={importPrompt}
                  onChange={(e) => setImportPrompt(e.target.value)}
                  placeholder="The instructions that will be sent to the agent when this skill is used..."
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:border-primary transition-all resize-none"
                />
              </div>

              <button
                onClick={saveImport}
                disabled={!importName.trim() || !importPrompt.trim()}
                className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all active:scale-95"
              >
                Save skill
              </button>

              <div className="bg-muted/60 border border-border/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Tip:</strong> Skills are saved to your browser and available in all your projects. You can use any plain text or markdown file as a skill — just paste the instructions directly if you don't have a GitHub link.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Live Build Log Modal ──────────────────────────────────────────────
function LiveBuildLogModal({
  tools, notifies, isStreaming, onClose, onOpenCode,
}: {
  tools: ToolEvent[];
  notifies: string[];
  isStreaming: boolean;
  onClose: () => void;
  onOpenCode: (path: string, content: string) => void;
}) {
  const logEndRef = useRef<HTMLDivElement>(null);
  const FILE_TOOL_NAMES = ["file_write", "file_str_replace", "file_delete", "file_read"];

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tools.length, notifies.length]);

  const allItems: Array<{ kind: "notify"; text: string } | { kind: "tool"; tool: ToolEvent }> = [];
  for (const text of notifies) allItems.push({ kind: "notify", text });
  for (const tool of tools) {
    if (tool.name === "message_notify" || tool.name === "request_secret") continue;
    allItems.push({ kind: "tool", tool });
  }

  const runningTool = tools.find((t) => t.status === "running");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0d1117] w-full sm:max-w-2xl max-h-[85dvh] sm:max-h-[78dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 border border-white/8">

        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-[#161b22] border-b border-white/8 shrink-0">
          <div className="flex gap-1.5">
            <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="flex-1 text-center text-[11px] text-white/30 font-mono select-none">Agent Build Log</span>
          {isStreaming ? (
            <div className="flex gap-[3px] shrink-0">
              <span className="w-[4px] h-[4px] rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-[4px] h-[4px] rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "100ms" }} />
              <span className="w-[4px] h-[4px] rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "200ms" }} />
            </div>
          ) : (
            <span className="text-[10px] text-emerald-400/50 font-mono shrink-0">✓ done</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-sm space-y-1.5">
          {allItems.length === 0 && isStreaming && (
            <div className="flex items-center gap-2 text-white/30 text-xs py-4">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Starting agent...
            </div>
          )}

          {allItems.map((item, i) => {
            if (item.kind === "notify") {
              return (
                <div key={`n-${i}`} className="flex items-start gap-2 py-0.5">
                  <span className="text-white/25 shrink-0 text-xs">→</span>
                  <span className="text-white/40 text-xs leading-relaxed">{item.text}</span>
                </div>
              );
            }

            const { tool } = item;
            const cfg = TOOL_CONFIG[tool.name] ?? { label: tool.name, icon: "🔧", color: "slate" };
            const isRunning = tool.status === "running";
            const isFile = FILE_TOOL_NAMES.includes(tool.name);
            const op = isFile ? getFileOp(tool) : null;
            const isError = tool.result?.startsWith("❌") || tool.result?.startsWith("Exit ");

            const cmdLabel = op
              ? `${op.type === "write" ? "write" : op.type === "replace" ? "edit" : op.type === "delete" ? "delete" : "read"} ${op.file}`
              : tool.args.command
              ? tool.args.command.slice(0, 80)
              : tool.args.packages
              ? `install ${Array.isArray(tool.args.packages) ? tool.args.packages.join(" ") : tool.args.packages}`
              : tool.args.query
              ? `search "${tool.args.query.slice(0, 50)}"`
              : tool.args.url
              ? `fetch ${tool.args.url.slice(0, 50)}`
              : cfg.label;

            return (
              <div key={`t-${i}`} className="space-y-1">
                <div className="flex items-center gap-2 py-0.5">
                  {isRunning ? (
                    <svg className="animate-spin w-3 h-3 text-yellow-400 shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : isError ? (
                    <span className="text-red-400 text-xs shrink-0 leading-none">✗</span>
                  ) : (
                    <span className="text-emerald-400 text-xs shrink-0 leading-none">✓</span>
                  )}
                  <span className={cn(
                    "text-xs truncate max-w-[85%]",
                    isRunning ? "text-yellow-300" : isError ? "text-red-300/80" : "text-white/75"
                  )}>
                    <span className="text-white/25">$ </span>
                    {cmdLabel}
                    {isRunning && <span className="animate-pulse">_</span>}
                  </span>
                  {op && tool.status === "done" && !isError && (
                    <span className="ml-auto text-[10px] text-emerald-500/50 shrink-0 font-mono">
                      {op.added > 0 ? `+${op.added}` : ""}
                      {op.removed > 0 ? ` -${op.removed}` : ""}
                    </span>
                  )}
                </div>

                {tool.status === "done" && !isFile && tool.result && (
                  <div className="ml-5 pl-2 border-l border-white/6">
                    <pre className={cn(
                      "text-[11px] leading-relaxed whitespace-pre-wrap break-all",
                      isError ? "text-red-300/60" : "text-white/25"
                    )}>
                      {tool.result.slice(0, 250)}{tool.result.length > 250 ? "\n…" : ""}
                    </pre>
                  </div>
                )}

                {op && op.content && tool.status === "done" && !isError && (
                  <button
                    onClick={() => onOpenCode(op.file, op.content!)}
                    className="ml-5 text-[11px] text-cyan-400/50 hover:text-cyan-300 transition-colors font-mono"
                  >
                    open {op.file.split("/").pop()} ↗
                  </button>
                )}
              </div>
            );
          })}

          {runningTool && (
            <div className="text-white/20 text-[11px] py-0.5 animate-pulse font-mono">···</div>
          )}
          <div ref={logEndRef} />
        </div>

        <div className="px-4 py-2 border-t border-white/8 bg-[#161b22] shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-white/20 font-mono">
            {allItems.filter((i) => i.kind === "tool").length} actions · {notifies.length} updates
          </span>
          <button onClick={onClose} className="text-[10px] text-white/25 hover:text-white/50 transition-colors font-mono">[close]</button>
        </div>
      </div>
    </div>
  );
}
