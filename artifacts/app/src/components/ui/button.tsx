import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-[#E5E5E6] text-[#08090A] rounded-full shadow-[rgba(0,0,0,0)_0px_8px_2px_0px,rgba(0,0,0,0.01)_0px_5px_2px_0px,rgba(0,0,0,0.04)_0px_3px_2px_0px,rgba(0,0,0,0.07)_0px_1px_1px_0px,rgba(0,0,0,0.08)_0px_0px_1px_0px] hover:bg-[#F0F0F1] border border-[#E5E5E6]",
        destructive:
          "bg-red-500/10 text-red-400 border border-red-500/20 rounded-full hover:bg-red-500/15",
        outline:
          "border border-white/10 bg-transparent text-white/70 rounded-full hover:bg-white/[0.05] hover:text-white/90 shadow-[rgba(255,255,255,0.03)_0px_0px_0px_1px_inset]",
        secondary:
          "bg-[#141516] text-[#F7F8F8] rounded-full border border-transparent shadow-[rgba(255,255,255,0.03)_0px_0px_0px_1px_inset,rgba(255,255,255,0.04)_0px_1px_0px_0px_inset,rgba(0,0,0,0.6)_0px_0px_0px_1px,rgba(0,0,0,0.1)_0px_4px_4px_0px] hover:bg-[#1c1d1e]",
        ghost: "text-white/55 hover:text-white/85 hover:bg-white/[0.05] rounded-lg border border-transparent",
        link: "text-white/65 underline-offset-4 hover:underline hover:text-white/90 border-0",
      },
      size: {
        default: "min-h-8 px-4 py-1.5 text-[13px]",
        sm: "min-h-7 px-3 py-1 text-[12px]",
        lg: "min-h-10 px-6 py-2.5 text-[14px]",
        icon: "h-8 w-8 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
