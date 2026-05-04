import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useRegister, useLogin, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { detectLanguage, detectCountry } from "@/lib/utils";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80&auto=format&fit=crop";

const LOGOS = [
  { name: "Vercel", svg: <svg viewBox="0 0 76 65" fill="currentColor" className="h-4"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg> },
  { name: "OpenAI", svg: <span className="font-semibold text-sm tracking-tight">OpenAI</span> },
  { name: "GitHub", svg: <svg viewBox="0 0 98 96" className="h-4 fill-current"><path d="M49 .12C21.94.12 0 22.06 0 49.12c0 21.7 14.07 40.12 33.59 46.62 2.46.45 3.35-1.07 3.35-2.37 0-1.17-.04-4.27-.06-8.38-13.68 2.97-16.57-6.6-16.57-6.6-2.24-5.68-5.46-7.19-5.46-7.19-4.46-3.05.34-2.99.34-2.99 4.93.35 7.53 5.07 7.53 5.07 4.38 7.5 11.49 5.33 14.29 4.08.44-3.17 1.71-5.34 3.12-6.56-10.91-1.24-22.38-5.45-22.38-24.26 0-5.36 1.91-9.74 5.06-13.17-.51-1.24-2.19-6.23.48-13 0 0 4.12-1.32 13.5 5.04A47.03 47.03 0 0149 27.83c4.17.02 8.37.56 12.29 1.65 9.35-6.36 13.46-5.04 13.46-5.04 2.68 6.77 1 11.76.49 13 3.15 3.43 5.05 7.81 5.05 13.17 0 18.86-11.49 23.01-22.43 24.23 1.76 1.52 3.33 4.51 3.33 9.09 0 6.56-.06 11.86-.06 13.47 0 1.31.88 2.84 3.38 2.36C83.96 89.23 98 70.82 98 49.12 98 22.06 76.06.12 49 .12z"/></svg> },
  { name: "Stripe", svg: <span className="font-semibold text-sm tracking-tight">stripe</span> },
  { name: "Supabase", svg: <span className="font-semibold text-sm tracking-tight">supabase</span> },
  { name: "Next.js", svg: <span className="font-semibold text-sm tracking-tight">Next.js</span> },
];

