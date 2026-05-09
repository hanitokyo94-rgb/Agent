import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMe, useListProjects, useDeleteProject,
  getGetMeQueryKey, getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "./Logo";
import { formatRelativeTime, cn } from "@/lib/utils";

interface SidebarProps {
  currentProjectId?: string | null;
  onClose?: () => void;
}

function groupProjects(projects: any[]) {
  const now = Date.now(); const day = 86400000;
  const groups: { label: string; items: any[] }[] = [
    { label: "Today", items: [] }, { label: "This Week", items: [] }, { label: "Older", items: [] },
  ];
  for (const p of projects) {
    const age = now - new Date(p.updatedAt).getTime();
    if (age < day) groups[0].items.push(p);
    else if (age < 7 * day) groups[1].items.push(p);
    else groups[2].items.push(p);
  }
  return groups.filter((g) => g.items.length > 0);
}

const HomeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>
  </svg>
);
const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);
const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

export function Sidebar({ currentProjectId, onClose }: SidebarProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["Today", "This Week", "Older"]));

  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: projects = [] } = useListProjects({ query: { queryKey: getListProjectsQueryKey() } });
  const deleteProject = useDeleteProject();

  function navigate(path: string) { setLocation(path); onClose?.(); }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(id);
    await deleteProject.mutateAsync({ projectId: id });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    setDeletingId(null);
    if (currentProjectId === id) setLocation("/dashboard");
  }

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  const grouped = groupProjects(projects as any[]);
  const creditsPercent = user ? Math.round((user.creditsUsed / Math.max(user.credits, 1)) * 100) : 0;
  const [location] = useLocation();

  const navItems = [
    { icon: <HomeIcon />, label: "Dashboard", path: "/dashboard" },
    { icon: <GridIcon />, label: "Templates", path: "/templates" },
    { icon: <GearIcon />, label: "Settings", path: "/settings" },
  ];
  if (user?.plan === "admin" || (user as any)?.isAdmin) {
    navItems.push({ icon: <ShieldIcon />, label: "Admin", path: "/admin" });
  }

  return (
    <div className={cn(
      "flex flex-col h-full border-r border-white/[0.05] transition-all duration-250 select-none",
      "bg-[#09090B]",
      collapsed ? "w-[52px]" : "w-[232px]"
    )}>
      {/* Header */}
      <div className={cn("flex items-center h-[52px] shrink-0 px-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
            <Logo className="w-6 h-6 shrink-0" />
            <span className="font-semibold text-[14px] text-white/85 tracking-tight">Bobo</span>
          </button>
        )}
        {collapsed && (
          <button onClick={() => navigate("/dashboard")} className="hover:opacity-75 transition-opacity">
            <Logo className="w-5 h-5" />
          </button>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-white/20 hover:text-white/45 hover:bg-white/[0.05] transition-all">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}
      </div>

      {/* New Project */}
      <div className={cn("px-2.5 pb-2.5 shrink-0", collapsed && "px-2")}>
        <button onClick={() => navigate("/dashboard")}
          className={cn(
            "w-full flex items-center gap-2 rounded-lg font-medium text-[12.5px] transition-all",
            "bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.07]",
            "text-white/55 hover:text-white/80",
            collapsed ? "h-8 justify-center px-0" : "h-7 px-3"
          )}
          title={collapsed ? "New Project" : undefined}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {!collapsed && "New Project"}
        </button>
      </div>

      {/* Nav items */}
      <div className={cn("space-y-0.5 shrink-0 pb-1.5", collapsed ? "px-2" : "px-2.5")}>
        {navItems.map((item) => {
          const isActive = location === item.path;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg text-[12.5px] font-medium transition-all",
                collapsed ? "h-8 justify-center px-0" : "h-7 px-2.5",
                isActive
                  ? "bg-white/[0.08] text-white/90"
                  : "text-white/35 hover:text-white/65 hover:bg-white/[0.04]"
              )}>
              <span className={isActive ? "text-white/80" : "text-white/30"}>{item.icon}</span>
              {!collapsed && item.label}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-white/[0.05] my-1 shrink-0" />

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto min-h-0 py-0.5" style={{ scrollbarWidth: "none" }}>
        {collapsed ? (
          <div className="px-2 space-y-0.5">
            {(projects as any[]).slice(0, 12).map((p) => (
              <button key={p.id} onClick={() => navigate(`/chat/${p.id}`)} title={p.name}
                className={cn("w-full h-7 flex items-center justify-center rounded-lg transition-all",
                  currentProjectId === p.id ? "bg-white/[0.1] text-white/90" : "text-white/20 hover:text-white/50 hover:bg-white/[0.04]")}>
                <div className={cn("w-1.5 h-1.5 rounded-full", currentProjectId === p.id ? "bg-white/70" : "bg-white/15")} />
              </button>
            ))}
          </div>
        ) : (
          <div className="px-2.5 space-y-0">
            {projects.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-2.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-white/18">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                </div>
                <p className="text-[11.5px] text-white/18 font-medium">No projects yet</p>
              </div>
            )}
            {grouped.map((group) => (
              <div key={group.label}>
                <button onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-1.5 px-1 py-1.5 text-[10.5px] font-semibold tracking-widest uppercase text-white/18 hover:text-white/35 transition-all">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    className={cn("transition-transform duration-150 shrink-0", openGroups.has(group.label) ? "rotate-90" : "")}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  {group.label}
                </button>
                {openGroups.has(group.label) && (
                  <div className="space-y-0 mb-1">
                    {group.items.map((p: any) => {
                      const isActive = currentProjectId === p.id;
                      return (
                        <div key={p.id} onClick={() => navigate(`/chat/${p.id}`)}
                          className={cn("group flex items-center gap-2 px-2 py-[5px] rounded-lg cursor-pointer transition-all",
                            isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]")}>
                          <div className={cn("w-1 h-1 rounded-full shrink-0 transition-all",
                            isActive ? "bg-white/60" : "bg-white/10 group-hover:bg-white/25")} />
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-[12px] truncate leading-tight font-medium",
                              isActive ? "text-white/80" : "text-white/38 group-hover:text-white/65")}>
                              {p.name}
                            </p>
                          </div>
                          <button onClick={(e) => handleDelete(p.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/12 hover:text-red-400 transition-all shrink-0 text-white/20"
                            disabled={deletingId === p.id}>
                            {deletingId === p.id ? (
                              <svg className="animate-spin w-2.5 h-2.5" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                              </svg>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {user && (
        <div className={cn("shrink-0 border-t border-white/[0.05]", collapsed ? "px-2 py-2" : "px-2.5 py-2.5")}>
          {!collapsed && (
            <div className="mb-2.5 px-1">
              <div className="flex items-center justify-between text-[10.5px] mb-1">
                <span className="text-white/22 font-medium">Credits</span>
                <span className="text-white/38 font-semibold">{user.creditsUsed} / {user.credits}</span>
              </div>
              <div className="h-[2px] rounded-full bg-white/[0.05] overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-700",
                  creditsPercent >= 80 ? "bg-red-400/70" : "bg-white/30")}
                  style={{ width: `${Math.min(creditsPercent, 100)}%` }} />
              </div>
            </div>
          )}

          <button onClick={() => navigate("/settings")} title={collapsed ? user.name : undefined}
            className={cn("w-full flex items-center gap-2 rounded-lg hover:bg-white/[0.05] transition-colors",
              collapsed ? "h-8 justify-center px-0" : "px-1.5 py-1.5")}>
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-white/10"/>
            ) : (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 bg-white/10 text-white/70">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 text-left min-w-0">
                <p className="text-[11.5px] font-medium truncate text-white/55">{user.name}</p>
                <p className="text-[10px] text-white/22 truncate">{user.email}</p>
              </div>
            )}
          </button>
        </div>
      )}

      {/* Expand when collapsed */}
      {collapsed && (
        <div className="px-2 pb-2 shrink-0">
          <button onClick={() => setCollapsed(false)}
            className="w-full h-7 flex items-center justify-center rounded-lg text-white/18 hover:text-white/40 hover:bg-white/[0.04] transition-all">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
