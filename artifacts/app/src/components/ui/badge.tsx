import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-white/[0.1] text-white/80 border border-white/[0.08]",
        secondary:
          "bg-white/[0.05] text-white/50 border border-white/[0.06]",
        destructive:
          "bg-red-500/10 text-red-400 border border-red-500/20",
        outline:
          "text-white/60 border border-white/[0.1]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
