import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, MinusCircle, ShieldBan, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BinanceAd, BINANCE_AD_STATUS, getAdStatusLabel } from '@/hooks/useBinanceAds';
import { adZone } from '@/lib/adZone';
import { toValidDate, safeFormat } from '@/lib/safe-date';

/*
 * Shared presentation pieces for the Ad Manager (page, views and dialogs).
 * Presentation only: nothing here fetches, mutates or decides behaviour.
 */

/* Segmented controls — same look as the Terminal Orders filters. */
export const SEG_LIST = 'h-8 min-h-0 flex-nowrap gap-0.5 rounded-md border border-border bg-secondary/60 p-0.5';
export const SEG_TRIGGER =
  'h-7 gap-1.5 rounded-[5px] px-2.5 py-0 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm';
export const SEG_COUNT = 't-mono min-w-[18px] rounded px-1 text-center text-[10px] tabular-nums';
/** A toggle button styled like a segment (aria-pressed drives the look). */
export const SEG_BTN =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm';

/* Small chips used on cards, rows and dialogs. */
export const CHIP = 'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1.5 text-[10px] font-semibold leading-none';
export const CHIP_MUTED = `${CHIP} border-border bg-secondary/70 text-muted-foreground`;

export function SideChip({ side, className }: { side: string; className?: string }) {
  const buy = side === 'BUY';
  return (
    <span className={cn(CHIP, buy ? 'border-trade-buy/30 bg-trade-buy/10 text-trade-buy' : 'border-trade-sell/30 bg-trade-sell/10 text-trade-sell', className)}>
      {buy ? 'BUY' : side === 'SELL' ? 'SELL' : side}
    </span>
  );
}

export function ZoneChip({ ad, className }: { ad: Pick<BinanceAd, 'classify'>; className?: string }) {
  if (adZone(ad) !== 'block') return null;
  return <span className={cn(CHIP_MUTED, 'text-foreground', className)}>Block</span>;
}

export function PriceTypeLabel({ ad }: { ad: Pick<BinanceAd, 'priceType'> }) {
  return <span className="whitespace-nowrap">{ad.priceType === 1 ? 'Fixed' : 'Floating'}</span>;
}

export function StatusDot({ status, className }: { status: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        status === BINANCE_AD_STATUS.ONLINE ? 'bg-success' : status === BINANCE_AD_STATUS.PRIVATE ? 'bg-warning' : 'bg-muted-foreground/60',
        className,
      )}
    />
  );
}

export function StatusPill({ status, className }: { status: number; className?: string }) {
  const tone =
    status === BINANCE_AD_STATUS.ONLINE
      ? 'border-success/30 bg-success/10 text-success'
      : status === BINANCE_AD_STATUS.PRIVATE
        ? 'border-warning/30 bg-warning/10 text-warning'
        : 'border-border bg-secondary/70 text-muted-foreground';
  return (
    <span className={cn(CHIP, 'font-medium', tone, className)}>
      {status === BINANCE_AD_STATUS.PRIVATE ? <Lock className="h-2.5 w-2.5" /> : <StatusDot status={status} />}
      {getAdStatusLabel(status)}
    </span>
  );
}

/** "Not visible" chip; the full Binance reason sits in the tooltip. */
export function HiddenChip({ reason, className }: { reason: string; className?: string }) {
  return (
    <span title={reason} className={cn(CHIP, 'border-destructive/30 bg-destructive/10 text-destructive', className)}>
      Not visible
    </span>
  );
}

/** Short plain reason for the card line, e.g. "Remaining amount is below your minimum order limit". */
export function hiddenReasonShort(reason: string) {
  const s = reason.replace(/^Hidden by Binance\s*[—-]\s*/i, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ExcludedChip({ className, labelClassName }: { className?: string; labelClassName?: string }) {
  return (
    <span title="Excluded from automation — change it in the ⋮ menu" className={cn(CHIP, 'border-destructive/30 bg-destructive/10 text-destructive', className)}>
      <ShieldBan className="h-2.5 w-2.5" />
      <span className={labelClassName}>Excluded</span>
    </span>
  );
}

/* Number formatting (display only). */
export const inr = (n: unknown, opts?: { min?: number; max?: number }) => {
  const v = Number(n || 0);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: opts?.min ?? 0, maximumFractionDigits: opts?.max ?? 2 })}`;
};
/** Ad price: 2 decimals, up to 6 for prices under ₹1 (e.g. SHIB). */
export const priceText = (n: unknown) => {
  const v = Number(n || 0);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: v > 0 && v < 1 ? 6 : 2 })}`;
};
export const qty = (n: unknown) => Number(n || 0).toLocaleString('en-IN');
export const shortAdNo = (advNo?: string, n = 8) => (advNo ? `…${advNo.slice(-n)}` : '—');

