/**
 * BoboAuth — hosted login/register page for Bobo Auth-powered projects
 *
 * Deployed projects redirect here:
 *   /bobo-auth?project=<projectId>&callback=<returnUrl>&mode=login|register
 *
 * After auth, redirects back to callback with ?bobo_token=<jwt>
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

function getParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/meta`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.name) setProjectName(d.name); })
      .catch(() => {});
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Missing project ID.</p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/bobo/auth/login" : "/api/bobo/auth/register";
      const body: Record<string, string> = { email, password };
      if (mode === "register" && name) body.name = name;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${projectId}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Authentication failed");
        return;
      }
      const token: string = data.token;
      if (callback) {
        const sep = callback.includes("?") ? "&" : "?";
        window.location.href = `${callback}${sep}bobo_token=${encodeURIComponent(token)}`;
      } else {
        setLocation("/");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-white dark:bg-black flex flex-col">
      {/* Top bar */}
      <header className="border-b border-black/10 dark:border-white/10 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-black dark:bg-white flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-white dark:text-black">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">
            {projectName ?? "Bobo Auth"}
          </span>
        </div>
        <span className="text-[11px] text-black/40 dark:text-white/40 font-mono">
          Powered by Bobo
        </span>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Heading */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
              {mode === "login" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-sm text-black/50 dark:text-white/50">
              {mode === "login"
                ? `Continue to ${projectName ?? "this app"}`
                : `Join ${projectName ?? "this app"}`}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "register" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-black/60 dark:text-white/60 uppercase tracking-wide">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-sm placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 focus:border-black/40 dark:focus:border-white/40 transition"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/60 dark:text-white/60 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-sm placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 focus:border-black/40 dark:focus:border-white/40 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/60 dark:text-white/60 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-sm placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 focus:border-black/40 dark:focus:border-white/40 transition"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-semibold hover:opacity-90 active:opacity-80 transition disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </span>
              ) : (
                mode === "login" ? "Sign in" : "Create account"
              )}
            </button>
          </form>

          {/* Toggle */}
          <p className="text-center text-xs text-black/40 dark:text-white/40">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              className="text-black dark:text-white font-medium hover:underline"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>

          {/* Security note */}
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-black/30 dark:text-white/30">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>Secured by Bobo Auth</span>
          </div>
        </div>
      </main>
    </div>
  );
}
