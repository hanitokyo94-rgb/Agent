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
import { cn } from "@/lib/utils";

type SettingsTab = "profile" | "subscription" | "appearance" | "notifications" | "shortcuts" | "ai" | "integrations";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    credits: 20,
    agentPower: { label: "Lite", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", iterations: 10 },
    features: ["20 monthly credits", "Basic AI models", "JSON storage", "Community support"],
  },
  {
    id: "build",
    name: "Build",
    price: 25,
    credits: 100,
    agentPower: { label: "Economy", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", iterations: 25 },
    features: ["100 monthly credits", "Advanced AI models", "Priority responses", "Email support", "Credits never expire"],
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 79,
    credits: 500,
    agentPower: { label: "Power", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", iterations: 50 },
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

interface CustomAIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

interface GitHubConfig {
  token: string;
  defaultRepo: string;
}

interface ConnectorConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
  category: string;
}

const CONNECTORS: ConnectorConfig[] = [
  {
    id: "github",
    name: "GitHub",
    icon: "github",
    description: "Push & sync project code to GitHub repositories",
    category: "Development",
    fields: [
      { key: "token", label: "Personal Access Token", placeholder: "ghp_...", secret: true },
      { key: "defaultRepo", label: "Default Repository", placeholder: "username/repository" },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    icon: "stripe",
    description: "Accept payments and manage subscriptions",
    category: "Payments",
    fields: [
      { key: "secretKey", label: "Secret Key", placeholder: "sk_live_...", secret: true },
      { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_...", secret: true },
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    icon: "shopify",
    description: "Build e-commerce apps with Shopify data",
    category: "E-commerce",
    fields: [
      { key: "shopDomain", label: "Shop Domain", placeholder: "your-shop.myshopify.com" },
      { key: "accessToken", label: "Access Token", placeholder: "shpat_...", secret: true },
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    icon: "gmail",
    description: "Send emails and manage inbox via Gmail API",
    category: "Communication",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "...apps.googleusercontent.com" },
      { key: "clientSecret", label: "Client Secret", placeholder: "GOCSPX-...", secret: true },
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: "telegram",
    description: "Build Telegram bots with the Bot API",
    category: "Messaging",
    fields: [
      { key: "botToken", label: "Bot Token", placeholder: "123456789:AAF...", secret: true },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "whatsapp",
    description: "Send WhatsApp messages via the Cloud API",
    category: "Messaging",
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "1234567890" },
      { key: "accessToken", label: "Access Token", placeholder: "EAABs...", secret: true },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "openai",
    description: "Use OpenAI APIs directly in your projects",
    category: "AI",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-proj-...", secret: true },
    ],
  },
  {
    id: "supabase",
    name: "Supabase",
    icon: "supabase",
    description: "Postgres database, auth, and realtime subscriptions",
    category: "Database",
    fields: [
      { key: "projectUrl", label: "Project URL", placeholder: "https://xxxx.supabase.co" },
      { key: "anonKey", label: "Anon Key", placeholder: "eyJhbGci...", secret: true },
      { key: "serviceKey", label: "Service Key", placeholder: "eyJhbGci...", secret: true },
    ],
  },
];

function ConnectorIcon({ id }: { id: string }) {
  const icons: Record<string, React.ReactNode> = {
    github: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    ),
    stripe: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#635BFF]">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
      </svg>
    ),
    shopify: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#96BF48]">
        <path d="M15.337 23.979l7.216-1.561s-2.6-17.579-2.617-17.69c-.017-.108-.109-.18-.2-.18-.09 0-1.741-.108-1.741-.108s-1.165-1.147-1.291-1.273v-.018l-.982 20.83zM12.198.805c-.018 0-.09.018-.108.018-.128.018-1.057.327-2.24.672-.763-2.2-2.113-4.217-4.48-4.217h-.2C4.53-3.72 3.838-4 3.22-4 -1.434-4-3.647 1.822-4.282 4.73l-3.173.98c-.98.308-1.018.345-1.145 1.272L-12 24.979l21.236 3.662L12.198.805zm-3.87 1.635c-1.056.327-2.24.69-3.443 1.055.654-2.528 1.893-3.75 2.986-4.217.29.78.457 1.87.457 3.162zm-1.893-.835C5.403.987 4.365 2.042 3.585 3.932a23.54 23.54 0 01-.942.29C3.439.459 5.2-.58 6.435-.58v1.185zm3.743-.563c1.056-.018 2.004.835 2.494 2.128l-4.88 1.509c.562-2.076 1.435-3.637 2.386-3.637z"/>
      </svg>
    ),
    gmail: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.909v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.909 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
      </svg>
    ),
    telegram: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#2AABEE]">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    ),
    whatsapp: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#25D366]">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
    openai: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.372L15.115 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.403-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
      </svg>
    ),
    supabase: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#3ECF8E]">
        <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.003.509c.015.986 1.26 1.41 1.874.637l9.262-11.652c1.093-1.375.113-3.403-1.646-3.403h-9.58l-.001-.51z"/>
      </svg>
    ),
  };
  return <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-muted">{icons[id] ?? <span className="text-lg">🔌</span>}</span>;
}

