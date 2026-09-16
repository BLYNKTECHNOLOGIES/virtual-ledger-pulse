import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, AlertTriangle, Clock, Radio, ShoppingCart, Store, Coins, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const AD_CLASSES = [
  { key: 'buy', label: 'Buy ads', icon: ShoppingCart },
  { key: 'sell', label: 'Sell ads', icon: Store },
  { key: 'small_sale', label: 'Small-sale ads', icon: Coins },
] as const;

const REASON_LABELS: Record<string, string> = {
  no_surplus: 'No balance left',
  surplus_below_min_limit: 'Balance below its own minimum',
  invalid_limits: 'Broken min/max limits',
  no_payment_method: 'No payment method',
  price_off_market: 'Price far from market',
};

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
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

interface SummaryRow {
  ist_date: string;
  shift_key: string;
  ad_class: string;
  exchange_account_id: string;
  shift_minutes: number;
  measured_minutes: number;
  unmeasured_minutes: number;
  effective_minutes: number;
  hollow_minutes: number;
  offline_minutes: number;
  full_coverage_minutes: number;
  partial_coverage_minutes: number;
  down_minutes: number;
  expected_ads: number;
  uptime_pct: number;
  downtime_episodes: Array<{
    adv_no: string;
    from: string;
    to: string;
    minutes: number;
    grade: string;
    reasons: string[] | null;
  }>;
}

