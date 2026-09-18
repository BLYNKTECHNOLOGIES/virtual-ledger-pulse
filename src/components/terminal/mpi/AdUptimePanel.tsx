import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, AlertTriangle, Clock, Radio, ShoppingCart, Store, Coins, Zap, RefreshCw, EyeOff, Coffee } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/** Categories we actually trade in, with the shift-score weights. */
const AD_CLASSES = [
  { key: 'lightning_small_sale', label: 'Lightning small sale', short: 'Lightning', weight: 15, icon: Zap },
  { key: 'small_sale', label: 'Small sale (UPI)', short: 'Small sale', weight: 15, icon: Coins },
  { key: 'big_sell', label: 'Big sell', short: 'Big sell', weight: 30, icon: Store },
  { key: 'big_buy', label: 'Big buy', short: 'Big buy', weight: 40, icon: ShoppingCart },
] as const;

const CLASS_LABEL: Record<string, string> = Object.fromEntries(AD_CLASSES.map((c) => [c.key, c.label]));

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function istThisMonth(): string {
  return istToday().slice(0, 7);
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}


function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(1)}%`;
}

function scoreTone(value: number): string {
  if (value >= 90) return 'text-success';
  if (value >= 70) return 'text-warning';
  return 'text-destructive';
}

/**
 * Sentinel account id used by the rollup for the pooled "all accounts" line.
 * A minute counts as active there if ANY account had a public, online ad, so
 * accounts that simply do not run a category never drag the number down.
 */
const POOLED_ACCOUNT = '00000000-0000-0000-0000-000000000000';

interface SummaryRow {
  ist_date: string;
  shift_key: string;
  ad_class: string;
  exchange_account_id: string;
  shift_minutes: number;
  measured_minutes: number;
  unmeasured_minutes: number;
  effective_minutes: number;
  offline_minutes: number;
  private_minutes: number;
  active_clock_minutes: number;
  private_only_minutes: number;
  offline_clock_minutes: number;
  break_minutes?: number;

  full_coverage_minutes: number;
  partial_coverage_minutes: number;
  down_minutes: number;
  minutes_one: number;
  minutes_two: number;
  minutes_three_plus: number;
  peak_concurrent: number;
  concurrency_cap: number;
  expected_ads: number;
  uptime_pct: number;
  category_score: number;
  downtime_episodes: Array<{
    adv_no: string;
    from: string;
    to: string;
    minutes: number;
    grade: string;
    asset?: string | null;
    zone?: string | null;
  }>;
}

/**
 * One row per shift + category: the pooled all-accounts line when no account
 * filter is applied, otherwise that account's own line. Mixing the two is what
 * made the category cards and the blended score disagree.
 */
function scopeRows<T extends SummaryRow>(rows: T[], accountId: string): T[] {
  if (accountId !== 'all') return rows.filter((r) => r.exchange_account_id === accountId);
  const pooled = new Set(
    rows.filter((r) => r.exchange_account_id === POOLED_ACCOUNT).map((r) => `${r.shift_key}|${r.ad_class}`),
  );
  const best = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.shift_key}|${row.ad_class}`;
    if (row.exchange_account_id === POOLED_ACCOUNT) {
      best.set(key, row);
      continue;
    }
    if (pooled.has(key)) continue;
    // Legacy days have no pooled line — fall back to the strongest account.
    const current = best.get(key);
    if (!current || Number(row.category_score) > Number(current.category_score)) best.set(key, row);
  }
  return [...best.values()];
}


