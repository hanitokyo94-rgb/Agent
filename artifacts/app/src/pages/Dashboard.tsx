import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe, useListProjects, useCreateProject, useGenerateProjectName,
  getGetMeQueryKey, getListProjectsQueryKey,
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

/* 3D stat icons */
function StatIcon3D({ type }: { type: "code" | "calendar" | "github" | "credits" }) {
  const defs = {
    code: { grad: ["#f59e0b", "#f97316"], path: <><polyline points="16 18 22 12 16 6" stroke="url(#sg0)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><polyline points="8 6 2 12 8 18" stroke="url(#sg0)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></>, id: "sg0" },
    calendar: { grad: ["#a78bfa", "#7c3aed"], path: <><rect x="3" y="4" width="18" height="18" rx="2" stroke="url(#sg1)" strokeWidth="1.7"/><line x1="16" y1="2" x2="16" y2="6" stroke="url(#sg1)" strokeWidth="1.7" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="url(#sg1)" strokeWidth="1.7" strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="url(#sg1)" strokeWidth="1.7"/></>, id: "sg1" },
    github: { grad: ["#e2e8f0", "#94a3b8"], path: <></>, id: "sg2" },
    credits: { grad: ["#34d399", "#059669"], path: <><circle cx="12" cy="12" r="9" stroke="url(#sg3)" strokeWidth="1.7"/><path d="M12 6v6l4 2" stroke="url(#sg3)" strokeWidth="1.7" strokeLinecap="round"/></>, id: "sg3" },
  };
  const d = defs[type];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <defs><linearGradient id={d.id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={d.grad[0]}/><stop offset="1" stopColor={d.grad[1]}/></linearGradient></defs>
      {type === "github" ? (
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" fill="url(#sg2)"/>
      ) : d.path}
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
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }

  const isPending = createProject.isPending;
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const allProjects = projects as any[];
  const now = Date.now();
  const filteredProjects = projectTab === "recent"
    ? allProjects.filter((p) => now - new Date(p.updatedAt).getTime() < 7 * 86400000)
    : projectTab === "github" ? allProjects.filter((p) => p.githubRepo) : allProjects;

  const stats = [
    { label: "Projects", value: allProjects.length, type: "code" as const },
    { label: "This Week", value: allProjects.filter((p) => now - new Date(p.updatedAt).getTime() < 7 * 86400000).length, type: "calendar" as const },
    { label: "GitHub", value: allProjects.filter((p) => p.githubRepo).length, type: "github" as const },
    { label: "Credits Left", value: user ? Math.max(0, user.credits - user.creditsUsed) : "—", type: "credits" as const },
  ];

  return (
    <div className="flex h-[100dvh] bg-black overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-md" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={null} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 h-[52px] border-b border-white/[0.05] shrink-0 bg-black/80 backdrop-blur-xl">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors text-white/40 md:hidden">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="hidden md:flex items-center gap-1.5 text-[12px]">
            <span className="text-white/20">Bobo</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/12">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span className="text-white/50 font-semibold">Dashboard</span>
          </div>
          <span className="font-bold text-sm text-white/60 md:hidden">Dashboard</span>
          <button onClick={() => setLocation("/settings")}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black text-black hover:scale-105 transition-transform"
            style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
            {user?.name?.charAt(0).toUpperCase() ?? "U"}
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
          <div className="max-w-3xl mx-auto px-5 pt-10 pb-20">

            {/* Greeting */}
            <div className="mb-10">
              <h1 className="text-[28px] sm:text-[34px] font-black text-white tracking-tight leading-tight">
                {firstName ? `Hello, ${firstName}` : "Dashboard"}
              </h1>
              <p className="text-[14px] text-white/30 mt-1.5 font-medium">What are we building today?</p>
            </div>

            {/* Stats */}
            {allProjects.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {stats.map((s) => (
                  <div key={s.label} className="group bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all cursor-default">
                    <div className="mb-3"><StatIcon3D type={s.type} /></div>
                    <p className="text-[24px] font-black text-white leading-none">{s.value}</p>
                    <p className="text-[11px] text-white/25 mt-1.5 font-semibold uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Create card */}
            <div className={cn(
              "rounded-2xl overflow-hidden mb-8 transition-all duration-300",
              "border bg-[#0a0a0a]",
              inputFocused
                ? "border-amber-500/40 shadow-[0_0_0_3px_rgba(245,158,11,0.08),0_20px_60px_rgba(0,0,0,0.5)]"
                : "border-white/[0.08] hover:border-white/[0.13] shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
            )}>
              {/* Mode toggle */}
              <div className="flex border-b border-white/[0.06]">
                {[
                  { key: "new" as const, label: "New project", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> },
                  { key: "github" as const, label: "Import GitHub", icon: <GitHubIcon className="w-3.5 h-3.5" /> },
                ].map(({ key, label, icon }) => (
                  <button key={key} onClick={() => setMode(key)}
                    className={cn("flex-1 flex items-center justify-center gap-2 py-3 text-[12.5px] font-semibold transition-all",
                      mode === key ? "text-white/80 bg-white/[0.04]" : "text-white/25 hover:text-white/50 hover:bg-white/[0.02]",
                      key === "github" && "border-l border-white/[0.06]")}>
                    {icon}{label}
                  </button>
                ))}
              </div>

              {mode === "new" ? (
                <>
                  <textarea ref={textareaRef} value={description} onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
                    placeholder="Describe what you want to build..."
                    rows={3}
                    className="w-full px-5 pt-5 pb-3 bg-transparent text-[15px] text-white/85 resize-none outline-none placeholder:text-white/18 leading-relaxed font-medium"/>

                  {!description && (
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      {EXAMPLES.slice(0, 3).map((ex) => (
                        <button key={ex} onClick={() => { setDescription(ex); if (textareaRef.current) textareaRef.current.focus(); }}
                          className="text-[11.5px] px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white/30 hover:text-white/60 hover:bg-white/[0.06] hover:border-amber-500/25 hover:text-amber-400 transition-all">
                          {ex.length > 38 ? ex.slice(0, 38) + "…" : ex}
                        </button>
                      ))}
                    </div>
                  )}

                  {(generatedName || isGeneratingName) && description.trim().length >= 10 && (
                    <div className="px-5 pb-3 flex items-center gap-2">
                      <span className="text-[11px] text-white/20 font-medium">Name:</span>
                      {isGeneratingName ? (
                        <div className="flex gap-1">{[0,150,300].map((d) => (
                          <span key={d} className="w-1 h-1 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay: `${d}ms` }}/>
                        ))}</div>
                      ) : (
                        <span className="text-[12px] font-bold text-amber-400 bg-amber-500/10 px-3 py-0.5 rounded-full border border-amber-500/25">{generatedName}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between px-4 py-3.5 border-t border-white/[0.06]">
                    <span className="text-[11px] text-white/15 font-mono">⌘ Enter to create</span>
                    <button onClick={handleSubmit} disabled={!description.trim() || isPending}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all disabled:opacity-25 disabled:cursor-not-allowed text-black hover:scale-105 active:scale-95"
                      style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
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
                    <GitHubIcon className="w-4 h-4 text-white/25 shrink-0" />
                    <input type="text" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)}
                      onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 bg-transparent text-[14.5px] text-white/80 outline-none placeholder:text-white/18 font-medium"
                      disabled={isImporting}/>
                    {isFetchingRepo && (
                      <svg className="animate-spin w-4 h-4 text-white/25 shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    )}
                  </div>
                  {repoInfo && !repoError && (
                    <div className="mx-4 mb-3 p-4 bg-white/[0.03] rounded-xl border border-white/[0.08]">
                      <div className="flex items-start gap-2 mb-1.5">
                        <p className="font-bold text-[13px] text-white/80 truncate">{repoInfo.fullName}</p>
                        {repoInfo.isPrivate && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold shrink-0 border border-amber-500/20">Private</span>}
                      </div>
                      {repoInfo.description && <p className="text-[12px] text-white/35 mb-2 line-clamp-2">{repoInfo.description}</p>}
                      <div className="flex items-center gap-3 text-[11px] text-white/25">
                        {repoInfo.language && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />{repoInfo.language}</span>}
                        <span>⭐ {repoInfo.stars.toLocaleString()}</span>
                        <span className="font-mono">{repoInfo.defaultBranch}</span>
                      </div>
                    </div>
                  )}
                  {repoError && <div className="mx-4 mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[12px] text-red-400">{repoError}</div>}
                  {importProgress && (
                    <div className="mx-4 mb-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      <p className="text-[12px] text-amber-400 font-medium">{importProgress}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3.5 border-t border-white/[0.06]">
                    <span className="text-[11px] text-white/15">Public repos only</span>
                    <button onClick={handleGithubImport} disabled={!repoInfo || isImporting || repoInfo?.isPrivate}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-black transition-all disabled:opacity-25 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                      style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
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
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[13px] font-black text-white/50 uppercase tracking-widest">Projects</h2>
                  <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.06] rounded-xl p-0.5">
                    {([["all", "All"], ["recent", "Recent"], ["github", "GitHub"]] as const).map(([t, label]) => (
                      <button key={t} onClick={() => setProjectTab(t)}
                        className={cn("px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-all",
                          projectTab === t ? "bg-white/[0.08] text-white/80" : "text-white/25 hover:text-white/50")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {filteredProjects.length === 0 ? (
                    <div className="text-center py-12 text-white/20 text-[13px] font-medium">No projects in this view</div>
                  ) : (
                    filteredProjects.slice(0, 12).map((p) => (
                      <button key={p.id} onClick={() => setLocation(`/chat/${p.id}`)}
                        className="group w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.09] cursor-pointer transition-all text-left">
                        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center shrink-0 group-hover:border-amber-500/30 group-hover:bg-amber-500/8 transition-all">
                          {p.githubRepo ? (
                            <GitHubIcon className="w-4 h-4 text-white/25 group-hover:text-amber-400 transition-colors" />
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-white/20 group-hover:text-amber-400 transition-colors">
                              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-semibold text-white/70 group-hover:text-white/90 truncate transition-colors">{p.name}</p>
                          {p.description && (
                            <p className="text-[11.5px] text-white/25 truncate mt-0.5">{p.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-white/20 font-medium">{formatRelativeTime(p.updatedAt)}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/15 group-hover:text-amber-400 transition-all group-hover:translate-x-0.5">
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
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.15),rgba(249,115,22,0.15))", border: "1px solid rgba(245,158,11,0.2)" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <defs><linearGradient id="emptyIcon" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f59e0b"/><stop offset="1" stopColor="#f97316"/></linearGradient></defs>
                    <polyline points="16 18 22 12 16 6" stroke="url(#emptyIcon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="8 6 2 12 8 18" stroke="url(#emptyIcon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-[16px] font-bold text-white/50 mb-1.5">No projects yet</p>
                <p className="text-[13px] text-white/25">Describe your idea above and let AI build it for you</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