export function AdUptimePanel() {
  const [date, setDate] = useState(istToday());
  const [accountId, setAccountId] = useState<string>('all');
  const [shift, setShift] = useState<string>('all');
  const [timelineClass, setTimelineClass] = useState<string>('sell');

  const { data: accounts = [] } = useQuery({
    queryKey: ['terminal-exchange-accounts-uptime'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_exchange_accounts')
        .select('id, account_name, is_active')
        .eq('is_active', true)
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
      let q = supabase
        .from('terminal_ad_uptime_shift_summary')
        .select('*')
        .eq('ist_date', date);
      if (accountId !== 'all') q = q.eq('exchange_account_id', accountId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SummaryRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ['ad-uptime-timeline', date, accountId, timelineClass],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ad_uptime_timeline', {
        p_date: date,
        p_ad_class: timelineClass,
        p_account: accountId === 'all' ? null : accountId,
        p_bucket_minutes: 10,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        bucket_start: string;
        shift_key: string | null;
        ads_expected: number;
        effective_ads: number;
        hollow_ads: number;
        offline_ads: number;
        samples: number;
      }>;
    },
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

  const { data: trend = [] } = useQuery({
    queryKey: ['ad-uptime-trend', accountId],
    queryFn: async () => {
      const from = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10);
      let q = supabase
        .from('terminal_ad_uptime_shift_summary')
        .select('ist_date, shift_key, ad_class, uptime_pct, measured_minutes')
        .gte('ist_date', from);
      if (accountId !== 'all') q = q.eq('exchange_account_id', accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 300_000,
  });

  const filtered = useMemo(
    () => summary.filter((row) => shift === 'all' || row.shift_key === shift),
    [summary, shift],
  );

  const byClass = useMemo(() => {
    const map: Record<string, { uptime: number; effective: number; hollow: number; offline: number; unmeasured: number; expected: number; measured: number }> = {};
    for (const cls of AD_CLASSES) {
      const rows = filtered.filter((r) => r.ad_class === cls.key);
      const measured = rows.reduce((s, r) => s + r.measured_minutes, 0);
      const weighted = rows.reduce((s, r) => s + Number(r.uptime_pct) * r.measured_minutes, 0);
      map[cls.key] = {
        uptime: measured ? weighted / measured : 0,
        effective: rows.reduce((s, r) => s + r.effective_minutes, 0),
        hollow: rows.reduce((s, r) => s + r.hollow_minutes, 0),
        offline: rows.reduce((s, r) => s + r.offline_minutes, 0),
        unmeasured: rows.reduce((s, r) => s + r.unmeasured_minutes, 0),
        expected: rows.reduce((s, r) => Math.max(s, r.expected_ads), 0),
        measured,
      };
    }
    return map;
  }, [filtered]);

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
    const map = new Map<string, { minutes: number; weighted: number }>();
    const cutoff7 = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10);
    const out: Record<string, { d7: number | null; d30: number | null }> = {};
    for (const window of shifts) {
      for (const range of ['d7', 'd30'] as const) {
        const rows = (trend as any[]).filter(
          (r) => r.shift_key === window.shift_key && (range === 'd30' || r.ist_date >= cutoff7),
        );
        const minutes = rows.reduce((s, r) => s + (r.measured_minutes || 0), 0);
        const weighted = rows.reduce((s, r) => s + Number(r.uptime_pct || 0) * (r.measured_minutes || 0), 0);
        out[window.shift_key] = {
          ...(out[window.shift_key] ?? { d7: null, d30: null }),
          [range]: minutes ? weighted / minutes : null,
        } as { d7: number | null; d30: number | null };
      }
      map.set(window.shift_key, { minutes: 0, weighted: 0 });
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
              <input
                type="date"
                value={date}
                max={istToday()}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-[10px] sm:text-xs text-foreground"
              />
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger className="h-8 w-24 text-[10px] sm:text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All shifts</SelectItem>
                  {shifts.map((s: any) => (
                    <SelectItem key={s.shift_key} value={s.shift_key}>{s.shift_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-8 w-28 text-[10px] sm:text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 px-2 text-[10px] sm:text-xs" onClick={() => refetch()}>
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-3 pb-3 space-y-4">
          {/* Headline uptime per ad class */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {AD_CLASSES.map(({ key, label, icon: Icon }) => {
              const stats = byClass[key];
              const hasData = stats && stats.measured > 0;
              return (
                <div key={key} className="t-panel p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-primary" /> {label}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{stats?.expected ?? 0} ads</span>
                  </div>
                  <div className={`t-mono text-2xl font-semibold leading-none ${hasData ? scoreTone(stats.uptime) : 'text-muted-foreground'}`}>
                    {hasData ? pct(stats.uptime) : '—'}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[9px] text-success border-success/40">
                      {stats?.effective ?? 0}m real
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[9px] text-warning border-warning/40 cursor-help">
                          {stats?.hollow ?? 0}m hollow
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px] max-w-56">
                        Ad showed as online but could not actually trade — no balance, broken limits, no payment method, or price far off market. Never counted as uptime.
                      </TooltipContent>
                    </Tooltip>
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      {stats?.offline ?? 0}m off
                    </Badge>
                    {(stats?.unmeasured ?? 0) > 0 && (
                      <Badge variant="outline" className="text-[9px] text-info border-info/40">
                        {stats.unmeasured}m unmeasured
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shift table */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Shift</TableHead>
                  <TableHead className="text-[10px]">Ads</TableHead>
                  <TableHead className="text-[10px]">Uptime</TableHead>
                  <TableHead className="text-[10px]">All live</TableHead>
                  <TableHead className="text-[10px]">Partial</TableHead>
                  <TableHead className="text-[10px]">Down</TableHead>
                  <TableHead className="text-[10px]">Unmeasured</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[10px] text-muted-foreground py-6">
                      No tracking data for this day yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  [...filtered]
                    .sort((a, b) => a.shift_key.localeCompare(b.shift_key) || a.ad_class.localeCompare(b.ad_class))
                    .map((row) => (
                      <TableRow key={`${row.shift_key}-${row.ad_class}-${row.exchange_account_id}`}>
                        <TableCell className="text-[10px] sm:text-xs">
                          <div className="font-medium capitalize">{row.shift_key}</div>
                          <div className="text-[9px] text-muted-foreground capitalize">
                            {row.ad_class.replace('_', ' ')}
                          </div>
                        </TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs">{row.expected_ads}</TableCell>
                        <TableCell className={`t-mono text-[10px] sm:text-xs font-semibold ${scoreTone(Number(row.uptime_pct))}`}>
                          {pct(row.uptime_pct)}
                        </TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs text-success">{row.full_coverage_minutes}m</TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs text-warning">{row.partial_coverage_minutes}m</TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs text-destructive">{row.down_minutes}m</TableCell>
                        <TableCell className="t-mono text-[10px] sm:text-xs text-muted-foreground">{row.unmeasured_minutes}m</TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Timeline strip */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Day timeline (10-minute blocks, IST)
              </span>
              <div className="flex gap-1">
                {AD_CLASSES.map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={timelineClass === key ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setTimelineClass(key)}
                  >
                    {label}
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
                  const effectiveShare = Number(bucket.effective_ads) / expected;
                  const hollowShare = Number(bucket.hollow_ads) / expected;
                  const tone = effectiveShare >= 0.99
                    ? 'bg-success'
                    : effectiveShare > 0
                      ? 'bg-warning'
                      : hollowShare > 0
                        ? 'bg-trade-pending'
                        : 'bg-muted';
                  const height = Math.max(Math.round(effectiveShare * 100), 6);
                  return (
                    <Tooltip key={bucket.bucket_start}>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col justify-end h-full min-w-[6px] flex-1">
                          <div className={`${tone} rounded-sm`} style={{ height: `${height}%` }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px] space-y-0.5">
                        <div className="font-medium">{istTime(bucket.bucket_start)} IST · {bucket.shift_key ?? '—'}</div>
                        <div>Real active: {Number(bucket.effective_ads).toFixed(2)} of {bucket.ads_expected} ads</div>
                        <div>Hollow: {Number(bucket.hollow_ads).toFixed(2)} · Offline: {Number(bucket.offline_ads).toFixed(2)}</div>
                        <div>Samples: {bucket.samples} min</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success inline-block" /> all ads live</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning inline-block" /> partial</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-trade-pending inline-block" /> online but untradable</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted inline-block" /> offline / no data</span>
            </div>
          </div>

          {/* Downtime episodes */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Downtime episodes
            </span>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Ad</TableHead>
                    <TableHead className="text-[10px]">Shift</TableHead>
                    <TableHead className="text-[10px]">From → To (IST)</TableHead>
                    <TableHead className="text-[10px]">Minutes</TableHead>
                    <TableHead className="text-[10px]">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {episodes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-[10px] text-muted-foreground py-6">
                        No downtime recorded for this selection.
                      </TableCell>
                    </TableRow>
                  ) : episodes.map((ep, i) => (
                    <TableRow key={`${ep.adv_no}-${ep.from}-${i}`}>
                      <TableCell className="t-mono text-[10px]">
                        …{String(ep.adv_no).slice(-8)}
                        <div className="text-[9px] text-muted-foreground capitalize">{ep.ad_class.replace('_', ' ')}</div>
                      </TableCell>
                      <TableCell className="text-[10px] capitalize">{ep.shift_key}</TableCell>
                      <TableCell className="t-mono text-[10px]">{istTime(ep.from)} → {istTime(ep.to)}</TableCell>
                      <TableCell className="t-mono text-[10px]">{ep.minutes}m</TableCell>
                      <TableCell className="text-[10px]">
                        {ep.grade === 'offline' ? (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">Paused / closed</Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(ep.reasons ?? []).map((r) => (
                              <Badge key={r} variant="outline" className="text-[9px] text-warning border-warning/40">
                                {REASON_LABELS[r] ?? r}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Shift comparison */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Shift comparison</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {shifts.map((s: any) => {
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
