import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 cursor-pointer",
  {
    variants: {
      variant: {
        // PRIMARY: solid authoritative action
        default:
          "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 shadow-xs font-semibold",
        // GROWTH: high-visibility revenue action
        growth:
          "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs font-semibold",
        // AI: restrained intelligence / campaign action
        ai:
          "bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs font-semibold",
        // SECONDARY / OUTLINE: inspection, review, and navigation
        outline:
          "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/80 hover:text-neutral-900 dark:hover:text-white shadow-xs font-medium",
        secondary:
          "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200/80 dark:hover:bg-neutral-700 shadow-xs font-medium",
        // TERTIARY / GHOST: low-emphasis inline actions
        ghost:
          "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white font-medium",
        // DESTRUCTIVE: reject, disconnect, purge
        destructive:
          "border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100/80 dark:hover:bg-rose-950/60 font-medium",
        link: "text-neutral-900 dark:text-neutral-100 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-1.5 px-3 text-xs",
        xs: "h-6 gap-1 rounded-md px-2 text-[11px]",
        sm: "h-7 gap-1 px-2.5 text-xs",
        lg: "h-9 gap-1.5 px-3.5 text-xs font-semibold",
        xl: "h-10 gap-2 px-4 text-sm font-semibold",
        icon: "size-8",
        "icon-xs": "size-5 rounded-md",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
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
