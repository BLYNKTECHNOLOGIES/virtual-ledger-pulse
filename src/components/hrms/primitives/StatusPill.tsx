import { cn } from "@/lib/utils";

export type PillTone =
  | "default"
  | "primary"
  | "emerald"
  | "amber"
  | "destructive"
  | "info";

const TONE: Record<PillTone, string> = {
  default: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/10 text-primary border-primary/30",
  emerald:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  amber:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

interface StatusPillProps {
  tone?: PillTone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * StatusPill — unified rounded status chip used across HRMS.
 * 10px uppercase, bordered, tinted 10% background.
 */
export function StatusPill({
  tone = "default",
  children,
  icon,
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
        TONE[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
