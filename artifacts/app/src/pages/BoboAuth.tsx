/**
 * BoboAuth — hosted login/register page for Bobo Auth-powered projects
 * Redesigned: clean, premium dark — inspired by OAuth connect flows
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

function getParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

/* Bobo logo small */
function BoboLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="boboGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f59e0b"/><stop offset="1" stopColor="#f97316"/>
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#boboGrad)"/>
      <path d="M8 16L14 10L20 16L26 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 22L14 16L20 22L26 16" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55"/>
    </svg>
  );
}

/* Generic app icon */
function AppLogo({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  const colors = ["#6366f1","#8b5cf6","#ec4899","#14b8a6","#3b82f6","#f59e0b"];
  const color = colors[letter.charCodeAt(0) % colors.length];
  return (
    <div className="w-[56px] h-[56px] rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-xl"
      style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
      {letter}
    </div>
  );
}

export function BoboAuth() {
  const [, setLocation] = useLocation();
  const projectId = getParam("project");
  const callback = getParam("callback");
  const initialMode = (getParam("mode") ?? "login") as "login" | "register";

  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/meta`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.name) setProjectName(d.name); })
      .catch(() => {});
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-white/30">Missing project ID.</p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/bobo/auth/login" : "/api/bobo/auth/register";
      const body: Record<string, string> = { email, password };
      if (mode === "register" && name) body.name = name;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${projectId}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Authentication failed"); return; }
      const token: string = data.token;
      if (callback) {
        const sep = callback.includes("?") ? "&" : "?";
        window.location.href = `${callback}${sep}bobo_token=${encodeURIComponent(token)}`;
      } else { setLocation("/"); }
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  const appName = projectName ?? "This App";

  return (
    <div className={`min-h-[100dvh] bg-black flex flex-col transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber-500/6 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/[0.07] px-6 py-4 flex items-center justify-between shrink-0 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <BoboLogo size={28} />
          <span className="text-[13px] font-bold text-white tracking-tight">Bobo Auth</span>
        </div>
        <span className="text-[11px] text-white/20 font-mono">Secured · bobo.app</span>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px]">

          {/* Connect header — like OAuth flow */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <BoboLogo size={56} />
            {/* Connector line */}
            <div className="flex items-center gap-1">
              <div className="w-6 h-px bg-white/15" />
              <div className="w-2 h-2 rounded-full border border-white/20 bg-white/5" />
              <div className="w-6 h-px bg-white/15" />
            </div>
            <AppLogo name={appName} />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-[22px] font-black text-white tracking-tight mb-1">
              {mode === "login" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-[13px] text-white/35">
              {mode === "login" ? `Continue to ${appName}` : `Join ${appName}`}
            </p>
          </div>

          {/* Card */}
          <div className="bg-[#0a0a0a] border border-white/[0.09] rounded-2xl overflow-hidden shadow-2xl">
            {/* Top line */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            <div className="p-6">
              {/* Mode tabs */}
              <div className="flex bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 mb-6">
                {(["login", "register"] as const).map((m) => (
                  <button key={m} onClick={() => { setMode(m); setError(null); }}
                    className={`flex-1 py-2 text-[12.5px] font-bold rounded-lg transition-all ${mode === m ? "bg-white text-black" : "text-white/35 hover:text-white/60"}`}>
                    {m === "login" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div className="space-y-1.5">
                    <label className="text-[10.5px] font-bold text-white/25 uppercase tracking-widest">Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="Your name" autoFocus
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.06] transition-all"/>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-bold text-white/25 uppercase tracking-widest">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required autoFocus={mode === "login"}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.06] transition-all"/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-bold text-white/25 uppercase tracking-widest">Password</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" required minLength={6}
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.06] transition-all pr-12"/>
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/25 hover:text-white/55 transition-colors">
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
                  <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl text-[14px] font-black text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed mt-1"
                  style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}>
                  {loading ? (
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
            </div>
          </div>

          {/* Toggle */}
          <p className="text-center text-[12px] text-white/25 mt-5">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              className="text-amber-400 font-bold hover:text-amber-300 transition-colors">
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>

          {/* Security note */}
          <div className="flex items-center justify-center gap-2 text-[10.5px] text-white/18 mt-6">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>Secured by Bobo Auth</span>
          </div>
        </div>
      </main>
    </div>
  );
}
