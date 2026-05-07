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
import { Logo } from "@/components/Logo";
import { formatRelativeTime } from "@/lib/utils";
const EXAMPLES = [
  "Build a Next.js landing page with animations",
  "Create a Discord bot with slash commands",
  "Build a REST API with TypeScript and Express",
  "Make a CLI tool for file management",
  "Create a Telegram bot for task tracking",
  "Build a real-time chat app with WebSockets",
];

interface RepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  description: string;
  stars: number;
  language: string;
  defaultBranch: string;
  isPrivate: boolean;
  topics: string[];
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

  // GitHub import state
  const [showGithub, setShowGithub] = useState(false);
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

  // Auto-generate name from description (debounced 800ms)
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

  // Auto-fetch repo info when GitHub URL changes (debounced)
  useEffect(() => {
    if (githubTimerRef.current) clearTimeout(githubTimerRef.current);
    setRepoInfo(null);
    setRepoError(null);
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
        setRepoInfo(data);
        setRepoError(null);
      } catch (err: any) {
        setRepoError(err.message ?? "Could not fetch repository info");
        setRepoInfo(null);
      } finally { setIsFetchingRepo(false); }
    }, 700);
    return () => { if (githubTimerRef.current) clearTimeout(githubTimerRef.current); };
  }, [githubUrl]);

  async function handleSubmit() {
    const desc = description.trim();
    if (!desc) return;
    setDescription("");
    setGeneratedName(null);
    const projectRes = await createProject.mutateAsync({ data: { description: desc } });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    setLocation(`/chat/${projectRes.id}`);
  }

  async function handleGithubImport() {
    if (!repoInfo || isImporting) return;
    setIsImporting(true);
    setImportProgress("Fetching files from GitHub...");
    try {
      const res = await fetch(`/api/projects/github-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
        body: JSON.stringify({ githubUrl: githubUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportProgress(`Imported ${data.fileCount} files!`);
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setTimeout(() => setLocation(`/chat/${data.projectId}`), 600);
    } catch (err: any) {
      setRepoError(err.message ?? "Import failed");
      setIsImporting(false);
      setImportProgress(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDescription(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }

  const isPending = createProject.isPending;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={null} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <Logo className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">AI Builder</span>
          </div>
          <div className="hidden md:block" />
          <button onClick={() => setLocation("/settings")} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            {user?.avatar ? (
              <img src={user.avatar} className="w-7 h-7 rounded-full object-cover" alt="avatar" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                {user?.name?.charAt(0).toUpperCase() ?? "U"}
              </div>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-12">
            {/* Greeting */}
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {greeting}, {user?.name?.split(" ")[0] ?? "there"}
              </h1>
              <p className="text-muted-foreground">What are we building today?</p>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 mb-4 p-1 bg-muted rounded-xl w-fit mx-auto">
              <button
                onClick={() => setShowGithub(false)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${!showGithub ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                New project
              </button>
              <button
                onClick={() => setShowGithub(true)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${showGithub ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <GitHubIcon className="w-3.5 h-3.5" />
                Import from GitHub
              </button>
            </div>

            {!showGithub ? (
              <>
                {/* Create project input */}
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mb-4 focus-within:border-border/60 transition-all">
                  <textarea
                    ref={textareaRef}
                    value={description}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your project... e.g. 'Build a Discord bot with TypeScript'"
                    rows={3}
                    className="w-full px-5 py-4 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground"
                  />
                  {(generatedName || isGeneratingName) && description.trim().length >= 10 && (
                    <div className="px-5 pb-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Project name:</span>
                      {isGeneratingName ? (
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-primary bg-primary/8 px-2.5 py-1 rounded-full border border-primary/15">
                          {generatedName}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">⌘+Enter to create</span>
                    <button
                      onClick={handleSubmit}
                      disabled={!description.trim() || isPending}
                      className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      {isPending ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      )}
                      {isPending ? "Creating..." : "Start building"}
                    </button>
                  </div>
                </div>

                {/* Examples */}
                <div className="flex flex-wrap gap-2 justify-center mb-12">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setDescription(ex)}
                      className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              /* GitHub import panel */
              <div className="mb-12">
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mb-4">
                  {/* URL input */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <GitHubIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      disabled={isImporting}
                    />
                    {isFetchingRepo && (
                      <svg className="animate-spin w-4 h-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    )}
                  </div>

                  {/* Repo info card */}
                  {repoInfo && !repoError && (
                    <div className="mx-4 mb-4 p-4 bg-muted/50 rounded-xl border border-border/50">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-foreground truncate">{repoInfo.fullName}</span>
                            {repoInfo.isPrivate && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">Private</span>
                            )}
                          </div>
                          {repoInfo.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{repoInfo.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {repoInfo.language && (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                            {repoInfo.language}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                          {repoInfo.stars.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                            <path d="M18 9a9 9 0 01-9 9"/>
                          </svg>
                          {repoInfo.defaultBranch}
                        </span>
                      </div>
                      {repoInfo.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {repoInfo.topics.slice(0, 5).map((t) => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {repoError && (
                    <div className="mx-4 mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                      <p className="text-xs text-destructive">{repoError}</p>
                    </div>
                  )}

                  {/* Import progress */}
                  {importProgress && (
                    <div className="mx-4 mb-4 p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      <p className="text-xs text-primary">{importProgress}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">Public repositories only</p>
                    <button
                      onClick={handleGithubImport}
                      disabled={!repoInfo || isImporting || repoInfo.isPrivate}
                      className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      {isImporting ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : (
                        <GitHubIcon className="w-4 h-4" />
                      )}
                      {isImporting ? "Importing..." : "Import repo"}
                    </button>
                  </div>
                </div>

                {/* How it works hint */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border/50">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Paste any public GitHub repo URL and we'll import all the source files into a new project. You can then ask the AI agent to explain the code, add features, fix bugs, or deploy it.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Projects */}
            {projects.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                  </svg>
                  Recent Projects
                </h2>
                <div className="space-y-2">
                  {projects.slice(0, 8).map((p: any) => (
                    <div
                      key={p.id}
                      onClick={() => setLocation(`/chat/${p.id}`)}
                      className="group flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-primary/30 hover:shadow-sm cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {p.githubRepo ? (
                            <GitHubIcon className="w-4 h-4" />
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-foreground truncate">{p.name}</p>
                            {p.githubRepo && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium hidden sm:block">{p.githubRepo}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{p.description ?? "No description"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(p.updatedAt)}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full hidden sm:block">
                          {p.messageCount} msgs
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-0 group-hover:opacity-60 transition-opacity">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                    </div>
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
