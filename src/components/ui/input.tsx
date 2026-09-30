import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-[#3A3230] bg-[#0A0C10] px-3 py-1.5 text-xs sm:text-sm font-mono text-[#FAF7F2] placeholder:text-[#7A736E] placeholder:font-mono transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-[#FAF7F2] focus-visible:border-[#FF6F00] focus-visible:ring-1 focus-visible:ring-[#FF6F00] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-500 aria-invalid:ring-1 aria-invalid:ring-red-500/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
