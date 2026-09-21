import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WorkforceKpiCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "danger" | "success";
  onClick?: () => void;
}

const TONE: Record<string, string> = {
  default: "text-foreground",
  warning: "text-amber-600",
  danger: "text-destructive",
  success: "text-emerald-600",
};

export function WorkforceKpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  onClick,
}: WorkforceKpiCardProps) {
  return (
    <Card
      className={cn(onClick && "cursor-pointer transition-colors hover:border-primary/50")}
      onClick={onClick}
    >
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {Icon && <Icon className={cn("h-4 w-4 shrink-0", TONE[tone])} />}
        </div>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", TONE[tone])}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
