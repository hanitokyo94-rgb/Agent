import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useRegister, useLogin, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { detectLanguage, detectCountry } from "@/lib/utils";

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

  function handleSuccess(token: string, onboardingCompleted: boolean) {
    localStorage.setItem("token", token);
    setAuthTokenGetter(() => localStorage.getItem("token"));
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setShowModal(false);
    if (!onboardingCompleted) {
      setLocation("/onboarding");
    } else {
      setLocation("/dashboard");
    }
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
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 h-16 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <Logo className="w-7 h-7 text-primary" />
          <span className="font-semibold text-base tracking-tight">AI Builder</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setMode("login"); setShowModal(true); }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
          >
            Sign in
          </button>
          <button
            onClick={() => { setMode("register"); setShowModal(true); }}
            className="text-sm bg-foreground text-background px-5 py-2 rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            Get started free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-8">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            AI-powered project builder
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 leading-[1.1]">
            Build anything.<br />
            <span className="text-primary">Ship faster.</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Research, build, and deploy projects with an AI that thinks with you. One conversation. Everything you need.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => { setMode("register"); setShowModal(true); }}
              className="bg-foreground text-background px-8 py-3.5 rounded-full text-base font-medium hover:opacity-90 transition-opacity"
            >
              Start building free
            </button>
            <button
              onClick={() => { setMode("login"); setShowModal(true); }}
              className="border border-border px-8 py-3.5 rounded-full text-base font-medium hover:bg-muted transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>

        {/* Feature pills */}
        <div className="mt-16 flex flex-wrap justify-center gap-3">
          {["Websites & Apps", "Discord Bots", "TypeScript Tools", "APIs & Backend", "CLI Tools", "AI Agents"].map((f) => (
            <span key={f} className="px-4 py-2 bg-muted rounded-full text-sm text-muted-foreground">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Auth Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm mx-auto p-8 z-10 animate-in slide-in-from-bottom-4 duration-300">
            {/* Close */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>

            <div className="flex items-center gap-2 mb-2">
              <Logo className="w-7 h-7 text-primary" />
              <span className="font-semibold">AI Builder</span>
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {mode === "login" ? "Sign in to continue building" : "Join thousands of builders"}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "register" && (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-foreground text-background py-3.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? "Loading..." : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
              By continuing, you agree to our{" "}
              <a href="#" className="underline">Terms</a> and{" "}
              <a href="#" className="underline">Privacy Policy</a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
