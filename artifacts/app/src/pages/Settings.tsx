import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, useUpdateProfile, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { Sidebar } from "@/components/Sidebar";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";

type SettingsTab = "profile" | "subscription" | "appearance" | "notifications" | "shortcuts" | "ai" | "integrations";

const PLANS = [
  { id: "free", name: "Free", price: 0, credits: 20, badge: null, features: ["20 monthly credits", "Basic AI models", "JSON storage", "Community support"] },
  { id: "build", name: "Build", price: 25, credits: 100, badge: "Popular", features: ["100 monthly credits", "Advanced AI models", "Priority responses", "Email support"], highlight: true },
  { id: "scale", name: "Scale", price: 79, credits: 500, badge: "Power", features: ["500 monthly credits", "All AI models", "Fastest responses", "Priority support"] },
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
  { code: "en", label: "English" }, { code: "ar", label: "العربية" },
  { code: "fr", label: "Français" }, { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" }, { code: "zh", label: "中文" },
];

interface CustomAIConfig { baseUrl: string; apiKey: string; model: string; enabled: boolean; }

const CONNECTORS = [
  { id: "github", name: "GitHub", description: "Push & sync project code", fields: [{ key: "token", label: "Personal Access Token", placeholder: "ghp_...", secret: true }, { key: "defaultRepo", label: "Default Repository", placeholder: "username/repo" }] },
  { id: "stripe", name: "Stripe", description: "Accept payments", fields: [{ key: "secretKey", label: "Secret Key", placeholder: "sk_live_...", secret: true }, { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_...", secret: true }] },
  { id: "openai", name: "OpenAI", description: "Use OpenAI APIs in projects", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-proj-...", secret: true }] },
  { id: "supabase", name: "Supabase", description: "Postgres + auth + realtime", fields: [{ key: "projectUrl", label: "Project URL", placeholder: "https://xxxx.supabase.co" }, { key: "anonKey", label: "Anon Key", placeholder: "eyJhbGci...", secret: true }] },
  { id: "telegram", name: "Telegram", description: "Build Telegram bots", fields: [{ key: "botToken", label: "Bot Token", placeholder: "123456789:AAF...", secret: true }] },
  { id: "gmail", name: "Gmail", description: "Send emails via Gmail API", fields: [{ key: "clientId", label: "Client ID", placeholder: "...apps.googleusercontent.com" }, { key: "clientSecret", label: "Client Secret", placeholder: "GOCSPX-...", secret: true }] },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={cn(
        "relative w-[44px] shrink-0 rounded-full transition-all focus:outline-none border-2 border-transparent",
        checked ? "bg-white" : "bg-white/10"
      )}
      style={{ height: "26px" }}>
      <div className={cn(
        "absolute top-[3px] w-[18px] h-[18px] rounded-full transition-transform shadow-sm",
        checked ? "bg-[#08090A] translate-x-[20px]" : "bg-white/50 translate-x-[3px]"
      )} />
    </button>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-white/38 mb-1.5">{label}</label>
      {children}
      {description && <p className="text-[11px] text-white/20 mt-1.5 leading-relaxed">{description}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", mono = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={cn("w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80",
        "outline-none focus:border-white/18 focus:bg-white/[0.05] transition-all placeholder:text-white/18",
        mono && "font-mono")} />
  );
}

function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-[#111113] border border-white/[0.07] rounded-xl overflow-hidden", className)}>{children}</div>;
}

function Row({ label, description, right, border = true }: { label: string; description?: string; right: React.ReactNode; border?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-5 py-4", border && "border-b border-white/[0.05] last:border-0")}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white/65">{label}</p>
        {description && <p className="text-[11.5px] text-white/25 mt-0.5 leading-snug">{description}</p>}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function loadCustomAI(): CustomAIConfig {
  try { const r = localStorage.getItem("custom-ai-config"); if (r) return JSON.parse(r); } catch {}
  return { baseUrl: "", apiKey: "", model: "", enabled: false };
}
function loadConnectors(): Record<string, Record<string, string>> {
  try { const r = localStorage.getItem("connectors-config"); if (r) return JSON.parse(r); } catch {}
  return {};
}

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

  const [customAI, setCustomAI] = useState<CustomAIConfig>(loadCustomAI);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<"ok" | "fail" | null>(null);

  const [connectors, setConnectors] = useState<Record<string, Record<string, string>>>(loadConnectors);
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [connectorSaved, setConnectorSaved] = useState<string | null>(null);

  const [theme, setTheme] = useState<string>(() => localStorage.getItem("theme") ?? "dark");
  const [fontSize, setFontSize] = useState<string>(() => localStorage.getItem("font-size") ?? "Medium");

  const [notifications, setNotifications] = useState<Record<string, boolean>>(() => {
    try { const r = localStorage.getItem("notifications-config"); if (r) return JSON.parse(r); } catch {}
    return { emailUpdates: true, emailFeatures: true, emailBilling: true, emailTips: false, emailPromo: false };
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else if (theme === "light") root.classList.remove("dark");
    else { if (window.matchMedia("(prefers-color-scheme: dark)").matches) root.classList.add("dark"); else root.classList.remove("dark"); }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const sizes: Record<string, string> = { Small: "13px", Medium: "15px", Large: "17px" };
    document.documentElement.style.setProperty("--chat-font-size", sizes[fontSize] ?? "15px");
    localStorage.setItem("font-size", fontSize);
  }, [fontSize]);

  function toggleNotif(key: string) {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    localStorage.setItem("notifications-config", JSON.stringify(updated));
  }

  async function handleSave() {
    const patch: { name?: string; language?: string } = {};
    if (displayName && displayName !== user?.name) patch.name = displayName;
    if (language !== user?.language) patch.language = language;
    if (Object.keys(patch).length) await updateProfile.mutateAsync({ data: patch });
    localStorage.setItem("ui-language", language);
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function handleLogout() {
    await logout.mutateAsync();
    localStorage.removeItem("token");
    queryClient.clear();
    setLocation("/");
  }

  function saveCustomAI() {
    localStorage.setItem("custom-ai-config", JSON.stringify(customAI));
    setAiSaved(true); setAiTestResult(null);
    setTimeout(() => setAiSaved(false), 2000);
  }

  async function testCustomAI() {
    if (!customAI.apiKey) return;
    setAiTesting(true); setAiTestResult(null);
    try {
      const res = await fetch(`${customAI.baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${customAI.apiKey}` },
        body: JSON.stringify({ model: customAI.model || "gpt-4o-mini", messages: [{ role: "user", content: "Say OK" }], max_tokens: 5 }),
      });
      setAiTestResult(res.ok ? "ok" : "fail");
    } catch { setAiTestResult("fail"); }
    setAiTesting(false);
  }

  function updateConnectorField(id: string, key: string, value: string) {
    setConnectors((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } }));
  }
  function saveConnector(id: string) {
    localStorage.setItem("connectors-config", JSON.stringify(connectors));
    setConnectorSaved(id); setTimeout(() => setConnectorSaved(null), 2000);
  }
  function isConnected(id: string) {
    const cfg = connectors[id];
    if (!cfg) return false;
    return CONNECTORS.find((c) => c.id === id)?.fields.some((f) => cfg[f.key]?.trim()) ?? false;
  }

  const navItems: { id: SettingsTab; label: string; icon: React.ReactNode; group?: string }[] = [
    { id: "profile", label: "General", group: "Account", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-8 8-8s8 4 8 8"/></svg> },
    { id: "subscription", label: "Subscription", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> },
    { id: "notifications", label: "Notifications", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg> },
    { id: "appearance", label: "Appearance", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 000 20z"/></svg> },
    { id: "shortcuts", label: "Shortcuts", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h8"/></svg> },
    { id: "ai", label: "My AI", group: "Developer", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2V4a2 2 0 012-2zm0 16a2 2 0 012 2v2a2 2 0 01-4 0v-2a2 2 0 012-2zM2 12a2 2 0 012-2h2a2 2 0 010 4H4a2 2 0 01-2-2zm16 0a2 2 0 012-2h2a2 2 0 010 4h-2a2 2 0 01-2-2z"/></svg> },
    { id: "integrations", label: "Connectors", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> },
  ];

  const pageTitle = navItems.find((n) => n.id === activeTab)?.label ?? "Settings";
  const langOptions = LANGUAGES.map((l) => ({ value: l.code, label: l.label }));

  return (
    <div className="flex h-[100dvh] bg-[#08090A] overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-250 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={null} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex overflow-hidden min-w-0">
        {/* Settings inner nav */}
        <div className="hidden md:flex flex-col w-48 shrink-0 bg-[#09090B] border-r border-white/[0.05] overflow-y-auto">
          <div className="px-3 py-3 border-b border-white/[0.05] shrink-0">
            <button onClick={() => setLocation("/dashboard")}
              className="flex items-center gap-2 text-[12px] text-white/25 hover:text-white/55 transition-colors font-medium py-1 rounded-lg hover:bg-white/[0.04] px-2 -mx-2 w-full">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>
          </div>
          <div className="flex-1 py-2.5 px-2">
            {(() => {
              type NavGroup = { label: string; items: Array<typeof navItems[number]> };
              const groups: NavGroup[] = [];
              for (const item of navItems) {
                const grpLabel = item.group ?? "";
                const last = groups[groups.length - 1];
                if (!last || last.label !== grpLabel) groups.push({ label: grpLabel, items: [item] });
                else last.items.push(item);
              }
              return groups.map((g, gi) => (
                <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                  {g.label && <p className="text-[9.5px] font-semibold text-white/18 uppercase tracking-widest px-2 mb-1.5">{g.label}</p>}
                  {g.items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button key={item.id} onClick={() => setActiveTab(item.id)}
                        className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] font-medium transition-all mb-0.5",
                          isActive ? "bg-white/[0.08] text-white/90" : "text-white/32 hover:text-white/60 hover:bg-white/[0.04]")}>
                        <span className={isActive ? "text-white/70" : "text-white/28"}>{item.icon}</span>
                        {item.label}
                        {item.id === "integrations" && Object.keys(connectors).some((k) => isConnected(k)) && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400/60 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-5 h-[52px] border-b border-white/[0.05] bg-[#08090A]/90 backdrop-blur-xl shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg hover:bg-white/[0.05] text-white/32">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-white/20">Settings</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/12">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span className="text-white/50 font-medium">{pageTitle}</span>
            </div>
          </div>

          {/* Mobile tab bar */}
          <div className="md:hidden flex overflow-x-auto gap-0.5 px-3 py-2 border-b border-white/[0.05] bg-[#09090B] shrink-0" style={{ scrollbarWidth: "none" }}>
            {navItems.map((item) => (
              <button key={item.id} onClick={() => setActiveTab(item.id)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium whitespace-nowrap shrink-0 transition-all",
                  activeTab === item.id ? "bg-white/[0.08] text-white/85" : "text-white/28 hover:text-white/55")}>
                {item.icon}{item.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.05) transparent" }}>
            <div className="max-w-[600px] mx-auto px-5 sm:px-8 py-8 space-y-7">

              {/* Profile */}
              {activeTab === "profile" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[18px] font-semibold text-white/90">General</h2>
                    <p className="text-[12.5px] text-white/28 mt-0.5">Manage your profile and preferences</p>
                  </div>
                  <SettingsCard>
                    <div className="flex items-center gap-4 p-5">
                      {user?.avatar ? (
                        <img src={user.avatar} className="w-12 h-12 rounded-xl object-cover shrink-0 ring-1 ring-white/10" alt="avatar"/>
                      ) : (
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-semibold shrink-0 bg-white/[0.08] text-white/70">
                          {user?.name?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                      )}
                      <div>
                        <p className="text-[14px] font-semibold text-white/82">{user?.name}</p>
                        <p className="text-[12px] text-white/28 mt-0.5">{user?.email}</p>
                        <span className="inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.07] text-white/45 border border-white/[0.08] capitalize">
                          {user?.plan ?? "free"}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-white/[0.05] px-5 pb-4 pt-3.5">
                      <div className="flex items-center justify-between text-[11.5px] mb-1.5">
                        <span className="text-white/28 font-medium">Credits used</span>
                        <span className="text-white/50 font-semibold">{creditsUsed} / {creditsTotal}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-700", creditsPercent >= 80 ? "bg-red-400/70" : "bg-white/30")}
                          style={{ width: `${Math.min(creditsPercent, 100)}%` }} />
                      </div>
                    </div>
                  </SettingsCard>

                  <SettingsCard>
                    <div className="px-5 py-5 space-y-4">
                      <Field label="Display name">
                        <TextInput value={displayName} onChange={setName} placeholder={user?.name ?? "Your name"} />
                      </Field>
                      <Field label="Language">
                        <Select value={language} onChange={setLanguage} options={langOptions}
                          className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80 outline-none focus:border-white/18 transition-all"/>
                      </Field>
                    </div>
                    <div className="border-t border-white/[0.05] px-5 py-3.5 flex items-center justify-between">
                      <button onClick={handleLogout}
                        className="text-[12.5px] text-red-400/60 hover:text-red-400/90 transition-colors font-medium">
                        Sign out
                      </button>
                      <button onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[12.5px] font-medium bg-[#E5E5E6] text-[#08090A] hover:bg-white transition-all active:scale-95">
                        {saved ? (
                          <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Saved</>
                        ) : "Save changes"}
                      </button>
                    </div>
                  </SettingsCard>
                </div>
              )}

              {/* Subscription */}
              {activeTab === "subscription" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[18px] font-semibold text-white/90">Subscription</h2>
                    <p className="text-[12.5px] text-white/28 mt-0.5">Choose the plan that fits your needs</p>
                  </div>
                  <div className="flex items-center gap-2 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg w-fit">
                    {["Monthly", "Yearly"].map((p) => (
                      <button key={p} onClick={() => setBillingYearly(p === "Yearly")}
                        className={cn("px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all",
                          (p === "Yearly") === billingYearly ? "bg-white/[0.1] text-white/85" : "text-white/32 hover:text-white/60")}>
                        {p} {p === "Yearly" && <span className="text-white/40 text-[10px] ml-1">-20%</span>}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {PLANS.map((plan) => {
                      const isCurrent = user?.plan === plan.id;
                      const price = billingYearly ? Math.round(plan.price * 0.8) : plan.price;
                      return (
                        <div key={plan.id} className={cn("rounded-xl p-5 border transition-all relative",
                          plan.highlight ? "border-white/15 bg-white/[0.04]" : "border-white/[0.07] bg-white/[0.02]")}>
                          {plan.badge && (
                            <span className="absolute -top-2.5 left-4 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.1] text-white/60 border border-white/[0.1]">{plan.badge}</span>
                          )}
                          <p className="text-[13px] font-semibold text-white/80 mb-1">{plan.name}</p>
                          <p className="text-[26px] font-semibold text-white leading-none mb-1">
                            ${price}<span className="text-[13px] text-white/28 font-normal">/mo</span>
                          </p>
                          <p className="text-[11px] text-white/28 mb-4 font-medium">{plan.credits} credits/month</p>
                          <ul className="space-y-1.5 mb-5">
                            {plan.features.map((f) => (
                              <li key={f} className="flex items-center gap-2 text-[11.5px] text-white/42">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/35 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                                {f}
                              </li>
                            ))}
                          </ul>
                          <button className={cn("w-full py-2 rounded-full text-[12.5px] font-medium transition-all",
                            isCurrent ? "bg-white/[0.08] text-white/50 cursor-default" : plan.highlight
                              ? "bg-[#E5E5E6] text-[#08090A] hover:bg-white" : "border border-white/12 text-white/55 hover:bg-white/[0.06]")}>
                            {isCurrent ? "Current plan" : "Upgrade"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Appearance */}
              {activeTab === "appearance" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[18px] font-semibold text-white/90">Appearance</h2>
                    <p className="text-[12.5px] text-white/28 mt-0.5">Customize how the app looks</p>
                  </div>
                  <SettingsCard>
                    <Row label="Theme" description="Choose your preferred color scheme"
                      right={
                        <div className="flex gap-1 bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5">
                          {["dark", "light", "system"].map((t) => (
                            <button key={t} onClick={() => setTheme(t)}
                              className={cn("px-2.5 py-1 rounded-md text-[11.5px] font-medium capitalize transition-all",
                                theme === t ? "bg-white/[0.1] text-white/85" : "text-white/30 hover:text-white/55")}>
                              {t}
                            </button>
                          ))}
                        </div>
                      } />
                    <Row label="Font size" description="Adjust chat message text size" border={false}
                      right={
                        <div className="flex gap-1 bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5">
                          {["Small", "Medium", "Large"].map((s) => (
                            <button key={s} onClick={() => setFontSize(s)}
                              className={cn("px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all",
                                fontSize === s ? "bg-white/[0.1] text-white/85" : "text-white/30 hover:text-white/55")}>
                              {s}
                            </button>
                          ))}
                        </div>
                      } />
                  </SettingsCard>
                </div>
              )}

              {/* Notifications */}
              {activeTab === "notifications" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[18px] font-semibold text-white/90">Notifications</h2>
                    <p className="text-[12.5px] text-white/28 mt-0.5">Choose what emails you receive</p>
                  </div>
                  <SettingsCard>
                    {[
                      { key: "emailUpdates", label: "Product updates", desc: "New features and improvements" },
                      { key: "emailFeatures", label: "Feature announcements", desc: "Early access to new tools" },
                      { key: "emailBilling", label: "Billing notices", desc: "Invoices and payment alerts" },
                      { key: "emailTips", label: "Tips & tutorials", desc: "Learn how to build faster" },
                      { key: "emailPromo", label: "Promotions", desc: "Special offers and discounts" },
                    ].map(({ key, label, desc }, i, arr) => (
                      <Row key={key} label={label} description={desc} border={i < arr.length - 1}
                        right={<Toggle checked={notifications[key]} onChange={() => toggleNotif(key)} />} />
                    ))}
                  </SettingsCard>
                </div>
              )}

              {/* Shortcuts */}
              {activeTab === "shortcuts" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[18px] font-semibold text-white/90">Keyboard shortcuts</h2>
                    <p className="text-[12.5px] text-white/28 mt-0.5">Speed up your workflow</p>
                  </div>
                  <SettingsCard>
                    {SHORTCUTS.map(({ keys, desc }, i) => (
                      <div key={desc} className={cn("flex items-center justify-between px-5 py-3.5", i < SHORTCUTS.length - 1 && "border-b border-white/[0.05]")}>
                        <span className="text-[13px] text-white/55 font-medium">{desc}</span>
                        <div className="flex items-center gap-1">
                          {keys.map((k, j) => (
                            <span key={j} className="px-1.5 py-0.5 rounded-md border border-white/[0.1] bg-white/[0.04] text-[11px] font-mono text-white/45 min-w-[22px] text-center">{k}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </SettingsCard>
                </div>
              )}

              {/* My AI */}
              {activeTab === "ai" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[18px] font-semibold text-white/90">Custom AI</h2>
                    <p className="text-[12.5px] text-white/28 mt-0.5">Use your own API key and model</p>
                  </div>
                  <SettingsCard>
                    <Row label="Use custom AI" description="Override platform AI with your own provider"
                      right={<Toggle checked={customAI.enabled} onChange={() => setCustomAI(p => ({ ...p, enabled: !p.enabled }))} />} />
                    {customAI.enabled && (
                      <div className="px-5 pb-5 pt-2 space-y-4 border-t border-white/[0.05]">
                        <Field label="Base URL">
                          <TextInput value={customAI.baseUrl} onChange={(v) => setCustomAI(p => ({ ...p, baseUrl: v }))} placeholder="https://api.openai.com/v1" />
                        </Field>
                        <Field label="API Key">
                          <TextInput value={customAI.apiKey} onChange={(v) => setCustomAI(p => ({ ...p, apiKey: v }))} placeholder="sk-..." type="password" mono />
                        </Field>
                        <Field label="Model">
                          <TextInput value={customAI.model} onChange={(v) => setCustomAI(p => ({ ...p, model: v }))} placeholder="gpt-4o-mini" mono />
                        </Field>
                        <div className="flex items-center gap-2">
                          <button onClick={saveCustomAI}
                            className="px-4 py-1.5 rounded-full text-[12.5px] font-medium bg-[#E5E5E6] text-[#08090A] hover:bg-white transition-all active:scale-95">
                            {aiSaved ? "Saved ✓" : "Save"}
                          </button>
                          <button onClick={testCustomAI} disabled={!customAI.apiKey || aiTesting}
                            className="px-4 py-1.5 rounded-full text-[12.5px] font-medium border border-white/[0.1] text-white/50 hover:bg-white/[0.05] transition-all disabled:opacity-30">
                            {aiTesting ? "Testing..." : "Test connection"}
                          </button>
                          {aiTestResult === "ok" && <span className="text-[12px] text-emerald-400/70 font-medium">Connected ✓</span>}
                          {aiTestResult === "fail" && <span className="text-[12px] text-red-400/70 font-medium">Failed ✗</span>}
                        </div>
                      </div>
                    )}
                  </SettingsCard>
                </div>
              )}

              {/* Connectors */}
              {activeTab === "integrations" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[18px] font-semibold text-white/90">Connectors</h2>
                    <p className="text-[12.5px] text-white/28 mt-0.5">Connect third-party services to your projects</p>
                  </div>
                  <div className="space-y-2">
                    {CONNECTORS.map((connector) => {
                      const expanded = expandedConnector === connector.id;
                      const connected = isConnected(connector.id);
                      return (
                        <SettingsCard key={connector.id}>
                          <button className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
                            onClick={() => setExpandedConnector(expanded ? null : connector.id)}>
                            <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                              <span className="text-[12px] font-semibold text-white/50">{connector.name.charAt(0)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-white/72">{connector.name}</p>
                              <p className="text-[11.5px] text-white/25">{connector.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />}
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("text-white/18 transition-transform duration-150", expanded ? "rotate-180" : "")} strokeLinecap="round">
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </div>
                          </button>
                          {expanded && (
                            <div className="px-5 pb-5 pt-1 space-y-3.5 border-t border-white/[0.05]">
                              {connector.fields.map((field) => (
                                <Field key={field.key} label={field.label}>
                                  <TextInput value={connectors[connector.id]?.[field.key] ?? ""} onChange={(v) => updateConnectorField(connector.id, field.key, v)}
                                    placeholder={field.placeholder} type={field.secret ? "password" : "text"} mono={field.secret} />
                                </Field>
                              ))}
                              <button onClick={() => saveConnector(connector.id)}
                                className="px-4 py-1.5 rounded-full text-[12.5px] font-medium bg-[#E5E5E6] text-[#08090A] hover:bg-white transition-all active:scale-95">
                                {connectorSaved === connector.id ? "Saved ✓" : "Save"}
                              </button>
                            </div>
                          )}
                        </SettingsCard>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