function loadCustomAI(): CustomAIConfig {
  try {
    const raw = localStorage.getItem("custom-ai-config");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { baseUrl: "", apiKey: "", model: "", enabled: false };
}

function loadGitHubConfig(): GitHubConfig {
  try {
    const raw = localStorage.getItem("github-config");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { token: "", defaultRepo: "" };
}

function loadConnectors(): Record<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem("connectors-config");
    if (raw) return JSON.parse(raw);
  } catch {}
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

  // Custom AI state
  const [customAI, setCustomAI] = useState<CustomAIConfig>(loadCustomAI);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<"ok" | "fail" | null>(null);

  // GitHub config state
  const [githubConfig, setGithubConfig] = useState<GitHubConfig>(loadGitHubConfig);
  const [githubSaved, setGithubSaved] = useState(false);

  // Connectors state
  const [connectors, setConnectors] = useState<Record<string, Record<string, string>>>(loadConnectors);
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [connectorSaved, setConnectorSaved] = useState<string | null>(null);

  // Appearance state
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("theme") ?? "system");
  const [fontSize, setFontSize] = useState<string>(() => localStorage.getItem("font-size") ?? "Medium");

  // Notifications state
  const [notifications, setNotifications] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("notifications-config");
      if (raw) return JSON.parse(raw);
    } catch {}
    return { emailUpdates: true, emailFeatures: true, emailBilling: true, emailTips: false, emailPromo: false, pushEnabled: false };
  });
  const [notifSaved, setNotifSaved] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else if (theme === "light") root.classList.remove("dark");
    else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) root.classList.add("dark");
      else root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const sizes: Record<string, string> = { Small: "13px", Medium: "15px", Large: "17px" };
    document.documentElement.style.setProperty("--chat-font-size", sizes[fontSize] ?? "15px");
    localStorage.setItem("font-size", fontSize);
  }, [fontSize]);

  function saveNotifications(updated: Record<string, boolean>) {
    setNotifications(updated);
    localStorage.setItem("notifications-config", JSON.stringify(updated));
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2000);
  }

  function toggleNotif(key: string) {
    const updated = { ...notifications, [key]: !notifications[key] };
    saveNotifications(updated);
  }

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

  function saveCustomAI() {
    localStorage.setItem("custom-ai-config", JSON.stringify(customAI));
    setAiSaved(true);
    setAiTestResult(null);
    setTimeout(() => setAiSaved(false), 2000);
  }

  async function testCustomAI() {
    if (!customAI.apiKey) return;
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const baseURL = customAI.baseUrl || "https://api.openai.com/v1";
      const model = customAI.model || "gpt-4o-mini";
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${customAI.apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Say OK" }], max_tokens: 5 }),
      });
      setAiTestResult(res.ok ? "ok" : "fail");
    } catch {
      setAiTestResult("fail");
    }
    setAiTesting(false);
  }

  function saveGitHub() {
    localStorage.setItem("github-config", JSON.stringify(githubConfig));
    setGithubSaved(true);
    setTimeout(() => setGithubSaved(false), 2000);
  }

  function saveConnector(id: string) {
    const updated = { ...connectors };
    localStorage.setItem("connectors-config", JSON.stringify(updated));
    setConnectorSaved(id);
    setTimeout(() => setConnectorSaved(null), 2000);
  }

  function updateConnectorField(id: string, key: string, value: string) {
    setConnectors((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), [key]: value },
    }));
  }

  function isConnectorConnected(id: string): boolean {
    const cfg = connectors[id];
    if (!cfg) return false;
    const connector = CONNECTORS.find((c) => c.id === id);
    if (!connector) return false;
    return connector.fields.some((f) => cfg[f.key]?.trim());
  }

  function disconnectConnector(id: string) {
    setConnectors((prev) => { const n = { ...prev }; delete n[id]; return n; });
    const updated = { ...connectors };
    delete updated[id];
    localStorage.setItem("connectors-config", JSON.stringify(updated));
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
      id: "ai",
      label: "My AI",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2V4a2 2 0 012-2zm0 16a2 2 0 012 2v2a2 2 0 01-4 0v-2a2 2 0 012-2zM2 12a2 2 0 012-2h2a2 2 0 010 4H4a2 2 0 01-2-2zm16 0a2 2 0 012-2h2a2 2 0 010 4h-2a2 2 0 01-2-2z"/>
        </svg>
      ),
    },
    {
      id: "integrations",
      label: "Connectors",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
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
      id: "notifications",
      label: "Notifications",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
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

                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={user?.email ?? ""}
                    readOnly
                    className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm opacity-50 cursor-not-allowed"
                  />
                </div>

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

            {/* ── My AI Tab ── */}
            {activeTab === "ai" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-0.5">My AI</h2>
                  <p className="text-sm text-muted-foreground">Connect your own AI model — use it alongside or instead of the platform AI</p>
                </div>

                {/* Enable toggle */}
                <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Enable custom AI</p>
                    <p className="text-xs text-muted-foreground mt-0.5">When enabled, you can switch between your AI and the platform AI inside the chat</p>
                  </div>
                  <button
                    onClick={() => setCustomAI((p) => ({ ...p, enabled: !p.enabled }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative shrink-0",
                      customAI.enabled ? "bg-primary" : "bg-muted border border-border"
                    )}
                  >
                    <div
                      className="w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm"
                      style={{ transform: customAI.enabled ? "translateX(24px)" : "translateX(4px)" }}
                    />
                  </button>
                </div>

                <div className={cn("space-y-4 transition-opacity", !customAI.enabled && "opacity-40 pointer-events-none")}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <input
                      type="password"
                      value={customAI.apiKey}
                      onChange={(e) => setCustomAI((p) => ({ ...p, apiKey: e.target.value }))}
                      placeholder="sk-... or your provider's key"
                      className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Stored locally in your browser — never sent to our servers</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Base URL <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <input
                      type="url"
                      value={customAI.baseUrl}
                      onChange={(e) => setCustomAI((p) => ({ ...p, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1  (or OpenRouter, Together, etc.)"
                      className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Model</label>
                    <input
                      type="text"
                      value={customAI.model}
                      onChange={(e) => setCustomAI((p) => ({ ...p, model: e.target.value }))}
                      placeholder="gpt-4o, claude-3-5-sonnet, gemini-2.0-flash..."
                      className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={saveCustomAI}
                      className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-all active:scale-95"
                    >
                      {aiSaved ? "✓ Saved!" : "Save"}
                    </button>
                    <button
                      onClick={testCustomAI}
                      disabled={!customAI.apiKey || aiTesting}
                      className="px-6 py-2.5 rounded-xl text-sm font-medium border border-border hover:bg-muted transition-all active:scale-95 disabled:opacity-40"
                    >
                      {aiTesting ? "Testing..." : "Test connection"}
                    </button>
                    {aiTestResult === "ok" && (
                      <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        Connected
                      </span>
                    )}
                    {aiTestResult === "fail" && (
                      <span className="text-xs text-destructive font-medium flex items-center gap-1">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Connection failed
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-muted/50 border border-border/50 rounded-2xl p-4">
                  <p className="text-xs font-medium mb-2">Compatible providers</p>
                  <div className="flex flex-wrap gap-2">
                    {["OpenAI", "Anthropic (via OpenRouter)", "Google Gemini (via OpenRouter)", "Together AI", "Groq", "Mistral", "DeepSeek", "Ollama (local)"].map((p) => (
                      <span key={p} className="text-xs px-2.5 py-1 rounded-lg bg-background border border-border text-muted-foreground">{p}</span>
                    ))}
                  </div>
                </div>

                {/* Auto-fallback note */}
                <div className="flex items-start gap-2.5 bg-primary/5 border border-primary/20 rounded-xl p-3.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    If your AI fails or is unreachable, the platform AI automatically takes over so your work never stops.
                  </p>
                </div>
              </div>
            )}

            {/* ── Integrations/Connectors Tab ── */}
            {activeTab === "integrations" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-0.5">Connectors</h2>
                  <p className="text-sm text-muted-foreground">Connect your tools — the agent can use these in your projects</p>
                </div>

                {/* GitHub special card (also used for push) */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                    <div className="flex items-center gap-3">
                      <ConnectorIcon id="github" />
                      <div>
                        <p className="text-sm font-semibold">GitHub</p>
                        <p className="text-xs text-muted-foreground">Push project code to your GitHub repos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {githubConfig.token && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-medium">Connected</span>
                      )}
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Personal Access Token</label>
                      <input
                        type="password"
                        value={githubConfig.token}
                        onChange={(e) => setGithubConfig((p) => ({ ...p, token: e.target.value }))}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Generate at github.com/settings/tokens — needs <code className="bg-muted px-1 rounded">repo</code> scope
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Default Repository <span className="font-normal">(optional)</span></label>
                      <input
                        type="text"
                        value={githubConfig.defaultRepo}
                        onChange={(e) => setGithubConfig((p) => ({ ...p, defaultRepo: e.target.value }))}
                        placeholder="username/repository"
                        className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                      />
                    </div>
                    <button
                      onClick={saveGitHub}
                      className="px-5 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all active:scale-95"
                    >
                      {githubSaved ? "✓ Saved!" : "Save"}
                    </button>
                  </div>
                </div>

                {/* Other connectors */}
                <div className="space-y-3">
                  {CONNECTORS.filter((c) => c.id !== "github").map((connector) => {
                    const isExpanded = expandedConnector === connector.id;
                    const isConnected = isConnectorConnected(connector.id);
                    const cfg = connectors[connector.id] ?? {};

                    return (
                      <div key={connector.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
                          onClick={() => setExpandedConnector(isExpanded ? null : connector.id)}
                        >
                          <div className="flex items-center gap-3">
                            <ConnectorIcon id={connector.id} />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold">{connector.name}</p>
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{connector.category}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{connector.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isConnected && (
                              <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-medium">Connected</span>
                            )}
                            <svg
                              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              className={cn("text-muted-foreground transition-transform", isExpanded && "rotate-180")}
                            >
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-5 pb-5 pt-0 space-y-3 border-t border-border/50">
                            <div className="pt-4 space-y-3">
                              {connector.fields.map((field) => (
                                <div key={field.key}>
                                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">{field.label}</label>
                                  <input
                                    type={field.secret ? "password" : "text"}
                                    value={cfg[field.key] ?? ""}
                                    onChange={(e) => updateConnectorField(connector.id, field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all font-mono"
                                  />
                                </div>
                              ))}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => { saveConnector(connector.id); }}
                                  className="px-5 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all active:scale-95"
                                >
                                  {connectorSaved === connector.id ? "✓ Saved!" : "Save"}
                                </button>
                                {isConnected && (
                                  <button
                                    onClick={() => disconnectConnector(connector.id)}
                                    className="px-4 py-2 rounded-xl text-sm text-destructive border border-destructive/20 hover:bg-destructive/5 transition-colors"
                                  >
                                    Disconnect
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="bg-muted/50 border border-border/50 rounded-2xl p-4 flex items-start gap-3">
                  <span className="text-base shrink-0">🔐</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    All credentials are stored locally in your browser and sent only when the agent needs them. They are never stored on our servers.
                  </p>
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

                <div className="flex items-center justify-end gap-3">
                  <span className="text-sm text-muted-foreground">Monthly</span>
                  <button
                    onClick={() => setBillingYearly(!billingYearly)}
                    className={cn(
                      "w-11 h-6 rounded-full transition-colors relative shrink-0",
                      billingYearly ? "bg-primary" : "bg-muted border border-border"
                    )}
                  >
                    <div className="w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm"
                      style={{ transform: billingYearly ? "translateX(20px)" : "translateX(4px)" }} />
                  </button>
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    Yearly
                    <span className="text-xs text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded-full">-20%</span>
                  </span>
                </div>

                <div className="space-y-3">
                  {PLANS.map((plan) => {
                    const price = billingYearly ? Math.round(plan.price * 0.8) : plan.price;
                    const isCurrent = user?.plan === plan.id || (plan.id === "free" && !user?.plan);
                    return (
                      <div
                        key={plan.id}
                        className={cn(
                          "border-2 rounded-2xl p-4 sm:p-5 transition-all",
                          isCurrent ? "border-primary bg-primary/5" :
                          plan.highlight ? "border-primary/30 bg-primary/2" : "border-border"
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
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0", plan.agentPower.color)}>
                                ⚡ Agent {plan.agentPower.label}
                              </span>
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
                              plan.highlight ? "bg-foreground text-background hover:opacity-90" : "border border-border hover:bg-muted"
                            )}>
                              Upgrade
                            </button>
                          )}
                        </div>
                        {/* Agent Power bar */}
                        <div className="mt-3 mb-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                            <span className="font-medium">Agent Power</span>
                            <span>{plan.agentPower.iterations} iterations / request</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", {
                                "bg-slate-400": plan.agentPower.label === "Lite",
                                "bg-blue-500": plan.agentPower.label === "Economy",
                                "bg-violet-500": plan.agentPower.label === "Power",
                              })}
                              style={{ width: `${(plan.agentPower.iterations / 50) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                            <span>Lite</span><span>Economy</span><span>Power</span>
                          </div>
                        </div>
                        <ul className="mt-3 space-y-2">
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

                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-sm font-medium mb-4">Theme</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "light", label: "Light", bg: "bg-white", border: "border-gray-200" },
                      { id: "dark", label: "Dark", bg: "bg-gray-900", border: "border-gray-700" },
                      { id: "system", label: "System", bg: "bg-gradient-to-br from-white to-gray-900", border: "border-gray-400" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={cn(
                          "flex flex-col items-center gap-2.5 p-3 rounded-xl border-2 transition-all active:scale-95",
                          theme === t.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        <div className={cn("w-full h-10 rounded-lg border", t.bg, t.border)} />
                        <span className={cn("text-xs font-medium", theme === t.id && "text-primary")}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {theme === "system" ? "Follows your device's display settings" : theme === "dark" ? "Dark mode is active" : "Light mode is active"}
                  </p>
                </div>

                <div className="bg-card border border-border rounded-2xl p-5">
                  <p className="text-sm font-medium mb-4">Chat font size</p>
                  <div className="flex gap-2">
                    {["Small", "Medium", "Large"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setFontSize(s)}
                        className={cn(
                          "flex-1 py-2 rounded-xl border-2 transition-all active:scale-95",
                          fontSize === s
                            ? "border-primary bg-primary/5 text-primary font-medium text-sm"
                            : "border-border hover:border-primary/30 text-sm"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">Changes the font size in the chat area</p>
                </div>
              </div>
            )}

            {/* ── Notifications Tab ── */}
            {activeTab === "notifications" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-0.5">Notifications</h2>
                  <p className="text-sm text-muted-foreground">Choose what you'd like to be notified about</p>
                </div>

                {/* Email notifications */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                        <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/>
                      </svg>
                      <p className="text-sm font-semibold">Email notifications</p>
                    </div>
                  </div>
                  <div className="divide-y divide-border/50">
                    {[
                      { key: "emailUpdates", label: "Platform updates", desc: "Important changes and new releases" },
                      { key: "emailFeatures", label: "New features", desc: "Tips and what's new in AI Builder" },
                      { key: "emailBilling", label: "Subscription & billing", desc: "Receipts, renewal reminders, and credit alerts" },
                      { key: "emailTips", label: "Tips & tutorials", desc: "Guides to help you get more from the platform" },
                      { key: "emailPromo", label: "Promotional emails", desc: "Special offers and discounts" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between px-5 py-4 gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                        <button
                          onClick={() => toggleNotif(key)}
                          className={cn(
                            "w-11 h-6 rounded-full transition-colors relative shrink-0",
                            notifications[key] ? "bg-primary" : "bg-muted border border-border"
                          )}
                        >
                          <div
                            className="w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm"
                            style={{ transform: notifications[key] ? "translateX(20px)" : "translateX(4px)" }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Push notifications */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                      </svg>
                      <p className="text-sm font-semibold">Push notifications</p>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">Browser & mobile push</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Get notified when your agent finishes a task, even when the tab is in the background</p>
                      </div>
                      <button
                        onClick={() => toggleNotif("pushEnabled")}
                        className={cn(
                          "w-11 h-6 rounded-full transition-colors relative shrink-0",
                          notifications.pushEnabled ? "bg-primary" : "bg-muted border border-border"
                        )}
                      >
                        <div
                          className="w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-sm"
                          style={{ transform: notifications.pushEnabled ? "translateX(20px)" : "translateX(4px)" }}
                        />
                      </button>
                    </div>
                    {notifications.pushEnabled && (
                      <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-xl p-3">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        Allow notifications in your browser settings to receive push alerts on this device.
                      </div>
                    )}
                  </div>
                </div>

                {notifSaved && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Preferences saved
                  </div>
                )}
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
                    <div key={i} className={cn("flex items-center justify-between px-5 py-3.5", i > 0 && "border-t border-border/60")}>
                      <span className="text-sm text-foreground">{s.desc}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, j) => (
                          <span key={j} className="px-2 py-1 rounded-md bg-muted border border-border text-[11px] font-mono font-medium text-muted-foreground">{k}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3">Slash commands</h3>
                  <div className="bg-card border border-border rounded-2xl overflow-hidden">
                    {[
                      { cmd: "/plan", desc: "Plan before building" },
                      { cmd: "/fix", desc: "Fix all bugs and errors" },
                      { cmd: "/explain", desc: "Explain the codebase" },
                      { cmd: "/deploy", desc: "Deploy to Vercel" },
                      { cmd: "/optimize", desc: "Optimize performance" },
                      { cmd: "/test", desc: "Write tests" },
                      { cmd: "/document", desc: "Add docs and README" },
                      { cmd: "/refactor", desc: "Refactor structure" },
                      { cmd: "/debug", desc: "Step-by-step debugging" },
                      { cmd: "/security", desc: "Security audit" },
                    ].map((item, i) => (
                      <div key={i} className={cn("flex items-center gap-4 px-5 py-3", i > 0 && "border-t border-border/60")}>
                        <code className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">{item.cmd}</code>
                        <span className="text-sm text-muted-foreground">{item.desc}</span>
                      </div>
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