export function Auth() {
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const register = useRegister();
  const login = useLogin();
  const isPending = register.isPending || login.isPending;

  function openModal(m: "login" | "register") {
    setMode(m);
    setError("");
    setShowModal(true);
  }

  function handleSuccess(token: string, onboardingCompleted: boolean) {
    localStorage.setItem("token", token);
    setAuthTokenGetter(() => localStorage.getItem("token"));
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setShowModal(false);
    setLocation(!onboardingCompleted ? "/onboarding" : "/dashboard");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const country = detectCountry();
    const language = detectLanguage();
    if (mode === "register") {
      register.mutate(
        { data: { name, email, password, country: country ?? undefined, language } },
        {
          onSuccess: (res) => handleSuccess(res.token, res.user.onboardingCompleted),
          onError: (err: any) => setError(err?.data?.error ?? "Registration failed"),
        }
      );
    } else {
      login.mutate(
        { data: { email, password } },
        {
          onSuccess: (res) => handleSuccess(res.token, res.user.onboardingCompleted),
          onError: (err: any) => setError(err?.data?.error ?? "Login failed"),
        }
      );
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#f5f4ef] flex flex-col font-sans">
      {/* ── Navbar ── */}
      <nav className="flex items-center justify-between px-8 h-14 bg-[#f5f4ef]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <Logo className="w-6 h-6 text-[#1a1a1a]" />
          <span className="font-semibold text-[15px] text-[#1a1a1a] tracking-tight">AI Builder</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => openModal("login")}
            className="text-[14px] text-[#555] hover:text-[#111] transition-colors px-4 py-2 rounded-md"
          >
            Sign in
          </button>
          <button
            onClick={() => openModal("register")}
            className="text-[14px] bg-[#1a1a1a] text-white px-5 py-2 rounded-md font-medium hover:bg-[#333] transition-colors"
          >
            Get started free
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden mx-4 mb-0 rounded-2xl" style={{ height: "min(520px, 60dvh)" }}>
        {/* Background image */}
        <img
          src={HERO_IMAGE}
          alt="Mountain landscape"
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="eager"
        />
        {/* Subtle dark overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/10" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-end h-full px-8 pb-10">
          {/* Stat */}
          <p className="text-white/80 text-sm mb-4 font-normal">
            Join <strong className="text-white font-semibold">thousands of builders</strong> shipping projects with AI.
          </p>

          {/* Headline */}
          <h1 className="text-white font-bold leading-[1.08] tracking-tight text-[clamp(2rem,5vw,3.5rem)] max-w-2xl mb-6">
            Most AI tools help you build faster.<br />
            None of them tell you what to build.
          </h1>

          {/* CTAs */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => openModal("register")}
              className="bg-[#1a1a1a] text-white text-[14px] font-medium px-6 py-2.5 rounded-md hover:bg-[#333] transition-colors"
            >
              Start free
            </button>
            <button
              onClick={() => openModal("login")}
              className="bg-white/15 backdrop-blur text-white text-[14px] font-medium px-6 py-2.5 rounded-md border border-white/20 hover:bg-white/25 transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>

      {/* ── Logo bar ── */}
      <div className="flex items-center justify-center gap-8 flex-wrap px-8 py-8 border-b border-[#e5e3dc]">
        {LOGOS.map((l) => (
          <div key={l.name} className="text-[#888] flex items-center">
            {l.svg}
          </div>
        ))}
      </div>

      {/* ── Feature section ── */}
      <div className="max-w-5xl mx-auto px-8 py-16 w-full">
        <h2 className="text-[clamp(2rem,4vw,3rem)] font-bold text-[#1a1a1a] leading-tight mb-16">
          The thinking.<br />The building.
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: "🧠",
              title: "Understands your idea",
              desc: "Describe what you want to build in plain language. The AI figures out the architecture, stack, and implementation plan.",
            },
            {
              icon: "⚡",
              title: "Writes & runs the code",
              desc: "The agent writes TypeScript, installs packages, runs shell commands, and fixes errors — all automatically.",
            },
            {
              icon: "🚀",
              title: "Deploys instantly",
              desc: "When done, the project is deployed to a live URL with one command. Redeploy on every change automatically.",
            },
          ].map((f) => (
            <div key={f.title} className="space-y-3">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="text-[17px] font-semibold text-[#1a1a1a]">{f.title}</h3>
              <p className="text-[14px] text-[#666] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap gap-2">
          {["TypeScript APIs", "React Apps", "Discord Bots", "CLI Tools", "Web Scrapers", "AI Agents", "REST APIs", "Full-stack Apps"].map((t) => (
            <span key={t} className="text-[13px] text-[#555] bg-[#eae9e3] px-3 py-1.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-[#e5e3dc] px-8 py-6 flex items-center justify-between text-[13px] text-[#888]">
        <div className="flex items-center gap-2">
          <Logo className="w-4 h-4 text-[#888]" />
          <span>AI Builder</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="hover:text-[#333] transition-colors">Terms</a>
          <a href="#" className="hover:text-[#333] transition-colors">Privacy</a>
        </div>
      </div>

      {/* ── Auth Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowModal(false)} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[380px] mx-4 z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Top accent */}
            <div className="h-1 bg-[#1a1a1a]" />

            <div className="px-8 py-8">
              {/* Close */}
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-[#f0f0f0] flex items-center justify-center hover:bg-[#e0e0e0] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>

              {/* Header */}
              <div className="flex items-center gap-2 mb-6">
                <Logo className="w-6 h-6 text-[#1a1a1a]" />
                <span className="font-semibold text-[15px] text-[#1a1a1a]">AI Builder</span>
              </div>

              <h2 className="text-[22px] font-bold text-[#1a1a1a] mb-1">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="text-[14px] text-[#888] mb-6">
                {mode === "login"
                  ? "Sign in to continue building"
                  : "Start building with AI for free"}
              </p>

              {/* Tab switcher */}
              <div className="flex bg-[#f5f5f5] rounded-lg p-1 mb-6">
                {(["login", "register"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(""); }}
                    className={`flex-1 py-2 text-[13px] font-medium rounded-md transition-all ${
                      mode === m
                        ? "bg-white text-[#1a1a1a] shadow-sm"
                        : "text-[#888] hover:text-[#555]"
                    }`}
                  >
                    {m === "login" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === "register" && (
                  <div>
                    <label className="text-[12px] font-medium text-[#555] mb-1 block">Full name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      required
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#f8f8f8] border border-[#e5e5e5] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] focus:bg-white transition-all placeholder:text-[#bbb]"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[12px] font-medium text-[#555] mb-1 block">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#f8f8f8] border border-[#e5e5e5] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] focus:bg-white transition-all placeholder:text-[#bbb]"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#555] mb-1 block">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#f8f8f8] border border-[#e5e5e5] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] focus:bg-white transition-all placeholder:text-[#bbb]"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 px-3 py-2.5 rounded-lg text-[13px]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-[#1a1a1a] text-white py-2.5 rounded-lg text-[14px] font-semibold hover:bg-[#333] transition-colors disabled:opacity-50 mt-1"
                >
                  {isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      {mode === "login" ? "Signing in..." : "Creating account..."}
                    </span>
                  ) : mode === "login" ? "Sign in" : "Create account"}
                </button>
              </form>

              <p className="text-[11px] text-[#bbb] text-center mt-5 leading-relaxed">
                By continuing, you agree to our{" "}
                <a href="#" className="text-[#888] underline underline-offset-2 hover:text-[#555]">Terms</a>{" "}
                and{" "}
                <a href="#" className="text-[#888] underline underline-offset-2 hover:text-[#555]">Privacy Policy</a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
