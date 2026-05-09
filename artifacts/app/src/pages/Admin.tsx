import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { formatRelativeTime, cn } from "@/lib/utils";

interface AdminUser {
  id: string; name: string; email: string; plan: string;
  credits: number; creditsUsed: number; country: string | null;
  language: string | null; onboardingCompleted: boolean; createdAt: string;
  projectCount: number; avatar: string | null;
}

interface AdminStats {
  totalUsers: number; totalProjects: number; totalMessages: number;
  freeUsers: number; paidUsers: number; totalCreditsUsed: number;
}

const PLANS = ["free", "build", "scale", "admin", "max_builders"];

/* 3D stat icons */
function Stat3D({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: React.ReactNode }) {
  return (
    <div className="group bg-white/[0.025] border border-white/[0.07] rounded-2xl p-5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all cursor-default">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          {icon}
        </div>
      </div>
      <p className="text-[28px] font-black text-white leading-none mb-1">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[11px] text-white/28 font-bold uppercase tracking-wider">{label}</p>
    </div>
  );
}

const PLAN_COLORS: Record<string, string> = {
  free: "#64748b", build: "#f59e0b", scale: "#a78bfa", admin: "#ef4444", max_builders: "#f97316",
};

export function Admin() {
  const [, setLocation] = useLocation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ credits: 0, creditsUsed: 0, plan: "free", name: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiBaseURL, setAiBaseURL] = useState("");
  const [aiConfigSaving, setAiConfigSaving] = useState(false);
  const [aiConfigSaved, setAiConfigSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "config">("users");

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  async function loadData() {
    setLoading(true); setError("");
    const token = localStorage.getItem("token");
    const h = { Authorization: `Bearer ${token}` };
    try {
      const [usersRes, statsRes, configRes] = await Promise.all([
        fetch("/api/admin/users", { headers: h }),
        fetch("/api/admin/stats", { headers: h }),
        fetch("/api/admin/config", { headers: h }),
      ]);
      if (usersRes.status === 403) { setError("Admin access required."); setLoading(false); return; }
      if (usersRes.status === 401) { setLocation("/"); return; }
      setUsers(await usersRes.json());
      setStats(await statsRes.json());
      if (configRes.ok) {
        const cfg = await configRes.json();
        setAiModel(cfg.model ?? ""); setAiBaseURL(cfg.baseURL ?? "");
      }
      setLoaded(true);
    } catch { setError("Failed to load admin data"); }
    setLoading(false);
  }

  async function handleEditSave() {
    if (!editingUser) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ credits: Number(editForm.credits), creditsUsed: Number(editForm.creditsUsed), plan: editForm.plan, name: editForm.name }),
      });
      setUsers((prev) => prev.map((u) => u.id === editingUser.id ? { ...u, ...editForm, credits: Number(editForm.credits), creditsUsed: Number(editForm.creditsUsed) } : u));
      setEditingUser(null);
    } catch { alert("Failed to save"); }
    setSaving(false);
  }

  async function saveAiConfig() {
    setAiConfigSaving(true);
    try {
      await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ model: aiModel, baseURL: aiBaseURL }),
      });
      setAiConfigSaved(true); setTimeout(() => setAiConfigSaved(false), 2000);
    } catch { alert("Failed to save config"); }
    setAiConfigSaving(false);
  }

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.plan.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-[100dvh] bg-black">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-red-500/4 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-black/90 backdrop-blur-xl px-5 sm:px-8 h-[56px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/dashboard")}
            className="flex items-center gap-1.5 text-[12.5px] text-white/30 hover:text-white/60 transition-colors font-medium mr-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span className="font-black text-[14px] text-white">Admin Panel</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!loaded && (
            <button onClick={loadData} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-bold text-black transition-all hover:scale-105 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
              {loading ? (
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>}
              {loading ? "Loading..." : "Load data"}
            </button>
          )}
          {loaded && (
            <button onClick={loadData} disabled={loading}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all" title="Refresh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-[13px]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {error}
          </div>
        )}

        {!loaded && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.15))", border: "1px solid rgba(239,68,68,0.2)" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <defs><linearGradient id="adminIcon" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ef4444"/><stop offset="1" stopColor="#dc2626"/></linearGradient></defs>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="url(#adminIcon)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[16px] font-bold text-white/40 mb-1">Admin Panel</p>
            <p className="text-[13px] text-white/20 mb-6">Load data to manage users and configuration</p>
            <button onClick={loadData}
              className="px-6 py-3 rounded-xl text-[13px] font-bold text-black hover:scale-105 transition-transform"
              style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
              Load data →
            </button>
          </div>
        )}

        {loaded && (
          <>
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                {[
                  { label: "Users", value: stats.totalUsers, color: "#a78bfa", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-8 8-8s8 4 8 8"/></svg> },
                  { label: "Projects", value: stats.totalProjects, color: "#f59e0b", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.7"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
                  { label: "Messages", value: stats.totalMessages, color: "#3b82f6", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.7"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
                  { label: "Free", value: stats.freeUsers, color: "#64748b", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.7"><circle cx="12" cy="12" r="10"/></svg> },
                  { label: "Paid", value: stats.paidUsers, color: "#34d399", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.7"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> },
                  { label: "Credits Used", value: stats.totalCreditsUsed, color: "#f97316", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg> },
                ].map((s) => <Stat3D key={s.label} {...s} />)}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-0.5 bg-white/[0.04] border border-white/[0.06] rounded-xl p-1 mb-6 w-fit">
              {(["users", "config"] as const).map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={cn("px-4 py-1.5 rounded-lg text-[12.5px] font-bold capitalize transition-all",
                    activeTab === t ? "bg-white text-black" : "text-white/35 hover:text-white/60")}>
                  {t === "users" ? `Users (${users.length})` : "AI Config"}
                </button>
              ))}
            </div>

            {activeTab === "users" && (
              <>
                {/* Search */}
                <div className="relative mb-5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${users.length} users...`}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80 outline-none focus:border-amber-500/40 transition-all placeholder:text-white/20"/>
                </div>

                {/* Users table */}
                <div className="bg-white/[0.025] border border-white/[0.07] rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          {["User", "Plan", "Credits", "Projects", "Joined", "Actions"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-[10.5px] font-black text-white/25 uppercase tracking-widest">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors last:border-0">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {u.avatar ? (
                                  <img src={u.avatar} className="w-7 h-7 rounded-full object-cover shrink-0" alt={u.name}/>
                                ) : (
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-black shrink-0"
                                    style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                                    {u.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="text-[12.5px] font-semibold text-white/75 truncate max-w-[150px]">{u.name}</p>
                                  <p className="text-[11px] text-white/30 truncate max-w-[150px]">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold capitalize"
                                style={{ background: `${PLAN_COLORS[u.plan] ?? "#64748b"}18`, color: PLAN_COLORS[u.plan] ?? "#64748b", border: `1px solid ${PLAN_COLORS[u.plan] ?? "#64748b"}30` }}>
                                {u.plan}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-white/45 font-medium">
                              {u.creditsUsed}/{u.credits}
                            </td>
                            <td className="px-4 py-3 text-[12px] text-white/45 font-medium">
                              {u.projectCount}
                            </td>
                            <td className="px-4 py-3 text-[11.5px] text-white/30">
                              {formatRelativeTime(u.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => { setEditingUser(u); setEditForm({ credits: u.credits, creditsUsed: u.creditsUsed, plan: u.plan, name: u.name }); }}
                                className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-white/[0.05] border border-white/[0.08] text-white/45 hover:text-white/70 hover:bg-white/[0.08] transition-all">
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-12 text-white/20 text-[13px] font-medium">No users match your search</div>
                  )}
                </div>
              </>
            )}

            {activeTab === "config" && (
              <div className="bg-white/[0.025] border border-white/[0.07] rounded-2xl overflow-hidden max-w-lg">
                <div className="px-5 py-5 space-y-4">
                  <div>
                    <p className="text-[14px] font-bold text-white/80 mb-1">AI Model Configuration</p>
                    <p className="text-[12px] text-white/30">Override the platform AI settings globally</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-white/30 uppercase tracking-widest mb-1.5">Model Name</label>
                    <input value={aiModel} onChange={(e) => setAiModel(e.target.value)}
                      placeholder="e.g. gpt-4o, claude-3-5-sonnet"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80 outline-none focus:border-amber-500/40 transition-all placeholder:text-white/20 font-mono"/>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-white/30 uppercase tracking-widest mb-1.5">Base URL</label>
                    <input value={aiBaseURL} onChange={(e) => setAiBaseURL(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80 outline-none focus:border-amber-500/40 transition-all placeholder:text-white/20 font-mono"/>
                  </div>
                </div>
                <div className="border-t border-white/[0.05] px-5 py-4 flex justify-end">
                  <button onClick={saveAiConfig} disabled={aiConfigSaving}
                    className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-black transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                    {aiConfigSaving ? "Saving..." : aiConfigSaved ? "Saved ✓" : "Save config"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit user modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setEditingUser(null)} />
          <div className="relative bg-[#0d0d0d] border border-white/[0.1] rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden z-10">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <div className="px-6 py-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[16px] font-black text-white">Edit user</h3>
                <button onClick={() => setEditingUser(null)} className="w-8 h-8 rounded-xl bg-white/[0.05] flex items-center justify-center text-white/40 hover:text-white/70 transition-colors">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="space-y-4">
                {[
                  { label: "Name", key: "name" as const, type: "text" },
                  { label: "Credits", key: "credits" as const, type: "number" },
                  { label: "Credits Used", key: "creditsUsed" as const, type: "number" },
                ].map(({ label, key, type }) => (
                  <div key={key}>
                    <label className="block text-[10.5px] font-bold text-white/25 uppercase tracking-widest mb-1.5">{label}</label>
                    <input type={type} value={editForm[key]}
                      onChange={(e) => setEditForm((p) => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80 outline-none focus:border-amber-500/40 transition-all"/>
                  </div>
                ))}
                <div>
                  <label className="block text-[10.5px] font-bold text-white/25 uppercase tracking-widest mb-1.5">Plan</label>
                  <select value={editForm.plan} onChange={(e) => setEditForm((p) => ({ ...p, plan: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80 outline-none focus:border-amber-500/40 transition-all">
                    {PLANS.map((p) => <option key={p} value={p} className="bg-[#111]">{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingUser(null)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white/40 bg-white/[0.04] border border-white/[0.07] hover:text-white/60 transition-all">
                  Cancel
                </button>
                <button onClick={handleEditSave} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
