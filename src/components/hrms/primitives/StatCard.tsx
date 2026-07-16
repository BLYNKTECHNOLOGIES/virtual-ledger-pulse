import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type StatTone = "default" | "primary" | "emerald" | "amber" | "destructive";

const TONE: Record<StatTone, { icon: string; ring: string; accent: string }> = {
  default: {
    icon: "text-muted-foreground bg-muted",
    ring: "",
    accent: "text-foreground",
  },
  primary: {
    icon: "text-primary bg-primary/10",
    ring: "",
    accent: "text-primary",
  },
  emerald: {
    icon: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    ring: "",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    icon: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    ring: "",
    accent: "text-amber-600 dark:text-amber-400",
  },
  destructive: {
    icon: "text-destructive bg-destructive/10",
    ring: "",
    accent: "text-destructive",
  },
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  onClick?: () => void;
  className?: string;
}

/**
 * StatCard — single-metric surface for HR dashboards.
 * Tabular numerals, tokenized status accents, tap-target friendly.
 */
export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "default",
  onClick,
  className,
}: StatCardProps) {
  const t = TONE[tone];
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "group text-left rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col gap-2 transition-colors",
        onClick && "hover:border-primary/40 hover:bg-accent/40 active:scale-[0.99]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </p>
        {Icon && (
          <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg", t.icon)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className={cn("text-xl sm:text-2xl font-semibold tracking-tight tabular-nums", t.accent)}>
        {value}
      </div>
      {helper && (
        <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">{helper}</p>
      )}
    </Tag>
  );
}
