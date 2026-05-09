import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useCompleteOnboarding,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const SKILL_LEVELS = [
  {
    id: "beginner",
    label: "Beginner",
    desc: "Just getting started",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
        <path d="M8 12h8M12 8v8"/>
      </svg>
    ),
  },
  {
    id: "intermediate",
    label: "Intermediate",
    desc: "Some experience with code",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  {
    id: "advanced",
    label: "Advanced",
    desc: "Experienced developer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
];

const CATEGORIES = [
  { id: "web", label: "Web Dev", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
  { id: "mobile", label: "Mobile Apps", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> },
  { id: "ai", label: "AI / ML", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 014 4v1h1a3 3 0 013 3v5a3 3 0 01-3 3H7a3 3 0 01-3-3V10a3 3 0 013-3h1V6a4 4 0 014-4z"/><circle cx="9" cy="13" r="1" fill="currentColor"/><circle cx="15" cy="13" r="1" fill="currentColor"/></svg> },
  { id: "backend", label: "Backend / APIs", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> },
  { id: "tools", label: "Dev Tools", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg> },
  { id: "other", label: "Other", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/></svg> },
];

const AD_SOURCES = [
  { id: "twitter", label: "Twitter / X" },
  { id: "youtube", label: "YouTube" },
  { id: "friend", label: "Friend referral" },
  { id: "search", label: "Search engine" },
  { id: "other", label: "Other" },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [skillLevel, setSkillLevel] = useState("");
  const [category, setCategory] = useState("");
  const [adSource, setAdSource] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const completeOnboarding = useCompleteOnboarding();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  const steps = [
    { title: "What's your experience level?", subtitle: "We'll personalize your experience" },
    { title: "What are you building?", subtitle: "Help us recommend the right tools" },
    { title: "How did you find us?", subtitle: "Last question, we promise" },
  ];

  async function handleFinish() {
    if (!skillLevel || !category || !adSource) return;
    await completeOnboarding.mutateAsync({ data: { skillLevel, category, adSource } });
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/dashboard");
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#08090A] flex items-center justify-center">
        <svg className="animate-spin w-4 h-4 text-white/30" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  const currentStep = steps[step];

  return (
    <div className="min-h-[100dvh] bg-[#08090A] flex flex-col items-center justify-center px-6 font-sans">
      <div className="w-full max-w-[400px]">

        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <Logo className="w-6 h-6" />
          <span className="font-semibold text-[14px] text-white/75">Bobo</span>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div key={i}
              className={cn(
                "h-[2px] flex-1 rounded-full transition-all duration-300",
                i <= step ? "bg-white/60" : "bg-white/[0.08]"
              )} />
          ))}
        </div>

        {/* Heading */}
        <div className="mb-7">
          <h1 className="text-[22px] font-semibold text-white/90 mb-1 tracking-tight">{currentStep.title}</h1>
          <p className="text-[13px] text-white/35">{currentStep.subtitle}</p>
        </div>

        {/* Step 0: Skill level */}
        {step === 0 && (
          <div className="space-y-2">
            {SKILL_LEVELS.map((s) => {
              const sel = skillLevel === s.id;
              return (
                <button key={s.id} onClick={() => setSkillLevel(s.id)}
                  className={cn(
                    "w-full flex items-center gap-3.5 px-4 py-3 rounded-xl border text-left transition-all",
                    sel
                      ? "border-white/20 bg-white/[0.07]"
                      : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/12"
                  )}>
                  <span className={cn("shrink-0 transition-colors", sel ? "text-white/75" : "text-white/25")}>
                    {s.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[13.5px] font-medium", sel ? "text-white/90" : "text-white/55")}>{s.label}</p>
                    <p className={cn("text-[11.5px]", sel ? "text-white/35" : "text-white/22")}>{s.desc}</p>
                  </div>
                  {sel && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/60 shrink-0">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Step 1: Category */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => {
              const sel = category === c.id;
              return (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={cn(
                    "flex flex-col items-start gap-2.5 px-4 py-3.5 rounded-xl border text-left transition-all",
                    sel
                      ? "border-white/20 bg-white/[0.07]"
                      : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/12"
                  )}>
                  <span className={cn("transition-colors", sel ? "text-white/75" : "text-white/25")}>{c.icon}</span>
                  <span className={cn("text-[13px] font-medium", sel ? "text-white/88" : "text-white/50")}>{c.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: Ad source */}
        {step === 2 && (
          <div className="space-y-2">
            {AD_SOURCES.map((s) => {
              const sel = adSource === s.id;
              return (
                <button key={s.id} onClick={() => setAdSource(s.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                    sel
                      ? "border-white/20 bg-white/[0.07]"
                      : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/12"
                  )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full border-[1.5px] shrink-0 flex items-center justify-center transition-all",
                    sel ? "border-white/60 bg-white/10" : "border-white/18"
                  )}>
                    {sel && <div className="w-1.5 h-1.5 rounded-full bg-white/70" />}
                  </div>
                  <span className={cn("text-[13.5px] font-medium", sel ? "text-white/88" : "text-white/50")}>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex justify-between items-center mt-8">
          {step > 0 ? (
            <button onClick={() => setStep(step - 1)}
              className="text-[13px] text-white/30 hover:text-white/60 transition-colors font-medium px-3 py-1.5 rounded-full hover:bg-white/[0.05]">
              Back
            </button>
          ) : <div />}

          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={(step === 0 && !skillLevel) || (step === 1 && !category)}
              className="bg-[#E5E5E6] text-[#08090A] px-5 py-2 rounded-full text-[13px] font-medium hover:bg-white transition-all disabled:opacity-30 active:scale-95">
              Continue
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!adSource || completeOnboarding.isPending}
              className="bg-[#E5E5E6] text-[#08090A] px-5 py-2 rounded-full text-[13px] font-medium hover:bg-white transition-all disabled:opacity-30 active:scale-95">
              {completeOnboarding.isPending ? "Setting up..." : "Get started"}
            </button>
          )}
        </div>

        <p className="text-center text-[12px] text-white/18 mt-6">
          Welcome, {user?.name?.split(" ")[0] ?? "there"}
        </p>
      </div>
    </div>
  );
}
