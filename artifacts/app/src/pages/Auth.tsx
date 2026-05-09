import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useRegister, useLogin, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { detectLanguage, detectCountry } from "@/lib/utils";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>
    ),
    title: "Understands your idea",
    desc: "Describe in plain language. The AI figures out the architecture, stack, and plan.",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    title: "Writes & runs the code",
    desc: "Installs packages, runs shell commands, and fixes errors automatically.",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-white/50">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
    title: "Deploys instantly",
    desc: "Get a live public URL in seconds. Redeploy on every change automatically.",
  },
];

const TAGS = ["TypeScript APIs", "React Apps", "Discord Bots", "CLI Tools", "Web Scrapers", "AI Agents", "REST APIs", "Full-stack Apps"];

function FloatingCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn(
      "absolute bg-[#111113]/90 border border-white/[0.08] backdrop-blur-xl rounded-xl p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
      className
    )}>
      {children}
    </div>
  );
}

/* ── OTP Input: 8 individual boxes ────────────────────────────── */
function OtpInput({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(8, "").slice(0, 8).split("");

  function handleChange(i: number, ch: string) {
    const d = ch.replace(/\D/g, "").slice(-1);
    const next = digits.map((v, idx) => (idx === i ? d : v)).join("").slice(0, 8);
    onChange(next);
    if (d && i < 7) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!digits[i] && i > 0) {
        const next = digits.map((v, idx) => (idx === i - 1 ? "" : v)).join("");
        onChange(next);
        refs.current[i - 1]?.focus();
      } else {
        const next = digits.map((v, idx) => (idx === i ? "" : v)).join("");
        onChange(next);
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 7) {
      refs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8);
    onChange(pasted.padEnd(Math.max(value.length, pasted.length), "").slice(0, 8));
    const nextIdx = Math.min(pasted.length, 7);
    refs.current[nextIdx]?.focus();
  }

  return (
    <div className="flex gap-2 justify-center">
      {[0,1,2,3,4,5,6,7].map((i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            "w-9 h-11 text-center text-[18px] font-bold rounded-lg border transition-all outline-none",
            "bg-white/[0.04] text-white/90",
            digits[i]
              ? "border-white/25 bg-white/[0.07]"
              : "border-white/[0.08]",
            "focus:border-white/35 focus:bg-white/[0.09]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "font-mono"
          )}
        />
      ))}
    </div>
  );
}

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

  // OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingToken, setPendingToken] = useState("");
  const [pendingOnboarding, setPendingOnboarding] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const register = useRegister();
  const login = useLogin();
  const isPending = register.isPending || login.isPending;

  useEffect(() => { requestAnimationFrame(() => setPageVisible(true)); }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function openModal(m: "login" | "register") {
    setMode(m); setError("");
    setName(""); setEmail(""); setPassword(""); setShowPass(false);
    setOtpStep(false); setOtpCode(""); setOtpError("");
    setShowModal(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setModalVisible(true)));
  }
  function closeModal() {
    setModalVisible(false);
    setTimeout(() => { setShowModal(false); setOtpStep(false); setOtpCode(""); setOtpError(""); }, 280);
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeModal(); }
    if (showModal) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showModal]);

  function handleSuccess(token: string, onboardingCompleted: boolean, requiresOtp: boolean, userEmail: string) {
    localStorage.setItem("token", token);
    setAuthTokenGetter(() => localStorage.getItem("token"));
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    if (requiresOtp) {
      setPendingToken(token);
      setPendingOnboarding(onboardingCompleted);
      setPendingEmail(userEmail);
      setOtpStep(true);
      setResendCooldown(60);
    } else {
      closeModal();
      setTimeout(() => setLocation(!onboardingCompleted ? "/onboarding" : "/dashboard"), 100);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const country = detectCountry(); const language = detectLanguage();
    if (mode === "register") {
      register.mutate({ data: { name, email, password, country: country ?? undefined, language } }, {
        onSuccess: (res) => handleSuccess(
          res.token,
          res.user.onboardingCompleted,
          (res as any).emailVerificationRequired ?? false,
          res.user.email
        ),
        onError: (err: any) => setError(err?.data?.error ?? "Registration failed"),
      });
    } else {
      login.mutate({ data: { email, password } }, {
        onSuccess: (res) => handleSuccess(
          res.token,
          res.user.onboardingCompleted,
          (res as any).emailVerificationRequired ?? false,
          res.user.email
        ),
        onError: (err: any) => setError(err?.data?.error ?? "Login failed"),
      });
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpCode.length !== 8) { setOtpError("Enter all 8 digits"); return; }
    setOtpLoading(true); setOtpError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Invalid code"); setOtpLoading(false); return; }
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      closeModal();
      setTimeout(() => setLocation(!pendingOnboarding ? "/onboarding" : "/dashboard"), 100);
    } catch {
      setOtpError("Something went wrong. Try again.");
      setOtpLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setResendCooldown(60); setOtpError("");
    try {
      await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { Authorization: `Bearer ${pendingToken}` },
      });
    } catch {}
  }

  return (
    <div className={cn("min-h-[100dvh] bg-[#08090A] flex flex-col font-sans transition-opacity duration-500", pageVisible ? "opacity-100" : "opacity-0")}>

      {/* Very subtle radial — monochrome */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-[0.04]"
          style={{ background: "radial-gradient(ellipse at center,#ffffff 0%,transparent 70%)" }} />
      </div>

      {/* Navbar */}
      <nav className="flex items-center justify-between px-5 sm:px-10 h-[52px] border-b border-white/[0.06] sticky top-0 bg-[#08090A]/90 backdrop-blur-xl z-20">
        <div className="flex items-center gap-2">
          <Logo className="w-6 h-6" />
          <span className="font-semibold text-[14px] text-white/85 tracking-tight">Bobo</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => openModal("login")}
            className="text-[13px] text-white/38 hover:text-white/70 transition-colors px-3 py-1.5 rounded-full font-medium">
            Sign in
          </button>
          <button onClick={() => openModal("register")}
            className="text-[13px] font-medium px-4 py-1.5 rounded-full transition-all active:scale-95 bg-[#E5E5E6] text-[#08090A] hover:bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
            Get started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative flex flex-col items-center justify-center pt-20 pb-12 sm:pt-28 sm:pb-20 px-5 overflow-hidden min-h-[70dvh]">

        {/* Floating cards — desktop only */}
        <div className="hidden xl:block">
          <FloatingCard className="left-8 top-16 w-52 animate-[float_6s_ease-in-out_infinite]">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.07] flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-white/50"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              </div>
              <div>
                <p className="text-[12px] font-medium text-white/75">task-manager</p>
                <p className="text-[10px] text-white/28">TypeScript · 2m ago</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-1 bg-white/[0.07] rounded-full w-full" />
              <div className="h-1 bg-white/[0.05] rounded-full w-4/5" />
              <div className="h-1 bg-white/[0.1] rounded-full w-3/5" />
            </div>
          </FloatingCard>

          <FloatingCard className="left-12 bottom-24 w-48 animate-[float_8s_ease-in-out_infinite_1s]">
            <p className="text-[9.5px] text-white/25 mb-1.5 font-mono uppercase tracking-wider">Agent working</p>
            <div className="flex items-center gap-2">
              <div className="flex gap-[3px]">
                {[0,120,240].map((d) => (
                  <span key={d} className="w-1 h-1 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
              <span className="text-[11px] text-white/50 italic">Writing API routes…</span>
            </div>
          </FloatingCard>

          <FloatingCard className="right-8 top-20 w-52 animate-[float_7s_ease-in-out_infinite_0.5s]">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
              <span className="text-[11px] text-emerald-400/70 font-medium">Deployed</span>
            </div>
            <p className="text-[11px] text-white/35 font-mono truncate">my-app.vercel.app</p>
            <div className="mt-2 h-1 bg-white/[0.07] rounded-full w-full" />
          </FloatingCard>

          <FloatingCard className="right-12 bottom-28 w-48 animate-[float_9s_ease-in-out_infinite_2s]">
            <p className="text-[9.5px] text-white/25 mb-2 font-medium uppercase tracking-wider">Files written</p>
            {["index.ts", "auth.ts", "db.ts"].map((f) => (
              <div key={f} className="flex items-center gap-2 py-0.5">
                <span className="text-white/40 text-[10px] font-mono">+</span>
                <span className="text-[11px] text-white/45 font-mono">{f}</span>
              </div>
            ))}
          </FloatingCard>
        </div>

        {/* Center content */}
        <div className="relative z-10 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
            <span className="text-[12px] text-white/45 font-medium">Thousands of builders · Free to start</span>
          </div>

          <h1 className={cn(
            "text-[clamp(2.4rem,6.5vw,5rem)] font-semibold text-white tracking-[-0.03em] leading-[1.05] mb-5 transition-all duration-600",
            pageVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}>
            AI that builds<br />
            <span className="text-white/45">software for you</span>
          </h1>

          <p className={cn(
            "text-[15px] text-white/38 mb-9 max-w-md mx-auto leading-relaxed transition-all duration-600 delay-75",
            pageVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}>
            Describe your idea in plain language. Bobo plans, writes, runs, and deploys your project — fully autonomous.
          </p>

          <div className={cn(
            "flex items-center justify-center gap-3 flex-wrap transition-all duration-600 delay-150",
            pageVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}>
            <button onClick={() => openModal("register")}
              className="text-[14px] font-medium px-8 py-3 rounded-full transition-all active:scale-95 bg-[#E5E5E6] text-[#08090A] hover:bg-white shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              Start building free
            </button>
            <button onClick={() => openModal("login")}
              className="bg-white/[0.05] text-white/65 text-[14px] font-medium px-8 py-3 rounded-full border border-white/[0.08] hover:bg-white/[0.08] transition-all active:scale-95">
              Sign in
            </button>
          </div>
        </div>
      </div>

      {/* Logo bar */}
      <div className="flex items-center justify-center gap-8 sm:gap-14 flex-wrap px-6 py-5 border-y border-white/[0.05]">
        {[
          { name: "Vercel", el: <svg viewBox="0 0 76 65" fill="currentColor" className="h-3 opacity-18 hover:opacity-35 transition-opacity"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg> },
          { name: "OpenAI", el: <span className="text-[11.5px] font-semibold tracking-tight text-white/15 hover:text-white/35 transition-colors">OpenAI</span> },
          { name: "GitHub", el: <svg viewBox="0 0 98 96" className="h-3.5 fill-current opacity-18 hover:opacity-35 transition-opacity"><path d="M49 .12C21.94.12 0 22.06 0 49.12c0 21.7 14.07 40.12 33.59 46.62 2.46.45 3.35-1.07 3.35-2.37 0-1.17-.04-4.27-.06-8.38-13.68 2.97-16.57-6.6-16.57-6.6-2.24-5.68-5.46-7.19-5.46-7.19-4.46-3.05.34-2.99.34-2.99 4.93.35 7.53 5.07 7.53 5.07 4.38 7.5 11.49 5.33 14.29 4.08.44-3.17 1.71-5.34 3.12-6.56-10.91-1.24-22.38-5.45-22.38-24.26 0-5.36 1.91-9.74 5.06-13.17-.51-1.24-2.19-6.23.48-13 0 0 4.12-1.32 13.5 5.04A47.03 47.03 0 0149 27.83c4.17.02 8.37.56 12.29 1.65 9.35-6.36 13.46-5.04 13.46-5.04 2.68 6.77 1 11.76.49 13 3.15 3.43 5.05 7.81 5.05 13.17 0 18.86-11.49 23.01-22.43 24.23 1.76 1.52 3.33 4.51 3.33 9.09 0 6.56-.06 11.86-.06 13.47 0 1.31.88 2.84 3.38 2.36C83.96 89.23 98 70.82 98 49.12 98 22.06 76.06.12 49 .12z"/></svg> },
          { name: "Stripe", el: <span className="text-[11.5px] font-semibold tracking-tight text-white/15 hover:text-white/35 transition-colors">stripe</span> },
          { name: "Supabase", el: <span className="text-[11.5px] font-semibold tracking-tight text-white/15 hover:text-white/35 transition-colors">supabase</span> },
          { name: "Next.js", el: <span className="text-[11.5px] font-semibold tracking-tight text-white/15 hover:text-white/35 transition-colors">Next.js</span> },
        ].map((l) => (
          <div key={l.name} className="text-white/25 flex items-center shrink-0">{l.el}</div>
        ))}
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-5 sm:px-10 py-20 sm:py-24 w-full">
        <div className="mb-12">
          <p className="text-[10.5px] font-semibold text-white/22 uppercase tracking-[0.2em] mb-3">How it works</p>
          <h2 className="text-[clamp(1.8rem,4.5vw,3rem)] font-semibold text-white leading-[1.1] tracking-tight">
            The thinking.<br /><span className="text-white/45">The building.</span>
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={f.title}
              className={cn(
                "p-6 rounded-xl border border-white/[0.06] bg-[#111113] transition-all duration-400",
                pageVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
              style={{ transitionDelay: `${i * 60 + 150}ms` }}>
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.06] flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="text-[14px] font-semibold text-white/85 mb-1.5">{f.title}</h3>
              <p className="text-[12.5px] text-white/32 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {TAGS.map((t, i) => (
            <span key={t}
              className={cn(
                "text-[12px] text-white/28 bg-transparent px-3 py-1 rounded-full border border-white/[0.07] hover:border-white/15 hover:text-white/50 transition-all cursor-default",
                pageVisible ? "opacity-100" : "opacity-0"
              )}
              style={{ transitionDelay: `${i * 25 + 350}ms` }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* CTA section */}
      <div className="border-t border-white/[0.06] px-5 py-20 sm:py-24">
        <div className="max-w-sm mx-auto text-center">
          <h3 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-semibold text-white tracking-tight mb-2 leading-tight">
            Start building today
          </h3>
          <p className="text-white/28 text-[13.5px] mb-7">No credit card required. Free to start.</p>
          <button onClick={() => openModal("register")}
            className="text-[14px] font-medium px-8 py-3 rounded-full transition-all active:scale-95 bg-[#E5E5E6] text-[#08090A] hover:bg-white shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
            Create free account
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.05] px-5 sm:px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="w-5 h-5" />
          <span className="text-[12px] text-white/22 font-medium">Bobo</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="text-[12px] text-white/18 hover:text-white/45 transition-colors">Terms</a>
          <a href="#" className="text-[12px] text-white/18 hover:text-white/45 transition-colors">Privacy</a>
        </div>
      </div>

      {/* Auth Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className={cn("fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-250", modalVisible ? "opacity-100" : "opacity-0")} onClick={closeModal} />
          <div className={cn(
            "relative bg-[#0E0E10] border border-white/[0.09] w-full sm:max-w-[400px] sm:mx-4 rounded-t-[24px] sm:rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] z-10 overflow-hidden",
            "transition-all duration-250 ease-out",
            modalVisible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-full sm:translate-y-0 opacity-0 sm:scale-95"
          )}>
            {/* Top drag indicator */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-8 h-[3px] bg-white/10 rounded-full" />
            </div>

            <div className="px-6 pt-5 pb-7">
              <button onClick={closeModal}
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/[0.05] flex items-center justify-center hover:bg-white/[0.1] transition-colors text-white/28 hover:text-white/60">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>

              {otpStep ? (
                /* ── OTP Step ─────────────────────────── */
                <>
                  <div className="flex items-center gap-2 mb-5">
                    <Logo className="w-6 h-6" />
                    <span className="font-semibold text-[13px] text-white/75">Bobo</span>
                  </div>

                  {/* Email icon */}
                  <div className="flex justify-center mb-5">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/55">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </div>
                  </div>

                  <h2 className="text-[20px] font-semibold text-white mb-1.5 tracking-tight text-center">
                    Check your email
                  </h2>
                  <p className="text-[13px] text-white/32 mb-6 text-center leading-relaxed">
                    We sent an 8-digit code to<br />
                    <span className="text-white/55 font-medium">{pendingEmail}</span>
                  </p>

                  <form onSubmit={handleVerifyOtp}>
                    <div className="mb-5">
                      <OtpInput value={otpCode} onChange={setOtpCode} disabled={otpLoading} />
                    </div>

                    {otpError && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-lg text-[12.5px] mb-4">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                        {otpError}
                      </div>
                    )}

                    <button type="submit" disabled={otpLoading || otpCode.length !== 8}
                      className="w-full py-2.5 rounded-full text-[13.5px] font-medium transition-all disabled:opacity-35 active:scale-[0.98] bg-[#E5E5E6] text-[#08090A] hover:bg-white mb-4">
                      {otpLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Verifying…
                        </span>
                      ) : "Verify email"}
                    </button>
                  </form>

                  <div className="text-center">
                    <p className="text-[12px] text-white/22 mb-1">Didn't receive it?</p>
                    <button onClick={handleResendOtp} disabled={resendCooldown > 0}
                      className="text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed text-white/40 hover:text-white/70 disabled:text-white/22">
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>
                </>
              ) : (
                /* ── Auth Step ─────────────────────────── */
                <>
                  <div className="flex items-center gap-2 mb-5">
                    <Logo className="w-6 h-6" />
                    <span className="font-semibold text-[13px] text-white/75">Bobo</span>
                  </div>

                  <h2 className="text-[22px] font-semibold text-white mb-1 tracking-tight">
                    {mode === "login" ? "Welcome back" : "Create account"}
                  </h2>
                  <p className="text-[13px] text-white/30 mb-5">
                    {mode === "login" ? "Sign in to continue building" : "Start building with AI for free"}
                  </p>

                  {/* Mode toggle */}
                  <div className="flex bg-white/[0.04] border border-white/[0.06] rounded-lg p-0.5 mb-5">
                    {(["login", "register"] as const).map((m) => (
                      <button key={m} onClick={() => { setMode(m); setError(""); }}
                        className={cn("flex-1 py-1.5 text-[12.5px] font-medium rounded-md transition-all",
                          mode === m ? "bg-white/[0.1] text-white/90" : "text-white/35 hover:text-white/60")}>
                        {m === "login" ? "Sign in" : "Sign up"}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    {mode === "register" && (
                      <div>
                        <label className="text-[11px] font-medium text-white/28 uppercase tracking-widest mb-1.5 block">Full name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                          placeholder="Ahmad Al-Hassan" required autoFocus
                          className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-white/85 outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all placeholder:text-white/15"/>
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] font-medium text-white/28 uppercase tracking-widest mb-1.5 block">Email</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com" required autoFocus={mode === "login"}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-white/85 outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all placeholder:text-white/15"/>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-white/28 uppercase tracking-widest mb-1.5 block">Password</label>
                      <div className="relative">
                        <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••" required
                          className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-white/85 outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all placeholder:text-white/15 pr-11"/>
                        <button type="button" onClick={() => setShowPass(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/22 hover:text-white/55 transition-colors">
                          {showPass ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-lg text-[12.5px]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                        {error}
                      </div>
                    )}

                    <button type="submit" disabled={isPending}
                      className="w-full py-2.5 rounded-full text-[13.5px] font-medium transition-all disabled:opacity-40 active:scale-[0.98] bg-[#E5E5E6] text-[#08090A] hover:bg-white mt-1">
                      {isPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          {mode === "login" ? "Signing in..." : "Creating account..."}
                        </span>
                      ) : mode === "login" ? "Sign in" : "Create account"}
                    </button>
                  </form>

                  <p className="text-[11px] text-white/15 text-center mt-4 leading-relaxed">
                    By continuing, you agree to our{" "}
                    <a href="#" className="text-white/30 hover:text-white/55 underline underline-offset-2">Terms</a>{" "}
                    and{" "}
                    <a href="#" className="text-white/30 hover:text-white/55 underline underline-offset-2">Privacy Policy</a>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
