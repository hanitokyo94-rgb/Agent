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
  { id: "github", name: "GitHub", description: "Push & sync project code", color: "#e2e8f0", fields: [{ key: "token", label: "Personal Access Token", placeholder: "ghp_...", secret: true }, { key: "defaultRepo", label: "Default Repository", placeholder: "username/repo" }] },
  { id: "stripe", name: "Stripe", description: "Accept payments", color: "#635BFF", fields: [{ key: "secretKey", label: "Secret Key", placeholder: "sk_live_...", secret: true }, { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_...", secret: true }] },
  { id: "openai", name: "OpenAI", description: "Use OpenAI APIs in projects", color: "#10a37f", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-proj-...", secret: true }] },
  { id: "supabase", name: "Supabase", description: "Postgres + auth + realtime", color: "#3ECF8E", fields: [{ key: "projectUrl", label: "Project URL", placeholder: "https://xxxx.supabase.co" }, { key: "anonKey", label: "Anon Key", placeholder: "eyJhbGci...", secret: true }] },
  { id: "telegram", name: "Telegram", description: "Build Telegram bots", color: "#2AABEE", fields: [{ key: "botToken", label: "Bot Token", placeholder: "123456789:AAF...", secret: true }] },
  { id: "gmail", name: "Gmail", description: "Send emails via Gmail API", color: "#EA4335", fields: [{ key: "clientId", label: "Client ID", placeholder: "...apps.googleusercontent.com" }, { key: "clientSecret", label: "Client Secret", placeholder: "GOCSPX-...", secret: true }] },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={cn("w-10 rounded-full transition-all relative shrink-0 focus:outline-none", checked ? "" : "bg-white/10 border border-white/10")}
      style={{ height: "22px", background: checked ? "linear-gradient(135deg,#f59e0b,#f97316)" : undefined }}>
      <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-transform shadow-sm"
        style={{ transform: checked ? "translateX(20px)" : "translateX(3px)" }} />
    </button>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12.5px] font-semibold text-white/50 mb-1.5">{label}</label>
      {children}
      {description && <p className="text-[11px] text-white/20 mt-1.5">{description}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", mono = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={cn("w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80",
        "outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/15 transition-all placeholder:text-white/18",
        mono && "font-mono")} />
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-white/[0.025] border border-white/[0.07] rounded-2xl overflow-hidden", className)}>{children}</div>;
}

function Row({ label, description, right, border = true }: { label: string; description?: string; right: React.ReactNode; border?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-5 py-4", border && "border-b border-white/[0.05] last:border-0")}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-white/70">{label}</p>
        {description && <p className="text-[11.5px] text-white/28 mt-0.5 leading-snug">{description}</p>}
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
    { id: "profile", label: "General", group: "Account", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-8 8-8s8 4 8 8"/></svg> },
    { id: "subscription", label: "Subscription", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> },
    { id: "notifications", label: "Notifications", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg> },
    { id: "appearance", label: "Appearance", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 000 20z"/></svg> },
    { id: "shortcuts", label: "Shortcuts", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h8"/></svg> },
    { id: "ai", label: "My AI", group: "Developer", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2V4a2 2 0 012-2zm0 16a2 2 0 012 2v2a2 2 0 01-4 0v-2a2 2 0 012-2zM2 12a2 2 0 012-2h2a2 2 0 010 4H4a2 2 0 01-2-2zm16 0a2 2 0 012-2h2a2 2 0 010 4h-2a2 2 0 01-2-2z"/></svg> },
    { id: "integrations", label: "Connectors", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> },
  ];

  const pageTitle = navItems.find((n) => n.id === activeTab)?.label ?? "Settings";
  const langOptions = LANGUAGES.map((l) => ({ value: l.code, label: l.label }));

  return (
    <div className="flex h-[100dvh] bg-black overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-md" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={null} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex overflow-hidden min-w-0">
        {/* Settings inner nav */}
        <div className="hidden md:flex flex-col w-52 shrink-0 bg-[#080808] border-r border-white/[0.05] overflow-y-auto">
          <div className="px-4 py-3.5 border-b border-white/[0.05] shrink-0">
            <button onClick={() => setLocation("/dashboard")}
              className="flex items-center gap-2 text-[12.5px] text-white/30 hover:text-white/60 transition-colors font-medium">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>
          </div>
          <div className="flex-1 py-3 px-2.5">
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
                <div key={gi} className={gi > 0 ? "mt-5" : ""}>
                  {g.label && <p className="text-[9.5px] font-black text-white/18 uppercase tracking-widest px-2 mb-2">{g.label}</p>}
                  {g.items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button key={item.id} onClick={() => setActiveTab(item.id)}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all mb-0.5",
                          isActive ? "bg-amber-500/10 text-amber-300 border border-amber-500/15" : "text-white/35 hover:text-white/65 hover:bg-white/[0.04]")}>
                        <span className={isActive ? "text-amber-400" : ""}>{item.icon}</span>
                        {item.label}
                        {item.id === "integrations" && Object.keys(connectors).some((k) => isConnected(k)) && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
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
          <div className="flex items-center gap-3 px-5 h-[52px] border-b border-white/[0.05] bg-black/80 backdrop-blur-xl shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-xl hover:bg-white/[0.06] text-white/35">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-white/20">Settings</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/12">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span className="text-white/55 font-semibold">{pageTitle}</span>
            </div>
          </div>

          {/* Mobile tab bar */}
          <div className="md:hidden flex overflow-x-auto gap-0.5 px-3 py-2 border-b border-white/[0.05] bg-[#080808] shrink-0" style={{ scrollbarWidth: "none" }}>
            {navItems.map((item) => (
              <button key={item.id} onClick={() => setActiveTab(item.id)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-semibold whitespace-nowrap shrink-0 transition-all",
                  activeTab === item.id ? "bg-amber-500/10 text-amber-400 border border-amber-500/15" : "text-white/30 hover:text-white/55")}>
                {item.icon}{item.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}>
            <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-8 space-y-8">

              {/* Profile */}
              {activeTab === "profile" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[20px] font-black text-white">General</h2>
                    <p className="text-[13px] text-white/28 mt-1">Manage your profile and preferences</p>
                  </div>
                  <Card>
                    <div className="flex items-center gap-4 p-5">
                      {user?.avatar ? (
                        <img src={user.avatar} className="w-14 h-14 rounded-2xl object-cover shrink-0 ring-1 ring-white/10" alt="avatar"/>
                      ) : (
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0 text-black"
                          style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                          {user?.name?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                      )}
                      <div>
                        <p className="text-[15px] font-bold text-white/85">{user?.name}</p>
                        <p className="text-[12px] text-white/30">{user?.email}</p>
                        <span className="inline-flex mt-2 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 capitalize">
                          {user?.plan ?? "free"}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-white/[0.05] px-5 pb-5 pt-4">
                      <div className="flex items-center justify-between text-[12px] mb-2">
                        <span className="text-white/30 font-medium">Credits used</span>
                        <span className="text-white/55 font-bold">{creditsUsed} / {creditsTotal}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-700", creditsPercent >= 80 ? "bg-red-500" : "")}
                          style={{ width: `${Math.min(creditsPercent, 100)}%`, background: creditsPercent >= 80 ? undefined : "linear-gradient(90deg,#f59e0b,#f97316)" }} />
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <div className="px-5 py-5 space-y-4">
                      <Field label="Display name">
                        <TextInput value={displayName} onChange={setName} placeholder={user?.name ?? "Your name"} />
                      </Field>
                      <Field label="Language">
                        <Select value={language} onChange={setLanguage} options={langOptions}
                          className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[13px] text-white/80 outline-none focus:border-amber-500/40 transition-all"/>
                      </Field>
                    </div>
                    <div className="border-t border-white/[0.05] px-5 py-4 flex items-center justify-between">
                      <button onClick={handleLogout}
                        className="text-[12.5px] text-red-400/70 hover:text-red-400 transition-colors font-semibold">
                        Sign out
                      </button>
                      <button onClick={handleSave}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-[12.5px] font-bold text-black transition-all hover:scale-105 active:scale-95"
                        style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                        {saved ? (
                          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Saved</>
                        ) : "Save changes"}
                      </button>
                    </div>
                  </Card>
                </div>
              )}

              {/* Subscription */}
              {activeTab === "subscription" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[20px] font-black text-white">Subscription</h2>
                    <p className="text-[13px] text-white/28 mt-1">Choose the plan that fits your needs</p>
                  </div>
                  <div className="flex items-center gap-3 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl w-fit">
                    {["Monthly", "Yearly"].map((p) => (
                      <button key={p} onClick={() => setBillingYearly(p === "Yearly")}
                        className={cn("px-4 py-1.5 rounded-lg text-[12.5px] font-bold transition-all",
                          (p === "Yearly") === billingYearly ? "bg-white text-black" : "text-white/35 hover:text-white/60")}>
                        {p} {p === "Yearly" && <span className="text-amber-400 text-[10px] ml-1">-20%</span>}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {PLANS.map((plan) => {
                      const isCurrent = user?.plan === plan.id;
                      const price = billingYearly ? Math.round(plan.price * 0.8) : plan.price;
                      return (
                        <div key={plan.id} className={cn("rounded-2xl p-5 border transition-all relative", plan.highlight
                          ? "border-amber-500/30 bg-amber-500/5" : "border-white/[0.07] bg-white/[0.02]")}>
                          {plan.badge && (
                            <span className="absolute -top-2.5 left-4 text-[10px] font-black px-2.5 py-0.5 rounded-full text-black"
                              style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>{plan.badge}</span>
                          )}
                          <p className="text-[13px] font-black text-white mb-1">{plan.name}</p>
                          <p className="text-[28px] font-black text-white leading-none mb-1">
                            ${price}<span className="text-[14px] text-white/30 font-normal">/mo</span>
                          </p>
                          <p className="text-[11px] text-white/30 mb-4 font-medium">{plan.credits} credits/month</p>
                          <ul className="space-y-2 mb-5">
                            {plan.features.map((f) => (
                              <li key={f} className="flex items-center gap-2 text-[11.5px] text-white/50">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-500 shrink-0">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                {f}
                              </li>
                            ))}
                          </ul>
                          <button disabled={isCurrent}
                            className={cn("w-full py-2 rounded-xl text-[12.5px] font-bold transition-all",
                              isCurrent ? "bg-white/[0.06] text-white/30 cursor-not-allowed" : "text-black hover:scale-105 active:scale-95")}
                            style={!isCurrent ? { background: "linear-gradient(135deg,#f59e0b,#f97316)" } : {}}>
                            {isCurrent ? "Current plan" : `Upgrade to ${plan.name}`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Appearance */}
              {activeTab === "appearance" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[20px] font-black text-white">Appearance</h2>
                    <p className="text-[13px] text-white/28 mt-1">Customize how things look</p>
                  </div>
                  <Card>
                    <Row label="Theme" description="Choose your preferred color scheme"
                      right={
                        <div className="flex gap-1.5">
                          {["dark", "light", "system"].map((t) => (
                            <button key={t} onClick={() => setTheme(t)}
                              className={cn("px-3 py-1.5 rounded-lg text-[12px] font-semibold capitalize transition-all border",
                                theme === t ? "bg-amber-500/15 text-amber-400 border-amber-500/25" : "bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60")}>
                              {t}
                            </button>
                          ))}
                        </div>
                      }/>
                    <Row label="Font size" description="Chat message text size" border={false}
                      right={
                        <div className="flex gap-1.5">
                          {["Small", "Medium", "Large"].map((f) => (
                            <button key={f} onClick={() => setFontSize(f)}
                              className={cn("px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all border",
                                fontSize === f ? "bg-amber-500/15 text-amber-400 border-amber-500/25" : "bg-white/[0.04] text-white/35 border-white/[0.06] hover:text-white/60")}>
                              {f}
                            </button>
                          ))}
                        </div>
                      }/>
                  </Card>
                </div>
              )}

              {/* Notifications */}
              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[20px] font-black text-white">Notifications</h2>
                    <p className="text-[13px] text-white/28 mt-1">Control what you receive</p>
                  </div>
                  <Card>
                    {[
                      { key: "emailUpdates", label: "Product updates", desc: "New features and improvements" },
                      { key: "emailFeatures", label: "Feature announcements", desc: "Early access to new tools" },
                      { key: "emailBilling", label: "Billing alerts", desc: "Invoice and usage notifications" },
                      { key: "emailTips", label: "Tips & tutorials", desc: "Learn to use AI Builder better" },
                      { key: "emailPromo", label: "Promotions", desc: "Special offers and discounts", last: true },
                    ].map(({ key, label, desc, last }) => (
                      <Row key={key} label={label} description={desc} border={!last}
                        right={<Toggle checked={!!notifications[key]} onChange={() => toggleNotif(key)} />}/>
                    ))}
                  </Card>
                </div>
              )}

              {/* Shortcuts */}
              {activeTab === "shortcuts" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[20px] font-black text-white">Keyboard shortcuts</h2>
                    <p className="text-[13px] text-white/28 mt-1">Speed up your workflow</p>
                  </div>
                  <Card>
                    {SHORTCUTS.map((s, i) => (
                      <div key={i} className={cn("flex items-center justify-between px-5 py-3.5", i < SHORTCUTS.length - 1 && "border-b border-white/[0.05]")}>
                        <span className="text-[13px] text-white/55 font-medium">{s.desc}</span>
                        <div className="flex items-center gap-1">
                          {s.keys.map((k, ki) => (
                            <span key={ki} className="px-2 py-0.5 rounded-lg bg-white/[0.06] border border-white/[0.09] text-[11px] font-bold text-white/50 font-mono">
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              )}

              {/* My AI */}
              {activeTab === "ai" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[20px] font-black text-white">Custom AI</h2>
                    <p className="text-[13px] text-white/28 mt-1">Connect your own AI API endpoint</p>
                  </div>
                  <Card>
                    <div className="px-5 py-5 space-y-4">
                      <Row label="Enable custom AI" description="Use your own AI instead of the platform default" border={false}
                        right={<Toggle checked={customAI.enabled} onChange={() => setCustomAI(prev => ({ ...prev, enabled: !prev.enabled }))} />}/>
                    </div>
                    {customAI.enabled && (
                      <div className="border-t border-white/[0.05] px-5 py-5 space-y-4">
                        <Field label="Base URL" description="e.g. https://api.openai.com/v1 or your custom endpoint">
                          <TextInput value={customAI.baseUrl} onChange={(v) => setCustomAI(p => ({ ...p, baseUrl: v }))} placeholder="https://api.openai.com/v1" mono />
                        </Field>
                        <Field label="API Key">
                          <TextInput value={customAI.apiKey} onChange={(v) => setCustomAI(p => ({ ...p, apiKey: v }))} placeholder="sk-..." type="password" mono />
                        </Field>
                        <Field label="Model" description="e.g. gpt-4o, claude-3-5-sonnet, gemini-pro">
                          <TextInput value={customAI.model} onChange={(v) => setCustomAI(p => ({ ...p, model: v }))} placeholder="gpt-4o" mono />
                        </Field>
                      </div>
                    )}
                    <div className="border-t border-white/[0.05] px-5 py-4 flex items-center gap-3">
                      {customAI.enabled && (
                        <button onClick={testCustomAI} disabled={!customAI.apiKey || aiTesting}
                          className="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-white/[0.06] border border-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.09] transition-all disabled:opacity-40">
                          {aiTesting ? "Testing..." : "Test connection"}
                        </button>
                      )}
                      {aiTestResult === "ok" && <span className="text-[12px] text-emerald-400 font-semibold">✓ Connected</span>}
                      {aiTestResult === "fail" && <span className="text-[12px] text-red-400 font-semibold">✗ Failed</span>}
                      <button onClick={saveCustomAI}
                        className="ml-auto px-5 py-2 rounded-xl text-[12.5px] font-bold text-black transition-all hover:scale-105 active:scale-95"
                        style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                        {aiSaved ? "Saved ✓" : "Save"}
                      </button>
                    </div>
                  </Card>
                </div>
              )}

              {/* Connectors */}
              {activeTab === "integrations" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[20px] font-black text-white">Connectors</h2>
                    <p className="text-[13px] text-white/28 mt-1">Connect external services to your projects</p>
                  </div>
                  <div className="space-y-3">
                    {CONNECTORS.map((conn) => {
                      const connected = isConnected(conn.id);
                      const expanded = expandedConnector === conn.id;
                      return (
                        <div key={conn.id} className="bg-white/[0.025] border border-white/[0.07] rounded-2xl overflow-hidden">
                          <button onClick={() => setExpandedConnector(expanded ? null : conn.id)}
                            className="w-full flex items-center gap-3.5 px-5 py-4 hover:bg-white/[0.03] transition-colors text-left">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 text-white"
                              style={{ background: `${conn.color}25`, border: `1px solid ${conn.color}40` }}>
                              {conn.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold text-white/80">{conn.name}</p>
                              <p className="text-[11.5px] text-white/30">{conn.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {connected && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("text-white/20 transition-transform", expanded && "rotate-90")}>
                                <polyline points="9 18 15 12 9 6"/>
                              </svg>
                            </div>
                          </button>
                          {expanded && (
                            <div className="border-t border-white/[0.05] px-5 py-4 space-y-3">
                              {conn.fields.map((field) => (
                                <Field key={field.key} label={field.label}>
                                  <TextInput
                                    value={connectors[conn.id]?.[field.key] ?? ""}
                                    onChange={(v) => updateConnectorField(conn.id, field.key, v)}
                                    placeholder={field.placeholder}
                                    type={field.secret ? "password" : "text"}
                                    mono />
                                </Field>
                              ))}
                              <div className="flex items-center justify-end pt-1">
                                <button onClick={() => saveConnector(conn.id)}
                                  className="px-5 py-2 rounded-xl text-[12.5px] font-bold text-black transition-all hover:scale-105 active:scale-95"
                                  style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                                  {connectorSaved === conn.id ? "Saved ✓" : "Save"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
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
