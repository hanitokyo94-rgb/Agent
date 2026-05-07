import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useUpdateProfile,
  useLogout,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";

type SettingsTab = "profile" | "subscription" | "appearance" | "shortcuts";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    credits: 20,
    features: ["20 monthly credits", "Basic AI models", "JSON storage", "Community support"],
  },
  {
    id: "build",
    name: "Build",
    price: 25,
    credits: 100,
    features: ["100 monthly credits", "Advanced AI models", "Priority responses", "Email support", "Credits never expire"],
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 79,
    credits: 500,
    features: ["500 monthly credits", "All AI models", "Fastest responses", "Priority support", "Team features"],
  },
];

const SHORTCUTS = [
  { keys: ["⌘", "Enter"], desc: "Send message" },
  { keys: ["⌘", "K"], desc: "Open project switcher" },
  { keys: ["⌘", "/"], desc: "Toggle Plan / Build mode" },
  { keys: ["Esc"], desc: "Close modal / stop streaming" },
  { keys: ["⌘", "Shift", "F"], desc: "Search in files" },
  { keys: ["⌘", "D"], desc: "Deploy project" },
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "zh", label: "中文" },
];

export function Settings() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState(() => localStorage.getItem("ui-language") ?? "en");
  const [saved, setSaved] = useState(false);
  const [billingYearly, setBillingYearly] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const updateProfile = useUpdateProfile();
  const logout = useLogout();

  const displayName = name || user?.name || "";
  const creditsUsed = user?.creditsUsed ?? 0;
  const creditsTotal = user?.credits ?? 20;
  const creditsPercent = Math.round((creditsUsed / Math.max(creditsTotal, 1)) * 100);
  const creditsLeft = creditsTotal - creditsUsed;

  async function handleSave() {
    const patch: { name?: string; language?: string } = {};
    if (displayName && displayName !== user?.name) patch.name = displayName;
    if (language !== user?.language) patch.language = language;
    if (Object.keys(patch).length) {
      await updateProfile.mutateAsync({ data: patch });
    }
    localStorage.setItem("ui-language", language);
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleLogout() {
    await logout.mutateAsync();
    localStorage.removeItem("token");
    queryClient.clear();
    setLocation("/");
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "profile",
      label: "Profile",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-8 8-8s8 4 8 8"/>
        </svg>
      ),
    },
    {
      id: "subscription",
      label: "Plan",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      ),
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 000 20z"/>
        </svg>
      ),
    },
    {
      id: "shortcuts",
      label: "Shortcuts",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h8"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={null} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button
            onClick={() => setLocation("/dashboard")}
            className="p-2 rounded-lg hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="text-sm font-medium">Settings</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

            {/* Tabs — horizontal scroll on mobile */}
            <div className="flex overflow-x-auto gap-1 bg-muted p-1 rounded-xl mb-7 scrollbar-none -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap shrink-0",
                    activeTab === t.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Profile Tab ── */}
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-0.5">Profile</h2>
                  <p className="text-sm text-muted-foreground">Manage your personal information</p>
                </div>

                {/* Avatar + info */}
                <div className="flex items-center gap-4">
                  {user?.avatar ? (
                    <img src={user.avatar} className="w-16 h-16 rounded-2xl object-cover shrink-0" alt="avatar" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold shrink-0">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary capitalize">
                      {user?.plan ?? "free"} plan
                    </span>
                  </div>
                </div>

                {/* Credits mini bar */}
                <div className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Credits</span>
                    <span className="text-sm font-semibold">
                      {creditsUsed} <span className="text-muted-foreground font-normal">/ {creditsTotal}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        creditsPercent >= 90 ? "bg-destructive" :
                        creditsPercent >= 70 ? "bg-amber-500" : "bg-primary"
                      )}
                      style={{ width: `${Math.min(creditsPercent, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {creditsLeft > 0 ? `${creditsLeft} credits remaining this month` : "Credit limit reached"}
                  </p>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Display name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    placeholder="Your name"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={user?.email ?? ""}
                    readOnly
                    className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm opacity-50 cursor-not-allowed"
                  />
                </div>

                {/* Language */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all appearance-none cursor-pointer"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">The AI agent will respond in this language</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={updateProfile.isPending}
                    className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-95"
                  >
                    {updateProfile.isPending ? "Saving..." : saved ? "✓ Saved!" : "Save changes"}
                  </button>
                </div>

                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-destructive mb-3">Danger zone</h3>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-sm text-destructive border border-destructive/30 px-4 py-2.5 rounded-xl hover:bg-destructive/5 transition-colors active:scale-95"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                    </svg>
                    Sign out of all devices
                  </button>
                </div>
              </div>
            )}

            {/* ── Subscription Tab ── */}
            {activeTab === "subscription" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-0.5">Subscription</h2>
                  <p className="text-sm text-muted-foreground">Manage your plan and credits</p>
                </div>

                {/* Current plan */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Current plan</p>
                      <p className="text-xl font-bold capitalize">{user?.plan ?? "Free"}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium capitalize">
                      {user?.plan ?? "free"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Credits used this month</span>
                      <span className="font-semibold">{creditsUsed} / {creditsTotal}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
                          creditsPercent >= 90 ? "bg-destructive" :
                          creditsPercent >= 70 ? "bg-amber-500" : "bg-primary"
                        )}
                        style={{ width: `${Math.min(creditsPercent, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{creditsLeft} left</span>
                      <span>{creditsPercent}% used</span>
                    </div>
                  </div>
                </div>

                {/* Billing toggle */}
                <div className="flex items-center justify-end gap-3">
                  <span className="text-sm text-muted-foreground">Monthly</span>
                  <button
                    onClick={() => setBillingYearly(!billingYearly)}
                    className={cn(
                      "w-11 h-6 rounded-full transition-colors relative shrink-0",
                      billingYearly ? "bg-primary" : "bg-muted border border-border"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm",
                      billingYearly ? "translate-x-5.5" : "translate-x-1"
                    )} style={{ transform: billingYearly ? "translateX(20px)" : "translateX(4px)" }} />
                  </button>
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    Yearly
                    <span className="text-xs text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded-full">-20%</span>
                  </span>
                </div>

                {/* Plans */}
                <div className="space-y-3">
                  {PLANS.map((plan) => {
                    const price = billingYearly ? Math.round(plan.price * 0.8) : plan.price;
                    const isCurrent = user?.plan === plan.id || (plan.id === "free" && !user?.plan);
                    return (
                      <div
                        key={plan.id}
                        className={cn(
                          "border-2 rounded-2xl p-4 sm:p-5 transition-all",
                          isCurrent
                            ? "border-primary bg-primary/5"
                            : plan.highlight
                            ? "border-primary/30 bg-primary/2"
                            : "border-border"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-semibold">{plan.name}</h3>
                              {plan.highlight && !isCurrent && (
                                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full shrink-0">Popular</span>
                              )}
                              {isCurrent && (
                                <span className="text-xs border border-primary text-primary px-2 py-0.5 rounded-full shrink-0">Current</span>
                              )}
                            </div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold">${price}</span>
                              <span className="text-muted-foreground text-sm">/mo</span>
                              {billingYearly && plan.price > 0 && (
                                <span className="text-xs text-muted-foreground line-through ml-1">${plan.price}</span>
                              )}
                            </div>
                          </div>
                          {!isCurrent && (
                            <button className={cn(
                              "px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 active:scale-95",
                              plan.highlight
                                ? "bg-foreground text-background hover:opacity-90"
                                : "border border-border hover:bg-muted"
                            )}>
                              Upgrade
                            </button>
                          )}
                        </div>
                        <ul className="mt-4 space-y-2">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary shrink-0">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Appearance Tab ── */}
            {activeTab === "appearance" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-0.5">Appearance</h2>
                  <p className="text-sm text-muted-foreground">Customize how the app looks</p>
                </div>

                {/* Theme */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-sm font-medium mb-4">Theme</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "light", label: "Light", bg: "bg-white", border: "border-gray-200", dot: "bg-gray-200" },
                      { id: "dark", label: "Dark", bg: "bg-gray-900", border: "border-gray-700", dot: "bg-gray-700" },
                      { id: "system", label: "System", bg: "bg-gradient-to-br from-white to-gray-900", border: "border-gray-400", dot: "bg-gray-400" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        className="flex flex-col items-center gap-2.5 p-3 rounded-xl border-2 border-border hover:border-primary/40 transition-all active:scale-95"
                      >
                        <div className={cn("w-full h-10 rounded-lg border", t.bg, t.border)} />
                        <span className="text-xs font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font size */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-sm font-medium mb-4">Chat font size</p>
                  <div className="flex gap-2">
                    {["Small", "Medium", "Large"].map((s, i) => (
                      <button
                        key={s}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-sm border-2 transition-all active:scale-95",
                          i === 1 ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-primary/30"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Code style */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-sm font-medium mb-1">Code highlight theme</p>
                  <p className="text-xs text-muted-foreground mb-4">Syntax highlighting style for code blocks</p>
                  <div className="flex flex-wrap gap-2">
                    {["GitHub Dark", "Dracula", "Monokai", "Nord", "One Dark"].map((theme, i) => (
                      <button
                        key={theme}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                          i === 0 ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"
                        )}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Shortcuts Tab ── */}
            {activeTab === "shortcuts" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-0.5">Keyboard shortcuts</h2>
                  <p className="text-sm text-muted-foreground">Speed up your workflow</p>
                </div>

                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  {SHORTCUTS.map((s, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between px-5 py-3.5",
                        i > 0 && "border-t border-border/60"
                      )}
                    >
                      <span className="text-sm text-foreground">{s.desc}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, j) => (
                          <span
                            key={j}
                            className="px-2 py-1 rounded-md bg-muted border border-border text-[11px] font-mono font-medium text-muted-foreground"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Slash commands reference */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Slash commands</h3>
                  <div className="bg-card border border-border rounded-2xl overflow-hidden">
                    {[
                      { cmd: "/plan", desc: "Plan before building — see a roadmap first" },
                      { cmd: "/fix", desc: "Diagnose and fix all bugs and errors" },
                      { cmd: "/explain", desc: "Explain the codebase architecture" },
                      { cmd: "/deploy", desc: "Deploy the project to Vercel" },
                      { cmd: "/optimize", desc: "Optimize performance and code quality" },
                      { cmd: "/test", desc: "Write comprehensive tests" },
                      { cmd: "/document", desc: "Add docs, comments, and README" },
                      { cmd: "/refactor", desc: "Refactor for cleaner structure" },
                      { cmd: "/debug", desc: "Step-by-step debugging session" },
                      { cmd: "/security", desc: "Security audit and hardening" },
                    ].map((item, i) => (
                      <div key={i} className={cn("flex items-center gap-4 px-5 py-3", i > 0 && "border-t border-border/60")}>
                        <code className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">{item.cmd}</code>
                        <span className="text-sm text-muted-foreground">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-muted/50 border border-border/50 rounded-2xl p-4 flex items-start gap-3">
                  <span className="text-base shrink-0">💡</span>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Type <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">/</code> in the chat to see all available skills and import your own from GitHub.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
