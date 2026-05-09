import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useListMessages,
  useGetMe,
  getGetProjectQueryKey,
  getListMessagesQueryKey,
  getListProjectsQueryKey,
  getGetMeQueryKey,
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
  size?: number;
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

// ── Icon background colours per tool colour key ─────────────────────
const STEP_ICON_BG: Record<string, string> = {
  blue:    "bg-white/[0.06]",
  slate:   "bg-white/[0.04]",
  amber:   "bg-white/[0.06]",
  red:     "bg-red-500/10",
  violet:  "bg-white/[0.06]",
  orange:  "bg-white/[0.06]",
  cyan:    "bg-white/[0.06]",
  yellow:  "bg-white/[0.06]",
  emerald: "bg-emerald-500/10",
};

// ── Generate a smart human-readable label from what the agent did ────
function buildStepsLabel(tools: ToolEvent[]): string {
  const writes  = tools.filter(t => t.name === "file_write" || t.name === "file_str_replace").length;
  const reads   = tools.filter(t => t.name === "file_read" || t.name === "file_list" || t.name === "file_find_by_name" || t.name === "file_find_in_content").length;
  const runs    = tools.filter(t => t.name === "shell_exec").length;
  const installs= tools.filter(t => t.name === "install_packages").length;
  const deploys = tools.filter(t => t.name === "deploy_to_vercel" || t.name === "expo_snack").length;
  const searches= tools.filter(t => t.name === "web_search" || t.name === "fetch_url").length;
  const secrets = tools.filter(t => t.name === "set_secret" || t.name === "get_secrets").length;

  const parts: string[] = [];
  if (deploys > 0) parts.push(deploys === 1 ? "نشر المشروع" : `نشر ${deploys}×`);
  if (writes > 0)  parts.push(writes === 1 ? "تعديل ملف" : `تعديل ${writes} ملف`);
  if (installs > 0) parts.push(installs === 1 ? "تثبيت حزم" : `تثبيت ${installs}×`);
  if (runs > 0)    parts.push(runs === 1 ? "تشغيل أمر" : `تشغيل ${runs} أمر`);
  if (searches > 0) parts.push("بحث الويب");
  if (reads > 0 && parts.length === 0) parts.push(reads === 1 ? "قراءة ملف" : `قراءة ${reads} ملف`);
  if (secrets > 0 && parts.length === 0) parts.push("إعداد مفاتيح");

  if (parts.length === 0) {
    const n = tools.length;
    return n === 1 ? "خطوة واحدة" : `${n} خطوات`;
  }
  return parts.slice(0, 3).join(" · ");
}


const TOOL_ICONS: Record<string, React.ReactNode> = {
  file_write:           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  file_read:            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  file_str_replace:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>,
  file_find_by_name:    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  file_find_in_content: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  file_list:            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  file_delete:          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
  shell_exec:           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  shell_background:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  install_packages:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>,
  fetch_url:            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  web_search:           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  set_secret:           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  get_secrets:          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  request_secret:       <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  deploy_to_vercel:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
  expo_snack:           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  message_notify:       <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  task_done:            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  generate_image:       <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  git_push:             <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>,
  build_preview:        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
};

const _TI_DEFAULT = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

const TOOL_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  file_write:           { label: "Writing",          icon: TOOL_ICONS.file_write,       color: "blue" },
  file_read:            { label: "Reading",           icon: TOOL_ICONS.file_read,        color: "slate" },
  file_str_replace:     { label: "Editing",           icon: TOOL_ICONS.file_str_replace, color: "amber" },
  file_find_by_name:    { label: "Finding files",     icon: TOOL_ICONS.file_find_by_name,    color: "slate" },
  file_find_in_content: { label: "Searching",         icon: TOOL_ICONS.file_find_in_content, color: "slate" },
  file_list:            { label: "Listing files",     icon: TOOL_ICONS.file_list,        color: "slate" },
  file_delete:          { label: "Deleting",          icon: TOOL_ICONS.file_delete,      color: "red" },
  shell_exec:           { label: "Running",           icon: TOOL_ICONS.shell_exec,       color: "violet" },
  shell_background:     { label: "Running (bg)",      icon: TOOL_ICONS.shell_background, color: "violet" },
  install_packages:     { label: "Installing",        icon: TOOL_ICONS.install_packages, color: "orange" },
  fetch_url:            { label: "Fetching",          icon: TOOL_ICONS.fetch_url,        color: "cyan" },
  web_search:           { label: "Searching web",     icon: TOOL_ICONS.web_search,       color: "cyan" },
  set_secret:           { label: "Storing secret",    icon: TOOL_ICONS.set_secret,       color: "yellow" },
  get_secrets:          { label: "Reading secrets",   icon: TOOL_ICONS.get_secrets,      color: "yellow" },
  request_secret:       { label: "Needs key",         icon: TOOL_ICONS.request_secret,   color: "orange" },
  deploy_to_vercel:     { label: "Deploying",         icon: TOOL_ICONS.deploy_to_vercel, color: "emerald" },
  expo_snack:           { label: "Uploading to Expo", icon: TOOL_ICONS.expo_snack,       color: "emerald" },
  message_notify:       { label: "Notify",            icon: TOOL_ICONS.message_notify,   color: "blue" },
  task_done:            { label: "Complete",          icon: TOOL_ICONS.task_done,        color: "emerald" },
  generate_image:       { label: "Generating image",  icon: TOOL_ICONS.generate_image,   color: "purple" },
  git_push:             { label: "Pushing to Git",    icon: TOOL_ICONS.git_push,         color: "slate" },
  build_preview:        { label: "Building preview",  icon: TOOL_ICONS.build_preview,    color: "teal" },
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

