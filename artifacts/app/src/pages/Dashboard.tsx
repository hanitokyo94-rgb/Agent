import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useListProjects,
  useCreateProject,
  useGenerateProjectName,
  getGetMeQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { Sidebar } from "@/components/Sidebar";
import { formatRelativeTime, cn } from "@/lib/utils";

const EXAMPLES = [
  "Build a task manager with login and data storage",
  "Create a Discord bot with TypeScript",
  "Build a REST API with Express + auth",
  "Make a Telegram bot for reminders",
  "Build a real-time chat with WebSockets",
  "Create a web scraper for e-commerce prices",
];

interface RepoInfo {
  owner: string; repo: string; fullName: string; description: string;
  stars: number; language: string; defaultBranch: string; isPrivate: boolean; topics: string[];
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

type ProjectTab = "all" | "recent" | "github";

export function Dashboard() {
  const [description, setDescription] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [generatedName, setGeneratedName] = useState<string | null>(null);
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [mode, setMode] = useState<"new" | "github">("new");
  const [githubUrl, setGithubUrl] = useState("");
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [isFetchingRepo, setIsFetchingRepo] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [projectTab, setProjectTab] = useState<ProjectTab>("all");
  const [inputFocused, setInputFocused] = useState(false);

  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const githubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: projects = [] } = useListProjects({ query: { queryKey: getListProjectsQueryKey() } });
  const createProject = useCreateProject();
  const generateName = useGenerateProjectName();

  useEffect(() => {
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    if (description.trim().length < 10) { setGeneratedName(null); return; }
    setIsGeneratingName(true);
    nameTimerRef.current = setTimeout(async () => {
      try {
        const result = await generateName.mutateAsync({ data: { description: description.trim() } });
        setGeneratedName((result as any).name ?? null);
      } catch { setGeneratedName(null); }
      finally { setIsGeneratingName(false); }
    }, 800);
    return () => { if (nameTimerRef.current) clearTimeout(nameTimerRef.current); };
  }, [description]);

