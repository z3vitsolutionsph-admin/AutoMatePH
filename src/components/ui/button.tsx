import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-xs sm:text-sm font-mono font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-[#FF6F00] focus-visible:ring-1 focus-visible:ring-[#FF6F00] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-red-500 aria-invalid:ring-1 aria-invalid:ring-red-500/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[#FF6F00] text-[#0A0C10] font-bold uppercase tracking-wider hover:bg-[#FF851B] shadow-[0_0_12px_rgba(255,111,0,0.18)] hover:shadow-[0_0_18px_rgba(255,111,0,0.3)]",
        outline:
          "border-[#3A3230] bg-[#141210]/90 text-[#FAF7F2] hover:bg-[#1A1614] hover:border-[#FF6F00]/60 hover:text-[#FF6F00]",
        secondary:
          "bg-[#1A1614] text-[#FAF7F2] border border-[#3A3230] hover:bg-[#25201D] hover:border-[#7A736E] hover:text-[#FAF7F2]",
        ghost:
          "text-[#FAF7F2] hover:bg-[#1A1614] hover:text-[#FF6F00]",
        destructive:
          "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 hover:border-red-500/60",
        success:
          "bg-[#1D9E75]/15 text-[#1D9E75] border border-[#1D9E75]/30 hover:bg-[#1D9E75]/25 hover:border-[#1D9E75]/60",
        link: "text-[#FF6F00] underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3",
        xs: "h-6 gap-1 rounded px-2 text-[10px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 text-sm font-semibold uppercase tracking-wider",
        icon: "size-9 rounded-md",
        "icon-xs":
          "size-6 rounded [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
