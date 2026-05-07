import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { formatRelativeTime, cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  plan: string;
  credits: number;
  creditsUsed: number;
  country: string | null;
  language: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  projectCount: number;
  avatar: string | null;
}

interface AdminStats {
  totalUsers: number;
  totalProjects: number;
  totalMessages: number;
  freeUsers: number;
  paidUsers: number;
  totalCreditsUsed: number;
}

const PLANS = ["free", "build", "scale", "admin"];

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
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userProjects, setUserProjects] = useState<any[]>([]);

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  async function loadData() {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("token");
    const h = { Authorization: `Bearer ${token}` };
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch("/api/admin/users", { headers: h }),
        fetch("/api/admin/stats", { headers: h }),
      ]);
      if (usersRes.status === 403) { setError("Admin access required."); setLoading(false); return; }
      if (usersRes.status === 401) { setLocation("/"); return; }
      setUsers(await usersRes.json());
      setStats(await statsRes.json());
      setLoaded(true);
    } catch {
      setError("Failed to load admin data");
    }
    setLoading(false);
  }

  async function loadUserProjects(userId: string) {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/admin/users/${userId}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUserProjects(await res.json());
  }

  function openEdit(u: AdminUser) {
    setEditingUser(u);
    setEditForm({ credits: u.credits, creditsUsed: u.creditsUsed, plan: u.plan, name: u.name });
  }

  async function saveEdit() {
    if (!editingUser) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      setEditingUser(null);
    }
    setSaving(false);
  }

  async function deleteUser(userId: string) {
    if (!confirm("Delete this user permanently?")) return;
    const token = localStorage.getItem("token");
    await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const planColor: Record<string, string> = {
    free: "bg-muted text-muted-foreground",
    build: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    scale: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    admin: "bg-primary/20 text-primary",
  };

  if (!loaded && !loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background">
        <Logo className="w-10 h-10 text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">Admin Panel</h1>
        <p className="text-muted-foreground text-sm mb-6">Control panel for managing users and data</p>
        {error && <p className="text-destructive text-sm mb-4">{error}</p>}
        <button
          onClick={loadData}
          className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          Access Admin Panel
        </button>
        <button onClick={() => setLocation("/dashboard")} className="mt-3 text-sm text-muted-foreground hover:text-foreground">
          ← Back to app
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/dashboard")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <Logo className="w-6 h-6 text-primary" />
          <span className="font-semibold">Admin Panel</span>
        </div>
        <button
          onClick={loadData}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? "animate-spin" : ""}>
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {[
              { label: "Total Users", value: stats.totalUsers, icon: "👥" },
              { label: "Total Projects", value: stats.totalProjects, icon: "📁" },
              { label: "Total Messages", value: stats.totalMessages, icon: "💬" },
              { label: "Free Users", value: stats.freeUsers, icon: "🆓" },
              { label: "Paid Users", value: stats.paidUsers, icon: "💎" },
              { label: "Credits Used", value: stats.totalCreditsUsed, icon: "⚡" },
            ].map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xl mb-1">{s.icon}</p>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Users Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold">Users ({filtered.length})</h2>
            <div className="relative">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="pl-8 pr-4 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 w-48"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Credits</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Projects</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Country</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Joined</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {u.avatar ? (
                          <img src={u.avatar} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", planColor[u.plan] ?? planColor.free)}>
                        {u.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{u.creditsUsed} / {u.credits}</p>
                        <div className="w-16 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min((u.creditsUsed / Math.max(u.credits, 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={async () => {
                          setSelectedUser(u.id === selectedUser ? null : u.id);
                          if (u.id !== selectedUser) loadUserProjects(u.id);
                        }}
                        className="text-primary hover:underline"
                      >
                        {u.projectCount} projects
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.country ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatRelativeTime(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/70 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        {u.id !== me?.id && (
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="px-3 py-1.5 text-xs text-destructive border border-destructive/20 hover:bg-destructive/5 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* User projects sub-row */}
          {selectedUser && userProjects.length > 0 && (
            <div className="border-t border-border px-5 py-4 bg-muted/20">
              <p className="text-xs font-medium mb-3 text-muted-foreground">Projects for selected user</p>
              <div className="space-y-2">
                {userProjects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm bg-background rounded-lg px-3 py-2">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.description ?? ""}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{p.messageCount} msgs</span>
                      <span>{formatRelativeTime(p.updatedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingUser(null)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
            <h3 className="text-lg font-bold mb-1">Edit User</h3>
            <p className="text-sm text-muted-foreground mb-5">{editingUser.email}</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-muted rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Plan</label>
                <select
                  value={editForm.plan}
                  onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                  className="w-full px-3 py-2.5 bg-muted rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Total Credits</label>
                  <input
                    type="number"
                    value={editForm.credits}
                    onChange={(e) => setEditForm({ ...editForm, credits: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-muted rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Credits Used</label>
                  <input
                    type="number"
                    value={editForm.creditsUsed}
                    onChange={(e) => setEditForm({ ...editForm, creditsUsed: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-muted rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingUser(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
