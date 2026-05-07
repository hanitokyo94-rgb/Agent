import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useCompleteOnboarding,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";

const SKILL_LEVELS = [
  { id: "beginner", label: "Beginner", desc: "Just getting started" },
  { id: "intermediate", label: "Intermediate", desc: "Some experience" },
  { id: "advanced", label: "Advanced", desc: "Experienced developer" },
];

const CATEGORIES = [
  { id: "web", label: "Web Development", icon: "🌐" },
  { id: "mobile", label: "Mobile Apps", icon: "📱" },
  { id: "ai", label: "AI / ML", icon: "🤖" },
  { id: "backend", label: "Backend / APIs", icon: "⚙️" },
  { id: "tools", label: "Dev Tools", icon: "🛠️" },
  { id: "other", label: "Other", icon: "✨" },
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

  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const completeOnboarding = useCompleteOnboarding();

  const steps = [
    {
      title: "What's your experience level?",
      subtitle: "We'll personalize your experience",
    },
    {
      title: "What are you building?",
      subtitle: "Help us recommend the right tools",
    },
    {
      title: "How did you find us?",
      subtitle: "Last question, we promise",
    },
  ];

  async function handleFinish() {
    if (!skillLevel || !category || !adSource) return;
    await completeOnboarding.mutateAsync({ data: { skillLevel, category, adSource } });
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/dashboard");
  }

  const currentStep = steps[step];

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <Logo className="w-7 h-7 text-primary" />
          <span className="font-semibold text-sm">AI Builder</span>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">{currentStep.title}</h1>
          <p className="text-muted-foreground text-sm">{currentStep.subtitle}</p>
        </div>

        {/* Step 0: Skill Level */}
        {step === 0 && (
          <div className="space-y-3">
            {SKILL_LEVELS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSkillLevel(s.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                  skillLevel === s.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
                  skillLevel === s.id ? "border-primary bg-primary" : "border-muted-foreground"
                }`} />
                <div>
                  <p className="font-medium text-sm">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Category */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all ${
                  category === c.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <span className="text-xl">{c.icon}</span>
                <span className="text-sm font-medium">{c.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Ad Source */}
        {step === 2 && (
          <div className="space-y-2">
            {AD_SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setAdSource(s.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  adSource === s.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
                  adSource === s.id ? "border-primary bg-primary" : "border-muted-foreground"
                }`} />
                <span className="text-sm font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Navigation */}
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
              disabled={
                (step === 0 && !skillLevel) ||
                (step === 1 && !category)
              }
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
