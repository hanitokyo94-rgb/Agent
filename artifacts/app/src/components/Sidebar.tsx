import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  useListProjects,
  useDeleteProject,
  getGetMeQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "./Logo";
import { formatRelativeTime, cn } from "@/lib/utils";

interface SidebarProps {
  currentProjectId?: string | null;
  onClose?: () => void;
}

export function Sidebar({ currentProjectId, onClose }: SidebarProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: projects = [] } = useListProjects({ query: { queryKey: getListProjectsQueryKey() } });
  const deleteProject = useDeleteProject();

  function navigate(path: string) {
    setLocation(path);
    onClose?.();
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(id);
    await deleteProject.mutateAsync({ projectId: id });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    setDeletingId(null);
    if (currentProjectId === id) setLocation("/dashboard");
  }

  const creditsPercent = user
    ? Math.round((user.creditsUsed / Math.max(user.credits, 1)) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full w-64 bg-background border-r border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 hover:opacity-75 transition-opacity"
        >
          <Logo className="w-6 h-6 text-primary" />
          <span className="font-semibold text-sm text-foreground">AI Builder</span>
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground md:hidden"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* New project button */}
      <div className="px-3 pb-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Project
        </button>
      </div>

      {/* Navigation */}
      <div className="px-3 space-y-0.5 pb-3">
        <NavItem
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
          label="Home"
          onClick={() => navigate("/dashboard")}
        />
        <NavItem
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>}
          label="Templates"
          onClick={() => navigate("/templates")}
        />
        <NavItem
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>}
          label="Settings"
          onClick={() => navigate("/settings")}
        />
        {(user?.plan === "admin" || (user as any)?.isAdmin) && (
          <NavItem
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            label="Admin"
            onClick={() => navigate("/admin")}
          />
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-border/50 mb-2" />

      {/* Recent Projects */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {projects.length > 0 && (
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2 mb-2">Recent</p>
        )}
        {(projects as any[]).map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/chat/${p.id}`)}
            className={cn(
              "group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all mb-0.5",
              currentProjectId === p.id
                ? "bg-primary/8 text-primary"
                : "hover:bg-muted/60 text-foreground/80 hover:text-foreground"
            )}
          >
            <div className={cn(
              "w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors",
              currentProjectId === p.id ? "bg-primary/15" : "bg-muted group-hover:bg-muted/80"
            )}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={currentProjectId === p.id ? "text-primary" : "text-muted-foreground"}>
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{p.name}</p>
              <p className="text-[10px] text-muted-foreground/60">{formatRelativeTime(p.updatedAt)}</p>
            </div>
            <button
              onClick={(e) => handleDelete(p.id, e)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
              disabled={deletingId === p.id}
            >
              {deletingId === p.id ? (
                <svg className="animate-spin w-3 h-3 text-muted-foreground" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                </svg>
              )}
            </button>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/30 mb-2">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            <p className="text-xs text-muted-foreground/50">No projects yet</p>
          </div>
        )}
      </div>

      {/* User section */}
      {user && (
        <div className="px-3 py-3 border-t border-border/50 shrink-0">
          {/* Credits bar */}
          <div className="mb-3 px-1">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-muted-foreground/70">Credits</span>
              <span className="font-medium text-foreground/80">{user.creditsUsed} / {user.credits}</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  creditsPercent >= 80 ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${Math.min(creditsPercent, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              {user.plan === "max_builders" ? (
                <span className="flex items-center gap-1 text-[10px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                  ⚡ MAX BUILDERS
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/50 capitalize">{user.plan} plan</span>
              )}
              {creditsPercent >= 80 && user.plan !== "max_builders" && (
                <span className="text-[10px] text-destructive font-medium">Running low</span>
              )}
            </div>
          </div>

          {/* User card */}
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-muted/60 transition-colors"
          >
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-medium truncate text-foreground">{user.name}</p>
              <p className="text-[10px] text-muted-foreground/60 truncate">{user.email}</p>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40 shrink-0">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-foreground/70 hover:text-foreground hover:bg-muted/60 transition-all"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}
