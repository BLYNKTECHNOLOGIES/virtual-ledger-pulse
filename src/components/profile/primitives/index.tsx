import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Employee-profile presentation primitives.
 * Pure presentation — no data access, no business logic.
 */

// ── Field grid ───────────────────────────────────────────────
export function FieldGrid({
  children,
  wide,
  className,
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
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
      <div className={cn('ds-field-value mt-0.5', mono && 'font-mono')}>{value ?? '—'}</div>
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
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={cn('ds-panel', className)}>
      {(title || actions) && (
        <header className="ds-panel-head">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
              <h3 className="t-card-title text-foreground truncate">{title}</h3>
            </div>
            {description && <p className="t-secondary mt-0.5">{description}</p>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('ds-panel-body', bodyClassName)}>{children}</div>
    </section>
  );
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
      <span className={cn('truncate', strong ? 'text-foreground font-medium' : 'text-muted-foreground')}>
        {label}
      </span>
      <span
        className={cn(
          'ds-money',
          strong ? 'font-semibold' : 'font-medium',
          tone === 'negative' && 'text-destructive',
          tone === 'positive' && 'text-success',
          tone === 'neutral' && 'text-foreground',
        )}
      >
        {value}
        {suffix && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{suffix}</span>}
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
  if (['approved', 'present', 'active', 'paid', 'completed', 'detailed'].includes(s)) return 'success';
  if (['pending', 'requested', 'awaiting_manager', 'half_day', 'late'].includes(s)) return 'warning';
  if (['rejected', 'absent', 'failed', 'inactive'].includes(s)) return 'danger';
  if (['cancelled', 'no_data', 'draft'].includes(s)) return 'neutral';
  return 'neutral';
}

// ── Empty state ──────────────────────────────────────────────
export function ProfileEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('ds-panel flex flex-col items-center text-center gap-2 px-6 py-10', className)}>
      {Icon && <Icon className="h-6 w-6 text-muted-foreground" />}
      <p className="t-card-title text-foreground">{title}</p>
      {description && <p className="t-secondary max-w-md">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────
export function ProfileSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('ds-panel p-4 space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-muted animate-pulse" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}
