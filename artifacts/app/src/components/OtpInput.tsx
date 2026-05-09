import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  onComplete?: (v: string) => void;
}

/**
 * Reliable OTP input — single hidden <input> with visual boxes overlay.
 * Works perfectly on desktop & mobile. No focus-jumping bugs.
 */
export function OtpInput({
  value,
  onChange,
  length = 8,
  disabled = false,
  autoFocus = false,
  onComplete,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digits = value.slice(0, length).split("");

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, length);
    onChange(raw);
    if (raw.length === length) onComplete?.(raw);
  }

  function handleContainerClick() {
    inputRef.current?.focus();
  }

  // Half-point for splitting 8 into 4+4
  const half = Math.ceil(length / 2);

  return (
    <div
      className="relative flex items-center gap-2.5 cursor-text select-none"
      onClick={handleContainerClick}>

      {/* Hidden real input — sits on top, captures all events */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        maxLength={length}
        className="absolute inset-0 opacity-0 w-full h-full cursor-text z-10"
        style={{ fontSize: "16px" }}
      />

      {/* Visual boxes - first half */}
      <div className="flex gap-1.5">
        {Array.from({ length: half }).map((_, i) => {
          const filled = i < digits.length;
          const active = i === digits.length && !disabled;
          const char = digits[i] ?? "";
          return (
            <OtpBox key={i} char={char} filled={filled} active={active} />
          );
        })}
      </div>

      {/* Separator dot */}
      <div className="flex gap-[3px] shrink-0">
        <span className="w-[3px] h-[3px] rounded-full bg-white/20" />
        <span className="w-[3px] h-[3px] rounded-full bg-white/20" />
      </div>

      {/* Visual boxes - second half */}
      <div className="flex gap-1.5">
        {Array.from({ length: length - half }).map((_, i) => {
          const absIdx = half + i;
          const filled = absIdx < digits.length;
          const active = absIdx === digits.length && !disabled;
          const char = digits[absIdx] ?? "";
          return (
            <OtpBox key={absIdx} char={char} filled={filled} active={active} />
          );
        })}
      </div>
    </div>
  );
}

function OtpBox({
  char,
  filled,
  active,
}: {
  char: string;
  filled: boolean;
  active: boolean;
}) {
  return (
    <div className={cn(
      "w-[38px] h-[46px] rounded-[10px] border flex items-center justify-center",
      "text-[20px] font-semibold font-mono leading-none",
      "transition-all duration-100",
      filled
        ? "bg-white/[0.07] border-white/[0.28] text-white"
        : "bg-white/[0.03] border-white/[0.09] text-transparent",
      active && !filled
        ? "border-white/40 bg-white/[0.05] shadow-[0_0_0_2px_rgba(255,255,255,0.05)]"
        : "",
    )}>
      {filled ? char : (
        /* cursor blink when active */
        active ? (
          <span className="w-[1.5px] h-[20px] bg-white/60 rounded-full animate-[blink_1s_ease-in-out_infinite]" />
        ) : null
      )}
    </div>
  );
}
