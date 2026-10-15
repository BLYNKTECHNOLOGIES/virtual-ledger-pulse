import { useId, type ReactNode } from 'react';
import { ShoppingCart, Clock, Send, AlertTriangle, CheckCircle2, ArrowDownLeft, ArrowUpRight, BarChart3, Percent, type LucideIcon } from 'lucide-react';
import { useTerminalValueFlash } from '@/hooks/useTerminalValueFlash';
import { cn } from '@/lib/utils';
import { formatVolume, formatExactRupees, formatIstClock, formatIstWhen, roundShares } from './dashFormat';
import { useOlderThan } from './dashHooks';

type Tone = 'primary' | 'pending' | 'warning' | 'buy' | 'sell' | 'danger';

const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  pending: 'text-trade-pending',
  warning: 'text-warning',
  buy: 'text-trade-buy',
  sell: 'text-trade-sell',
  danger: 'text-destructive',
};

/** Where the live counts come from: Binance now, the synced history (fallback), or still loading. */
export type LiveSource = 'live' | 'history' | 'loading';

/** Live counts older than this are shown as "Not updating" (the poll runs every 2 s, 15 s in a hidden tab). */
const LIVE_STALE_MS = 30 * 1000;

interface Cell {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  /** Number watched for the change flash; null = text value. */
  raw: number | null;
  value: string;
  sub?: ReactNode;
  title?: string;
  /** Colour the value with the tone (something needs attention). */
  attention?: boolean;
  /** 0–100 progress bar under the value. */
  bar?: number;
}

function MetricValue({ raw, formatted, className }: { raw: number; formatted: string; className?: string }) {
  const flash = useTerminalValueFlash(raw);
  return <span className={cn('rounded px-1 -mx-1', className, flash)}>{formatted}</span>;
}

/**
 * One panel holding several metrics. Each cell draws its own left and top hairline
 * and the grid is pulled 1px up and left under the panel edge, so dividers are right
 * whatever the wrap and the panel never shows a grey background while cells fade in.
 * `spans` gives each cell's column classes so rows always fill (no empty slots).
 */