export function limitsText(ad: Pick<BinanceAd, 'minSingleTransAmount' | 'maxSingleTransAmount'>) {
  return `${inr(ad.minSingleTransAmount)} – ${inr(ad.maxSingleTransAmount)}`;
}

/** Remaining quantity as a share of the ad's total (for the thin bar). */
export function remainingShare(ad: Pick<BinanceAd, 'surplusAmount' | 'initAmount'>) {
  const left = Number(ad.surplusAmount || 0);
  const total = Number(ad.initAmount || 0);
  if (!(total > 0)) return left > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, left / total));
}

export function QtyBar({ ad, className }: { ad: Pick<BinanceAd, 'surplusAmount' | 'initAmount'>; className?: string }) {
  const share = remainingShare(ad);
  const left = Number(ad.surplusAmount || 0);
  return (
    <span aria-hidden="true" className={cn('block h-1 w-full overflow-hidden rounded-full bg-secondary', className)}>
      <span
        className={cn('block h-full rounded-full', left <= 0 ? 'bg-destructive' : share < 0.15 ? 'bg-warning' : 'bg-primary/70')}
        style={{ width: `${Math.max(left > 0 ? 3 : 0, Math.round(share * 100))}%` }}
      />
    </span>
  );
}

/** Amber "Xh ago" label when an ad's price is older than 30 min, else null. */
export function stalePriceLabel(updateTime?: string): string | null {
  const d = toValidDate(updateTime);
  if (!d) return null;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins <= 30) return null;
  return mins >= 60 ? `${Math.floor(mins / 60)}h ago` : `${mins}m ago`;
}

/** Updated time as "15 Oct, 16:47"; full date in the tooltip. */
export function updatedText(updateTime?: unknown) {
  return safeFormat(updateTime, 'dd MMM, HH:mm');
}
export function updatedTitle(updateTime?: unknown) {
  const d = toValidDate(updateTime);
  return d ? `Updated ${safeFormat(d, 'dd MMM yyyy, HH:mm:ss')}` : 'Update time unknown';
}

/* ── Dialog building blocks ───────────────────────────────────────────── */

type Tone = 'primary' | 'warning' | 'destructive' | 'success' | 'muted';
const TONE_TILE: Record<Tone, string> = {
  primary: 'border-primary/20 bg-primary/10 text-primary',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
  success: 'border-success/25 bg-success/10 text-success',
  muted: 'border-border bg-secondary text-muted-foreground',
};

/** Dialog header: icon tile, title and a one-line description (real Title/Description for screen readers). */
export function AdDialogHeader({ icon: Icon, tone = 'primary', title, description, className }: { icon: LucideIcon; tone?: Tone; title: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <DialogHeader className={cn('space-y-0 pr-8 text-left sm:text-left', className)}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', TONE_TILE[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <DialogTitle className="text-base leading-tight">{title}</DialogTitle>
          {description && <DialogDescription className="text-xs leading-relaxed">{description}</DialogDescription>}
        </div>
      </div>
    </DialogHeader>
  );
}

/** "3 ads · 2 buy / 1 sell · 3 P2P / 0 Block" summary chips for a selection. */
export function SelectionSummary({ ads, label, className }: { ads: BinanceAd[]; label?: ReactNode; className?: string }) {
  const buy = ads.filter((a) => a.tradeType === 'BUY').length;
  const sell = ads.filter((a) => a.tradeType === 'SELL').length;
  const block = ads.filter((a) => adZone(a) === 'block').length;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-[11px]', className)}>
      <span className="inline-flex h-6 items-center rounded-md border border-primary/25 bg-primary/10 px-2 font-semibold text-foreground tabular-nums">
        {label ?? `${ads.length} ad${ads.length !== 1 ? 's' : ''}`}
      </span>
      <span className="inline-flex h-6 items-center rounded-md border border-border bg-secondary/60 px-2 text-muted-foreground tabular-nums">
        {buy} buy · {sell} sell
      </span>
      <span className="inline-flex h-6 items-center rounded-md border border-border bg-secondary/60 px-2 text-muted-foreground tabular-nums">
        {ads.length - block} P2P · {block} Block
      </span>
    </div>
  );
}

