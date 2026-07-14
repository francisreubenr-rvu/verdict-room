import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Carved-well style: no visible border by default — inputs sit inside a
        // well-shaded container (see DESIGN.md "Inputs") rather than drawing
        // their own border/shadow. Consumers add the well wrapper.
        "h-8 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2.5 py-1 font-serif text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:font-serif placeholder:text-muted-foreground placeholder:italic focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
