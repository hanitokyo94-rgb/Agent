import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

export function Select({ value, onChange, options, placeholder = "Select...", searchable = false, label, className, size = "md" }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = searchable && search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.description?.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", onOutside);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function handleSelect(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    setSearch("");
  }

  const triggerH = size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-10 px-3.5 text-[13px]";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {label && <p className="text-[11.5px] font-medium text-foreground/60 mb-1.5">{label}</p>}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-xl border bg-background",
          "hover:border-border/80 transition-all select-none text-left",
          open ? "border-primary/40 ring-2 ring-primary/10" : "border-border/60",
          triggerH
        )}
      >
        {selected?.icon && <span className="shrink-0 text-muted-foreground">{selected.icon}</span>}
        <span className={cn("flex-1 truncate", selected ? "text-foreground" : "text-muted-foreground/50")}>
          {selected?.label ?? placeholder}
        </span>
        {selected?.badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium shrink-0">{selected.badge}</span>
        )}
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={cn("text-muted-foreground/50 shrink-0 transition-transform duration-200", open && "rotate-180")}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          "absolute z-50 left-0 right-0 mt-1.5 bg-background border border-border/80 rounded-2xl shadow-xl overflow-hidden",
          "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-100"
        )}>
          {/* Search */}
          {searchable && (
            <div className="px-3 py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/50 shrink-0">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/40"
                />
              </div>
            </div>
          )}

          {/* Options */}
          <div className="py-1.5 max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center py-5 text-[12px] text-muted-foreground">No results</p>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    disabled={opt.disabled}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                      isSelected ? "bg-primary/8 text-foreground" : "hover:bg-muted/50 text-foreground/80",
                      opt.disabled && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {opt.icon && (
                      <span className={cn("shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}>
                        {opt.icon}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[13px] font-medium truncate", isSelected && "text-primary")}>{opt.label}</p>
                      {opt.description && (
                        <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{opt.description}</p>
                      )}
                    </div>
                    {opt.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium shrink-0">{opt.badge}</span>
                    )}
                    {isSelected && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary shrink-0">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
