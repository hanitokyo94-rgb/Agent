import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useCompleteOnboarding,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";

const SKILL_LEVELS = [
  {
    id: "beginner",
    label: "Beginner",
    desc: "Just getting started",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  {
    id: "advanced",
    label: "Advanced",
    desc: "Experienced developer",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
];

const CATEGORIES = [
  {
    id: "web",
    label: "Web Development",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
      </svg>
    ),
  },
  {
    id: "mobile",
    label: "Mobile Apps",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI / ML",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a4 4 0 014 4v1h1a3 3 0 013 3v5a3 3 0 01-3 3H7a3 3 0 01-3-3V10a3 3 0 013-3h1V6a4 4 0 014-4z"/>
        <circle cx="9" cy="13" r="1" fill="currentColor"/>
        <circle cx="15" cy="13" r="1" fill="currentColor"/>
        <path d="M9 17c1 1 5 1 6 0"/>
      </svg>
    ),
  },
  {
    id: "backend",
    label: "Backend / APIs",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
        <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: "tools",
    label: "Dev Tools",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  {
    id: "other",
    label: "Other",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="1" fill="currentColor"/>
        <circle cx="19" cy="12" r="1" fill="currentColor"/>
        <circle cx="5" cy="12" r="1" fill="currentColor"/>
      </svg>
    ),
  },
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
    if (!isLoading && !user) {
      setLocation("/");
    }
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
      <div className="min-h-[100dvh] flex items-center justify-center">
        <svg className="animate-spin w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  const currentStep = steps[step];

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-10">
          <Logo className="w-7 h-7 text-primary" />
          <span className="font-semibold text-sm">AI Builder</span>
        </div>

        <div className="flex gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-1.5">{currentStep.title}</h1>
          <p className="text-muted-foreground text-sm">{currentStep.subtitle}</p>
        </div>

        {step === 0 && (
          <div className="space-y-2.5">
            {SKILL_LEVELS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSkillLevel(s.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                  skillLevel === s.id ? "border-primary bg-primary/5" : "border-border hover:border-border-primary/30 hover:bg-muted/30"
                }`}
              >
                <div className={`shrink-0 transition-colors ${skillLevel === s.id ? "text-primary" : "text-muted-foreground"}`}>
                  {s.icon}
                </div>
                <div>
                  <p className="font-medium text-sm">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
                {skillLevel === s.id && (
                  <div className="ml-auto shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-2 gap-2.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex flex-col items-start gap-2.5 p-4 rounded-xl border-2 text-left transition-all ${
                  category === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                }`}
              >
                <div className={`transition-colors ${category === c.id ? "text-primary" : "text-muted-foreground"}`}>
                  {c.icon}
                </div>
                <span className="text-sm font-medium">{c.label}</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            {AD_SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setAdSource(s.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  adSource === s.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors flex items-center justify-center ${
                  adSource === s.id ? "border-primary bg-primary" : "border-muted-foreground"
                }`}>
                  {adSource === s.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-sm font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mt-8">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back
            </button>
          ) : <div />}

          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={(step === 0 && !skillLevel) || (step === 1 && !category)}
              className="bg-foreground text-background px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!adSource || completeOnboarding.isPending}
              className="bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {completeOnboarding.isPending ? "Setting up..." : "Get started"}
            </button>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Welcome, {user?.name?.split(" ")[0] ?? "there"}
        </p>
      </div>
    </div>
  );
}
