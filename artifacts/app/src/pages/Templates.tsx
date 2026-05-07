import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: string;
  tags: string[];
  usageCount: number;
  agentPower: "lite" | "economy" | "power";
  createdAt: string;
}

const AGENT_POWER_LABELS: Record<string, { label: string; color: string }> = {
  lite: { label: "Lite", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  economy: { label: "Economy", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  power: { label: "Power", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
};

const CATEGORY_ICONS: Record<string, string> = {
  SaaS: "⚡",
  "E-commerce": "🛒",
  "Landing Page": "🌐",
  Dashboard: "📊",
  API: "🔌",
  Mobile: "📱",
  Game: "🎮",
  Portfolio: "🎨",
  Blog: "✍️",
  Other: "📦",
  General: "📦",
};

export function Templates() {
  const [, setLocation] = useLocation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [usingId, setUsingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTemplates(await res.json());
      } else {
        setError("Failed to load templates");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  async function useTemplate(template: Template) {
    setUsingId(template.id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/templates/${template.id}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `${template.name}` }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocation(`/chat/${data.projectId}`);
      } else {
        alert("Failed to create project from template");
      }
    } catch {
      alert("Network error");
    }
    setUsingId(null);
  }

  const categories = ["All", ...Array.from(new Set(templates.map((t) => t.category).filter(Boolean)))];
  const filtered = templates.filter((t) => {
    const matchSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = selectedCategory === "All" || t.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  return (
    <div className="min-h-[100dvh] flex bg-background">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 h-14 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-20">
          <button
            className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div>
            <h1 className="font-semibold text-sm">Templates</h1>
            <p className="text-[10px] text-muted-foreground">Ready-made projects — pick one and start building</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="pl-8 pr-4 py-1.5 text-sm bg-muted rounded-lg outline-none focus:ring-2 focus:ring-primary/30 w-44"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">

            {/* Category tabs */}
            <div className="flex gap-2 flex-wrap mb-8">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  )}
                >
                  {cat !== "All" && (CATEGORY_ICONS[cat] ?? "📦")} {cat}
                </button>
              ))}
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-24">
                <svg className="animate-spin w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="text-center py-16">
                <p className="text-destructive text-sm mb-3">{error}</p>
                <button onClick={loadTemplates} className="text-sm text-primary hover:underline">Try again</button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">
                  {search ? "No templates found" : "No templates yet"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {search
                    ? "Try a different search term or category"
                    : "Admins can mark projects as templates from the Admin panel"}
                </p>
              </div>
            )}

            {/* Templates grid */}
            {!loading && !error && filtered.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map((template) => {
                  const powerInfo = AGENT_POWER_LABELS[template.agentPower] ?? AGENT_POWER_LABELS.economy;
                  const isUsing = usingId === template.id;
                  return (
                    <div
                      key={template.id}
                      className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
                    >
                      {/* Card header */}
                      <div className="px-5 pt-5 pb-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">
                            {CATEGORY_ICONS[template.category] ?? "📦"}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", powerInfo.color)}>
                              {powerInfo.label}
                            </span>
                          </div>
                        </div>
                        <h3 className="font-semibold text-sm mb-1 leading-snug">{template.name}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {template.description || template.prompt}
                        </p>
                      </div>

                      {/* Tags */}
                      {template.tags.length > 0 && (
                        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                          {template.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                          </svg>
                          <span>{template.usageCount} used</span>
                        </div>
                        <button
                          onClick={() => useTemplate(template)}
                          disabled={isUsing}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
                        >
                          {isUsing ? (
                            <>
                              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Creating...
                            </>
                          ) : (
                            <>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                              </svg>
                              Use Template
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
