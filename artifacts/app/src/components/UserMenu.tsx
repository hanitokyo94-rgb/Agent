import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface User {
  name: string;
  email: string;
  avatar?: string | null;
  plan?: string;
  credits?: number;
  creditsUsed?: number;
  isAdmin?: boolean;
}

interface UserMenuProps {
  user: User;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  admin: "Admin",
};

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();

  const creditsUsed = user.creditsUsed ?? 0;
  const creditsTotal = user.credits ?? 1;
  const creditsPercent = Math.min(Math.round((creditsUsed / creditsTotal) * 100), 100);

  function openMenu() {
    setOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }
  function closeMenu() {
    setVisible(false);
    setTimeout(() => setOpen(false), 160);
  }
  function toggle() { open ? closeMenu() : openMenu(); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeMenu(); }
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMenu();
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.addEventListener("mousedown", onOutside);
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside);
    };
  }, [open]);

  function navigate(path: string) {
    closeMenu();
    setTimeout(() => setLocation(path), 80);
  }

  async function handleLogout() {
    closeMenu();
    try { await logout.mutateAsync(); } catch {}
    localStorage.removeItem("token");
    setAuthTokenGetter(() => null);
    queryClient.clear();
    setLocation("/");
  }

  const plan = user.plan ?? "free";
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const isAdmin = user.isAdmin || plan === "admin";

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={toggle}
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold",
          "transition-all duration-150 btn-press",
          "ring-1 ring-white/[0.1] hover:ring-white/25",
          open
            ? "bg-white/15 text-white/90 ring-white/25"
            : "bg-white/[0.07] text-white/60 hover:bg-white/[0.1] hover:text-white/80"
        )}>
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          user.name.charAt(0).toUpperCase()
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-2 w-[220px] z-50 menu-macos",
            "transition-all duration-150 origin-top-right",
            visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-1"
          )}>

          {/* User info */}
          <div className="px-3 py-2.5 border-b border-white/[0.06] mb-1">
            <div className="flex items-center gap-2.5 mb-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0",
                "ring-1 ring-white/[0.1] bg-white/[0.07] text-white/65"
              )}>
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12.5px] font-semibold text-white/85 truncate leading-tight">{user.name}</p>
                  <span className={cn(
                    "text-[9px] font-semibold px-1.5 py-0.5 rounded-full border leading-none shrink-0",
                    isAdmin
                      ? "bg-white/10 border-white/15 text-white/60"
                      : "bg-white/[0.06] border-white/[0.08] text-white/35"
                  )}>
                    {planLabel}
                  </span>
                </div>
                <p className="text-[11px] text-white/28 truncate leading-tight mt-0.5">{user.email}</p>
              </div>
            </div>

            {/* Usage bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white/22 font-medium">Credits used</span>
                <span className="text-[10px] text-white/38 font-semibold tabular-nums">
                  {creditsUsed}/{creditsTotal}
                </span>
              </div>
              <div className="relative h-[3px] bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                    creditsPercent >= 90 ? "bg-red-400/70" :
                    creditsPercent >= 70 ? "bg-white/40" : "bg-white/22"
                  )}
                  style={{ width: `${creditsPercent}%` }} />
              </div>
              {creditsPercent >= 80 && (
                <p className="text-[9.5px] text-red-400/60 mt-0.5 font-medium">{100 - creditsPercent}% remaining</p>
              )}
            </div>
          </div>

          {/* Nav items */}
          <button onClick={() => navigate("/dashboard")} className="menu-item-macos w-full">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-white/35">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Dashboard
          </button>
          <button onClick={() => navigate("/templates")} className="menu-item-macos w-full">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-white/35">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>
            </svg>
            Templates
          </button>
          <button onClick={() => navigate("/settings")} className="menu-item-macos w-full">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-white/35">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Settings
          </button>
          {isAdmin && (
            <button onClick={() => navigate("/admin")} className="menu-item-macos w-full">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-white/35">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Admin
            </button>
          )}

          <div className="menu-divider" />

          <button onClick={handleLogout} className="menu-item-macos danger w-full">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
