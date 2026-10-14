import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Employee-profile presentation primitives.
 * Pure presentation — no data access, no business logic.
 */

// ── Field grid ───────────────────────────────────────────────
export function FieldGrid({
  children,
  wide,
  dense,
  className,
}: {
  children: ReactNode;
  wide?: boolean;
  /** Two columns even on phones — for short label/value pairs. */
  dense?: boolean;
  className?: string;
}) {
  if (dense) {
    return (
      <div className={cn('grid grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-3', wide && '2xl:grid-cols-4', className)}>{children}</div>
    );
  }
  return (
    <div className={cn('ds-field-grid', wide && 'ds-field-grid-wide', className)}>{children}</div>
  );
}

export function Field({
  label,
  value,
  hint,
  mono,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('ds-field', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="ds-field-label truncate">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground shrink-0">{hint}</span>}
      </div>
      <div className={cn('ds-field-value mt-0.5', mono && 'font-mono tabular-nums')}>{value ?? '—'}</div>
    </div>
  );
}

// ── Section block ────────────────────────────────────────────
export function SectionBlock({
  title,
  description,
  icon: Icon,
  actions,
  children,
  bodyClassName,
  className,
  flush,
  footer,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
  /** Body without padding — for lists and tables that run edge to edge. */
  flush?: boolean;
  footer?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn('ds-panel min-w-0', className)}>
      {(title || actions) && (
        <header className="ds-panel-head flex-wrap">
          <div className="min-w-[9rem] flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
              <h3 className="t-card-title min-w-0 text-foreground [overflow-wrap:anywhere]">{title}</h3>
            </div>
            {description && <p className="t-secondary mt-0.5">{description}</p>}
          </div>
          {actions && <div className="shrink-0 flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(flush ? 'min-w-0' : 'ds-panel-body', bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-border px-3.5 py-2.5">{footer}</div>}
    </section>
  );
}

// ── Tab intro (title + one-line purpose + primary actions) ──
export function TabIntro({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h2 className="t-section text-foreground">{title}</h2>
        {description && <p className="t-secondary mt-0.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Stat tile ────────────────────────────────────────────────
export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
const STAT_TONE: Record<StatTone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  info: 'text-primary',
  muted: 'text-muted-foreground',
};

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
  onClick,
  className,
  children,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
  /** Optional colour for a 3px left accent (e.g. a leave type colour). */
  accent?: string;
}) {
  const body = (
    <>
      {accent && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ backgroundColor: accent }} />}
      <div className="flex items-start justify-between gap-2">
        <span className="ds-field-label">{label}</span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <div className={cn('mt-1 font-display text-[22px] font-bold leading-7 tracking-tight tabular-nums', STAT_TONE[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      {children}
      {onClick && <ChevronRight className="absolute right-2.5 bottom-2.5 h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />}
    </>
  );
  const base = 'relative flex min-w-0 flex-col items-stretch justify-start rounded-[var(--radius-card)] border border-border bg-card p-3.5 text-left';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'ds-elevate ds-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
        {body}
      </button>
    );
  }
  return <div className={cn(base, className)}>{body}</div>;
}

// ── Money row ────────────────────────────────────────────────
export function MoneyRow({
  label,
  value,
  tone = 'neutral',
  suffix,
  strong,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'neutral' | 'negative' | 'positive';
  suffix?: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="ds-money-row">
      <span className={cn('min-w-0', strong ? 'text-foreground font-medium' : 'text-muted-foreground')}>
        {label}
      </span>
      <span
        className={cn(
          'ds-money shrink-0 font-mono text-[13px]',
          strong ? 'font-semibold' : 'font-medium',
          tone === 'negative' && 'text-destructive',
          tone === 'positive' && 'text-success',
          tone === 'neutral' && 'text-foreground',
        )}
      >
        {value}
        {suffix && <span className="ml-1 font-sans text-[10px] font-normal text-muted-foreground">{suffix}</span>}
      </span>
    </div>
  );
}

// ── Status pill ──────────────────────────────────────────────
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'ds-status-success',
  warning: 'ds-status-warning',
  danger: 'ds-status-danger',
  info: 'ds-status-info',
  neutral: 'ds-status-neutral',
};

export function StatusPill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return <span className={cn('ds-status', TONE_CLASS[tone], className)}>{children}</span>;
}

/** Maps common request/attendance statuses to a semantic tone. */
export function statusTone(status?: string | null): StatusTone {
  const s = (status || '').toLowerCase();
  if (['approved', 'present', 'active', 'paid', 'completed', 'detailed', 'allocated', 'resolved', 'verified'].includes(s)) return 'success';
  if (['pending', 'requested', 'awaiting_manager', 'half_day', 'late', 'incomplete', 'manager_review', 'manager_reviewed', 'manager_approved', 'open'].includes(s)) return 'warning';
  if (['rejected', 'absent', 'failed', 'inactive', 'overdue'].includes(s)) return 'danger';
  if (['in_progress', 'on_leave', 'assigned', 'scheduled'].includes(s)) return 'info';
  if (['cancelled', 'no_data', 'draft', 'expired', 'returned', 'closed', 'week_off', 'holiday'].includes(s)) return 'neutral';
  return 'neutral';
}

// ── Empty state ──────────────────────────────────────────────
export function ProfileEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  bare,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** No panel chrome — for use inside an existing panel. */
  bare?: boolean;
}) {
  return (
    <div className={cn(!bare && 'ds-panel', 'flex flex-col items-center text-center gap-2 px-6 py-10', className)}>
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
      )}
      <p className="t-card-title text-foreground">{title}</p>
      {description && <div className="t-secondary max-w-md">{description}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────
export function ProfileSkeleton({ rows = 3, className, bare }: { rows?: number; className?: string; bare?: boolean }) {
  return (
    <div className={cn(!bare && 'ds-panel', 'p-4 space-y-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-muted animate-pulse" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

// ── Small count badge for nav items and headers ─────────────
export function CountBadge({ count, tone = 'info', className }: { count: number; tone?: 'info' | 'warning' | 'neutral'; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
        tone === 'info' && 'bg-primary/10 text-primary',
        tone === 'warning' && 'bg-warning/15 text-warning',
        tone === 'neutral' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
