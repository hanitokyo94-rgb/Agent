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
    <div className="flex flex-col h-full w-64 bg-sidebar border-r border-sidebar-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <Logo className="w-6 h-6 text-primary" />
          <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">AI Builder</span>
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-sidebar-accent transition-colors md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-3 space-y-1 border-b border-sidebar-border">
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New Project
        </button>
      </div>

      {/* Navigation */}
      <div className="px-3 py-2 border-b border-sidebar-border">
        <NavItem icon="home" label="Home" onClick={() => navigate("/dashboard")} />
        <NavItem icon="grid" label="Projects" onClick={() => navigate("/dashboard")} />
        <NavItem icon="settings" label="Settings" onClick={() => navigate("/settings")} />
        {(user?.plan === "admin" || (user as any)?.isAdmin) && (
          <NavItem icon="admin" label="Admin Panel" onClick={() => navigate("/admin")} />
        )}
      </div>

      {/* Recent Projects */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {projects.length > 0 && (
          <p className="text-xs text-muted-foreground px-2 mb-2 font-medium uppercase tracking-wide">Recent</p>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/chat/${p.id}`)}
            className={cn(
              "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors mb-0.5",
              currentProjectId === p.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/60 text-sidebar-foreground"
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground">{formatRelativeTime(p.updatedAt)}</p>
            </div>
            <button
              onClick={(e) => handleDelete(p.id, e)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all ml-1 shrink-0"
              disabled={deletingId === p.id}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No projects yet</p>
        )}
      </div>

      {/* Credits & User */}
      <div className="border-t border-sidebar-border px-4 py-3 shrink-0">
        {user && (
          <>
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Credits</span>
                <span className="text-foreground font-medium">{user.creditsUsed} / {user.credits}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(creditsPercent, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground capitalize">{user.plan} plan</span>
                {creditsPercent >= 80 && (
                  <span className="text-xs text-destructive font-medium">Low!</span>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate("/settings")}
              className="w-full flex items-center gap-2.5 hover:bg-sidebar-accent px-2 py-1.5 rounded-lg transition-colors"
            >
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-medium truncate text-sidebar-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NavItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const icons: Record<string, React.ReactNode> = {
    home: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    grid: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    settings: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    admin: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  };
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
    >
      <span className="opacity-60">{icons[icon]}</span>
      {label}
    </button>
  );
}
