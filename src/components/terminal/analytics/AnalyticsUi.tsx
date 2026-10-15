import { useContext, type ElementType, type ReactNode } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PendingContext } from './pendingContext';

/**
 * Presentation-only building blocks for Terminal → Analytics.
 * No data access and no business rules live here.
 */

export type Tone = 'primary' | 'buy' | 'sell' | 'warning' | 'muted';

const TONE_TILE: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  buy: 'bg-trade-buy/10 text-trade-buy',
  sell: 'bg-trade-sell/10 text-trade-sell',
  warning: 'bg-destructive/10 text-destructive',
  muted: 'bg-secondary text-muted-foreground',
};

/** Small uppercase caption used for section and column labels. */
export const CAPTION = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground';

export function Panel({
  title,
  icon: Icon,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  icon?: ElementType;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('t-panel flex min-w-0 flex-col', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pb-2 pt-3.5">
          <div className="min-w-0">
            {title && (
              <div role="heading" aria-level={2} className="flex items-center gap-1.5 text-[13px] font-semibold leading-5 text-foreground">
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="min-w-0 truncate">{title}</span>
              </div>
            )}
            {subtitle && <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('min-w-0 flex-1 px-4 pb-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  valueTitle,
  sub,
  tone = 'primary',
}: {
  icon: ElementType;
  label: string;
  value: string;
  valueTitle?: string;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="t-panel min-w-0 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', TONE_TILE[tone])} aria-hidden="true">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 truncate t-mono text-xl font-semibold leading-7 tracking-tight text-foreground" title={valueTitle}>
        {value}
      </div>
      {sub && <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{sub}</div>}
    </div>
  );
}

export type SegmentOption<T extends string> = { value: T; label: ReactNode; count?: number };

/**
 * Single-choice segmented control, styled like the shared period filter (raised,
 * primary and outlined when chosen, so selection never relies on colour alone).
 * Radix radio group: arrow keys move and select.
 */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  ariaLabel: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      orientation="horizontal"
      aria-label={ariaLabel}
      className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-border bg-secondary/60 p-0.5"
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-xs font-medium text-foreground/80 transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-card data-[state=checked]:text-primary data-[state=checked]:shadow-sm data-[state=checked]:ring-1 data-[state=checked]:ring-inset data-[state=checked]:ring-primary/70"
        >
          {o.label}
          {o.count != null && (
            <span className="t-mono min-w-[18px] rounded bg-muted px-1 text-center text-[10px] tabular-nums text-muted-foreground">{o.count}</span>
          )}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/** Colour key for a series (identity lives in the swatch, text stays neutral). */
export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block h-2 w-2 shrink-0 rounded-[2px]', className)} style={{ background: color }} />;
}

/** Thin share-of-total bar under a value (outlined track so every series colour stays visible). */
export function ShareBar({ pct, color = 'hsl(var(--primary))', label }: { pct: number; color?: string; label: string }) {
  const w = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full ring-1 ring-inset ring-border" role="img" aria-label={label}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** Buy vs sell split with a 2px gap; a neutral track when there is no volume. */
export function SplitBar({ buy, sell, className }: { buy: number; sell: number; className?: string }) {
  const total = buy + sell;
  if (!(total > 0)) {
    return <div className={cn('h-2 w-full rounded-full bg-secondary', className)} role="img" aria-label="No completed volume" />;
  }
  const buyPct = (buy / total) * 100;
  return (
    <div
      className={cn('flex h-2 w-full gap-[2px] overflow-hidden rounded-full', className)}
      role="img"
      aria-label={`Buy ${buyPct.toFixed(1)}%, sell ${(100 - buyPct).toFixed(1)}%`}
    >
      {buy > 0 && <div className="h-full rounded-l-full bg-trade-buy" style={{ width: `${buyPct}%` }} />}
      {sell > 0 && <div className="h-full flex-1 rounded-r-full bg-trade-sell" />}
    </div>
  );
}

export function EmptyState({ icon: Icon, text, className }: { icon?: ElementType; text: string; className?: string }) {
  const pending = useContext(PendingContext);
  return (
    <div className={cn('flex min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground', className)}>
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin opacity-60" aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-5 w-5 opacity-50" aria-hidden="true" />
      )}
      <span>{pending || text}</span>
    </div>
  );
}

/** Container for custom chart tooltips. */
export function TooltipCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-[180px] rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 font-medium text-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function TooltipRow({ color, label, value, sub }: { color?: string; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color && <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="t-mono tabular-nums text-foreground">
        {value}
        {sub && <span className="ml-1.5 text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

/** Legend row: swatch + neutral label. */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
