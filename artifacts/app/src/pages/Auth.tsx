import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useRegister, useLogin, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { detectLanguage, detectCountry } from "@/lib/utils";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>
    ),
    title: "Understands your idea",
    desc: "Describe what you want in plain language. The AI figures out the architecture, stack, and plan.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    title: "Writes & runs the code",
    desc: "The agent writes TypeScript, installs packages, runs shell commands, and fixes errors — automatically.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
    title: "Deploys instantly",
    desc: "Get a live public URL in seconds. Redeploy on every change automatically.",
  },
];

const TAGS = ["TypeScript APIs", "React Apps", "Discord Bots", "CLI Tools", "Web Scrapers", "AI Agents", "REST APIs", "Full-stack Apps"];

export function Auth() {
  const [showModal, setShowModal] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [pageVisible, setPageVisible] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const register = useRegister();
  const login = useLogin();
  const isPending = register.isPending || login.isPending;

  useEffect(() => {
    requestAnimationFrame(() => setPageVisible(true));
  }, []);

  function openModal(m: "login" | "register") {
    setMode(m);
    setError("");
    setName(""); setEmail(""); setPassword(""); setShowPass(false);
    setShowModal(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setModalVisible(true)));
  }

  function closeModal() {
    setModalVisible(false);
    setTimeout(() => setShowModal(false), 320);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeModal(); }
    if (showModal) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showModal]);

  function handleSuccess(token: string, onboardingCompleted: boolean) {
    localStorage.setItem("token", token);
    setAuthTokenGetter(() => localStorage.getItem("token"));
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    closeModal();
    setTimeout(() => setLocation(!onboardingCompleted ? "/onboarding" : "/dashboard"), 100);
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
    <div className={cn(
      "min-h-[100dvh] bg-background flex flex-col font-sans transition-opacity duration-500",
      pageVisible ? "opacity-100" : "opacity-0"
    )}>
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 sm:px-8 h-14 border-b border-border/40 sticky top-0 bg-background/95 backdrop-blur-sm z-20">
        <div className="flex items-center gap-2">
          <Logo className="w-6 h-6 text-primary" />
          <span className="font-semibold text-sm text-foreground tracking-tight">AI Builder</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => openModal("login")}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg min-h-[40px]"
          >
            Sign in
          </button>
          <button
            onClick={() => openModal("register")}
            className="text-[13px] bg-foreground text-background px-4 py-2 rounded-xl font-medium hover:opacity-90 transition-opacity min-h-[40px] active:scale-95"
          >
            Get started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden mx-3 sm:mx-4 mt-3 sm:mt-4 rounded-2xl sm:rounded-3xl"
        style={{ height: "min(480px, 55dvh)" }}>
        <img
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80&auto=format&fit=crop"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/5 to-black/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />

        <div className="relative z-10 flex flex-col justify-end h-full px-5 sm:px-10 pb-8 sm:pb-10">
          <p className="text-white/70 text-[13px] mb-3 font-medium">
            Join <strong className="text-white">thousands of builders</strong> shipping with AI.
          </p>
          <h1 className="text-white font-bold leading-[1.08] tracking-tight text-[clamp(1.55rem,5vw,3.5rem)] max-w-2xl mb-5">
            Most AI tools help you build faster.<br />
            None of them tell you what to build.
          </h1>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => openModal("register")}
              className="bg-white text-[#1a1a1a] text-[13px] font-semibold px-5 py-2.5 rounded-xl hover:bg-white/90 transition-all active:scale-95 min-h-[42px]"
            >
              Start free
            </button>
            <button
              onClick={() => openModal("login")}
              className="bg-white/12 backdrop-blur text-white text-[13px] font-medium px-5 py-2.5 rounded-xl border border-white/25 hover:bg-white/20 transition-all active:scale-95 min-h-[42px]"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>

      {/* Logo bar */}
      <div className="flex items-center justify-center gap-5 sm:gap-10 flex-wrap px-6 py-5 sm:py-7 border-b border-border/40 overflow-x-auto">
        {[
          { name: "Vercel", el: <svg viewBox="0 0 76 65" fill="currentColor" className="h-3"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg> },
          { name: "OpenAI", el: <span className="font-semibold text-[11px] tracking-tight">OpenAI</span> },
          { name: "GitHub", el: <svg viewBox="0 0 98 96" className="h-3 fill-current"><path d="M49 .12C21.94.12 0 22.06 0 49.12c0 21.7 14.07 40.12 33.59 46.62 2.46.45 3.35-1.07 3.35-2.37 0-1.17-.04-4.27-.06-8.38-13.68 2.97-16.57-6.6-16.57-6.6-2.24-5.68-5.46-7.19-5.46-7.19-4.46-3.05.34-2.99.34-2.99 4.93.35 7.53 5.07 7.53 5.07 4.38 7.5 11.49 5.33 14.29 4.08.44-3.17 1.71-5.34 3.12-6.56-10.91-1.24-22.38-5.45-22.38-24.26 0-5.36 1.91-9.74 5.06-13.17-.51-1.24-2.19-6.23.48-13 0 0 4.12-1.32 13.5 5.04A47.03 47.03 0 0149 27.83c4.17.02 8.37.56 12.29 1.65 9.35-6.36 13.46-5.04 13.46-5.04 2.68 6.77 1 11.76.49 13 3.15 3.43 5.05 7.81 5.05 13.17 0 18.86-11.49 23.01-22.43 24.23 1.76 1.52 3.33 4.51 3.33 9.09 0 6.56-.06 11.86-.06 13.47 0 1.31.88 2.84 3.38 2.36C83.96 89.23 98 70.82 98 49.12 98 22.06 76.06.12 49 .12z"/></svg> },
          { name: "Stripe", el: <span className="font-semibold text-[11px] tracking-tight">stripe</span> },
          { name: "Supabase", el: <span className="font-semibold text-[11px] tracking-tight">supabase</span> },
          { name: "Next.js", el: <span className="font-semibold text-[11px] tracking-tight">Next.js</span> },
        ].map((l) => (
          <div key={l.name} className="text-muted-foreground/50 flex items-center shrink-0">{l.el}</div>
        ))}
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-12 sm:py-16 w-full">
        <h2 className="text-[clamp(1.6rem,4vw,2.8rem)] font-bold text-foreground leading-tight mb-10 sm:mb-12">
          The thinking.<br />The building.
        </h2>
        <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={cn(
                "space-y-3 transition-all duration-500",
                pageVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
              style={{ transitionDelay: `${i * 80 + 200}ms` }}
            >
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-foreground/70">
                {f.icon}
              </div>
              <h3 className="text-[15px] font-semibold text-foreground">{f.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 sm:mt-14 flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <span key={t} className="text-[12px] text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full border border-border/50">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* CTA section */}
      <div className="border-t border-border/40 bg-muted/20 px-5 py-14 sm:py-16">
        <div className="max-w-xl mx-auto text-center">
          <h3 className="text-2xl font-bold text-foreground mb-2">Start building today</h3>
          <p className="text-muted-foreground text-sm mb-6">No credit card required. Free to start.</p>
          <button
            onClick={() => openModal("register")}
            className="bg-foreground text-background px-8 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity active:scale-95 min-h-[46px]"
          >
            Create free account
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border/40 px-5 sm:px-8 py-5 flex items-center justify-between text-[12px] text-muted-foreground/60">
        <div className="flex items-center gap-2">
          <Logo className="w-4 h-4" />
          <span>AI Builder</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
        </div>
      </div>

      {/* Auth Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300",
              modalVisible ? "opacity-100" : "opacity-0"
            )}
            onClick={closeModal}
          />

          {/* Sheet */}
          <div className={cn(
            "relative bg-background w-full sm:max-w-[400px] sm:mx-4 rounded-t-[28px] sm:rounded-2xl shadow-2xl z-10 overflow-hidden",
            "transition-all duration-300 ease-out",
            modalVisible
              ? "translate-y-0 opacity-100 sm:scale-100 sm:translate-y-0"
              : "translate-y-full sm:translate-y-0 opacity-0 sm:opacity-0 sm:scale-95"
          )}>
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
            </div>

            <div className="px-6 pt-5 pb-8 sm:px-7">
              {/* Close */}
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors text-muted-foreground active:scale-90"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>

              {/* Logo + title */}
              <div className="flex items-center gap-2 mb-5">
                <Logo className="w-6 h-6 text-primary" />
                <span className="font-semibold text-[14px] text-foreground">AI Builder</span>
              </div>

              <h2 className="text-[22px] font-bold text-foreground mb-1">
                {mode === "login" ? "Welcome back" : "Create account"}
              </h2>
              <p className="text-[13px] text-muted-foreground mb-5">
                {mode === "login" ? "Sign in to continue building" : "Start building with AI for free"}
              </p>

              {/* Mode tabs */}
              <div className="flex bg-muted rounded-xl p-1 mb-5">
                {(["login", "register"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(""); }}
                    className={cn(
                      "flex-1 py-2 text-[13px] font-medium rounded-lg transition-all",
                      mode === m
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "login" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === "register" && (
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Full name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ahmad Al-Hassan"
                      required
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-[14px] text-foreground outline-none focus:border-primary focus:bg-background transition-all placeholder:text-muted-foreground/50"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus={mode === "login"}
                    className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-[14px] text-foreground outline-none focus:border-primary focus:bg-background transition-all placeholder:text-muted-foreground/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-[14px] text-foreground outline-none focus:border-primary focus:bg-background transition-all placeholder:text-muted-foreground/50 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPass ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive px-3.5 py-2.5 rounded-xl text-[13px]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-foreground text-background py-3 rounded-xl text-[14px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 mt-1 active:scale-[0.98] min-h-[48px]"
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

              <p className="text-[11px] text-muted-foreground/50 text-center mt-5 leading-relaxed">
                By continuing, you agree to our{" "}
                <a href="#" className="text-muted-foreground hover:text-foreground underline underline-offset-2">Terms</a>{" "}
                and{" "}
                <a href="#" className="text-muted-foreground hover:text-foreground underline underline-offset-2">Privacy Policy</a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
