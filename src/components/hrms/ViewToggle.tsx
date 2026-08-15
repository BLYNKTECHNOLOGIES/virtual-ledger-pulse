import { LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/hooks/useViewMode";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  className?: string;
}

/**
 * Segmented Cards / Table view switch for HRMS pages.
 */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  const options: { key: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
    { key: "cards", label: "Cards", Icon: LayoutGrid },
    { key: "table", label: "Table", Icon: Table2 },
  ];

  return (
    <div className={cn("inline-flex h-9 items-center rounded-lg border border-border bg-muted/40 p-0.5", className)}>
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          title={`${label} view`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium transition-colors",
            value === key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
