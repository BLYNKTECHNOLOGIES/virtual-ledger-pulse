import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Sonner toaster wired to the ERP design tokens.
 * Semantic variants (success / error / warning / info) use the shared
 * semantic colours instead of sonner's stock palette, with a fast,
 * subtle entrance/exit.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-xl group-[.toaster]:shadow-lg group-[.toaster]:text-[13px] group-[.toaster]:gap-2.5",
          title: "group-[.toast]:text-[13px] group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
          closeButton:
            "group-[.toast]:bg-card group-[.toast]:border-border group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:border-l-2 group-[.toaster]:border-l-success [&_[data-icon]]:text-success",
          error:
            "group-[.toaster]:border-l-2 group-[.toaster]:border-l-destructive [&_[data-icon]]:text-destructive",
          warning:
            "group-[.toaster]:border-l-2 group-[.toaster]:border-l-warning [&_[data-icon]]:text-warning",
          info:
            "group-[.toaster]:border-l-2 group-[.toaster]:border-l-info [&_[data-icon]]:text-info",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
