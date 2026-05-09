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
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="icon1a" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f59e0b"/><stop offset="1" stopColor="#f97316"/></linearGradient>
          <linearGradient id="icon1b" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#fbbf24" stopOpacity="0.4"/><stop offset="1" stopColor="#f59e0b" stopOpacity="0"/></linearGradient>
        </defs>
        <circle cx="12" cy="12" r="11" fill="url(#icon1b)" stroke="url(#icon1a)" strokeWidth="1.5"/>
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="url(#icon1a)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "Understands your idea",
    desc: "Describe what you want in plain language. The AI figures out the architecture, stack, and plan.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="icon2a" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a78bfa"/><stop offset="1" stopColor="#7c3aed"/></linearGradient>
          <linearGradient id="icon2b" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#a78bfa" stopOpacity="0.3"/><stop offset="1" stopColor="#7c3aed" stopOpacity="0"/></linearGradient>
        </defs>
        <circle cx="12" cy="12" r="11" fill="url(#icon2b)" stroke="url(#icon2a)" strokeWidth="1.5"/>
        <polyline points="4 17 10 11 4 5" stroke="url(#icon2a)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="12" y1="19" x2="20" y2="19" stroke="url(#icon2a)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: "Writes & runs the code",
    desc: "The agent writes TypeScript, installs packages, runs shell commands, and fixes errors automatically.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="icon3a" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#34d399"/><stop offset="1" stopColor="#059669"/></linearGradient>
          <linearGradient id="icon3b" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#34d399" stopOpacity="0.3"/><stop offset="1" stopColor="#059669" stopOpacity="0"/></linearGradient>
        </defs>
        <circle cx="12" cy="12" r="11" fill="url(#icon3b)" stroke="url(#icon3a)" strokeWidth="1.5"/>
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#icon3a)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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

  useEffect(() => { requestAnimationFrame(() => setPageVisible(true)); }, []);

  function openModal(m: "login" | "register") {
    setMode(m); setError("");
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
    e.preventDefault(); setError("");
    const country = detectCountry(); const language = detectLanguage();
    if (mode === "register") {
      register.mutate({ data: { name, email, password, country: country ?? undefined, language } }, {
        onSuccess: (res) => handleSuccess(res.token, res.user.onboardingCompleted),
        onError: (err: any) => setError(err?.data?.error ?? "Registration failed"),
      });
    } else {
      login.mutate({ data: { email, password } }, {
        onSuccess: (res) => handleSuccess(res.token, res.user.onboardingCompleted),
        onError: (err: any) => setError(err?.data?.error ?? "Login failed"),
      });
    }
  }

  return (
    <div className={cn("min-h-[100dvh] bg-black flex flex-col font-sans transition-opacity duration-700", pageVisible ? "opacity-100" : "opacity-0")}>

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -left-40 w-[400px] h-[400px] bg-violet-500/4 rounded-full blur-[100px]" />
      </div>

      {/* Navbar */}
      <nav className="flex items-center justify-between px-5 sm:px-8 h-14 border-b border-white/[0.06] sticky top-0 bg-black/80 backdrop-blur-xl z-20">
        <div className="flex items-center gap-2.5">
          <Logo className="w-7 h-7" />
          <span className="font-bold text-[15px] text-white tracking-tight">Bobo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => openModal("login")}
            className="text-[13px] text-white/50 hover:text-white/90 transition-colors px-4 py-2 rounded-xl min-h-[38px]">
            Sign in
          </button>
          <button onClick={() => openModal("register")}
            className="text-[13px] bg-white text-black px-4 py-2 rounded-xl font-semibold hover:bg-white/90 transition-all active:scale-95 min-h-[38px]">
            Get started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden mx-3 sm:mx-5 mt-4 rounded-2xl sm:rounded-3xl" style={{ height: "min(520px, 60dvh)" }}>
        <img src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1800&q=80&auto=format&fit=crop"
          alt="" className="absolute inset-0 w-full h-full object-cover object-center"/>
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

        {/* Floating badge */}
        <div className="absolute top-6 left-6 flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3.5 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-white/80 font-medium">Live · Thousands of builders</span>
        </div>

        <div className="relative z-10 flex flex-col justify-end h-full px-6 sm:px-12 pb-10 sm:pb-14">
          <h1 className="text-white font-black leading-[1.03] tracking-tight text-[clamp(2rem,6vw,4.5rem)] max-w-3xl mb-6">
            Most AI tools help you<br />build faster.<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg,#f59e0b,#f97316)" }}>None tell you what to build.</span>
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => openModal("register")}
              className="bg-white text-black text-[13px] font-bold px-6 py-3 rounded-2xl hover:bg-amber-400 transition-all active:scale-95 min-h-[46px]">
              Start free →
            </button>
            <button onClick={() => openModal("login")}
              className="bg-white/10 backdrop-blur-sm text-white text-[13px] font-medium px-6 py-3 rounded-2xl border border-white/25 hover:bg-white/18 transition-all active:scale-95 min-h-[46px]">
              Sign in
            </button>
          </div>
        </div>
      </div>

      {/* Logo bar */}
      <div className="flex items-center justify-center gap-6 sm:gap-12 flex-wrap px-6 py-6 sm:py-8 border-b border-white/[0.05] overflow-x-auto">
        {[
          { name: "Vercel", el: <svg viewBox="0 0 76 65" fill="currentColor" className="h-3.5 opacity-30 hover:opacity-60 transition-opacity"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg> },
          { name: "OpenAI", el: <span className="text-[12px] font-bold tracking-tight text-white/25 hover:text-white/60 transition-colors">OpenAI</span> },
          { name: "GitHub", el: <svg viewBox="0 0 98 96" className="h-3.5 fill-current opacity-30 hover:opacity-60 transition-opacity"><path d="M49 .12C21.94.12 0 22.06 0 49.12c0 21.7 14.07 40.12 33.59 46.62 2.46.45 3.35-1.07 3.35-2.37 0-1.17-.04-4.27-.06-8.38-13.68 2.97-16.57-6.6-16.57-6.6-2.24-5.68-5.46-7.19-5.46-7.19-4.46-3.05.34-2.99.34-2.99 4.93.35 7.53 5.07 7.53 5.07 4.38 7.5 11.49 5.33 14.29 4.08.44-3.17 1.71-5.34 3.12-6.56-10.91-1.24-22.38-5.45-22.38-24.26 0-5.36 1.91-9.74 5.06-13.17-.51-1.24-2.19-6.23.48-13 0 0 4.12-1.32 13.5 5.04A47.03 47.03 0 0149 27.83c4.17.02 8.37.56 12.29 1.65 9.35-6.36 13.46-5.04 13.46-5.04 2.68 6.77 1 11.76.49 13 3.15 3.43 5.05 7.81 5.05 13.17 0 18.86-11.49 23.01-22.43 24.23 1.76 1.52 3.33 4.51 3.33 9.09 0 6.56-.06 11.86-.06 13.47 0 1.31.88 2.84 3.38 2.36C83.96 89.23 98 70.82 98 49.12 98 22.06 76.06.12 49 .12z"/></svg> },
          { name: "Stripe", el: <span className="text-[12px] font-bold tracking-tight text-white/25 hover:text-white/60 transition-colors">stripe</span> },
          { name: "Supabase", el: <span className="text-[12px] font-bold tracking-tight text-white/25 hover:text-white/60 transition-colors">supabase</span> },
          { name: "Next.js", el: <span className="text-[12px] font-bold tracking-tight text-white/25 hover:text-white/60 transition-colors">Next.js</span> },
        ].map((l) => (
          <div key={l.name} className="text-white/30 flex items-center shrink-0">{l.el}</div>
        ))}
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-5 sm:px-10 py-16 sm:py-24 w-full">
        <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black text-white leading-[1.05] tracking-tight mb-4">
          The thinking.<br />The building.
        </h2>
        <p className="text-white/40 text-[15px] mb-14 max-w-xl">From idea to deployed product — the AI handles every step so you can focus on what matters.</p>
        <div className="grid sm:grid-cols-3 gap-5 sm:gap-8">
          {FEATURES.map((f, i) => (
            <div key={f.title}
              className={cn("group p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-500 cursor-default",
                pageVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6")}
              style={{ transitionDelay: `${i * 100 + 200}ms` }}>
              <div className="mb-4">{f.icon}</div>
              <h3 className="text-[15px] font-bold text-white mb-2">{f.title}</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-2">
          {TAGS.map((t, i) => (
            <span key={t} className={cn("text-[12px] text-white/35 bg-white/[0.04] px-3 py-1.5 rounded-full border border-white/[0.07] hover:border-amber-500/30 hover:text-amber-400 transition-all cursor-default",
              pageVisible ? "opacity-100" : "opacity-0")} style={{ transitionDelay: `${i * 40 + 500}ms, ${i * 40 + 500}ms` }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* CTA section */}
      <div className="border-t border-white/[0.06] px-5 py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[300px] bg-amber-500/5 rounded-full blur-[80px]" />
        </div>
        <div className="max-w-xl mx-auto text-center relative">
          <h3 className="text-[clamp(1.8rem,4vw,3rem)] font-black text-white tracking-tight mb-3">Start building today</h3>
          <p className="text-white/35 text-[14px] mb-8">No credit card required. Free to start.</p>
          <button onClick={() => openModal("register")}
            className="bg-white text-black px-10 py-4 rounded-2xl text-[14px] font-bold hover:bg-amber-400 transition-all active:scale-95 min-h-[52px]">
            Create free account →
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.05] px-5 sm:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo className="w-5 h-5" />
          <span className="text-[12px] text-white/30 font-semibold">Bobo</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="text-[12px] text-white/25 hover:text-white/60 transition-colors">Terms</a>
          <a href="#" className="text-[12px] text-white/25 hover:text-white/60 transition-colors">Privacy</a>
        </div>
      </div>

      {/* Auth Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className={cn("fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300", modalVisible ? "opacity-100" : "opacity-0")} onClick={closeModal} />
          <div className={cn(
            "relative bg-[#0a0a0a] border border-white/[0.1] w-full sm:max-w-[420px] sm:mx-4 rounded-t-[28px] sm:rounded-3xl shadow-2xl z-10 overflow-hidden",
            "transition-all duration-300 ease-out",
            modalVisible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-full sm:translate-y-0 opacity-0 sm:scale-95"
          )}>
            {/* Glow top */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-white/10 rounded-full" />
            </div>

            <div className="px-7 pt-6 pb-8">
              <button onClick={closeModal}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1] transition-colors text-white/40 hover:text-white">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>

              <div className="flex items-center gap-2.5 mb-6">
                <Logo className="w-7 h-7" />
                <span className="font-bold text-[15px] text-white">Bobo</span>
              </div>

              <h2 className="text-[24px] font-black text-white mb-1 tracking-tight">
                {mode === "login" ? "Welcome back" : "Create account"}
              </h2>
              <p className="text-[13px] text-white/35 mb-6">
                {mode === "login" ? "Sign in to continue building" : "Start building with AI for free"}
              </p>

              <div className="flex bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 mb-6">
                {(["login", "register"] as const).map((m) => (
                  <button key={m} onClick={() => { setMode(m); setError(""); }}
                    className={cn("flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all",
                      mode === m ? "bg-white text-black shadow-sm" : "text-white/40 hover:text-white/70")}>
                    {m === "login" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div>
                    <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-2 block">Full name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="Ahmad Al-Hassan" required autoFocus
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-white outline-none focus:border-amber-500/50 focus:bg-white/[0.06] transition-all placeholder:text-white/20"/>
                  </div>
                )}
                <div>
                  <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-2 block">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required autoFocus={mode === "login"}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-white outline-none focus:border-amber-500/50 focus:bg-white/[0.06] transition-all placeholder:text-white/20"/>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-2 block">Password</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" required
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-white outline-none focus:border-amber-500/50 focus:bg-white/[0.06] transition-all placeholder:text-white/20 pr-12"/>
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors">
                      {showPass ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-[13px]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={isPending}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold transition-all disabled:opacity-40 active:scale-[0.98] min-h-[50px] mt-1"
                  style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)", color: "#000" }}>
                  {isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      {mode === "login" ? "Signing in..." : "Creating account..."}
                    </span>
                  ) : mode === "login" ? "Sign in →" : "Create account →"}
                </button>
              </form>

              <p className="text-[11px] text-white/20 text-center mt-5 leading-relaxed">
                By continuing, you agree to our{" "}
                <a href="#" className="text-white/40 hover:text-white/70 underline underline-offset-2">Terms</a>{" "}
                and{" "}
                <a href="#" className="text-white/40 hover:text-white/70 underline underline-offset-2">Privacy Policy</a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