function fileTypeIcon(name: string): React.ReactNode {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx"].includes(ext)) return <span className="text-[9px] font-bold text-blue-400 leading-none">TS</span>;
  if (["js", "jsx"].includes(ext)) return <span className="text-[9px] font-bold text-yellow-400 leading-none">JS</span>;
  if (["json"].includes(ext)) return <span className="text-[9px] font-bold text-white/45 leading-none">{"{}"}</span>;
  if (["css", "scss"].includes(ext)) return <span className="text-[9px] font-bold text-pink-400 leading-none">CSS</span>;
  if (["html"].includes(ext)) return <span className="text-[9px] font-bold text-white/45 leading-none">HTM</span>;
  if (["md"].includes(ext)) return <span className="text-[9px] font-bold text-white/35 leading-none">MD</span>;
  if (["py"].includes(ext)) return <span className="text-[9px] font-bold text-green-400 leading-none">PY</span>;
  if (["sh", "bash"].includes(ext)) return <span className="text-[9px] font-bold text-purple-400 leading-none">SH</span>;
  if (["env"].includes(ext)) return <span className="text-[9px] font-bold text-white/40 leading-none">ENV</span>;
  return <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
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
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubPushStatus, setGithubPushStatus] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const [githubPushResult, setGithubPushResult] = useState<{ url?: string; error?: string } | null>(null);
  const [githubRepo, setGithubRepo] = useState<string>(() => {
    try { const cfg = JSON.parse(localStorage.getItem("github-config") ?? "{}"); return cfg.defaultRepo ?? ""; } catch { return ""; }
  });
  const [githubCommitMsg, setGithubCommitMsg] = useState("");
  // GitHub connect state
  type GithubStatus =
    | { connected: false }
    | { connected: true; repo: string; username: string; connectedAt: string; lastPushedAt: string | null; autoPush: boolean };
  const [githubStatus, setGithubStatus] = useState<GithubStatus>({ connected: false });
  const [githubStatusLoading, setGithubStatusLoading] = useState(false);
  const [githubConnectToken, setGithubConnectToken] = useState("");
  const [githubConnectRepo, setGithubConnectRepo] = useState("");
  const [githubConnectStatus, setGithubConnectStatus] = useState<"idle" | "connecting" | "done" | "error">("idle");
  const [githubConnectError, setGithubConnectError] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [aiSourceLabel, setAiSourceLabel] = useState<string | null>(null);
  const [showBoboDB, setShowBoboDB] = useState(false);
  const [projectRunningUrl, setProjectRunningUrl] = useState<string | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCursorInfo, setMentionCursorInfo] = useState<{ start: number; end: number } | null>(null);
  const [expoSnacks, setExpoSnacks] = useState<Record<string, { url: string; qrUrl: string; snackId: string }>>({});
  const [generatedImages, setGeneratedImages] = useState<Record<string, Array<{ url: string; prompt: string; filename: string }>>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(`preview-url-${projectId}`) ?? null; } catch { return null; }
  });
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768
  );
  const [showConsole, setShowConsole] = useState(false);
  const [consoleLines, setConsoleLines] = useState<Array<{ type: string; text: string; ts: number }>>([]);
  const [consoleRunning, setConsoleRunning] = useState(false);
  const consoleSseRef = useRef<EventSource | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const prevIsStreamingRef = useRef(false);
  // Grace period: don't overwrite local messages from server for 90s after streaming ends
  const lastStreamEndRef = useRef<number>(0);
  const queryClient = useQueryClient();

  const { data: project } = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const isMaxBuilders = (me as any)?.plan === "max_builders";
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
          // Grace period: if streaming just ended (< 8s ago), keep local messages to avoid flicker
          const gracePeriodActive = Date.now() - lastStreamEndRef.current < 90000;
          if (prev.length > 0 && (localFinished >= serverCount || gracePeriodActive)) return prev;
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
  useEffect(() => { loadGithubStatus(); }, [projectId]);

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

  async function loadGithubStatus() {
    const authToken = localStorage.getItem("token");
    setGithubStatusLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/github/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) setGithubStatus(await res.json());
    } catch {}
    setGithubStatusLoading(false);
  }

  async function connectToGitHub() {
    const authToken = localStorage.getItem("token");
    if (!githubConnectToken.trim()) { setGithubConnectError("Enter your GitHub token"); return; }
    if (!githubConnectRepo.trim()) { setGithubConnectError("Enter a repository name (e.g. username/myproject)"); return; }
    setGithubConnectStatus("connecting");
    setGithubConnectError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/github/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ token: githubConnectToken.trim(), repo: githubConnectRepo.trim(), autoPush: false }),
      });
      const json = await res.json();
      if (res.ok) {
        setGithubConnectStatus("done");
        setGithubStatus({ connected: true, repo: json.repo, username: json.username, connectedAt: json.connectedAt, lastPushedAt: null, autoPush: false });
        setGithubConnectToken("");
      } else {
        setGithubConnectError(json.error ?? "Connection failed");
        setGithubConnectStatus("error");
      }
    } catch (e: any) {
      setGithubConnectError(e.message ?? "Network error");
      setGithubConnectStatus("error");
    }
  }

  async function disconnectGitHub() {
    const authToken = localStorage.getItem("token");
    try {
      await fetch(`/api/projects/${projectId}/github/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch {}
    setGithubStatus({ connected: false });
    setGithubConnectStatus("idle");
    setGithubPushStatus("idle");
    setGithubPushResult(null);
  }

  async function toggleAutoPush(val: boolean) {
    const authToken = localStorage.getItem("token");
    try {
      await fetch(`/api/projects/${projectId}/github/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ autoPush: val }),
      });
      setGithubStatus((prev) => prev.connected ? { ...prev, autoPush: val } : prev);
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

  function handleDownloadProject() {
    const token = localStorage.getItem("token");
    setShowMenu(false);
    const a = document.createElement("a");
    a.href = `/api/projects/${projectId}/download?token=${encodeURIComponent(token ?? "")}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function startConsole() {
    const token = localStorage.getItem("token");
    setShowMenu(false);
    setShowConsole(true);
    setConsoleLines([]);
    setConsoleRunning(true);

    // Close any existing SSE
    if (consoleSseRef.current) {
      consoleSseRef.current.close();
      consoleSseRef.current = null;
    }

    const url = `/api/projects/${projectId}/run/stream?authorization=${encodeURIComponent(`Bearer ${token ?? ""}`)}`;
    const es = new EventSource(url);
    consoleSseRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type: string; text: string; ts: number };
        setConsoleLines((prev) => [...prev, data]);
        setTimeout(() => consoleEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        if (data.type === "exit" || data.type === "error") {
          setConsoleRunning(false);
          es.close();
          consoleSseRef.current = null;
        }
      } catch {}
    };
    es.onerror = () => {
      setConsoleRunning(false);
      setConsoleLines((prev) => [...prev, { type: "error", text: "Connection lost", ts: Date.now() }]);
      es.close();
      consoleSseRef.current = null;
    };
  }

  function stopConsole() {
    const token = localStorage.getItem("token");
    if (consoleSseRef.current) { consoleSseRef.current.close(); consoleSseRef.current = null; }
    setConsoleRunning(false);
    setConsoleLines((prev) => [...prev, { type: "info", text: "⏹ Stopped by user", ts: Date.now() }]);
    fetch(`/api/projects/${projectId}/run/stream`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  function clearConsole() {
    setConsoleLines([]);
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

  async function pushToGitHub(silent = false) {
    if (!githubStatus.connected) {
      setGithubPushResult({ error: "Connect to GitHub first" });
      setGithubPushStatus("error");
      return;
    }
    if (!silent) setGithubPushStatus("pushing");
    setGithubPushResult(null);
    const authToken = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/github/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ message: githubCommitMsg || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        setGithubPushResult({ url: json.url });
        setGithubPushStatus("done");
        // Update lastPushedAt
        setGithubStatus((prev) => prev.connected ? { ...prev, lastPushedAt: new Date().toISOString() } : prev);
      } else {
        if (!silent) { setGithubPushResult({ error: json.error ?? "Push failed" }); setGithubPushStatus("error"); }
      }
    } catch (e: any) {
      if (!silent) { setGithubPushResult({ error: e.message ?? "Network error" }); setGithubPushStatus("error"); }
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
          ...(pendingAttachments.length > 0 ? { attachments: pendingAttachments } : {}),
          ...(useCustomAI && customAIConfig.apiKey ? {
            customAI: { baseUrl: customAIConfig.baseUrl, apiKey: customAIConfig.apiKey, model: customAIConfig.model },
          } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        let errMsg = `Server error ${res.status}`;
        try { const j = await res.json(); errMsg = j.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
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
                  setProjectRunningUrl(data.url);
                  try { localStorage.setItem(`preview-url-${projectId}`, data.url); } catch {}
                  break;
                case "expo_snack":
                  setExpoSnacks((prev) => ({
                    ...prev,
                    [aiMsgId]: { url: data.url, qrUrl: data.qrUrl, snackId: data.snackId },
                  }));
                  break;
                case "image_generated":
                  setGeneratedImages((prev) => ({
                    ...prev,
                    [aiMsgId]: [...(prev[aiMsgId] ?? []), { url: data.url, prompt: data.prompt, filename: data.filename }],
                  }));
                  break;
                case "git_pushed":
                  setGithubPushResult({ url: data.url });
                  setGithubPushStatus("done");
                  setGithubStatus((prev) => prev.connected ? { ...prev, lastPushedAt: new Date().toISOString() } : prev);
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
      lastStreamEndRef.current = Date.now();
      setIsStreaming(false);
      // Always finalize any message still marked as streaming — prevents disappearing on disconnect
      setStreamingMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId && m.streaming
            ? {
                ...m,
                streaming: false,
                content: m.content || aiContent || "*(انقطع الاتصال — أعد الإرسال)*",
              }
            : m
        )
      );
      loadFiles();
      loadDeployInfo();
      // Auto-push to GitHub if configured
      if (githubStatus.connected && githubStatus.autoPush) {
        setTimeout(() => pushToGitHub(true), 2000);
      }
      // Delay refresh so the server has time to save the message before we refetch
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      }, 3000);
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

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const ext = item.type.split("/")[1] ?? "png";
      const name = `paste_${Date.now()}.${ext}`;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        setPendingAttachments((prev) => [...prev, { name, type: file.type, url, size: file.size }]);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleTextareaDrop(e: React.DragEvent) {
    if (e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const processFilesAsync = async () => {
      const newAtts: Attachment[] = [];
      for (const file of files) {
        const url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.readAsDataURL(file);
        });
        let textContent: string | undefined;
        const isText = file.type.startsWith("text/") || ["json","md","txt","csv","ts","tsx","js","jsx","html","css"].includes(file.name.split(".").pop()?.toLowerCase() ?? "");
        if (isText && file.size < 200 * 1024) {
          textContent = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = (ev) => resolve(ev.target?.result as string);
            r.readAsText(file);
          });
        }
        newAtts.push({ name: file.name, type: file.type, url, content: textContent, size: file.size });
      }
      setPendingAttachments((prev) => [...prev, ...newAtts]);
    };
    processFilesAsync();
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
      onClick: startConsole,
    },
    {
      label: "Download Project",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      ),
      onClick: handleDownloadProject,
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
      onClick: () => { setShowBoboDB(true); setShowMenu(false); },
      badge: "DB",
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
      label: "GitHub",
      badge: githubStatus.connected ? "✓" : undefined,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
        </svg>
      ),
      onClick: () => {
        setShowGithubModal(true);
        setGithubPushStatus("idle");
        setGithubPushResult(null);
        setGithubConnectStatus("idle");
        setGithubConnectError(null);
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
    <div className="flex h-[100dvh] bg-black overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-md" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={projectId} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Header */}
          <header className="flex items-center gap-2 px-3 h-12 border-b border-white/[0.06] shrink-0 bg-black/90 backdrop-blur-xl z-10">
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

              {isMaxBuilders && (
                <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-white/[0.1] bg-white/[0.05] text-white/50">
                  ⚡ MAX
                </span>
              )}

              {aiSourceLabel && connectionStatus === "streaming" && (
                <span className="hidden md:inline text-[10px] text-muted-foreground/60 font-mono">{aiSourceLabel}</span>
              )}

              {projectRunningUrl && !isStreaming && (
                <span className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  Running
                </span>
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
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#111] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
                    <div className="py-1">
                      {menuItems.map((item, i) => {
                        if ((item as any).separator) {
                          return <div key={i} className="h-px bg-white/[0.06] mx-2 my-1" />;
                        }
                        return (
                          <button
                            key={i}
                            onClick={(item as any).onClick}
                            disabled={(item as any).disabled}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-emerald-900/20 border-b border-emerald-700/30 shrink-0">
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
                <EmptyState projectName={project?.name} userName={me?.name} onExample={setInput} />
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
                  images={generatedImages[msg.id]}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="border-t border-white/[0.06] px-4 py-3 shrink-0 bg-black/90 backdrop-blur-xl">
            <div className="max-w-2xl mx-auto space-y-2">
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingAttachments.map((a, i) => {
                    const isImg = a.type.startsWith("image/");
                    const isZip = a.name.endsWith(".zip") || a.name.endsWith(".tar.gz") || a.type.includes("zip");
                    const ext = a.name.split(".").pop()?.toUpperCase() ?? "FILE";
                    return (
                      <div key={i} className="relative group flex items-center gap-2 pr-7 rounded-xl border border-border bg-muted/60 overflow-hidden max-w-[200px]">
                        {isImg && a.url ? (
                          <img src={a.url} alt={a.name} className="w-9 h-9 object-cover shrink-0 rounded-l-xl" />
                        ) : (
                          <div className={`w-9 h-9 flex items-center justify-center shrink-0 rounded-l-xl ${isZip ? "bg-white/[0.06]" : "bg-white/[0.04]"}`}>
                            {isZip ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/45"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            )}
                          </div>
                        )}
                        <div className="min-w-0 py-1.5">
                          <p className="text-xs font-medium truncate leading-tight">{a.name}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{isImg ? a.type.split("/")[1].toUpperCase() : ext}{a.size ? ` · ${(a.size / 1024).toFixed(0)}KB` : ""}</p>
                        </div>
                        <button
                          onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}
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
                    <div className="bg-[#111] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
                        <span className="text-xs font-medium text-white/50">@ mention file</span>
                        <span className="ml-auto text-[10px] text-white/30">Esc to close</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {files
                          .filter((f) => !f.isDir && (mentionQuery === "" || f.path.toLowerCase().includes(mentionQuery.toLowerCase())))
                          .slice(0, 12)
                          .map((f) => (
                            <button
                              key={f.path}
                              onMouseDown={(e) => { e.preventDefault(); selectMentionFile(f.path); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
                            >
                              <span className="w-4 h-4 flex items-center justify-center opacity-60">{fileTypeIcon(f.path.split("/").pop() ?? f.path)}</span>
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

              <div
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl shadow-sm overflow-hidden focus-within:border-white/[0.15] transition-all"
                onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
                onDrop={handleTextareaDrop}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    activeSkill
                      ? `Describe what you want to ${activeSkill.name}... (optional)`
                      : isStreaming
                      ? "Type to queue next message..."
                      : "Ask anything · / for skills · @ for files · paste image"
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
          <div className="flex flex-col border-l border-white/[0.06] bg-[#080808] shrink-0 overflow-hidden" style={{ width: 520 }}>
            {/* Browser chrome */}
            <div className="flex items-center gap-1 px-2 h-10 bg-white/[0.03] border-b border-white/[0.06] shrink-0">
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

        {/* ── Console Panel — desktop side panel ── */}
        {showConsole && !isMobile && (
          <div className="flex flex-col border-l border-border bg-[#0d1117] shrink-0 overflow-hidden" style={{ width: 480 }}>
            {/* Console header */}
            <div className="flex items-center gap-2 px-3 h-10 bg-[#161b22] border-b border-[#30363d] shrink-0">
              <div className="flex items-center gap-1.5 mr-1">
                <button
                  onClick={() => { stopConsole(); setShowConsole(false); }}
                  className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center group"
                  title="Close console"
                >
                  <svg width="5" height="5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" className="opacity-0 group-hover:opacity-100">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2" className="shrink-0">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              <span className="text-[11px] font-mono text-[#8b949e] flex-1 truncate">Project Console</span>
              {consoleRunning && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  running
                </span>
              )}
              {!consoleRunning && (
                <span className="text-[10px] text-[#8b949e] font-mono">stopped</span>
              )}
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={clearConsole}
                  className="px-2 py-0.5 rounded text-[10px] font-mono text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
                  title="Clear console"
                >clear</button>
                {consoleRunning ? (
                  <button
                    onClick={stopConsole}
                    className="px-2 py-0.5 rounded text-[10px] font-mono text-red-400 hover:text-red-300 hover:bg-[#21262d] transition-colors border border-red-800/50"
                    title="Stop process"
                  >■ stop</button>
                ) : (
                  <button
                    onClick={startConsole}
                    className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 hover:text-emerald-300 hover:bg-[#21262d] transition-colors border border-emerald-800/50"
                    title="Restart process"
                  >▶ restart</button>
                )}
              </div>
            </div>
            {/* Console output */}
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-5 space-y-0.5">
              {consoleLines.length === 0 && (
                <div className="text-[#6e7681] italic">Starting process…</div>
              )}
              {consoleLines.map((line, i) => {
                const color = line.type === "stderr" || line.type === "error"
                  ? "text-red-400"
                  : line.type === "exit"
                  ? "text-yellow-400"
                  : line.type === "info"
                  ? "text-[#6e7681]"
                  : "text-[#c9d1d9]";
                return (
                  <div key={i} className={`whitespace-pre-wrap break-all ${color}`}>
                    {line.type === "stderr" && <span className="text-red-600 mr-1 select-none">!</span>}
                    {line.text}
                  </div>
                );
              })}
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}

        {/* ── Console Modal — mobile full screen ── */}
        {showConsole && isMobile && (
          <div className="fixed inset-0 z-[80] flex flex-col bg-[#0d1117] animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-2 px-3 h-12 bg-[#161b22] border-b border-[#30363d] shrink-0">
              <button
                onClick={() => { stopConsole(); setShowConsole(false); }}
                className="p-2 rounded-xl hover:bg-[#21262d] transition-colors text-[#8b949e]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              <span className="flex-1 text-[12px] font-mono text-[#c9d1d9]">Console</span>
              {consoleRunning && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              {consoleRunning ? (
                <button onClick={stopConsole} className="px-3 py-1 rounded-lg text-[11px] font-mono text-red-400 border border-red-800/50 hover:bg-[#21262d]">■ Stop</button>
              ) : (
                <button onClick={startConsole} className="px-3 py-1 rounded-lg text-[11px] font-mono text-emerald-400 border border-emerald-800/50 hover:bg-[#21262d]">▶ Restart</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-5 space-y-0.5">
              {consoleLines.length === 0 && (
                <div className="text-[#6e7681] italic">Starting…</div>
              )}
              {consoleLines.map((line, i) => {
                const color = line.type === "stderr" || line.type === "error"
                  ? "text-red-400" : line.type === "exit" ? "text-yellow-400"
                  : line.type === "info" ? "text-[#6e7681]" : "text-[#c9d1d9]";
                return (
                  <div key={i} className={`whitespace-pre-wrap break-all ${color}`}>
                    {line.type === "stderr" && <span className="text-red-600 mr-1 select-none">!</span>}
                    {line.text}
                  </div>
                );
              })}
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}

        {/* File tree side panel */}
        {fileCount > 0 && !showPreviewPanel && (
          <div className="hidden lg:flex flex-col w-52 border-l border-white/[0.06] overflow-hidden shrink-0 bg-white/[0.02]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
              <span className="text-xs font-medium text-white/40">Files</span>
              <button onClick={() => setShowFileModal(true)} className="text-xs text-white/28 hover:text-white/60 transition-colors">Open</button>
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

      {showBoboDB && (
        <BoboDatabaseModal
          projectId={projectId}
          onAsk={(q) => { setInput(q); setShowBoboDB(false); }}
          onClose={() => setShowBoboDB(false)}
        />
      )}


      {/* ── GitHub Modal (Connect + Push) ── */}
      {showGithubModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (githubConnectStatus !== "connecting" && githubPushStatus !== "pushing") setShowGithubModal(false); }} />
          <div className="relative bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            {/* drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", githubStatus.connected ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted")}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className={githubStatus.connected ? "text-emerald-600" : "text-foreground/70"}>
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-none">GitHub</h3>
                  {githubStatus.connected ? (
                    <p className="text-[11px] text-emerald-600 mt-0.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      متصل بـ {githubStatus.repo}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-0.5">غير متصل</p>
                  )}
                </div>
              </div>
              <button onClick={() => setShowGithubModal(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="p-5">
              {/* ── Not connected: Connect form ── */}
              {!githubStatus.connected && githubConnectStatus !== "done" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      توكن GitHub
                      <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline font-normal">← أنشئ توكن</a>
                    </label>
                    <input
                      type="password"
                      value={githubConnectToken}
                      onChange={(e) => setGithubConnectToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      autoComplete="off"
                      className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground/60 mt-1">يتطلب صلاحية <code className="text-[10px] bg-muted px-1 rounded">repo</code> — يُحفظ بشكل آمن في المشروع</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">اسم الريبو</label>
                    <input
                      type="text"
                      value={githubConnectRepo}
                      onChange={(e) => setGithubConnectRepo(e.target.value)}
                      placeholder="username/my-project"
                      className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                      onKeyDown={(e) => e.key === "Enter" && connectToGitHub()}
                    />
                    <p className="text-[11px] text-muted-foreground/60 mt-1">سيُنشئ الريبو تلقائياً إذا لم يكن موجوداً</p>
                  </div>
                  {githubConnectError && (
                    <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-xl px-3.5 py-2.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-destructive shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p className="text-xs text-destructive">{githubConnectError}</p>
                    </div>
                  )}
                  <button
                    onClick={connectToGitHub}
                    disabled={githubConnectStatus === "connecting"}
                    className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {githubConnectStatus === "connecting" ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M21 12a9 9 0 01-9-9"/>
                        </svg>
                        جاري التحقق…
                      </>
                    ) : "ربط بـ GitHub"}
                  </button>
                </div>
              )}

              {/* ── Just connected success ── */}
              {githubConnectStatus === "done" && githubStatus.connected && githubPushStatus === "idle" && (
                <div className="flex flex-col items-center gap-3 py-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">تم الاتصال بنجاح!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <a href={`https://github.com/${githubStatus.repo}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        github.com/{githubStatus.repo}
                      </a>
                    </p>
                  </div>
                  <button
                    onClick={() => { setGithubConnectStatus("idle"); setGithubPushStatus("idle"); }}
                    className="px-5 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all"
                  >
                    رفع الكود الآن ↑
                  </button>
                </div>
              )}

              {/* ── Connected: Push panel ── */}
              {githubStatus.connected && githubConnectStatus !== "done" && (
                <div className="space-y-4">
                  {/* Repo info row */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-600">
                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <a href={`https://github.com/${githubStatus.repo}`} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium hover:text-primary transition-colors truncate block">{githubStatus.repo}</a>
                      <p className="text-[11px] text-muted-foreground">
                        {githubStatus.lastPushedAt
                          ? `آخر رفع: ${new Date(githubStatus.lastPushedAt).toLocaleDateString("ar-SA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                          : "لم يتم الرفع بعد"}
                      </p>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  </div>

                  {/* Push success result */}
                  {githubPushStatus === "done" && githubPushResult?.url && (
                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/40 rounded-xl px-3.5 py-2.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 shrink-0">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">تم الرفع! <a href={githubPushResult.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">افتح الريبو</a></p>
                    </div>
                  )}

                  {/* Commit message */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">رسالة الـ commit <span className="font-normal">(اختياري)</span></label>
                    <input
                      type="text"
                      value={githubCommitMsg}
                      onChange={(e) => setGithubCommitMsg(e.target.value)}
                      placeholder="تحديث من AI Builder"
                      className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                      onKeyDown={(e) => e.key === "Enter" && pushToGitHub()}
                    />
                  </div>

                  {/* Push error */}
                  {githubPushStatus === "error" && githubPushResult?.error && (
                    <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-xl px-3.5 py-2.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-destructive shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p className="text-xs text-destructive">{githubPushResult.error}</p>
                    </div>
                  )}

                  {/* Push button */}
                  <button
                    onClick={() => pushToGitHub()}
                    disabled={githubPushStatus === "pushing"}
                    className="w-full py-2.5 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {githubPushStatus === "pushing" ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M21 12a9 9 0 01-9-9"/>
                        </svg>
                        جاري الرفع…
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        رفع الكود إلى GitHub
                      </>
                    )}
                  </button>

                  {/* Auto-push toggle */}
                  <div className="flex items-center justify-between py-2 px-3 rounded-xl border border-border/40 bg-muted/20">
                    <div>
                      <p className="text-[12.5px] font-medium">رفع تلقائي</p>
                      <p className="text-[11px] text-muted-foreground">ارفع الكود تلقائياً بعد كل مهمة للوكيل</p>
                    </div>
                    <button
                      onClick={() => toggleAutoPush(!githubStatus.autoPush)}
                      className={cn(
                        "relative w-10 h-5.5 rounded-full transition-colors duration-200 shrink-0",
                        githubStatus.autoPush ? "bg-emerald-500" : "bg-muted-foreground/30"
                      )}
                      style={{ width: 40, height: 22 }}
                    >
                      <span className={cn(
                        "absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                        githubStatus.autoPush ? "translate-x-[19px]" : "translate-x-0.5"
                      )} style={{ width: 18, height: 18 }} />
                    </button>
                  </div>

                  {/* Disconnect */}
                  <button
                    onClick={disconnectGitHub}
                    className="w-full text-[11.5px] text-muted-foreground/50 hover:text-destructive/70 transition-colors py-1 text-center"
                  >
                    إلغاء الاتصال بـ GitHub
                  </button>
                </div>
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
    <div className="flex items-start gap-3 px-4 py-3 bg-white/[0.03] border-b border-white/[0.07] shrink-0 animate-in slide-in-from-top-2">
      <span className="text-base shrink-0">🔑</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/75">{request.key} required</p>
        <p className="text-xs text-white/38 mb-2">{request.description}</p>
        {!submitted ? (
          <div className="flex gap-2">
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={`Enter ${request.key}...`}
              className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] outline-none focus:border-white/20 text-white/80 placeholder:text-white/18"
            />
            <button
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#E5E5E6] text-[#08090A] hover:bg-white transition-colors disabled:opacity-40"
            >
              Save
            </button>
            <button onClick={onDismiss} className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.1] text-white/40 hover:bg-white/[0.05] transition-colors">
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
const QUICK_ACTIONS = [
  {
    label: "Build an API",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    prompt: "Build a REST API with Express + TypeScript",
  },
  {
    label: "Web app",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
    ),
    prompt: "Create a full-stack web app with React + SQLite",
  },
  {
    label: "Build a bot",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>
      </svg>
    ),
    prompt: "Build a Telegram bot with command handling",
  },
  {
    label: "CLI tool",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    prompt: "Create a CLI tool with commander.js",
  },
  {
    label: "Explain code",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    prompt: "Explain how JWT authentication works",
  },
  {
    label: "AI agent",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>
    ),
    prompt: "Build an AI agent with tool calling",
  },
];

function EmptyState({ projectName, userName, onExample }: { projectName?: string; userName?: string; onExample: (v: string) => void }) {
  const firstName = userName?.split(" ")[0];

  // Time-based greeting
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const greeting = firstName ? `${timeGreeting}, ${firstName}.` : `${timeGreeting}.`;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60dvh] text-center px-4 select-none">
      {/* Big greeting — Claude.ai style */}
      <div className="mb-10">
        <h2 className="text-[clamp(1.8rem,5vw,3rem)] font-black text-white tracking-tight leading-tight mb-2">
          {greeting}
        </h2>
        <p className="text-[clamp(1.1rem,3vw,1.7rem)] font-semibold tracking-tight text-white/40">
          {projectName ? `Let's build "${projectName}"` : "What are we building today?"}
        </p>
      </div>

      {/* Quick action chips — Claude.ai category style */}
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.label}
            onClick={() => onExample(qa.prompt)}
            className="flex items-center gap-1.5 text-[12px] font-medium px-4 py-2.5 rounded-full border border-white/[0.1] bg-white/[0.04] text-white/50 hover:text-white/85 hover:bg-white/[0.08] hover:border-white/[0.18] transition-all duration-200 active:scale-95"
          >
            <span className="text-white/30">{qa.icon}</span>
            {qa.label}
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
                const cfg = TOOL_CONFIG[tool.name] ?? { label: tool.name, icon: _TI_DEFAULT, color: "slate" };
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
  const palette = ["bg-blue-500","bg-rose-500","bg-emerald-500","bg-violet-500","bg-white/40","bg-cyan-500","bg-pink-500","bg-white/30"];
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
  const cfg = TOOL_CONFIG[tool.name] ?? { label: tool.name, icon: _TI_DEFAULT, color: "slate" };
  const detail = tool.args.url || tool.args.file || tool.args.path || "";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background w-full max-w-lg max-h-[70dvh] rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 flex items-center justify-center text-muted-foreground">{cfg.icon}</span>
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
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
function GeneratedImageCard({ image }: { image: { url: string; prompt: string; filename: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-3 border border-violet-200 dark:border-violet-800/60 rounded-2xl overflow-hidden bg-violet-50/30 dark:bg-violet-900/10">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-500/10 border-b border-violet-200 dark:border-violet-800/60">
        <span className="text-base">🎨</span>
        <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">Generated Image</span>
        <code className="ml-auto text-[10px] text-violet-600/70 dark:text-violet-400/60 font-mono truncate max-w-[180px]">{image.filename}</code>
      </div>
      <div className="p-3">
        <img
          src={image.url}
          alt={image.prompt}
          className={`w-full rounded-xl border border-violet-200 dark:border-violet-800/60 object-cover cursor-zoom-in transition-all ${expanded ? "max-h-none" : "max-h-64"}`}
          onClick={() => setExpanded((e) => !e)}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{image.prompt}</p>
        <div className="mt-2 flex items-center gap-2">
          <a
            href={image.url}
            download={image.filename.split("/").pop()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Download
          </a>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted transition-colors text-muted-foreground"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  msg, tools, notifies, onOpenCode, onCopy, copiedId, expoSnack, images,
}: {
  msg: StreamMessage;
  tools: ToolEvent[];
  notifies: string[];
  onOpenCode: (path: string, content: string) => void;
  onCopy?: (content: string, id: string) => void;
  copiedId?: string | null;
  expoSnack?: { url: string; qrUrl: string; snackId: string };
  images?: Array<{ url: string; prompt: string; filename: string }>;
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
              {msg.attachments.map((a, i) => {
                const isImg = a.type.startsWith("image/");
                const isZip = a.name.endsWith(".zip") || a.name.endsWith(".tar.gz") || a.type?.includes("zip");
                const ext = a.name.split(".").pop()?.toUpperCase() ?? "FILE";
                if (isImg && a.url) {
                  return (
                    <div key={i} className="rounded-2xl overflow-hidden border border-border/60 shadow-sm">
                      <img
                        src={a.url}
                        alt={a.name}
                        className="max-w-[260px] max-h-[200px] object-cover block"
                        title={a.name}
                      />
                    </div>
                  );
                }
                return (
                  <div key={i} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border text-xs ${isZip ? "bg-white/[0.04] border-white/[0.08]" : "bg-white/[0.03] border-white/[0.07]"}`}>
                    <span className="shrink-0 text-white/35">
                      {isZip ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/45"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      )}
                    </span>
                    <div>
                      <p className="font-medium truncate max-w-[160px]">{a.name}</p>
                      <p className="text-muted-foreground">{isZip ? "Archive" : ext}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="relative">
            <div className="bg-white/[0.07] border border-white/[0.08] px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
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
    <div className="space-y-2">

      {/* ── Notify messages — plain text outside the select ── */}
      {notifies.length > 0 && (
        <div className="space-y-1">
          {notifies.map((text, i) => (
            <p key={`n-${i}`} className="text-sm text-foreground/80 leading-relaxed">{text}</p>
          ))}
        </div>
      )}

      {/* ── Active running indicator ── */}
      {runningTool && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground/60 select-none">
          <div className="flex gap-[3px] shrink-0">
            <span className="w-[4px] h-[4px] rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-[4px] h-[4px] rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "100ms" }} />
            <span className="w-[4px] h-[4px] rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "200ms" }} />
          </div>
          <span className="truncate max-w-[320px] italic">{runningLabel}</span>
        </div>
      )}

      {/* ── Steps collapsible — dynamic label + clean design ── */}
      {!runningTool && visibleTools.length > 0 && (
        <div>
          {/* Trigger — no background, ghost style */}
          <button
            onClick={() => setStepsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground/55 hover:text-foreground/65 transition-colors duration-150 select-none group/stbtn"
          >
            <svg
              width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
              className={cn("transition-transform duration-200 shrink-0", stepsOpen ? "rotate-90" : "")}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span className="font-medium tracking-tight">{buildStepsLabel(visibleTools)}</span>
          </button>

          {/* Expanded steps */}
          {stepsOpen && (
            <div className="mt-2 animate-in fade-in-0 slide-in-from-top-1 duration-150">
              <div className="space-y-px">
                {visibleTools.map((tool, i) => {
                  const cfg = TOOL_CONFIG[tool.name] ?? { label: tool.name, icon: _TI_DEFAULT, color: "slate" };
                  const op = FILE_TOOL_NAMES.includes(tool.name) ? getFileOp(tool) : null;
                  const isClickable = tool.status === "done" && !!tool.result;
                  const detail = op
                    ? shortFilename(op.file)
                    : tool.args.command
                    ? String(tool.args.command).slice(0, 48)
                    : tool.args.query
                    ? String(tool.args.query).slice(0, 48)
                    : tool.args.url
                    ? String(tool.args.url).slice(0, 48)
                    : null;

                  return (
                    <button
                      key={`t-${i}`}
                      onClick={() => isClickable ? setSelectedTool(tool) : undefined}
                      className={cn(
                        "flex items-center gap-2.5 w-full text-left rounded-lg px-2.5 py-1.5 transition-colors duration-100",
                        isClickable
                          ? "hover:bg-muted/50 cursor-pointer"
                          : "cursor-default"
                      )}
                    >
                      {/* Icon pill */}
                      <span className={cn(
                        "shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[11px] leading-none",
                        STEP_ICON_BG[cfg.color] ?? "bg-slate-100 dark:bg-slate-800/60"
                      )}>
                        {cfg.icon}
                      </span>

                      {/* Label + detail */}
                      <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                        <span className="text-[12px] font-medium text-foreground/75 shrink-0 leading-none">
                          {cfg.label}
                        </span>
                        {detail && (
                          <span className="text-[10.5px] text-muted-foreground/50 font-mono truncate leading-none">
                            {detail}
                          </span>
                        )}
                        {/* line count for file ops */}
                        {op && (op.added > 0 || op.removed > 0) && (
                          <span className="shrink-0 text-[9.5px] font-mono ml-auto flex items-center gap-1">
                            {op.added > 0 && <span className="text-emerald-500">+{op.added}</span>}
                            {op.removed > 0 && <span className="text-rose-400">-{op.removed}</span>}
                          </span>
                        )}
                      </div>

                      {/* Chevron for clickable */}
                      {isClickable && (
                        <svg className="w-2.5 h-2.5 text-muted-foreground/25 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              {visibleTools.length > 5 && (
                <button
                  onClick={() => setShowSummary(true)}
                  className="mt-1 w-full text-[11px] text-muted-foreground/40 hover:text-primary/70 py-1 text-center transition-colors"
                >
                  كل الخطوات ({visibleTools.length}) ←
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
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-900/20 border border-emerald-700/40">
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

      {/* ── Generated images ── */}
      {images && images.length > 0 && (
        <div className="space-y-2">
          {images.map((img, i) => <GeneratedImageCard key={i} image={img} />)}
        </div>
      )}

      {/* ── Skeleton activity while tool runs and no content yet ── */}
      {msg.streaming && !msg.content && runningTool && (
        <ToolActivitySkeleton toolName={runningTool.name} args={runningTool.args} />
      )}

      {/* ── Thinking animation — shown while streaming with no content yet and no running tool ── */}
      {msg.streaming && !msg.content && !runningTool && !hasSteps && (
        <div className="flex items-center gap-2.5 py-1">
          <div className="flex gap-[3px]">
            <span className="w-[6px] h-[6px] rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-[6px] h-[6px] rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "120ms" }} />
            <span className="w-[6px] h-[6px] rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "240ms" }} />
          </div>
          <span className="text-sm text-muted-foreground/50 italic select-none animate-pulse">Thinking...</span>
        </div>
      )}

      {/* ── Message content ── */}
      {msg.content && (
        <div className="text-sm leading-relaxed text-foreground group/msg relative">
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
      <div className="relative bg-[#0a0a0a] border border-white/[0.08] w-full sm:max-w-2xl max-h-[80dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-mono font-medium text-white truncate">{file.path.split("/").pop()}</span>
            <span className="text-xs text-white/40 bg-white/[0.06] px-2 py-0.5 rounded">{getLang(file.path)}</span>
            <span className="text-xs text-white/40">{lineCount} lines</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigator.clipboard.writeText(file.content)}
              className="text-xs px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/70 transition-colors">Copy</button>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors text-white/40">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-4">
          <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-white/70">
            <code>{file.content}</code>
          </pre>
        </div>
        <div className="px-4 py-2 border-t border-white/[0.06] bg-white/[0.02] shrink-0">
          <p className="text-xs text-white/30 font-mono">{file.path}</p>
        </div>
      </div>
    </div>
  );
}

// ── Bobo Database Modal ───────────────────────────────────────────────
function BoboDatabaseModal({
  projectId,
  onAsk,
  onClose,
}: {
  projectId: string;
  onAsk: (q: string) => void;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<{
    keyCount: number; userCount: number; usedKB: number; maxMB: number;
    items: Array<{ key: string; type: string; size: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "data">("overview");

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`/api/projects/${projectId}/bobo/stats`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  const usedPct = stats ? Math.min(100, Math.round((stats.usedKB / 1024 / stats.maxMB) * 100)) : 0;

  function typeColor(type: string) {
    if (type === "object") return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    if (type === "array") return "text-violet-400 bg-violet-500/10 border-violet-500/20";
    if (type === "string") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    if (type === "number") return "text-white/55 bg-white/[0.06] border-white/[0.1]";
    return "text-white/30 bg-white/5 border-white/10";
  }

  function typeDot(type: string) {
    if (type === "object") return "bg-blue-400";
    if (type === "array") return "bg-violet-400";
    if (type === "string") return "bg-emerald-400";
    if (type === "number") return "bg-white/40";
    return "bg-white/30";
  }

  const selectedItem = stats?.items.find((i) => i.key === selectedKey) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111213] border border-white/[0.08] w-full max-w-2xl rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in-0 duration-200" style={{ maxHeight: "min(680px, 90dvh)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white/80">Databobo</p>
            <p className="text-[10.5px] text-white/30">Key-value storage for your project</p>
          </div>
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
            {(["overview", "data"] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={cn("px-3 py-1 rounded-md text-[11.5px] font-medium transition-all capitalize",
                  activeTab === t ? "bg-white/[0.08] text-white/75" : "text-white/30 hover:text-white/55")}>
                {t === "overview" ? "Overview" : "Data"}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors ml-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center animate-pulse">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </div>
              <p className="text-[12px] text-white/25">Loading storage…</p>
            </div>
          </div>
        ) : !stats ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <p className="text-[13px] text-white/30">Failed to load storage data</p>
          </div>
        ) : activeTab === "overview" ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total keys", value: stats.keyCount, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                { label: "Unique users", value: stats.userCount, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-8 8-8s8 4 8 8"/></svg>, color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
                { label: "Storage used", value: `${stats.usedKB} KB`, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
              ].map((s) => (
                <div key={s.label} className={cn("rounded-xl p-4 border", s.color)}>
                  <div className="mb-2 opacity-70">{s.icon}</div>
                  <div className="text-[18px] font-bold text-white/80">{s.value}</div>
                  <div className="text-[10.5px] text-white/30 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Storage bar */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-white/40 font-medium">Storage quota</span>
                <span className="text-white/55 font-semibold">{stats.usedKB} KB <span className="text-white/25 font-normal">/ {stats.maxMB} MB</span></span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", usedPct >= 80 ? "bg-red-400/70" : "bg-white/30")}
                  style={{ width: `${usedPct}%` }} />
              </div>
              <p className="text-[10.5px] text-white/20">{usedPct}% used · {stats.maxMB * 1024 - stats.usedKB} KB free</p>
            </div>

            {/* Quick actions */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-3">Quick actions</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { onAsk("Set up Bobo Data integration — show me how to store and retrieve data using the Bobo Data API"); onClose(); }}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all text-left group">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-400"><path d="M12 5v14M5 12h14"/></svg>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-white/65 group-hover:text-white/80 transition-colors">Setup Bobo Data</p>
                    <p className="text-[10.5px] text-white/25">Integrate into project</p>
                  </div>
                </button>
                <button onClick={() => setActiveTab("data")}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all text-left group">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-white/65 group-hover:text-white/80 transition-colors">Browse Data</p>
                    <p className="text-[10.5px] text-white/25">{stats.keyCount} keys stored</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Data tab — two-panel layout */
          <div className="flex-1 flex min-h-0">
            {/* Left: key tree */}
            <div className="w-44 shrink-0 border-r border-white/[0.06] flex flex-col">
              <div className="px-3 py-2.5 border-b border-white/[0.05]">
                <p className="text-[10.5px] font-semibold text-white/25 uppercase tracking-wider">Keys ({stats.items.length})</p>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {stats.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-center px-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/15 mb-2">
                      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                    </svg>
                    <p className="text-[11px] text-white/20">No keys yet</p>
                  </div>
                ) : (
                  stats.items.map((item) => (
                    <button key={item.key} onClick={() => setSelectedKey(item.key)}
                      className={cn("w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                        selectedKey === item.key ? "bg-blue-500/10 text-blue-300" : "hover:bg-white/[0.04] text-white/50")}>
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", typeDot(item.type))} />
                      <span className="text-[11.5px] font-mono truncate flex-1">{item.key}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right: detail panel */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedItem ? (
                <>
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", typeDot(selectedItem.type))} />
                      <p className="text-[12.5px] font-mono font-medium text-white/70 truncate">{selectedItem.key}</p>
                    </div>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0", typeColor(selectedItem.type))}>
                      {selectedItem.type}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                        <p className="text-[10.5px] text-white/25 mb-1">Type</p>
                        <p className="text-[13px] font-medium text-white/60 capitalize">{selectedItem.type}</p>
                      </div>
                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                        <p className="text-[10.5px] text-white/25 mb-1">Size</p>
                        <p className="text-[13px] font-medium text-white/60">{selectedItem.size} chars</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { onAsk(`Show me the value stored in Bobo Data for key "${selectedItem.key}"`); onClose(); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/15 transition-colors text-[12.5px] font-medium"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Ask agent to inspect this key
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
                      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                    </svg>
                  </div>
                  {stats.items.length === 0 ? (
                    <>
                      <p className="text-[13px] font-medium text-white/40">No data stored</p>
                      <p className="text-[12px] text-white/20 mt-1">Ask the agent to set up Bobo Data</p>
                      <button onClick={() => { onAsk("Set up Bobo Data integration in my project"); onClose(); }}
                        className="mt-4 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/15 transition-colors text-[12px] font-medium">
                        Setup Bobo Data →
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] font-medium text-white/40">Select a key</p>
                      <p className="text-[12px] text-white/20 mt-1">Choose a key from the list to inspect</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
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
        "relative bg-[#0a0a0a] border border-white/[0.08] w-full sm:max-w-lg sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden transition-all duration-280 ease-out max-h-[90dvh]",
        visible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-full sm:translate-y-0 opacity-0 sm:scale-95"
      )}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/45">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            <h2 className="font-semibold text-[15px] text-white">Skills</h2>
          </div>
          <button onClick={close} className="w-7 h-7 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-white/40 transition-colors">
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
              tab === "all" ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/70"
            )}
          >
            All Skills ({allSkills.length})
          </button>
          <button
            onClick={() => setTab("import")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === "import" ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/70"
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
              <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wide px-5 mb-2">Built-in</p>
              {BUILT_IN_SKILLS.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => onSelect(skill)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/[0.04] transition-colors text-left"
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

