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

export function Dashboard() {
  const [description, setDescription] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [generatedName, setGeneratedName] = useState<string | null>(null);
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: projects = [] } = useListProjects({ query: { queryKey: getListProjectsQueryKey() } });
  const createProject = useCreateProject();
  const generateName = useGenerateProjectName();

  // Auto-generate name from description (debounced)
  useEffect(() => {
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    if (description.trim().length < 10) {
      setGeneratedName(null);
      return;
    }
    setIsGeneratingName(true);
    nameTimerRef.current = setTimeout(async () => {
      try {
        const result = await generateName.mutateAsync({ data: { description: description.trim() } });
        setGeneratedName((result as any).name ?? null);
      } catch {
        setGeneratedName(null);
      } finally {
        setIsGeneratingName(false);
      }
    }, 800);
    return () => {
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    };
  }, [description]);

  async function handleSubmit() {
    const desc = description.trim();
    if (!desc) return;
    setDescription("");
    setGeneratedName(null);

    const projectRes = await createProject.mutateAsync({
      data: { description: desc },
    });

    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    setLocation(`/chat/${projectRes.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
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
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <Logo className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">AI Builder</span>
          </div>
          <div className="hidden md:block" />
          <button
            onClick={() => setLocation("/settings")}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
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

            {/* Input */}
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

              {/* Generated name preview */}
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
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{p.name}</p>
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
