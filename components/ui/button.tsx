import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-2xl border-none bg-clip-padding font-mono text-sm font-medium whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Clay: raised gradient pillow that presses into the surface on click.
        default:
          "bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] text-primary-foreground shadow-[var(--shadow-btn-primary)] hover:translate-y-px active:translate-y-[3px] active:scale-[0.97] active:shadow-[var(--shadow-btn-primary-active)]",
        outline:
          "bg-chip text-foreground shadow-[var(--shadow-btn-secondary)] hover:translate-y-px active:translate-y-[2px] active:shadow-[var(--shadow-btn-secondary-active)]",
        secondary:
          "bg-chip text-secondary-foreground shadow-[var(--shadow-btn-secondary)] hover:translate-y-px active:translate-y-[2px] active:shadow-[var(--shadow-btn-secondary-active)]",
        // Quiet/locked: dashed outline, no shadow — deliberately underplayed per DESIGN.md.
        ghost:
          "border-2 border-dashed border-primary/45 text-accent-foreground hover:border-primary/85 hover:text-primary active:translate-y-px",
        destructive:
          "bg-[linear-gradient(145deg,var(--destructive-light),var(--destructive))] text-primary-foreground shadow-[var(--shadow-btn-primary)] hover:translate-y-px active:translate-y-[3px] active:scale-[0.97]",
        link: "rounded-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-xl px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-xl px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-1.5 rounded-2xl px-6 text-[0.95rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs": "size-7 rounded-xl [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-xl",
        "icon-lg": "size-12 rounded-2xl",
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