export function AdUptimePanel() {
  const [mode, setMode] = useState<'day' | 'month'>('day');
  const [date, setDate] = useState(istToday());
  const [month, setMonth] = useState(istThisMonth());
  const [accountId, setAccountId] = useState<string>('all');
  const [shift, setShift] = useState<string>('all');
  const [timelineClass, setTimelineClass] = useState<string>('big_sell');


  // Only accounts flagged for ad-uptime tracking are measured or shown.
  const { data: accounts = [] } = useQuery({
    queryKey: ['terminal-exchange-accounts-uptime'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_exchange_accounts')
        .select('id, account_name, is_active')
        .eq('is_active', true)
        .eq('ad_uptime_tracked', true)
        .order('display_order');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 300_000,
  });


  const { data: shifts = [] } = useQuery({
    queryKey: ['terminal-shift-windows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_shift_windows')
        .select('shift_key, shift_name, start_time, end_time, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 300_000,
  });

  const { data: summary = [], isFetching, refetch } = useQuery({
    queryKey: ['ad-uptime-summary', date, accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_ad_uptime_shift_summary')
        .select('*')
        .eq('ist_date', date);
      if (error) throw error;
      return scopeRows((data ?? []) as unknown as SummaryRow[], accountId);
    },
    enabled: mode === 'day',
    refetchInterval: 60_000,
  });

  /**
   * Monthly view reads the pre-aggregated monthly table — never the raw minute
   * rows — so opening a month costs one small query.
   */
  const { data: monthly = [], isFetching: monthFetching, refetch: refetchMonth } = useQuery({
    queryKey: ['ad-uptime-monthly', month, accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_ad_uptime_monthly_summary' as any)
        .select('*')
        .eq('month_start', `${month}-01`);
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({
        ...r,
        ist_date: r.month_start,
        downtime_episodes: [],
      })) as unknown as (SummaryRow & { days_counted: number })[];
      return scopeRows(rows, accountId);
    },
    enabled: mode === 'month',
    staleTime: 300_000,
  });



  const { data: timeline = [] } = useQuery({
    queryKey: ['ad-uptime-timeline', date, accountId, timelineClass],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ad_uptime_timeline' as any, {
        p_date: date,
        p_ad_class: timelineClass,
        p_account: accountId === 'all' ? null : accountId,
        p_bucket_minutes: 10,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        bucket_start: string;
        shift_key: string | null;
        ads_expected: number;
        active_ads: number;
        private_ads: number;
        offline_ads: number;
        samples: number;
      }>;
    },
    enabled: mode === 'day',
    refetchInterval: 60_000,
  });


  const { data: heartbeat } = useQuery({
    queryKey: ['ad-uptime-heartbeat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_ad_uptime_runs')
        .select('minute, status, ads_seen, error_text')
        .order('minute', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  /** Blended shift score (Lightning 15 / Small sale 15 / Big sell 30 / Big buy 40). */
  const { data: blendedDay = [] } = useQuery({
    queryKey: ['ad-uptime-blended', date, accountId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ad_uptime_shift_score' as any, {
        p_from: date,
        p_to: date,
        p_account: accountId === 'all' ? null : accountId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        ist_date: string;
        shift_key: string;
        blended_score: number;
        weight_covered: number;
        categories: Record<string, { score: number; weight: number; peak_concurrent: number; private_minutes: number }>;
      }>;
    },
    enabled: mode === 'day',
    refetchInterval: 60_000,
  });

  /** Monthly blended score — reads the pre-aggregated monthly rows only. */
  const { data: blendedMonth = [] } = useQuery({
    queryKey: ['ad-uptime-blended-month', month, accountId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ad_uptime_monthly_score' as any, {
        p_month: `${month}-01`,
        p_account: accountId === 'all' ? null : accountId,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, ist_date: r.month_start })) as unknown as Array<{
        ist_date: string;
        shift_key: string;
        blended_score: number;
        weight_covered: number;
        categories: Record<string, { score: number; weight: number; peak_concurrent: number; private_minutes: number }>;
      }>;
    },
    enabled: mode === 'month',
    staleTime: 300_000,
  });

  const blended = mode === 'month' ? blendedMonth : blendedDay;

  /**
   * Big buy is scored slot by slot (coin + zone), so this breakdown shows exactly
   * which buy slot was short. Raw minutes are kept ~4 days, so day mode only.
   */
  const { data: buySlots = [] } = useQuery({
    queryKey: ['ad-uptime-buy-slots', date, shift, accountId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ad_uptime_buy_slots' as any, {
        p_date: date,
        p_shift: shift,
        p_account: accountId === 'all' ? null : accountId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        asset: string;
        zone: string;
        required_ads: number;
        slot_score: number;
        peak_active: number;
        measured_minutes: number;
      }>;
    },
    enabled: mode === 'day',
    refetchInterval: 120_000,
  });

  const { data: trend = [] } = useQuery({
    queryKey: ['ad-uptime-trend', accountId],
    queryFn: async () => {
      const from = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10);
      const to = istToday();
      const { data, error } = await supabase.rpc('get_ad_uptime_shift_score' as any, {
        p_from: from,
        p_to: to,
        p_account: accountId === 'all' ? null : accountId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ ist_date: string; shift_key: string; blended_score: number }>;
    },
    staleTime: 300_000,
  });

  const baseRows = mode === 'month' ? monthly : summary;

  const filtered = useMemo(
    () => baseRows.filter((row) => shift === 'all' || row.shift_key === shift),
    [baseRows, shift],
  );


  const byClass = useMemo(() => {
    const map: Record<string, {
      score: number; uptime: number; active: number; offline: number; privateMin: number;
      breakMin: number;
      unmeasured: number; measured: number; peak: number; one: number; two: number; threePlus: number; down: number;
    }> = {};

    for (const cls of AD_CLASSES) {
      const rows = filtered.filter((r) => r.ad_class === cls.key);
      // Every minute figure below is CLOCK minutes of the shift, so
      // active + private-only + offline always add back up to measured.
      const measured = rows.reduce((s, r) => s + r.measured_minutes, 0);
      const active = rows.reduce((s, r) => s + (r.active_clock_minutes ?? Math.max(r.measured_minutes - r.down_minutes, 0)), 0);
      const weightedScore = rows.reduce((s, r) => s + Number(r.category_score) * r.measured_minutes, 0);
      map[cls.key] = {
        uptime: measured ? (100 * active) / measured : 0,
        score: measured ? weightedScore / measured : 0,
        active,
        offline: rows.reduce((s, r) => s + (r.offline_clock_minutes ?? 0), 0),
        privateMin: rows.reduce((s, r) => s + (r.private_only_minutes ?? 0), 0),
        breakMin: rows.reduce((s, r) => s + (r.break_minutes ?? 0), 0),

        unmeasured: rows.reduce((s, r) => s + r.unmeasured_minutes, 0),
        peak: rows.reduce((s, r) => Math.max(s, r.peak_concurrent ?? 0), 0),
        one: rows.reduce((s, r) => s + (r.minutes_one ?? 0), 0),
        two: rows.reduce((s, r) => s + (r.minutes_two ?? 0), 0),
        threePlus: rows.reduce((s, r) => s + (r.minutes_three_plus ?? 0), 0),
        down: rows.reduce((s, r) => s + r.down_minutes, 0),
        measured,
      };
    }
    return map;
  }, [filtered]);


  const blendedShown = useMemo(
    () => blended.filter((b) => shift === 'all' || b.shift_key === shift),
    [blended, shift],
  );

  const episodes = useMemo(() => {
    const out: Array<SummaryRow['downtime_episodes'][number] & { shift_key: string; ad_class: string }> = [];
    for (const row of filtered) {
      for (const ep of row.downtime_episodes ?? []) {
        out.push({ ...ep, shift_key: row.shift_key, ad_class: row.ad_class });
      }
    }
    return out.sort((a, b) => b.minutes - a.minutes).slice(0, 40);
  }, [filtered]);

  const trendByShift = useMemo(() => {
    const cutoff7 = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10);
    const out: Record<string, { d7: number | null; d30: number | null }> = {};
    for (const window of shifts as any[]) {
      const rows = trend.filter((r) => r.shift_key === window.shift_key);
      const rows7 = rows.filter((r) => r.ist_date >= cutoff7);
      const avg = (list: typeof rows) =>
        list.length ? list.reduce((s, r) => s + Number(r.blended_score || 0), 0) / list.length : null;
      out[window.shift_key] = { d7: avg(rows7), d30: avg(rows) };
    }
    return out;
  }, [trend, shifts]);

  const heartbeatAgeMin = heartbeat?.minute
    ? Math.round((Date.now() - new Date(heartbeat.minute).getTime()) / 60_000)
    : null;
  const heartbeatHealthy = heartbeatAgeMin !== null && heartbeatAgeMin <= 3 && heartbeat?.status !== 'error';

  return (
    <TooltipProvider>
      <Card className="border-border bg-card">
        <CardHeader className="pb-2 px-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Ad Active Time — by shift
              {mode === 'month' && (
                <span className="text-[10px] font-normal text-muted-foreground">· {monthLabel(month)}</span>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={`text-[9px] gap-1 ${heartbeatHealthy ? 'text-success border-success/40' : 'text-destructive border-destructive/40'}`}
              >
                <Radio className="h-3 w-3" />
                {heartbeatAgeMin === null
                  ? 'No tracking yet'
                  : heartbeatHealthy
                    ? `Live · ${heartbeat?.ads_seen ?? 0} ads`
                    : `Last check ${heartbeatAgeMin}m ago`}
              </Badge>
              <div className="flex rounded-md border border-border overflow-hidden">
                {(['day', 'month'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`h-8 px-2.5 text-[10px] sm:text-xs capitalize ${
                      mode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {mode === 'day' ? (
                <input
                  type="date"
                  value={date}
                  max={istToday()}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-[10px] sm:text-xs text-foreground"
                />
              ) : (
                <input
                  type="month"
                  value={month}
                  max={istThisMonth()}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-[10px] sm:text-xs text-foreground"
                />
              )}
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger className="h-8 w-24 text-[10px] sm:text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All shifts</SelectItem>
                  {(shifts as any[]).map((s) => (
                    <SelectItem key={s.shift_key} value={s.shift_key}>{s.shift_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(accounts as any[]).length > 1 ? (
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="h-8 w-28 text-[10px] sm:text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {(accounts as any[]).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (accounts as any[]).length === 1 ? (
                <Badge variant="outline" className="h-8 px-2 text-[10px] sm:text-xs flex items-center">
                  {(accounts as any[])[0].account_name}
                </Badge>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-[10px] sm:text-xs"
                onClick={() => (mode === 'month' ? refetchMonth() : refetch())}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${(mode === 'month' ? monthFetching : isFetching) ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>

        </CardHeader>

        <CardContent className="px-3 pb-3 space-y-4">
          {/* Blended shift score */}
          <div className="t-panel p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Blended shift score
              </span>
              <span className="text-[9px] text-muted-foreground">
                Lightning 15 · Small sale 15 · Big sell 30 · Big buy 40
              </span>
            </div>
            {blendedShown.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No score yet for this {mode}.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {blendedShown.map((b) => (
                  <div key={b.shift_key} className="rounded-md border border-border p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium capitalize text-foreground">{b.shift_key}</span>
                      <span className="text-[9px] text-muted-foreground">{Number(b.weight_covered)} / 100 weight measured</span>
                    </div>
                    <div className={`t-mono text-2xl font-semibold leading-none mt-1 ${scoreTone(Number(b.blended_score))}`}>
                      {pct(b.blended_score)}
                    </div>
                    {/* Per-category score (no weight arithmetic shown). */}
                    <div className="mt-1.5 space-y-0.5">
                      {AD_CLASSES.map(({ key, short }) => {
                        const cat = b.categories?.[key];
                        if (!cat) return null;
                        return (
                          <div key={key} className="flex items-center justify-between text-[9px] text-muted-foreground">
                            <span>{short}</span>
                            <span className="t-mono">{Number(cat.score).toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>

                  </div>

                ))}
              </div>
            )}
          </div>

          {/* Headline per category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
            {AD_CLASSES.map(({ key, label, weight, icon: Icon }) => {
              const stats = byClass[key];
              const hasData = stats && stats.measured > 0;
              return (
                <div key={key} className="t-panel p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-primary" /> {label}
                    </span>
                    <span className="text-[9px] text-muted-foreground">wt {weight}</span>
                  </div>
                  <div className={`t-mono text-2xl font-semibold leading-none ${hasData ? scoreTone(stats.score) : 'text-muted-foreground'}`}>
                    {hasData ? pct(stats.score) : '—'}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Active time {hasData ? pct(stats.uptime) : '—'} · peak {stats?.peak ?? 0} ads live
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[9px] text-success border-success/40">
                      {stats?.active ?? 0}m active
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[9px] text-warning border-warning/40 cursor-help gap-1">
                          <EyeOff className="h-2.5 w-2.5" />{stats?.privateMin ?? 0}m private
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px] max-w-56">
                        Ad was online on Binance but set to Private (link-only), so nobody could find it. Never counted as active.
                      </TooltipContent>
                    </Tooltip>
                    {(stats?.breakMin ?? 0) > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[9px] text-destructive border-destructive/40 cursor-help gap-1">
                            <Coffee className="h-2.5 w-2.5" />{stats.breakMin}m break
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="text-[10px] max-w-56">
                          Binance break mode or the Terminal rest timer was on. Ads may still look online, but nothing was trading, so these minutes never count as active.
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      {stats?.offline ?? 0}m off
                    </Badge>

                    {(stats?.unmeasured ?? 0) > 0 && (
                      <Badge variant="outline" className="text-[9px] text-info border-info/40">
                        {stats.unmeasured}m unmeasured
                      </Badge>
                    )}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    1 live {stats?.one ?? 0}m · 2 live {stats?.two ?? 0}m · 3+ live {stats?.threePlus ?? 0}m · none {stats?.down ?? 0}m
                  </div>
                </div>
              );
            })}
          </div>

          {/* Big buy slot coverage — which coin/zone slot was short */}
          {mode === 'day' && buySlots.length > 0 && (
            <div className="t-panel p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-primary" /> Big buy slots
                </span>
                <span className="text-[9px] text-muted-foreground">
                  required {buySlots.reduce((s, r) => s + Number(r.required_ads || 0), 0)} ads
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                {buySlots.map((slot) => (
                  <div
                    key={`${slot.asset}-${slot.zone}`}
                    className="flex items-center justify-between rounded-md border border-border px-2 py-1.5"
                  >
                    <span className="text-[10px] text-foreground">
                      {slot.asset}
                      <span className="text-muted-foreground"> · {slot.zone === 'block' ? 'Block' : 'P2P'} · {slot.required_ads} req</span>
                    </span>
                    <span className={`t-mono text-[11px] font-semibold ${scoreTone(Number(slot.slot_score))}`}>
                      {pct(Number(slot.slot_score))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}



          {/* Shift table */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Shift / category</TableHead>
                  <TableHead className="text-[10px]">Score</TableHead>
                  <TableHead className="text-[10px]">Active time</TableHead>
                  <TableHead className="text-[10px]">Peak live</TableHead>
                  <TableHead className="text-[10px]">1 / 2 / 3+ live</TableHead>
                  <TableHead className="text-[10px]">None live</TableHead>
                  <TableHead className="text-[10px]">Private</TableHead>
                  <TableHead className="text-[10px]">Unmeasured</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-[10px] text-muted-foreground py-6">
                      No tracking data for this {mode} yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  [...filtered]
                    .sort((a, b) => a.shift_key.localeCompare(b.shift_key) || a.ad_class.localeCompare(b.ad_class))
                    .map((row) => (
                      <TableRow key={`${row.shift_key}-${row.ad_class}-${row.exchange_account_id}`}>
                        <TableCell className="text-[10px] sm:text-xs">
                          <div className="font-medium capitalize">{row.shift_key}</div>
                          <div className="text-[9px] text-muted-foreground">
                            {CLASS_LABEL[row.ad_class] ?? row.ad_class.replace(/_/g, ' ')}
                          </div>
                        </TableCell>
                        <TableCell className={`t-mono text-[10px] sm:text-xs font-semibold ${scoreTone(Number(row.category_score))}`}>
                          {pct(row.category_score)}
                        </TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs">{pct(row.uptime_pct)}</TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs">{row.peak_concurrent}</TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs">
                          {row.minutes_one}m / {row.minutes_two}m / {row.minutes_three_plus}m
                        </TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs text-destructive">{row.down_minutes}m</TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs text-warning">{row.private_only_minutes ?? 0}m</TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs text-muted-foreground">{row.unmeasured_minutes}m</TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Timeline strip (day view only — needs recent minute rows) */}
          {mode === 'day' && (
          <div className="space-y-2">

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Day timeline (10-minute blocks, IST)
              </span>
              <div className="flex flex-wrap gap-1">
                {AD_CLASSES.map(({ key, short }) => (
                  <Button
                    key={key}
                    variant={timelineClass === key ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setTimelineClass(key)}
                  >
                    {short}
                  </Button>
                ))}
              </div>
            </div>
            {timeline.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-3">No samples recorded for this selection.</p>
            ) : (
              <div className="flex gap-[2px] items-end h-16 overflow-x-auto">
                {timeline.map((bucket) => {
                  const expected = Math.max(bucket.ads_expected || 1, 1);
                  const activeShare = Number(bucket.active_ads) / expected;
                  const privateShare = Number(bucket.private_ads) / expected;
                  const tone = activeShare >= 0.99
                    ? 'bg-success'
                    : activeShare > 0
                      ? 'bg-warning'
                      : privateShare > 0
                        ? 'bg-trade-pending'
                        : 'bg-muted';
                  const height = Math.max(Math.round(activeShare * 100), 6);
                  return (
                    <Tooltip key={bucket.bucket_start}>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col justify-end h-full min-w-[6px] flex-1">
                          <div className={`${tone} rounded-sm`} style={{ height: `${height}%` }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px] space-y-0.5">
                        <div className="font-medium">{istTime(bucket.bucket_start)} IST · {bucket.shift_key ?? '—'}</div>
                        <div>Active: {Number(bucket.active_ads).toFixed(2)} of {bucket.ads_expected} ads</div>
                        <div>Private: {Number(bucket.private_ads).toFixed(2)} · Offline: {Number(bucket.offline_ads).toFixed(2)}</div>
                        <div>Samples: {bucket.samples} min</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success inline-block" /> all ads live</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning inline-block" /> some live</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-trade-pending inline-block" /> private only</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted inline-block" /> offline / no data</span>
            </div>
          </div>
          )}



          {/* Downtime episodes (minute detail is kept only for recent days) */}
          {mode === 'day' && (
          <div className="space-y-2">

            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Not-active episodes
            </span>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Ad</TableHead>
                    <TableHead className="text-[10px]">Coin / zone</TableHead>
                    <TableHead className="text-[10px]">Shift</TableHead>
                    <TableHead className="text-[10px]">From → To (IST)</TableHead>
                    <TableHead className="text-[10px]">Minutes</TableHead>
                    <TableHead className="text-[10px]">State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {episodes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[10px] text-muted-foreground py-6">
                        No downtime recorded for this selection.
                      </TableCell>
                    </TableRow>
                  ) : episodes.map((ep, i) => (
                    <TableRow key={`${ep.adv_no}-${ep.from}-${i}`}>
                      <TableCell className="t-mono text-[10px]">
                        …{String(ep.adv_no).slice(-8)}
                        <div className="text-[9px] text-muted-foreground">
                          {CLASS_LABEL[ep.ad_class] ?? ep.ad_class.replace(/_/g, ' ')}
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {ep.asset ?? '—'}
                        <div className="text-[9px] text-muted-foreground uppercase">{ep.zone ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-[10px] capitalize">{ep.shift_key}</TableCell>
                      <TableCell className="t-mono text-[10px]">{istTime(ep.from)} → {istTime(ep.to)}</TableCell>
                      <TableCell className="t-mono text-[10px]">{ep.minutes}m</TableCell>
                      <TableCell className="text-[10px]">
                        {ep.grade === 'private' ? (
                          <Badge variant="outline" className="text-[9px] text-warning border-warning/40">Private (link-only)</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">Paused / closed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

            </div>
          </div>
          )}

          {mode === 'month' && (
            <p className="text-[10px] text-muted-foreground">
              Monthly figures are read from stored monthly totals, so they open instantly. Minute-level
              timeline and not-active episodes stay available for the last few days only.
            </p>
          )}


          {/* Shift comparison */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Shift comparison (blended score)</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(shifts as any[]).map((s) => {
                const t = trendByShift[s.shift_key];
                return (
                  <div key={s.shift_key} className="t-panel p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-foreground">{s.shift_name}</span>
                      <span className="t-mono text-[9px] text-muted-foreground">
                        {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <div>
                        <div className={`t-mono text-lg font-semibold ${t?.d7 != null ? scoreTone(t.d7) : 'text-muted-foreground'}`}>
                          {t?.d7 != null ? pct(t.d7) : '—'}
                        </div>
                        <div className="text-[9px] text-muted-foreground">last 7 days</div>
                      </div>
                      <div>
                        <div className={`t-mono text-sm font-semibold ${t?.d30 != null ? scoreTone(t.d30) : 'text-muted-foreground'}`}>
                          {t?.d30 != null ? pct(t.d30) : '—'}
                        </div>
                        <div className="text-[9px] text-muted-foreground">last 30 days</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default AdUptimePanel;
