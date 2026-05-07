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
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

type SettingsTab = "profile" | "subscription" | "appearance";

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

export function Settings() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [billingYearly, setBillingYearly] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const updateProfile = useUpdateProfile();
  const logout = useLogout();

  const displayName = name || user?.name || "";
  const creditsPercent = user
    ? Math.round((user.creditsUsed / Math.max(user.credits, 1)) * 100)
    : 0;

  async function handleSave() {
    const patch: { name?: string } = {};
    if (displayName && displayName !== user?.name) patch.name = displayName;
    if (Object.keys(patch).length) {
      await updateProfile.mutateAsync({ data: patch });
    }
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
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-8 8-8s8 4 8 8"/></svg>,
    },
    {
      id: "subscription",
      label: "Subscription",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 000 20z"/></svg>,
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

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button onClick={() => setLocation("/dashboard")} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="text-sm font-medium">Settings</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">
            {/* Tabs */}
            <div className="flex gap-1 bg-muted p-1 rounded-xl mb-8 w-fit">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
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

            {/* Profile Tab */}
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Profile</h2>
                  <p className="text-sm text-muted-foreground">Manage your personal information</p>
                </div>

                {/* Avatar */}
                <div className="flex items-center gap-4">
                  {user?.avatar ? (
                    <img src={user.avatar} className="w-16 h-16 rounded-2xl object-cover" alt="avatar" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{user?.plan ?? "free"} plan</p>
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Display name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    placeholder="Your name"
                  />
                </div>

                {/* Email (readonly) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={user?.email ?? ""}
                    readOnly
                    className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-sm opacity-60 cursor-not-allowed"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={updateProfile.isPending}
                    className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {updateProfile.isPending ? "Saving..." : saved ? "Saved!" : "Save changes"}
                  </button>
                </div>

                <div className="border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-destructive mb-3">Danger zone</h3>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-sm text-destructive border border-destructive/30 px-4 py-2.5 rounded-xl hover:bg-destructive/5 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {/* Subscription Tab */}
            {activeTab === "subscription" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Subscription</h2>
                  <p className="text-sm text-muted-foreground">Manage your plan and credits</p>
                </div>

                {/* Current plan & credits */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Current plan</p>
                      <p className="text-xl font-bold capitalize">{user?.plan ?? "Free"}</p>
                    </div>
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium capitalize">
                      {user?.plan ?? "free"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Credits used</span>
                      <span className="font-medium">{user?.creditsUsed ?? 0} / {user?.credits ?? 20}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          creditsPercent >= 90 ? "bg-destructive" :
                          creditsPercent >= 70 ? "bg-yellow-500" : "bg-primary"
                        )}
                        style={{ width: `${Math.min(creditsPercent, 100)}%` }}
                      />
                    </div>
                    {creditsPercent >= 80 && (
                      <p className="text-xs text-destructive">
                        {creditsPercent >= 100 ? "You've reached your credit limit" : `${100 - creditsPercent}% credits remaining`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Billing toggle */}
                <div className="flex items-center justify-end gap-3">
                  <span className="text-sm text-muted-foreground">Monthly</span>
                  <button
                    onClick={() => setBillingYearly(!billingYearly)}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative",
                      billingYearly ? "bg-primary" : "bg-muted border border-border"
                    )}
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm",
                      billingYearly ? "translate-x-5" : "translate-x-0.5"
                    )} />
                  </button>
                  <span className="text-sm text-muted-foreground">
                    Yearly
                    <span className="ml-1.5 text-xs text-primary font-medium">-20%</span>
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
                          "border-2 rounded-2xl p-5 transition-all",
                          plan.highlight && !isCurrent
                            ? "border-primary/40 bg-primary/2"
                            : isCurrent
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold">{plan.name}</h3>
                              {plan.highlight && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Popular</span>}
                              {isCurrent && <span className="text-xs border border-primary text-primary px-2 py-0.5 rounded-full">Current</span>}
                            </div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold">${price}</span>
                              <span className="text-muted-foreground text-sm">/mo</span>
                            </div>
                          </div>
                          {!isCurrent && (
                            <button className={cn(
                              "px-4 py-2 rounded-xl text-sm font-medium transition-all",
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
                            <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
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

            {/* Appearance Tab */}
            {activeTab === "appearance" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Appearance</h2>
                  <p className="text-sm text-muted-foreground">Customize how the app looks</p>
                </div>
                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-sm font-medium mb-3">Theme</p>
                  <div className="flex gap-3">
                    {["Light", "Dark", "System"].map((t) => (
                      <button
                        key={t}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-border hover:border-primary/40 transition-colors"
                      >
                        <div className={cn(
                          "w-12 h-8 rounded-lg",
                          t === "Light" ? "bg-white border border-gray-200" :
                          t === "Dark" ? "bg-gray-900 border border-gray-700" : "bg-gradient-to-br from-white to-gray-900 border border-gray-300"
                        )} />
                        <span className="text-xs font-medium">{t}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
