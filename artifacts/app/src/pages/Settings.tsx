import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useUpdateProfile,
  useLogout,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Sidebar } from "@/components/Sidebar";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";

type SettingsTab = "profile" | "subscription" | "appearance" | "notifications" | "shortcuts" | "ai" | "integrations";

const PLANS = [
  {
    id: "free", name: "Free", price: 0, credits: 20,
    agentPower: { label: "Lite", iterations: 10 },
    features: ["20 monthly credits", "Basic AI models", "JSON storage", "Community support"],
  },
  {
    id: "build", name: "Build", price: 25, credits: 100,
    agentPower: { label: "Economy", iterations: 25 },
    features: ["100 monthly credits", "Advanced AI models", "Priority responses", "Email support"],
    highlight: true,
  },
  {
    id: "scale", name: "Scale", price: 79, credits: 500,
    agentPower: { label: "Power", iterations: 50 },
    features: ["500 monthly credits", "All AI models", "Fastest responses", "Priority support"],
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

interface CustomAIConfig { baseUrl: string; apiKey: string; model: string; enabled: boolean; }
interface GitHubConfig { token: string; defaultRepo: string; }

const CONNECTORS = [
  { id: "github", name: "GitHub", description: "Push & sync project code", category: "Development", fields: [{ key: "token", label: "Personal Access Token", placeholder: "ghp_...", secret: true }, { key: "defaultRepo", label: "Default Repository", placeholder: "username/repo" }] },
  { id: "stripe", name: "Stripe", description: "Accept payments", category: "Payments", fields: [{ key: "secretKey", label: "Secret Key", placeholder: "sk_live_...", secret: true }, { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_...", secret: true }] },
  { id: "openai", name: "OpenAI", description: "Use OpenAI APIs in projects", category: "AI", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-proj-...", secret: true }] },
  { id: "supabase", name: "Supabase", description: "Postgres + auth + realtime", category: "Database", fields: [{ key: "projectUrl", label: "Project URL", placeholder: "https://xxxx.supabase.co" }, { key: "anonKey", label: "Anon Key", placeholder: "eyJhbGci...", secret: true }] },
  { id: "telegram", name: "Telegram", description: "Build Telegram bots", category: "Messaging", fields: [{ key: "botToken", label: "Bot Token", placeholder: "123456789:AAF...", secret: true }] },
  { id: "gmail", name: "Gmail", description: "Send emails via Gmail API", category: "Communication", fields: [{ key: "clientId", label: "Client ID", placeholder: "...apps.googleusercontent.com" }, { key: "clientSecret", label: "Client Secret", placeholder: "GOCSPX-...", secret: true }] },
];

function ConnectorIcon({ id, size = 16 }: { id: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    github: <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>,
    stripe: <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-[#635BFF]"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/></svg>,
    openai: <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z"/></svg>,
    supabase: <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-[#3ECF8E]"><path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.003.509c.015.986 1.26 1.41 1.874.637l9.262-11.652c1.093-1.375.113-3.403-1.646-3.403h-9.58l-.001-.51z"/></svg>,
    telegram: <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-[#2AABEE]"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
    gmail: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.909v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg>,
  };
  return <span className="flex items-center justify-center">{icons[id] ?? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>}</span>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn("w-10 h-5.5 rounded-full transition-colors relative shrink-0 focus:outline-none", checked ? "bg-primary" : "bg-white/10 border border-white/10")}
      style={{ height: "22px" }}
    >
      <div className="w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-transform shadow-sm"
        style={{ transform: checked ? "translateX(20px)" : "translateX(3px)" }} />
    </button>
  );
}

function SettingsInput({ label, description, type = "text", value, onChange, placeholder, mono = false }: {
  label: string; description?: string; type?: string;
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12.5px] font-medium text-white/60 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-white/80",
          "outline-none focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/10 transition-all placeholder:text-white/20",
          mono && "font-mono"
        )}
      />
      {description && <p className="text-[11px] text-white/25 mt-1.5">{description}</p>}
    </div>
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden", className)}>
      {children}
    </div>
  );
}

function SectionRow({ label, description, right, border = true }: {
  label: string; description?: string; right: React.ReactNode; border?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-5 py-4", border && "border-b border-white/[0.06] last:border-0")}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white/75">{label}</p>
        {description && <p className="text-[11.5px] text-white/30 mt-0.5 leading-snug">{description}</p>}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function loadCustomAI(): CustomAIConfig {
  try { const r = localStorage.getItem("custom-ai-config"); if (r) return JSON.parse(r); } catch {}
  return { baseUrl: "", apiKey: "", model: "", enabled: false };
}
function loadGitHubConfig(): GitHubConfig {
  try { const r = localStorage.getItem("github-config"); if (r) return JSON.parse(r); } catch {}
  return { token: "", defaultRepo: "" };
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
  const creditsLeft = creditsTotal - creditsUsed;

  const [customAI, setCustomAI] = useState<CustomAIConfig>(loadCustomAI);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<"ok" | "fail" | null>(null);

  const [githubConfig, setGithubConfig] = useState<GitHubConfig>(loadGitHubConfig);
  const [githubSaved, setGithubSaved] = useState(false);

  const [connectors, setConnectors] = useState<Record<string, Record<string, string>>>(loadConnectors);
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [connectorSaved, setConnectorSaved] = useState<string | null>(null);

  const [theme, setTheme] = useState<string>(() => localStorage.getItem("theme") ?? "system");
  const [fontSize, setFontSize] = useState<string>(() => localStorage.getItem("font-size") ?? "Medium");

  const [notifications, setNotifications] = useState<Record<string, boolean>>(() => {
    try { const r = localStorage.getItem("notifications-config"); if (r) return JSON.parse(r); } catch {}
    return { emailUpdates: true, emailFeatures: true, emailBilling: true, emailTips: false, emailPromo: false, pushEnabled: false };
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

  function saveGitHub() {
    localStorage.setItem("github-config", JSON.stringify(githubConfig));
    setGithubSaved(true); setTimeout(() => setGithubSaved(false), 2000);
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
    <div className="flex h-[100dvh] bg-[#0f1011] overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 md:flex`}>
        <Sidebar currentProjectId={null} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex overflow-hidden min-w-0">

        {/* Settings inner nav */}
        <div className="hidden md:flex flex-col w-52 shrink-0 bg-[#111213] border-r border-white/[0.05] overflow-y-auto">
          <div className="px-4 py-3.5 border-b border-white/[0.05] shrink-0">
            <button
              onClick={() => setLocation("/dashboard")}
              className="flex items-center gap-2 text-[12.5px] text-white/40 hover:text-white/65 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>
          </div>

          <div className="flex-1 py-2 px-2.5">
            {(() => {
              type NavGroup = { label: string; items: Array<typeof navItems[number]> };
              const groups: NavGroup[] = [];
              for (const item of navItems) {
                const grpLabel = item.group ?? "";
                const last = groups[groups.length - 1];
                if (!last || last.label !== grpLabel) {
                  groups.push({ label: grpLabel, items: [item] });
                } else {
                  last.items.push(item);
                }
              }
              return groups.map((g, gi) => (
                <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                  {g.label && (
                    <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest px-2 mb-1.5">{g.label}</p>
                  )}
                  {g.items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium transition-all mb-0.5",
                          isActive ? "bg-amber-500/10 text-amber-300" : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                        )}
                      >
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
          {/* Top bar */}
          <div className="flex items-center gap-3 px-5 h-[52px] border-b border-white/[0.05] bg-[#111213]/80 backdrop-blur-sm shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg hover:bg-white/5 text-white/40">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div className="flex items-center gap-1.5 text-[12px] text-white/30">
              <span>Settings</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/15">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span className="text-white/60 font-medium">{pageTitle}</span>
            </div>
          </div>

          {/* Mobile tab bar */}
          <div className="md:hidden flex overflow-x-auto gap-0.5 px-3 py-2 border-b border-white/[0.05] bg-[#111213] shrink-0" style={{ scrollbarWidth: "none" }}>
            {navItems.map((item) => (
              <button key={item.id} onClick={() => setActiveTab(item.id)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium whitespace-nowrap shrink-0 transition-all",
                  activeTab === item.id ? "bg-amber-500/10 text-amber-400" : "text-white/35 hover:text-white/60"
                )}>
                {item.icon}{item.label}
              </button>
            ))}
          </div>

          {/* Content scroll */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-8">

              {/* Profile */}
              {activeTab === "profile" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[18px] font-bold text-white/85">General</h2>
                    <p className="text-[13px] text-white/30 mt-1">Manage your profile and preferences</p>
                  </div>

                  {/* Avatar + info */}
                  <SectionCard>
                    <div className="flex items-center gap-4 p-5">
                      {user?.avatar ? (
                        <img src={user.avatar} className="w-14 h-14 rounded-2xl object-cover shrink-0 ring-1 ring-white/10" alt="avatar" />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl font-bold shrink-0">
                          {user?.name?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                      )}
                      <div>
                        <p className="text-[14px] font-semibold text-white/80">{user?.name}</p>
                        <p className="text-[12px] text-white/35">{user?.email}</p>
                        <span className="inline-flex mt-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 capitalize">
                          {user?.plan ?? "free"}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-white/[0.06] px-5 pb-5 pt-4 space-y-1">
                      <div className="flex items-center justify-between text-[12px] mb-1.5">
                        <span className="text-white/40">Credits used</span>
                        <span className="text-white/60 font-medium">{creditsUsed} / {creditsTotal}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", creditsPercent >= 90 ? "bg-red-500" : creditsPercent >= 70 ? "bg-amber-500" : "bg-emerald-500")}
                          style={{ width: `${Math.min(creditsPercent, 100)}%` }} />
                      </div>
                      <p className="text-[11px] text-white/25">{creditsLeft > 0 ? `${creditsLeft} credits remaining` : "Limit reached"}</p>
                    </div>
                  </SectionCard>

                  {/* Edit fields */}
                  <SectionCard>
                    <div className="p-5 space-y-4">
                      <SettingsInput label="Display name" value={displayName} onChange={setName} placeholder="Your name" />
                      <SettingsInput label="Email" value={user?.email ?? ""} onChange={() => {}} placeholder="" />
                      <div>
                        <label className="block text-[12.5px] font-medium text-white/60 mb-1.5">Language</label>
                        <Select
                          value={language}
                          onChange={setLanguage}
                          options={langOptions}
                        />
                        <p className="text-[11px] text-white/25 mt-1.5">The AI agent will respond in this language</p>
                      </div>
                    </div>
                  </SectionCard>

                  <div className="flex items-center gap-3">
                    <button onClick={handleSave} disabled={updateProfile.isPending}
                      className="bg-amber-500 hover:bg-amber-400 text-black px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-50">
                      {updateProfile.isPending ? "Saving…" : saved ? "✓ Saved!" : "Save changes"}
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/[0.06]">
                    <p className="text-[12px] font-semibold text-red-400 mb-3">Danger zone</p>
                    <button onClick={handleLogout}
                      className="flex items-center gap-2 text-[13px] text-red-400 border border-red-500/25 px-4 py-2.5 rounded-xl hover:bg-red-500/8 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              )}

              {/* My AI */}
              {activeTab === "ai" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[18px] font-bold text-white/85">My AI</h2>
                    <p className="text-[13px] text-white/30 mt-1">Connect your own AI model</p>
                  </div>

                  <SectionCard>
                    <SectionRow
                      label="Enable custom AI"
                      description="Switch between your AI and the platform AI inside chat"
                      right={<Toggle checked={customAI.enabled} onChange={() => setCustomAI((p) => ({ ...p, enabled: !p.enabled }))} />}
                    />
                  </SectionCard>

                  <SectionCard className={cn(!customAI.enabled && "opacity-40 pointer-events-none")}>
                    <div className="p-5 space-y-4">
                      <SettingsInput label="API Key" type="password" value={customAI.apiKey}
                        onChange={(v) => setCustomAI((p) => ({ ...p, apiKey: v }))}
                        placeholder="sk-... or your provider key" mono description="Stored locally — never sent to our servers" />
                      <SettingsInput label="Base URL (optional)" type="url" value={customAI.baseUrl}
                        onChange={(v) => setCustomAI((p) => ({ ...p, baseUrl: v }))}
                        placeholder="https://api.openai.com/v1" />
                      <SettingsInput label="Model" value={customAI.model}
                        onChange={(v) => setCustomAI((p) => ({ ...p, model: v }))}
                        placeholder="gpt-4o, claude-3-5-sonnet, gemini-2.0-flash…" mono />
                    </div>
                  </SectionCard>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={saveCustomAI} className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all">
                      {aiSaved ? "✓ Saved!" : "Save"}
                    </button>
                    <button onClick={testCustomAI} disabled={!customAI.apiKey || aiTesting}
                      className="px-5 py-2.5 rounded-xl text-[13px] font-medium border border-white/10 text-white/60 hover:bg-white/5 transition-all disabled:opacity-40">
                      {aiTesting ? "Testing…" : "Test connection"}
                    </button>
                    {aiTestResult === "ok" && <span className="text-[12px] text-emerald-400 font-medium flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Connected</span>}
                    {aiTestResult === "fail" && <span className="text-[12px] text-red-400 font-medium flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Failed</span>}
                  </div>

                  <div className="flex items-start gap-3 bg-amber-500/6 border border-amber-500/15 rounded-xl p-4">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p className="text-[12px] text-white/40 leading-relaxed">If your AI fails, the platform AI automatically takes over so your work never stops.</p>
                  </div>
                </div>
              )}

              {/* Integrations */}
              {activeTab === "integrations" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-[18px] font-bold text-white/85">Connectors</h2>
                    <p className="text-[13px] text-white/30 mt-1">Connect your tools — the agent can use these in your projects</p>
                  </div>

                  {/* GitHub */}
                  <SectionCard>
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-white/60">
                          <ConnectorIcon id="github" size={15} />
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-white/80">GitHub</p>
                          <p className="text-[11.5px] text-white/30">Push project code to repositories</p>
                        </div>
                      </div>
                      {githubConfig.token && <span className="text-[10.5px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">Connected</span>}
                    </div>
                    <div className="p-5 space-y-3.5">
                      <SettingsInput label="Personal Access Token" type="password" value={githubConfig.token}
                        onChange={(v) => setGithubConfig((p) => ({ ...p, token: v }))}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" mono
                        description="github.com/settings/tokens — needs repo scope" />
                      <SettingsInput label="Default Repository (optional)" value={githubConfig.defaultRepo}
                        onChange={(v) => setGithubConfig((p) => ({ ...p, defaultRepo: v }))}
                        placeholder="username/repository" />
                      <button onClick={saveGitHub} className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl text-[12.5px] font-semibold transition-all">
                        {githubSaved ? "✓ Saved!" : "Save"}
                      </button>
                    </div>
                  </SectionCard>

                  {/* Other connectors */}
                  <div className="space-y-2">
                    {CONNECTORS.filter((c) => c.id !== "github").map((connector) => {
                      const isExp = expandedConnector === connector.id;
                      const isCon = isConnected(connector.id);
                      const cfg = connectors[connector.id] ?? {};
                      return (
                        <SectionCard key={connector.id}>
                          <button className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
                            onClick={() => setExpandedConnector(isExp ? null : connector.id)}>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-white/60">
                                <ConnectorIcon id={connector.id} size={15} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-[13px] font-semibold text-white/75">{connector.name}</p>
                                  <span className="text-[9.5px] bg-white/[0.05] text-white/25 px-1.5 py-0.5 rounded font-medium">{connector.category}</span>
                                </div>
                                <p className="text-[11.5px] text-white/30">{connector.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              {isCon && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">Connected</span>}
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                className={cn("text-white/20 transition-transform", isExp && "rotate-180")}>
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </div>
                          </button>
                          {isExp && (
                            <div className="px-5 pb-5 pt-0 border-t border-white/[0.05] space-y-3.5 pt-4">
                              {connector.fields.map((field) => (
                                <SettingsInput key={field.key} label={field.label}
                                  type={field.secret ? "password" : "text"}
                                  value={cfg[field.key] ?? ""}
                                  onChange={(v) => updateConnectorField(connector.id, field.key, v)}
                                  placeholder={field.placeholder} mono={field.secret} />
                              ))}
                              <button onClick={() => saveConnector(connector.id)}
                                className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl text-[12.5px] font-semibold transition-all">
                                {connectorSaved === connector.id ? "✓ Saved!" : "Save"}
                              </button>
                            </div>
                          )}
                        </SectionCard>
                      );
                    })}
                  </div>
                  <div className="flex items-start gap-3 bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/25 shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p className="text-[12px] text-white/25 leading-relaxed">All credentials stored locally — never on our servers.</p>
                  </div>
                </div>
              )}

              {/* Subscription */}
              {activeTab === "subscription" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[18px] font-bold text-white/85">Subscription</h2>
                    <p className="text-[13px] text-white/30 mt-1">Manage your plan and credits</p>
                  </div>
                  <SectionCard>
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-[11.5px] text-white/30 mb-0.5">Current plan</p>
                          <p className="text-[20px] font-bold text-white/80 capitalize">{user?.plan ?? "Free"}</p>
                        </div>
                        <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-[11px] font-semibold capitalize">{user?.plan ?? "free"}</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="text-white/40">Credits used</span>
                          <span className="font-semibold text-white/65">{creditsUsed} / {creditsTotal}</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", creditsPercent >= 90 ? "bg-red-500" : creditsPercent >= 70 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min(creditsPercent, 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-white/25">
                          <span>{creditsLeft} left</span><span>{creditsPercent}% used</span>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <div className="flex items-center justify-end gap-3">
                    <span className="text-[12.5px] text-white/30">Monthly</span>
                    <Toggle checked={billingYearly} onChange={() => setBillingYearly((v) => !v)} />
                    <span className="text-[12.5px] text-white/30 flex items-center gap-1.5">Yearly <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded-full">-20%</span></span>
                  </div>

                  <div className="space-y-3">
                    {PLANS.map((plan) => {
                      const price = billingYearly ? Math.round(plan.price * 0.8) : plan.price;
                      const isCurrent = user?.plan === plan.id || (plan.id === "free" && !user?.plan);
                      return (
                        <div key={plan.id} className={cn("border-2 rounded-2xl p-5 transition-all",
                          isCurrent ? "border-amber-500/30 bg-amber-500/5" :
                          plan.highlight ? "border-white/10 bg-white/[0.02]" : "border-white/[0.06]")}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="font-bold text-white/80">{plan.name}</h3>
                                {plan.highlight && !isCurrent && <span className="text-[10px] bg-amber-500 text-black px-2 py-0.5 rounded-full font-bold">Popular</span>}
                                {isCurrent && <span className="text-[10px] border border-amber-500/40 text-amber-400 px-2 py-0.5 rounded-full">Current</span>}
                              </div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-[22px] font-bold text-white/80">${price}</span>
                                <span className="text-white/30 text-[13px]">/mo</span>
                              </div>
                            </div>
                            {!isCurrent && (
                              <button className={cn("px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-all shrink-0",
                                plan.highlight ? "bg-amber-500 hover:bg-amber-400 text-black" : "border border-white/10 text-white/50 hover:bg-white/5")}>
                                Upgrade
                              </button>
                            )}
                          </div>
                          <ul className="mt-3 space-y-1.5">
                            {plan.features.map((f) => (
                              <li key={f} className="flex items-center gap-2 text-[12.5px] text-white/40">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
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

              {/* Appearance */}
              {activeTab === "appearance" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[18px] font-bold text-white/85">Appearance</h2>
                    <p className="text-[13px] text-white/30 mt-1">Customize how the app looks</p>
                  </div>
                  <SectionCard>
                    <div className="p-5">
                      <p className="text-[13px] font-semibold text-white/60 mb-4">Theme</p>
                      <div className="grid grid-cols-3 gap-2.5">
                        {[
                          { id: "light", label: "Light", preview: "bg-white border-white/20" },
                          { id: "dark", label: "Dark", preview: "bg-[#111] border-white/10" },
                          { id: "system", label: "System", preview: "bg-gradient-to-br from-white to-[#111] border-white/15" },
                        ].map((t) => (
                          <button key={t.id} onClick={() => setTheme(t.id)}
                            className={cn("flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                              theme === t.id ? "border-amber-500/50 bg-amber-500/5" : "border-white/[0.06] hover:border-white/15")}>
                            <div className={cn("w-full h-8 rounded-lg border", t.preview)} />
                            <span className={cn("text-[11.5px] font-medium", theme === t.id ? "text-amber-400" : "text-white/40")}>{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                  <SectionCard>
                    <div className="p-5">
                      <p className="text-[13px] font-semibold text-white/60 mb-4">Chat font size</p>
                      <div className="flex gap-2">
                        {["Small", "Medium", "Large"].map((s) => (
                          <button key={s} onClick={() => setFontSize(s)}
                            className={cn("flex-1 py-2 rounded-xl border-2 text-[13px] font-medium transition-all",
                              fontSize === s ? "border-amber-500/40 bg-amber-500/8 text-amber-400" : "border-white/[0.06] text-white/40 hover:border-white/15")}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* Notifications */}
              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[18px] font-bold text-white/85">Notifications</h2>
                    <p className="text-[13px] text-white/30 mt-1">Choose what you'd like to be notified about</p>
                  </div>
                  <SectionCard>
                    <div className="px-5 py-3.5 border-b border-white/[0.06]">
                      <p className="text-[12.5px] font-semibold text-white/50">Email notifications</p>
                    </div>
                    {[
                      { key: "emailUpdates", label: "Platform updates", desc: "Important changes and new releases" },
                      { key: "emailFeatures", label: "New features", desc: "Tips and what's new" },
                      { key: "emailBilling", label: "Billing", desc: "Receipts, renewals, and credit alerts" },
                      { key: "emailTips", label: "Tips & tutorials", desc: "Guides to help you get more" },
                      { key: "emailPromo", label: "Promotions", desc: "Special offers and discounts" },
                    ].map(({ key, label, desc }) => (
                      <SectionRow key={key} label={label} description={desc} right={<Toggle checked={notifications[key]} onChange={() => toggleNotif(key)} />} />
                    ))}
                  </SectionCard>
                  <SectionCard>
                    <SectionRow label="Browser push" description="Get notified when your agent finishes, even when the tab is in the background"
                      right={<Toggle checked={notifications.pushEnabled} onChange={() => toggleNotif("pushEnabled")} />} border={false} />
                  </SectionCard>
                </div>
              )}

              {/* Shortcuts */}
              {activeTab === "shortcuts" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[18px] font-bold text-white/85">Keyboard shortcuts</h2>
                    <p className="text-[13px] text-white/30 mt-1">Speed up your workflow</p>
                  </div>
                  <SectionCard>
                    {SHORTCUTS.map((s, i) => (
                      <div key={i} className={cn("flex items-center justify-between px-5 py-3.5", i > 0 && "border-t border-white/[0.05]")}>
                        <span className="text-[13px] text-white/60">{s.desc}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {s.keys.map((k, j) => (
                            <span key={j} className="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] font-mono text-white/40">{k}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </SectionCard>
                  <div>
                    <p className="text-[12.5px] font-semibold text-white/40 mb-3">Slash commands</p>
                    <SectionCard>
                      {["/plan","/fix","/explain","/deploy","/optimize","/test","/document","/refactor","/debug","/security"].map((cmd, i) => {
                        const descs: Record<string, string> = { "/plan": "Plan before building", "/fix": "Fix all bugs", "/explain": "Explain the codebase", "/deploy": "Deploy to Vercel", "/optimize": "Optimize performance", "/test": "Write tests", "/document": "Add docs", "/refactor": "Refactor structure", "/debug": "Step-by-step debug", "/security": "Security audit" };
                        return (
                          <div key={i} className={cn("flex items-center gap-4 px-5 py-3", i > 0 && "border-t border-white/[0.05]")}>
                            <code className="text-[11.5px] font-mono text-amber-400 bg-amber-500/8 border border-amber-500/15 px-2 py-0.5 rounded shrink-0">{cmd}</code>
                            <span className="text-[12.5px] text-white/35">{descs[cmd]}</span>
                          </div>
                        );
                      })}
                    </SectionCard>
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
