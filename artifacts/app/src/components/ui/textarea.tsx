import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-2",
        "text-[13px] text-white/85 placeholder:text-white/25",
        "focus-visible:outline-none focus-visible:border-white/20 focus-visible:bg-white/[0.02]",
        "disabled:cursor-not-allowed disabled:opacity-40 transition-all resize-none",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