  useEffect(() => {
    if (githubTimerRef.current) clearTimeout(githubTimerRef.current);
    setRepoInfo(null); setRepoError(null);
    const trimmed = githubUrl.trim();
    if (!trimmed || trimmed.length < 8) return;
    setIsFetchingRepo(true);
    githubTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/github/info?url=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch repo");
        setRepoInfo(data); setRepoError(null);
      } catch (err: any) {
        setRepoError(err.message ?? "Could not fetch repo"); setRepoInfo(null);
      } finally { setIsFetchingRepo(false); }
    }, 700);
    return () => { if (githubTimerRef.current) clearTimeout(githubTimerRef.current); };
  }, [githubUrl]);

  async function handleSubmit() {
    const desc = description.trim();
    if (!desc) return;
    setDescription(""); setGeneratedName(null);
    const projectRes = await createProject.mutateAsync({ data: { description: desc } });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    setLocation(`/chat/${projectRes.id}?desc=${encodeURIComponent(desc)}`);
  }

  async function handleGithubImport() {
    if (!repoInfo || isImporting) return;
    setIsImporting(true); setImportProgress("Fetching files from GitHub...");
    try {
      const res = await fetch(`/api/projects/github-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
        body: JSON.stringify({ githubUrl: githubUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportProgress(`Imported ${data.fileCount} files!`);
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setTimeout(() => setLocation(`/chat/${data.projectId}`), 600);
    } catch (err: any) {
      setRepoError(err.message ?? "Import failed"); setIsImporting(false); setImportProgress(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDescription(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + "px";
    }
  }

  const isPending = createProject.isPending;
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const allProjects = projects as any[];
  const now = Date.now();
  const filteredProjects = projectTab === "recent"
    ? allProjects.filter((p) => now - new Date(p.updatedAt).getTime() < 7 * 86400000)
    : projectTab === "github"
    ? allProjects.filter((p) => p.githubRepo)
    : allProjects;

  const stats = [
    { label: "Total Projects", value: allProjects.length, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
    { label: "This Week", value: allProjects.filter((p) => now - new Date(p.updatedAt).getTime() < 7 * 86400000).length, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { label: "GitHub Linked", value: allProjects.filter((p) => p.githubRepo).length, icon: <GitHubIcon className="w-4 h-4" /> },
    { label: "Credits Left", value: user ? Math.max(0, user.credits - user.creditsUsed) : "—", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> },
  ];

  return (
    <div className="flex h-[100dvh] bg-[#0f1011] overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={null} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 h-[52px] border-b border-white/[0.05] shrink-0 bg-[#111213]/80 backdrop-blur-sm">
          {/* Mobile hamburger */}
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/50 md:hidden">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {/* Breadcrumb */}
          <div className="hidden md:flex items-center gap-1.5 text-[12.5px]">
            <span className="text-white/30">AI Builder</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/15">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span className="text-white/60 font-medium">Dashboard</span>
          </div>

          <span className="font-semibold text-sm text-white/70 md:hidden">Dashboard</span>

          {/* Right */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocation("/settings")}
              className="w-7 h-7 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center text-[11px] font-bold hover:bg-amber-500/25 transition-colors"
            >
              {user?.name?.charAt(0).toUpperCase() ?? "U"}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 pt-10 pb-16">

            {/* Page title */}
            <div className="mb-8">
              <h1 className="text-[22px] font-bold text-white/90 tracking-tight leading-tight">
                {firstName ? `Hello, ${firstName}` : "Dashboard"}
              </h1>
              <p className="text-[13px] text-white/35 mt-1">What are we building today?</p>
            </div>

            {/* Stats row */}
            {allProjects.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {stats.map((s) => (
                  <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3.5 hover:bg-white/[0.05] transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/25">{s.icon}</span>
                    </div>
                    <p className="text-[22px] font-bold text-white/85 leading-none">{s.value}</p>
                    <p className="text-[11px] text-white/30 mt-1.5 font-medium">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Create card */}
            <div className={cn(
              "bg-[#111213] border rounded-2xl overflow-hidden mb-8 transition-all duration-200",
              inputFocused ? "border-amber-500/30 shadow-[0_0_0_3px_rgba(245,158,11,0.06)]" : "border-white/[0.08] hover:border-white/[0.12]"
            )}>
              {/* Mode toggle */}
              <div className="flex border-b border-white/[0.06]">
                <button
                  onClick={() => setMode("new")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 text-[12.5px] font-medium transition-colors",
                    mode === "new" ? "text-white/80 bg-white/[0.04]" : "text-white/30 hover:text-white/55 hover:bg-white/[0.02]"
                  )}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  New project
                </button>
                <div className="w-px bg-white/[0.06]" />
                <button
                  onClick={() => setMode("github")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 text-[12.5px] font-medium transition-colors",
                    mode === "github" ? "text-white/80 bg-white/[0.04]" : "text-white/30 hover:text-white/55 hover:bg-white/[0.02]"
                  )}
                >
                  <GitHubIcon className="w-3.5 h-3.5" />
                  Import GitHub
                </button>
              </div>

              {mode === "new" ? (
                <>
                  <textarea
                    ref={textareaRef}
                    value={description}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    placeholder="Describe what you want to build..."
                    rows={3}
                    className="w-full px-5 pt-4 pb-2 bg-transparent text-[14.5px] text-white/80 resize-none outline-none placeholder:text-white/20 leading-relaxed"
                  />

                  {/* Example chips */}
                  {!description && (
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      {EXAMPLES.slice(0, 3).map((ex) => (
                        <button
                          key={ex}
                          onClick={() => {
                            setDescription(ex);
                            if (textareaRef.current) textareaRef.current.focus();
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/35 hover:text-white/60 hover:bg-white/[0.07] hover:border-white/[0.12] transition-all"
                        >
                          {ex.length > 36 ? ex.slice(0, 36) + "…" : ex}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Auto name badge */}
                  {(generatedName || isGeneratingName) && description.trim().length >= 10 && (
                    <div className="px-5 pb-2.5 flex items-center gap-2">
                      <span className="text-[11px] text-white/25">Name:</span>
                      {isGeneratingName ? (
                        <div className="flex gap-1">
                          {[0, 150, 300].map((d) => (
                            <span key={d} className="w-1 h-1 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11.5px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">{generatedName}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                    <span className="text-[11px] text-white/20">⌘ Enter to create</span>
                    <button
                      onClick={handleSubmit}
                      disabled={!description.trim() || isPending}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl text-[12.5px] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isPending ? (
                        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      )}
                      {isPending ? "Creating…" : "Build it"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-5 py-4">
                    <GitHubIcon className="w-4 h-4 text-white/30 shrink-0" />
                    <input
                      type="text"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 bg-transparent text-[14.5px] text-white/80 outline-none placeholder:text-white/20"
                      disabled={isImporting}
                    />
                    {isFetchingRepo && (
                      <svg className="animate-spin w-4 h-4 text-white/30 shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    )}
                  </div>

                  {repoInfo && !repoError && (
                    <div className="mx-4 mb-3 p-3.5 bg-white/[0.03] rounded-xl border border-white/[0.08]">
                      <div className="flex items-start gap-2 mb-1.5">
                        <p className="font-semibold text-[13px] text-white/75 truncate">{repoInfo.fullName}</p>
                        {repoInfo.isPrivate && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium shrink-0 border border-amber-500/20">Private</span>}
                      </div>
                      {repoInfo.description && <p className="text-[11.5px] text-white/35 mb-2 line-clamp-2">{repoInfo.description}</p>}
                      <div className="flex items-center gap-3 text-[11px] text-white/30">
                        {repoInfo.language && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />{repoInfo.language}</span>}
                        <span>⭐ {repoInfo.stars.toLocaleString()}</span>
                        <span className="font-mono">{repoInfo.defaultBranch}</span>
                      </div>
                    </div>
                  )}
                  {repoError && <div className="mx-4 mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[11.5px] text-red-400">{repoError}</div>}
                  {importProgress && (
                    <div className="mx-4 mb-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      <p className="text-[11.5px] text-amber-400">{importProgress}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                    <span className="text-[11px] text-white/20">Public repos only</span>
                    <button
                      onClick={handleGithubImport}
                      disabled={!repoInfo || isImporting || repoInfo?.isPrivate}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl text-[12.5px] font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isImporting ? <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <GitHubIcon className="w-3.5 h-3.5" />}
                      {isImporting ? "Importing…" : "Import repo"}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Projects section */}
            {allProjects.length > 0 && (
              <div>
                {/* Section header with tabs */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[13px] font-semibold text-white/60">Projects</h2>
                  <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5">
                    {([["all", "All"], ["recent", "Recent"], ["github", "GitHub"]] as const).map(([t, label]) => (
                      <button
                        key={t}
                        onClick={() => setProjectTab(t)}
                        className={cn(
                          "px-3 py-1 rounded-md text-[11.5px] font-medium transition-all",
                          projectTab === t ? "bg-white/8 text-white/70" : "text-white/30 hover:text-white/50"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Project list */}
                <div className="space-y-1.5">
                  {filteredProjects.length === 0 ? (
                    <div className="text-center py-10 text-white/20 text-[13px]">No projects in this view</div>
                  ) : (
                    filteredProjects.slice(0, 12).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setLocation(`/chat/${p.id}`)}
                        className="group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1] cursor-pointer transition-all text-left"
                      >
                        {/* Icon */}
                        <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.07] flex items-center justify-center shrink-0 group-hover:bg-amber-500/10 group-hover:border-amber-500/20 transition-all">
                          {p.githubRepo ? (
                            <GitHubIcon className="w-3.5 h-3.5 text-white/30 group-hover:text-amber-400 transition-colors" />
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/25 group-hover:text-amber-400 transition-colors">
                              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                            </svg>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[13px] text-white/75 truncate group-hover:text-white/90 transition-colors">{p.name}</p>
                          <p className="text-[11.5px] text-white/30 truncate mt-0.5">{p.description ?? "No description"}</p>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] text-white/20 hidden sm:block">{formatRelativeTime(p.updatedAt)}</span>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className="text-white/15 opacity-0 group-hover:opacity-100 transition-opacity">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Empty state */}
            {allProjects.length === 0 && (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mx-auto mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-white/40">No projects yet</p>
                <p className="text-[12px] text-white/20 mt-1.5">Describe what you want to build above to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
