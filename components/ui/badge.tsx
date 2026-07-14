import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-xl border border-transparent px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide whitespace-nowrap transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] text-primary-foreground shadow-[inset_1px_2px_4px_rgba(255,225,200,0.5),inset_-2px_-3px_5px_rgba(90,35,10,0.35)] [a]:hover:opacity-90",
        secondary: "bg-chip text-secondary-foreground shadow-[var(--shadow-chip)]",
        destructive:
          "bg-[linear-gradient(145deg,var(--destructive-light),var(--destructive))] text-primary-foreground",
        outline: "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground",
        ghost: "bg-transparent text-muted-foreground hover:bg-muted",
        link: "rounded-none text-primary underline-offset-4 hover:underline",
        // Sponsorship classification — see DESIGN.md "Sponsorship badges".
        organic:
          "bg-[#e9dcb4] text-[#5a4a22] shadow-[inset_1px_2px_4px_rgba(255,250,230,0.9),inset_-1px_-1px_3px_rgba(107,93,69,0.2)]",
        sponsored:
          "bg-[linear-gradient(145deg,var(--primary-light),var(--primary))] text-primary-foreground shadow-[inset_1px_2px_4px_rgba(255,225,200,0.5),inset_-2px_-3px_5px_rgba(90,35,10,0.35)]",
        affiliate:
          "bg-[linear-gradient(145deg,var(--accent-light),var(--accent))] text-accent-foreground shadow-[inset_1px_2px_4px_rgba(255,245,215,0.7),inset_-2px_-3px_5px_rgba(138,90,43,0.3)]",
        unclassified:
          "border-dashed border-muted-foreground/50 bg-[#f2ead2] text-muted-foreground",
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
