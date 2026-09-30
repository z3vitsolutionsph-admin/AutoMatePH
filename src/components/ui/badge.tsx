import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded border border-transparent px-2 py-0.5 text-[10px] font-mono font-medium tracking-wider uppercase whitespace-nowrap transition-all focus-visible:border-[#FF6F00] focus-visible:ring-1 focus-visible:ring-[#FF6F00] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-[#FF6F00]/15 text-[#FF6F00] border border-[#FF6F00]/30 font-semibold shadow-[0_0_8px_rgba(255,111,0,0.15)]",
        secondary:
          "bg-[#1A1614] text-[#FAF7F2] border border-[#3A3230]",
        destructive:
          "bg-red-500/15 text-red-400 border border-red-500/30 font-semibold",
        success:
          "bg-[#1D9E75]/15 text-[#1D9E75] border border-[#1D9E75]/30 font-semibold",
        warning:
          "bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold",
        outline:
          "border-[#3A3230] text-[#7A736E] bg-transparent",
        ghost:
          "text-[#7A736E] hover:text-[#FAF7F2] bg-transparent",
        link: "text-[#FF6F00] underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
