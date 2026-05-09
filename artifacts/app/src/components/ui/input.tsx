import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full bg-transparent px-3 py-1.5 text-[13px] text-white/85 transition-all outline-none",
          "border border-white/[0.08] rounded-md",
          "placeholder:text-white/25",
          "focus:border-white/20 focus:bg-white/[0.02]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
