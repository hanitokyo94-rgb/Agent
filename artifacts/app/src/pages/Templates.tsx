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

const AGENT_POWER_LABELS: Record<string, { label: string }> = {
  lite: { label: "Lite" },
  economy: { label: "Economy" },
  power: { label: "Power" },
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
    <div className="min-h-[100dvh] flex bg-[#08090A]">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
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
        <div className="flex items-center gap-3 px-5 h-[52px] border-b border-white/[0.05] sticky top-0 bg-[#08090A]/90 backdrop-blur-xl z-20">
          <button
            className="md:hidden p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors text-white/35"
            onClick={() => setSidebarOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-1.5 text-[12px]">
            <span className="text-white/20">Bobo</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/12">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span className="text-white/50 font-medium">Templates</span>
          </div>
          <div className="ml-auto">
            <div className="relative">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-white/22">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="pl-8 pr-4 py-1.5 text-[12.5px] bg-white/[0.04] border border-white/[0.07] rounded-lg outline-none focus:border-white/15 focus:bg-white/[0.05] text-white/70 placeholder:text-white/18 transition-all w-44"/>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.05) transparent" }}>
          <div className="max-w-5xl mx-auto px-5 py-8">

            {/* Category tabs */}
            <div className="flex gap-1.5 flex-wrap mb-7">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[12px] font-medium transition-all",
                    selectedCategory === cat
                      ? "bg-white/[0.1] text-white/85 border border-white/[0.12]"
                      : "text-white/30 hover:text-white/60 hover:bg-white/[0.04] border border-transparent"
                  )}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-24">
                <svg className="animate-spin w-5 h-5 text-white/25" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="text-center py-16">
                <p className="text-red-400/70 text-[13px] mb-3">{error}</p>
                <button onClick={loadTemplates} className="text-[12.5px] text-white/40 hover:text-white/70 transition-colors underline underline-offset-2">Try again</button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-white/20">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </div>
                <h3 className="font-medium text-[14px] text-white/45 mb-1">
                  {search ? "No templates found" : "No templates yet"}
                </h3>
                <p className="text-[12.5px] text-white/22 max-w-xs">
                  {search ? "Try a different search term or category" : "Admins can mark projects as templates from the Admin panel"}
                </p>
              </div>
            )}

            {/* Templates grid */}
            {!loading && !error && filtered.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((template) => {
                  const powerInfo = AGENT_POWER_LABELS[template.agentPower] ?? AGENT_POWER_LABELS.economy;
                  const isUsing = usingId === template.id;
                  return (
                    <div key={template.id}
                      className="group bg-[#111113] border border-white/[0.07] rounded-xl overflow-hidden hover:border-white/[0.12] transition-all duration-200">
                      <div className="px-5 pt-5 pb-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-base shrink-0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-white/35">
                              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                              <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                            </svg>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-white/[0.06] text-white/35 border border-white/[0.07]">
                            {powerInfo.label}
                          </span>
                        </div>
                        <h3 className="font-medium text-[13.5px] text-white/75 mb-1 leading-snug">{template.name}</h3>
                        <p className="text-[12px] text-white/32 leading-relaxed line-clamp-2">
                          {template.description || template.prompt}
                        </p>
                      </div>

                      {template.tags.length > 0 && (
                        <div className="px-5 pb-3 flex flex-wrap gap-1">
                          {template.tags.slice(0, 4).map((tag) => (
                            <span key={tag}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-white/28 font-medium border border-white/[0.06]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="px-5 py-3 border-t border-white/[0.05] flex items-center justify-between">
                        <span className="text-[11px] text-white/22">{template.usageCount} used</span>
                        <button onClick={() => useTemplate(template)} disabled={isUsing}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#E5E5E6] text-[#08090A] text-[12px] font-medium hover:bg-white transition-all active:scale-95 disabled:opacity-40">
                          {isUsing ? (
                            <>
                              <svg className="animate-spin w-2.5 h-2.5" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                              Creating...
                            </>
                          ) : (
                            <>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                              </svg>
                              Use
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