/** Steps of a bulk dialog (e.g. Set values → Review → Apply). */
export function StepRail({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5 text-[11px]" aria-label="Steps">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center gap-1.5" aria-current={active ? 'step' : undefined}>
            {i > 0 && <span aria-hidden="true" className={cn('h-px w-4', done || active ? 'bg-primary/50' : 'bg-border')} />}
            <span
              className={cn(
                'inline-flex h-5 items-center gap-1 rounded-full border px-2 font-medium',
                active ? 'border-primary/40 bg-primary/10 text-foreground' : done ? 'border-success/30 bg-success/10 text-success' : 'border-border text-muted-foreground',
              )}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : <span className="t-mono tabular-nums">{i + 1}</span>}
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Callout box for confirms, warnings and notes. */
export function NoteBox({ tone = 'warning', title, children, icon, className }: { tone?: 'warning' | 'destructive' | 'info' | 'success'; title?: ReactNode; children?: ReactNode; icon?: LucideIcon; className?: string }) {
  const Icon = icon ?? (tone === 'info' ? Info : tone === 'success' ? CheckCircle2 : AlertTriangle);
  const toneCls =
    tone === 'destructive'
      ? 'border-destructive/30 bg-destructive/10'
      : tone === 'info'
        ? 'border-border bg-secondary/50'
        : tone === 'success'
          ? 'border-success/30 bg-success/10'
          : 'border-warning/30 bg-warning/10';
  const iconCls = tone === 'destructive' ? 'text-destructive' : tone === 'info' ? 'text-muted-foreground' : tone === 'success' ? 'text-success' : 'text-warning';
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border p-3 text-sm', toneCls, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconCls)} />
      <div className="min-w-0 space-y-1">
        {title && <div className="font-medium text-foreground">{title}</div>}
        {children && <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>}
      </div>
    </div>
  );
}

export type RunStatus = 'pending' | 'success' | 'error' | 'skipped';

export function RunIcon({ status, className }: { status: RunStatus; className?: string }) {
  if (status === 'pending') return <Loader2 className={cn('h-4 w-4 shrink-0 animate-spin text-muted-foreground', className)} />;
  if (status === 'success') return <CheckCircle2 className={cn('h-4 w-4 shrink-0 text-success', className)} />;
  if (status === 'error') return <XCircle className={cn('h-4 w-4 shrink-0 text-destructive', className)} />;
  return <MinusCircle className={cn('h-4 w-4 shrink-0 text-muted-foreground', className)} />;
}

/** One line of a bulk run: icon, ad number, change, optional message. */
export function RunRow({ status, advNo, change, message, tag }: { status: RunStatus; advNo: string; change?: ReactNode; message?: ReactNode; tag?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs odd:bg-secondary/40">
      <RunIcon status={status} className="mt-px h-3.5 w-3.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="t-mono tabular-nums text-foreground">{shortAdNo(advNo)}</span>
            {tag}
          </span>
          {change && <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">{change}</span>}
        </div>
        {message && <div className={cn('mt-0.5 break-words', status === 'error' ? 'text-destructive' : 'text-warning')}>{message}</div>}
      </div>
    </div>
  );
}

/** Done line for a bulk run: all good, or N ok / M failed. */
export function RunSummary({ ok, failed, okText }: { ok: number; failed: number; okText: string }) {
  if (failed === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-foreground">
        <CheckCircle2 className="h-4 w-4 text-success" /> {okText}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-foreground">
      <AlertTriangle className="h-4 w-4 text-warning" /> {ok} succeeded, {failed} failed
    </div>
  );
}

/** Running progress line shown while a bulk run is in flight. */
export function RunProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {label}</span>
        <span className="t-mono tabular-nums">{done}/{total}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
