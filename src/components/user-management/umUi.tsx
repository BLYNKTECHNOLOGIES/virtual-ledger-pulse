/**
 * Presentation helpers for User Management (/user-management).
 * Nothing here reads or writes data.
 */
import type { ReactNode } from "react";
import { Eye, Search, Settings, ShieldCheck, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { PERMISSION_MODULES, type PermissionTier } from "@/lib/permissions/catalog";

/**
 * Underline tabs (ds-subnav). These classes also cancel the boxed look that the
 * shared TabsList / TabsTrigger add by default (all-side border, min height,
 * wrapping, boxed active tab), so only the bottom line and the active underline remain.
 */
export const SUBNAV_LIST =
  "ds-subnav mb-4 flex h-auto min-h-0 w-full flex-wrap justify-start gap-x-1 gap-y-0 rounded-none border-0 border-b border-border bg-transparent p-0";
export const SUBNAV_TRIGGER =
  "ds-subnav-item flex shrink-0 items-center gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2 text-[13px] shadow-none hover:text-foreground data-[state=active]:border-0 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";

/** Dense ERP table whose outer columns line up with the panel's toolbar padding. */
export const UM_TABLE =
  "ds-table table-fit [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";

/** "Aarav Sharma" or the username when no name is set. */
export const personName = (u: { first_name?: string | null; last_name?: string | null; username?: string | null }) =>
  u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.first_name || u.username || "—";

export function Initials({ name, className }: { name: string; className?: string }) {
  const parts = String(name || "?").trim().split(/[\s._-]+/).filter(Boolean);
  const text = ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary", className)}
    >
      {text}
    </span>
  );
}

/** Small pill. Tones map to the ERP's ds-status styles. */
export function Chip({ tone = "neutral", children, className, title }: { tone?: "success" | "warning" | "danger" | "info" | "neutral"; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cn("ds-status", `ds-status-${tone}`, className)}>{children}</span>;
}

const SYSTEM_ROLES = ["super admin", "admin"];
export const isSystemRole = (name?: string | null) => SYSTEM_ROLES.includes(String(name || "").trim().toLowerCase());

/** Role name as a chip; system roles are outlined in the brand colour, no role is a warning. */
export function RoleChip({ name }: { name?: string | null }) {
  const label = String(name || "").trim();
  if (!label) return <Chip tone="warning">No role</Chip>;
  return <Chip tone={isSystemRole(label) ? "info" : "neutral"} className="max-w-full truncate">{label}</Chip>;
}

const STATUS_META: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};
export function UserStatusChip({ status }: { status?: string | null }) {
  const meta = STATUS_META[String(status || "").toUpperCase()] ?? { label: status || "—", tone: "neutral" as const };
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}

const MODULE_LABELS: Record<string, string> = { hrms: "HRMS", erp: "ERP", p2p: "P2P" };
/** "hrms" → "HRMS", "stock" → "Stock" (system_functions.module). */
export const moduleLabel = (m?: string | null) =>
  MODULE_LABELS[String(m || "").toLowerCase()] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : "—");

/* ── Permission tiers ─────────────────────────────────────────────────── */

const TIER_OF = new Map<string, PermissionTier>();
const LABEL_OF = new Map<string, string>();
Object.values(PERMISSION_MODULES).forEach((m) =>
  m.permissions.forEach((p) => {
    TIER_OF.set(p.id, p.tier);
    LABEL_OF.set(p.id, `${m.label} · ${p.name}`);
  }),
);

/** "Sales · Manage" for a catalog key; the key itself (spaced) otherwise. */
export const permissionLabel = (id?: string | null) => (id ? LABEL_OF.get(id) ?? id.replace(/_/g, " ") : "—");

export const TIER_META: Record<PermissionTier, { label: string; badge: string; icon: typeof Eye }> = {
  view: { label: "View", badge: "bg-success/10 text-success border-success/20", icon: Eye },
  manage: { label: "Manage", badge: "bg-info/10 text-info border-info/20", icon: Settings },
  approve: { label: "Approve", badge: "bg-primary/10 text-primary border-primary/20", icon: ShieldCheck },
  destructive: { label: "Destructive", badge: "bg-destructive/10 text-destructive border-destructive/20", icon: Trash2 },
  special: { label: "Special", badge: "bg-warning/10 text-warning border-warning/20", icon: Zap },
};
export const TIER_ORDER: PermissionTier[] = ["view", "manage", "approve", "destructive", "special"];

/** How many of a role's permissions fall in each tier (keys outside the catalog count as special). */
export function tierCounts(permissions: string[]): Record<PermissionTier, number> {
  const out: Record<PermissionTier, number> = { view: 0, manage: 0, approve: 0, destructive: 0, special: 0 };
  permissions.forEach((p) => { out[TIER_OF.get(p) ?? "special"] += 1; });
  return out;
}

/** Compact tier chips: "26 View · 24 Manage · 5 Destructive". */
export function TierChips({ permissions, className }: { permissions: string[]; className?: string }) {
  const counts = tierCounts(permissions);
  const shown = TIER_ORDER.filter((t) => counts[t] > 0);
  if (shown.length === 0) return <span className={cn("text-xs text-muted-foreground", className)}>No permissions</span>;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((t) => (
        <span key={t} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums", TIER_META[t].badge)}>
          {counts[t]} {TIER_META[t].label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}

/** Empty / loading block used inside panels. */
export function PanelMessage({ icon: Icon, title, children }: { icon?: typeof Eye; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
      {Icon && <Icon className="mb-1 h-8 w-8 text-muted-foreground/50" aria-hidden />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted/60" />
      ))}
    </div>
  );
}

/** Uppercase label above a group of fields inside a dialog. */
export function FormSection({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 rounded-lg border border-border px-3.5 pb-3.5 pt-1", className)}>
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      <div className="space-y-3">
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {children}
      </div>
    </fieldset>
  );
}

/**
 * Footer that stays visible at the bottom of a long, scrolling dialog.
 * The dialog using it must drop its bottom padding (`pb-0 md:pb-0` on DialogContent),
 * otherwise the footer floats above the edge with content showing underneath.
 */
export function StickyFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-4 py-3 md:-mx-6 md:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small count beside a tab label. `attention` makes it stand out (work waiting). */
export function TabCount({ value, attention }: { value: number | null | undefined; attention?: boolean }) {
  if (value == null) return null;
  return (
    <span
      className={cn(
        "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums",
        attention ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
      )}
    >
      {value}
    </span>
  );
}

/** Compact button group used as a filter (one choice at a time). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex h-9 max-w-full shrink-0 items-center overflow-x-auto rounded-md border border-border bg-muted/40 p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null && <span className={cn("tabular-nums", on ? "text-muted-foreground" : "text-muted-foreground/80")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Search box with a leading icon. */
export function SearchField({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="flex h-9 w-full rounded-md border border-input bg-background py-1 pl-8 pr-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      />
    </div>
  );
}

/** "Name / value" summary used at the top of approval dialogs. */
export function DetailList({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm", className)}>
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 break-words font-medium text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
