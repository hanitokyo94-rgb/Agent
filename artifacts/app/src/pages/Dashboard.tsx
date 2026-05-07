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
import { formatRelativeTime } from "@/lib/utils";

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
    setLocation(`/chat/${projectRes.id}`);
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

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={null} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar mobile */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border/40 shrink-0 md:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="font-semibold text-sm">AI Builder</span>
          <button onClick={() => setLocation("/settings")} className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
            {user?.name?.charAt(0).toUpperCase() ?? "U"}
          </button>
        </div>

        {/* Main scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 pt-16 pb-12">

            {/* Greeting */}
            <div className="text-center mb-10">
              <h1 className="text-[2rem] font-bold text-foreground tracking-tight mb-1.5">
                What can I help you build?
              </h1>
              <p className="text-[15px] text-muted-foreground">
                Hello, {firstName} — describe your idea and I'll build it.
              </p>
            </div>

            {/* Main input card */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mb-5">

              {/* Mode toggle inside card */}
              <div className="flex border-b border-border/50">
                <button
                  onClick={() => setMode("new")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-medium transition-colors ${mode === "new" ? "text-foreground bg-muted/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  New project
                </button>
                <div className="w-px bg-border/50" />
                <button
                  onClick={() => setMode("github")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-medium transition-colors ${mode === "github" ? "text-foreground bg-muted/30" : "text-muted-foreground hover:text-foreground"}`}
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
                    placeholder="Describe what you want to build..."
                    rows={3}
                    className="w-full px-5 pt-4 pb-2 bg-transparent text-[15px] resize-none outline-none placeholder:text-muted-foreground/60 leading-relaxed"
                  />

                  {/* Auto name badge */}
                  {(generatedName || isGeneratingName) && description.trim().length >= 10 && (
                    <div className="px-5 pb-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Name:</span>
                      {isGeneratingName ? (
                        <div className="flex gap-1">
                          {[0, 150, 300].map((d) => (
                            <span key={d} className="w-1 h-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-primary bg-primary/8 px-2.5 py-0.5 rounded-full border border-primary/15">{generatedName}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
                    <span className="text-xs text-muted-foreground/60">⌘+Enter to create</span>
                    <button
                      onClick={handleSubmit}
                      disabled={!description.trim() || isPending}
                      className="flex items-center gap-2 bg-foreground text-background px-5 py-2 rounded-xl text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
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
                      {isPending ? "Creating..." : "Build it"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-5 py-4">
                    <GitHubIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60"
                      disabled={isImporting}
                    />
                    {isFetchingRepo && (
                      <svg className="animate-spin w-4 h-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    )}
                  </div>

                  {repoInfo && !repoError && (
                    <div className="mx-4 mb-3 p-3.5 bg-muted/40 rounded-xl border border-border/50">
                      <div className="flex items-start gap-2 mb-2">
                        <p className="font-medium text-[13px] truncate">{repoInfo.fullName}</p>
                        {repoInfo.isPrivate && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">Private</span>}
                      </div>
                      {repoInfo.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{repoInfo.description}</p>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {repoInfo.language && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />{repoInfo.language}</span>}
                        <span>⭐ {repoInfo.stars.toLocaleString()}</span>
                        <span>{repoInfo.defaultBranch}</span>
                      </div>
                    </div>
                  )}
                  {repoError && <div className="mx-4 mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive">{repoError}</div>}
                  {importProgress && (
                    <div className="mx-4 mb-3 p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5 text-primary shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      <p className="text-xs text-primary">{importProgress}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
                    <span className="text-xs text-muted-foreground/60">Public repos only</span>
                    <button
                      onClick={handleGithubImport}
                      disabled={!repoInfo || isImporting || repoInfo?.isPrivate}
                      className="flex items-center gap-2 bg-foreground text-background px-5 py-2 rounded-xl text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30"
                    >
                      {isImporting ? <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <GitHubIcon className="w-3.5 h-3.5" />}
                      {isImporting ? "Importing..." : "Import repo"}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Example chips */}
            {mode === "new" && (
              <div className="flex flex-wrap gap-2 justify-center mb-12">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => setDescription(ex)}
                    className="text-[12px] px-3.5 py-1.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            )}

            {/* Recent Projects */}
            {projects.length > 0 && (
              <div>
                <h2 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent</h2>
                <div className="space-y-1.5">
                  {(projects as any[]).slice(0, 10).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setLocation(`/chat/${p.id}`)}
                      className="group w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:border-primary/25 hover:bg-muted/30 cursor-pointer transition-all text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                        {p.githubRepo ? (
                          <GitHubIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-primary">
                            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[13px] text-foreground truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{p.description ?? "No description"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground/60">{formatRelativeTime(p.updatedAt)}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-0 group-hover:opacity-40 transition-opacity">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
