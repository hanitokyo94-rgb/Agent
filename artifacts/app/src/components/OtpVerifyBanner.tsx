import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  const digits = value.padEnd(8, "").slice(0, 8).split("");
  const refs: (HTMLInputElement | null)[] = [];

  function handleChange(i: number, ch: string) {
    const d = ch.replace(/\D/g, "").slice(-1);
    const next = digits.map((v, idx) => (idx === i ? d : v)).join("").slice(0, 8);
    onChange(next);
    if (d && i < 7) refs[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!digits[i] && i > 0) {
        const next = digits.map((v, idx) => (idx === i - 1 ? "" : v)).join("");
        onChange(next);
        refs[i - 1]?.focus();
      } else {
        const next = digits.map((v, idx) => (idx === i ? "" : v)).join("");
        onChange(next);
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 7) {
      refs[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8);
    onChange(pasted.padEnd(Math.max(value.length, pasted.length), "").slice(0, 8));
    const nextIdx = Math.min(pasted.length, 7);
    refs[nextIdx]?.focus();
  }

  return (
    <div className="flex gap-1.5 justify-center">
      {[0,1,2,3,4,5,6,7].map((i) => (
        <input
          key={i}
          ref={(el) => { refs[i] = el; }}
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
            "w-8 h-10 text-center text-[16px] font-bold rounded-lg border transition-all outline-none font-mono",
            "bg-white/[0.04] text-white/90",
            digits[i] ? "border-white/25 bg-white/[0.07]" : "border-white/[0.08]",
            "focus:border-white/35 focus:bg-white/[0.09]",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        />
      ))}
    </div>
  );
}

interface OtpVerifyBannerProps {
  email: string;
}

export function OtpVerifyBanner({ email }: OtpVerifyBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 8) { setError("Enter all 8 digits"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code"); setLoading(false); return; }
      setSuccess(true);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }, 800);
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setResendCooldown(60); setError("");
    try {
      await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
    } catch {}
  }

  if (success) {
    return (
      <div className="mx-5 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 shrink-0">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span className="text-[13px] font-medium text-emerald-400">Email verified successfully!</span>
      </div>
    );
  }

  return (
    <div className="mx-5 mt-4 rounded-xl border border-white/[0.08] bg-[#111113] overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.07] flex items-center justify-center shrink-0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-white/45">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-white/75">Verify your email</p>
          <p className="text-[11.5px] text-white/28 truncate">
            Check <span className="text-white/45 font-medium">{email}</span> for your 8-digit code
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10.5px] font-semibold text-white/25 uppercase tracking-wider bg-white/[0.05] border border-white/[0.07] px-2 py-0.5 rounded-full">Required</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={cn("text-white/25 transition-transform duration-200", expanded ? "rotate-180" : "rotate-0")}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {/* Expanded OTP input */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-4">
          <form onSubmit={handleVerify}>
            <div className="mb-4">
              <OtpInput value={code} onChange={setCode} disabled={loading} />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-[12px] mb-3">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button type="submit" disabled={loading || code.length !== 8}
                className="flex-1 py-2 rounded-full text-[12.5px] font-medium transition-all disabled:opacity-35 active:scale-[0.98] bg-[#E5E5E6] text-[#08090A] hover:bg-white">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Verifying…
                  </span>
                ) : "Verify"}
              </button>
              <button type="button" onClick={handleResend} disabled={resendCooldown > 0}
                className="px-3 py-2 rounded-full text-[12px] font-medium border border-white/[0.08] text-white/40 hover:text-white/65 hover:border-white/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                {resendCooldown > 0 ? `${resendCooldown}s` : "Resend"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