function Strip({ cells, loading, grid, spans }: { cells: Cell[]; loading: boolean; grid: string; spans?: string[] }) {
  return (
    <div className="t-panel overflow-hidden">
      <dl className={cn('t-stagger -ml-px -mt-px grid', grid)}>
        {cells.map((c, i) => (
          <div key={c.label} className={cn('min-w-0 border-l border-t border-border px-4 py-3', spans?.[i])} title={loading ? undefined : c.title}>
            <dt className="flex min-w-0 items-start gap-1.5 text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-muted-foreground">
              <c.icon className={cn('mt-px h-3.5 w-3.5 shrink-0', TONE_TEXT[c.tone])} aria-hidden="true" />
              <span className="line-clamp-2 min-w-0">{c.label}</span>
            </dt>
            <dd className="mt-1.5">
              {loading ? (
                <div className="flex h-8 items-center">
                  <div className="t-shimmer h-6 w-20 rounded" />
                </div>
              ) : (
                <div className={cn('t-mono text-2xl font-semibold leading-8 tracking-tight', c.attention ? TONE_TEXT[c.tone] : 'text-foreground')}>
                  {c.raw == null ? c.value : <MetricValue raw={c.raw} formatted={c.value} />}
                </div>
              )}
              {c.bar != null && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                  {!loading && <div className="h-full rounded-full bg-trade-buy" style={{ width: `${Math.max(0, Math.min(100, c.bar))}%` }} />}
                </div>
              )}
              {c.sub != null && (
                loading ? (
                  <div className="mt-1 flex h-4 items-center"><div className="t-shimmer h-2.5 w-16 rounded" /></div>
                ) : (
                  <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{c.sub}</div>
                )
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Section labels and notes sit on the page canvas: foreground at 80% keeps them as soft as the
// muted text in the dark theme and above 4.5:1 in the light theme.
const SECTION_TITLE = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/80';
const CANVAS_NOTE = 'text-[11px] text-foreground/80';

// Five period cells: 2 per row on phones, 3 + 2 on narrow work areas, 5 in one row when wide.
const PERIOD_GRID = 'grid-cols-2 @[30rem]:grid-cols-6 @[56rem]:grid-cols-5';
const PERIOD_SPANS = [
  'col-span-1 @[30rem]:col-span-2 @[56rem]:col-span-1',
  'col-span-1 @[30rem]:col-span-2 @[56rem]:col-span-1',
  'col-span-1 @[30rem]:col-span-2 @[56rem]:col-span-1',
  'col-span-1 @[30rem]:col-span-3 @[56rem]:col-span-1',
  'col-span-2 @[30rem]:col-span-3 @[56rem]:col-span-1',
];

type LiveState = LiveSource | 'stale';

function LiveBadge({ state, updatedAt }: { state: LiveState; updatedAt?: number }) {
  if (state === 'loading') return null;
  if (state === 'live') {
    return (
      <span className="inline-flex h-5 items-center gap-1.5 rounded-full border border-trade-buy/25 bg-trade-buy/10 px-2 text-[10px] font-medium text-trade-buy">
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="t-pulse absolute inline-flex h-full w-full rounded-full bg-trade-buy opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-trade-buy" />
        </span>
        Live
      </span>
    );
  }
  if (state === 'stale') {
    return (
      <span
        className="inline-flex h-5 items-center gap-1.5 rounded-full border border-warning/30 px-2 text-[10px] font-medium text-warning"
        title={updatedAt ? `Last update from Binance at ${formatIstClock(updatedAt)} IST. The counts below may be out of date.` : undefined}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
        Not updating
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-5 items-center rounded-full border border-border px-2 text-[10px] font-medium text-foreground/80"
      title="Binance live orders are unavailable right now, so these counts come from synced order history for the selected period."
    >
      From order history
    </span>
  );
}

interface MetricCardsProps {
  activeOrders: number;
  awaitingPayment: number;
  awaitingRelease: number;
  completedInPeriod: number;
  appeals: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  avgOrderSize: number;
  completionRate: number;
  buySellRatio: string;
  isLoading: boolean;
  periodLabel?: string;
  /** Source of the four live counts (presentation only). */
  liveSource?: LiveSource;
  /** When the live counts last arrived; the badge says "Not updating" once this is old. */
  liveUpdatedAt?: number;
  /** The live counts fall back to order history and order history could not be read. */
  liveUnavailable?: boolean;
  /** Order history could not be read: show dashes, not zeros. */
  periodUnavailable?: boolean;
  /** End of the period when it stops at the time it was chosen (rolling filters). */
  periodEndsAt?: number | null;
  /** The figures on screen still belong to the previous period while the new one loads. */
  periodUpdating?: boolean;
}

export function MetricCards({
  activeOrders, awaitingPayment, awaitingRelease, completedInPeriod, appeals,
  totalBuyVolume, totalSellVolume, avgOrderSize, completionRate, buySellRatio,
  isLoading, periodLabel, liveSource = 'live', liveUpdatedAt, liveUnavailable = false,
  periodUnavailable = false, periodEndsAt = null, periodUpdating = false,
}: MetricCardsProps) {
  const liveTitleId = useId();
  const periodTitleId = useId();
  const liveOld = useOlderThan(liveSource === 'live' ? liveUpdatedAt : null, LIVE_STALE_MS);
  const liveState: LiveState = liveSource === 'live' && liveOld ? 'stale' : liveSource;

  const avg = avgOrderSize || 0;
  const rate = completionRate || 0;
  const ratio = buySellRatio || '0 / 0';
  const [buys, sells] = ratio.split('/').map((v) => Number(v.trim()) || 0);
  const buyVol = totalBuyVolume || 0;
  const sellVol = totalSellVolume || 0;
  const [buyShare, sellShare] = roundShares([buyVol, sellVol]);
  const hasVolume = buyVol + sellVol > 0;

  const live: Cell[] = [
    { label: 'Active orders', icon: ShoppingCart, tone: 'primary', raw: activeOrders || 0, value: String(activeOrders || 0), sub: 'All open orders' },
    { label: 'Awaiting payment', icon: Clock, tone: 'pending', raw: awaitingPayment || 0, value: String(awaitingPayment || 0), sub: 'Payment not marked yet' },
    { label: 'Awaiting release', icon: Send, tone: 'warning', raw: awaitingRelease || 0, value: String(awaitingRelease || 0), sub: 'Buyer marked paid', attention: (awaitingRelease || 0) > 0 },
    { label: 'Appeals', icon: AlertTriangle, tone: 'danger', raw: appeals || 0, value: String(appeals || 0), sub: 'Open appeals', attention: (appeals || 0) > 0 },
  ];

  const period: Cell[] = [
    {
      label: 'Completed',
      icon: CheckCircle2,
      tone: 'buy',
      raw: completedInPeriod || 0,
      value: (completedInPeriod || 0).toLocaleString('en-IN'),
      sub: `${buys.toLocaleString('en-IN')} ${buys === 1 ? 'buy' : 'buys'} · ${sells.toLocaleString('en-IN')} ${sells === 1 ? 'sell' : 'sells'}`,
    },
    { label: 'Buy volume', icon: ArrowDownLeft, tone: 'buy', raw: buyVol, value: formatVolume(buyVol), sub: hasVolume ? `${buyShare}% of volume` : 'No completed volume', title: `Buy volume ${formatExactRupees(buyVol)}` },
    { label: 'Sell volume', icon: ArrowUpRight, tone: 'sell', raw: sellVol, value: formatVolume(sellVol), sub: hasVolume ? `${sellShare}% of volume` : 'No completed volume', title: `Sell volume ${formatExactRupees(sellVol)}` },
    { label: 'Avg order size', icon: BarChart3, tone: 'primary', raw: avg, value: `₹${avg.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, sub: 'Per completed order' },
    {
      label: 'Completion rate',
      icon: Percent,
      tone: 'buy',
      raw: rate,
      value: `${rate.toFixed(1)}%`,
      bar: rate,
      sub: 'Of finished orders',
      title: 'Completed orders ÷ finished orders (completed, cancelled including auto-cancelled, and expired)',
    },
  ];

  // Without order history, the period figures (and live counts taken from it) are unknown.
  const blank = (cells: Cell[]): Cell[] =>
    cells.map((c) => ({ ...c, raw: null, value: '—', sub: 'Not loaded', title: undefined, attention: false, bar: undefined }));
  const liveCells = liveState === 'history' && liveUnavailable ? blank(live) : live;
  const periodCells = periodUnavailable ? blank(period) : period;

  const liveNote =
    liveState === 'history'
      ? 'Live feed unavailable · counts follow the date filter'
      : liveState === 'stale' && liveUpdatedAt
        ? `Last update ${formatIstClock(liveUpdatedAt)} · not affected by the date filter`
        : 'Right now · not affected by the date filter';
  const liveLoading = liveState === 'loading' || (liveState === 'history' && isLoading);

  return (
    <div className="@container space-y-5">
      <section className="space-y-2" aria-labelledby={liveTitleId}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div id={liveTitleId} role="heading" aria-level={2} className={SECTION_TITLE}>Open orders on Binance</div>
          <LiveBadge state={liveState} updatedAt={liveUpdatedAt} />
          <span className={CANVAS_NOTE}>{liveNote}</span>
        </div>
        <div className={cn('transition-opacity duration-150', liveState === 'history' && periodUpdating && 'opacity-60')}>
          <Strip cells={liveCells} loading={liveLoading} grid="grid-cols-2 @[32rem]:grid-cols-4" />
        </div>
      </section>
      <section className="space-y-2" aria-labelledby={periodTitleId}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div id={periodTitleId} role="heading" aria-level={2} className={SECTION_TITLE}>Trading</div>
          {periodLabel && (
            <span className="inline-flex h-5 items-center rounded-full border border-border bg-secondary/60 px-2 text-[11px] text-foreground">{periodLabel}</span>
          )}
          {periodEndsAt ? (
            <span
              className={CANVAS_NOTE}
              title={`This period was fixed at ${formatIstClock(periodEndsAt)}, when it was chosen. Newer orders appear after you pick another period and come back, or reload the page.`}
            >
              Up to {formatIstWhen(periodEndsAt)}
            </span>
          ) : null}
          {periodUpdating && !isLoading && <span className={cn(CANVAS_NOTE, 'text-primary')}>Updating…</span>}
        </div>
        <div className={cn('transition-opacity duration-150', periodUpdating && 'opacity-60')}>
          <Strip cells={periodCells} loading={isLoading} grid={PERIOD_GRID} spans={PERIOD_SPANS} />
        </div>
      </section>
    </div>
  );
}
