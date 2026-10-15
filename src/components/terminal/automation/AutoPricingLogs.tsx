import { useState, type ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, ChevronRight, MinusCircle, ScrollText, XCircle } from 'lucide-react';
import { useAutoPricingLogs, AutoPricingLog, AutoPricingRule } from '@/hooks/useAutoPricingRules';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Chip, NUM, Panel, PanelHead, PanelState, SCROLL_BOX, ShimmerRows, TD, TH, TH_STICKY, type Tone } from './automationUi';

interface AutoPricingLogsProps {
  ruleId?: string;
  rules: AutoPricingRule[];
}

/** Engine reason codes in operator words — one map for this log, the rule cards' alert strip and the asset popover.
 *  The raw code stays available in tooltips. */
const REASON_LABELS: Record<string, string> = {
  rest_timer: 'Rest timer active',
  ad_conflict: 'Ad used by another rule',
  outside_hours: 'Outside active hours',
  cooldown: 'Manual-edit cooldown',
  auto_paused: 'Rule auto-paused',
  no_listings: 'No P2P listings found',
  no_merchant: 'Target merchant not found',
  deviation_exceeded: 'Blocked: too far from market price',
  deviation: 'Blocked: too far from market price',
  zone_mismatch: 'Ad zone differs from the rule zone',
  ad_offline: 'Ad offline on Binance',
  no_ads: 'No ads assigned',
  interval_not_elapsed: 'Waiting for next interval',
  safety_limit_blocked: 'Blocked by a safety limit',
  offset_not_configured: 'Offset not configured',
  ladder_prespace: 'Re-spaced own ads (price ladder)',
  ladder_resolved: 'Price-ladder conflict resolved',
};

/** Operator wording for an engine reason code (unknown codes are shown with spaces instead of underscores). */
export function pricingReasonLabel(code: string | null | undefined): string {
  if (!code) return '';
  return REASON_LABELS[code] ?? code.replace(/_/g, ' ');
}

/** Engine error text as stored; a bare "unauthorized" from Binance becomes a sentence. */
export function pricingErrorText(message: string): string {
  return message.toLowerCase() === 'unauthorized' ? 'Binance update rejected (auth)' : message;
}

const RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
  applied: { label: 'Applied', tone: 'success' },
  success: { label: 'Success', tone: 'success' },
  error: { label: 'Error', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'warning' },
  no_change: { label: 'No change', tone: 'neutral' },
};
/** Skips that mean the rule is working as configured (schedule, cooldown, rest, ladder housekeeping) — not a problem. */
const ROUTINE_SKIPS = new Set(['outside_hours', 'interval_not_elapsed', 'cooldown', 'rest_timer', 'ladder_prespace']);

function runStatus(log: AutoPricingLog): { label: string; tone: Tone } {
  const s = RUN_STATUS[log.status] ?? { label: String(log.status ?? '—').replace(/_/g, ' '), tone: 'neutral' as Tone };
  return log.status === 'skipped' && log.skipped_reason && ROUTINE_SKIPS.has(log.skipped_reason) ? { ...s, tone: 'neutral' } : s;
}

/** Status icon by tone, the page's shared map: done ✓, failed ✕, needs attention △, routine skip / no-op –. */
const STATUS_ICON: Partial<Record<Tone, ReactNode>> = {
  success: <CheckCircle2 aria-hidden="true" />,
  danger: <XCircle aria-hidden="true" />,
  warning: <AlertTriangle aria-hidden="true" />,
  neutral: <MinusCircle aria-hidden="true" />,
};

/** What happened in a run, in words. The engine's full message is kept (cells clamp it; the tooltip shows all of it). */
function logReason(log: AutoPricingLog): string {
  if (log.error_message) return pricingErrorText(log.error_message);
  if (log.skipped_reason) return pricingReasonLabel(log.skipped_reason);
  if (log.status === 'applied' || log.status === 'success') return 'Price updated';
  if (log.status === 'no_change') return 'Already at target price';
  return '—';
}

const reasonTitle = (log: AutoPricingLog) => (log.skipped_reason ? `${logReason(log)}\nCode: ${log.skipped_reason}` : logReason(log));
const statusTitle = (log: AutoPricingLog) => (log.skipped_reason ? `${log.status} · ${log.skipped_reason}` : String(log.status ?? ''));

/** Message of a failed read; Supabase errors are plain `{ message, code }` objects, not Error instances. */
const errorText = (e: unknown) => (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '');

/** ₹ with Indian grouping; fractions padded to 2 places so a column reads evenly (₹94.20, not ₹94.2). */
const inr = (v: number | string, maxFrac = 3) => {
  const n = Number(v);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: maxFrac })}`;
};

/** 13 columns: 10px side padding instead of 12px, so the table fits a 1440px screen without scrolling sideways. */
const CELL = cn(TD, 'px-2.5');
const NUM_TD = cn(CELL, NUM, 'text-right');
const HEAD = cn(TH, TH_STICKY, 'px-2.5');

export function AutoPricingLogs({ ruleId: initialRuleId, rules }: AutoPricingLogsProps) {
  const [filterRuleId, setFilterRuleId] = useState(initialRuleId || 'all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterZone, setFilterZone] = useState('all');
  // Presentation only: the per-rule summary can be collapsed; it starts open on every width (as the old page showed it).
  const [runsOpen, setRunsOpen] = useState(true);
  const activeRuleId = filterRuleId === 'all' ? undefined : filterRuleId;
  const logsQuery = useAutoPricingLogs(activeRuleId, 500);
  const { data: logs = [], isLoading } = logsQuery;
  // A failed read must not look like "no runs" (that reads as "the engine did nothing").
  const loadFailed = logsQuery.isError && !logsQuery.data;

  // Last two runs per rule, always visible regardless of filters.
  const latestPerRule = rules
    .map(rule => ({
      rule,
      runs: logs.filter(l => l.rule_id === rule.id).slice(0, 2),
    }))
    .filter(r => r.runs.length > 0);


  const filteredLogs = logs.filter(l => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    if (filterZone !== 'all') {
      // Zone of the book the cycle competed in; falls back to our ad's own zone.
      const zone = (l.competitor_zone || l.ad_zone || 'p2p').toLowerCase() === 'block' ? 'block' : 'p2p';
      if (zone !== filterZone) return false;
    }
    return true;
  });
  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r.name]));

  const narrowed = filterStatus !== 'all' || filterZone !== 'all';
  const meta = isLoading || loadFailed || logs.length === 0
    ? null
    : `${narrowed ? `${filteredLogs.length} of ` : ''}${logs.length} ${logs.length === 1 ? 'entry' : 'entries'} (latest 500)`;

  return (
    <Panel labelledBy="apl-title">
      <PanelHead
        icon={<ScrollText />}
        title="Auto-pricing logs"
        titleId="apl-title"
        meta={meta}
        // Filters take a full-width row of their own in narrow panels.
        className="[&>div:last-child]:w-full @[44rem]:[&>div:last-child]:w-auto"
        actions={
          <div className="grid w-full grid-cols-2 gap-2 @[44rem]:flex @[44rem]:w-auto">
            <Select value={filterRuleId} onValueChange={setFilterRuleId}>
              <SelectTrigger aria-label="Rule" className="col-span-2 h-8 w-full text-xs @[44rem]:w-[13rem]">
                <SelectValue placeholder="All Rules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rules</SelectItem>
                {rules.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger aria-label="Zone" className="h-8 w-full text-xs @[44rem]:w-[9.5rem]">
                <SelectValue placeholder="All Zones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Zones</SelectItem>
                <SelectItem value="p2p">P2P zone</SelectItem>
                <SelectItem value="block">Block zone</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger aria-label="Status" className="h-8 w-full text-xs @[44rem]:w-[9.5rem]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
                <SelectItem value="no_change">No Change</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {!isLoading && latestPerRule.length > 0 && (
        <details open={runsOpen} onToggle={(e) => setRunsOpen(e.currentTarget.open)} className="group border-b border-border">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
            Last 2 runs per rule
          </summary>
          <div className="grid gap-2 px-4 pb-3 @[40rem]:grid-cols-2 @[72rem]:grid-cols-3">
            {latestPerRule.map(({ rule, runs }) => (
              <div key={rule.id} className="min-w-0 rounded-md border border-border px-3 py-2">
                <p className="truncate text-xs font-medium text-foreground" title={rule.name}>{rule.name}</p>
                <ul className="mt-1.5 space-y-1">
                  {runs.map(run => {
                    const s = runStatus(run);
                    return (
                      <li key={run.id} className="flex min-w-0 items-center gap-2 text-[11px]">
                        <span className={cn(NUM, 'text-muted-foreground')}>
                          {format(new Date(run.created_at), 'dd MMM HH:mm')}
                        </span>
                        <Chip tone={s.tone} title={statusTitle(run)}>{STATUS_ICON[s.tone]}{s.label}</Chip>
                        <span className="min-w-0 truncate text-muted-foreground" title={reasonTitle(run)}>{logReason(run)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {isLoading ? (
        <ShimmerRows rows={6} label="Loading pricing logs…" />
      ) : loadFailed ? (
        <PanelState
          tone="danger"
          icon={<AlertTriangle />}
          title="Couldn't load pricing logs"
          hint={
            <>
              {errorText(logsQuery.error) && <p className="mb-1 t-mono text-[11px]">{errorText(logsQuery.error)}</p>}
              <p>Go back to the rules and open the logs again to retry.</p>
            </>
          }
        />
      ) : filteredLogs.length === 0 ? (
        <PanelState
          icon={<ScrollText />}
          title="No logs found"
          hint={narrowed ? 'No runs match the selected zone or status.' : activeRuleId ? 'This rule has no runs yet.' : 'Runs appear here after the pricing engine’s next cycle.'}
        />
      ) : (
        // Height cap only on wide panels; on narrow ones the table flows with the page and only scrolls sideways.
        <div className={cn(SCROLL_BOX, 'max-h-none @[52rem]:max-h-[36rem]')} tabIndex={0} role="region" aria-label="Auto-pricing log entries">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th scope="col" className={cn(HEAD, 'pl-4')}>Time</th>
                <th scope="col" className={HEAD}>Asset</th>
                <th scope="col" className={HEAD}>Status</th>
                <th scope="col" className={HEAD}>Rule</th>
                <th scope="col" className={HEAD}>Reason</th>
                <th scope="col" className={cn(HEAD, 'text-right')}>Applied</th>
                <th scope="col" className={cn(HEAD, 'text-right')}>Competitor</th>
                <th scope="col" className={HEAD}>Merchant</th>
                <th scope="col" className={cn(HEAD, 'text-right')}>Market ref</th>
                <th scope="col" className={cn(HEAD, 'text-right')}>Dev %</th>
                <th scope="col" className={HEAD}>Zone</th>
                <th scope="col" className={HEAD}>Ad</th>
                <th scope="col" className={cn(HEAD, 'pr-4')}>Guards</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => {
                const s = runStatus(log);
                const ruleName = ruleMap[log.rule_id];
                const identity = log.competitor_identity === 'BLOCK_MERCHANT' ? 'Block merchant'
                  : log.competitor_identity === 'MASS_MERCHANT' ? 'Mass merchant' : '';
                const vip = log.competitor_vip_level != null && log.competitor_vip_level > 0 ? `VIP ${log.competitor_vip_level}` : '';
                const badges = log.competitor_badges?.length ? `${log.competitor_badges.join('/')} ${log.competitor_badges.length > 1 ? 'badges' : 'badge'}` : '';
                const who = [identity, vip, badges].filter(Boolean).join(' · ');
                return (
                  <tr key={log.id}>
                    <td className={cn(CELL, NUM, 'pl-4 text-muted-foreground')}>
                      {format(new Date(log.created_at), 'dd MMM HH:mm:ss')}
                    </td>
                    <td className={CELL}>{log.asset ? <Chip mono>{log.asset}</Chip> : <span className="text-muted-foreground">—</span>}</td>
                    <td className={CELL}><Chip tone={s.tone} title={statusTitle(log)}>{STATUS_ICON[s.tone]}{s.label}</Chip></td>
                    <td className={cn(CELL, 'max-w-[10rem]')}>
                      <span className="block truncate font-medium text-foreground" title={ruleName}>{ruleName || '—'}</span>
                    </td>
                    {/* Fixed width: two clamped lines; the full engine message is in the tooltip. */}
                    <td className={cn(CELL, 'w-[13rem] min-w-[13rem] max-w-[13rem]')}>
                      <span className="line-clamp-2 whitespace-normal break-words text-muted-foreground" title={reasonTitle(log)}>{logReason(log)}</span>
                    </td>
                    <td className={cn(NUM_TD, 'font-medium text-foreground')}>
                      {log.applied_price ? inr(log.applied_price) :
                       log.applied_ratio ? `${Number(log.applied_ratio).toFixed(4)}%` : '—'}
                    </td>
                    <td className={cn(NUM_TD, 'text-foreground')}>{log.competitor_price ? inr(log.competitor_price) : '—'}</td>
                    {/* The competitor's class, VIP level and trust badges live in the tooltip, so the table fits a 1440px screen. */}
                    <td className={cn(CELL, 'whitespace-nowrap')} title={who || undefined}>
                      <span className="text-foreground">{log.competitor_merchant || '—'}</span>
                    </td>
                    <td className={cn(NUM_TD, 'text-muted-foreground')}>{log.market_reference_price ? inr(log.market_reference_price, 2) : '—'}</td>
                    <td className={cn(NUM_TD, 'text-muted-foreground')}>{log.deviation_from_market_pct != null ? `${Number(log.deviation_from_market_pct).toFixed(2)}%` : '—'}</td>
                    <td className={CELL}>
                      <Chip>{log.competitor_zone === 'block' ? 'Block' : 'P2P'}</Chip>
                    </td>
                    <td className={cn(CELL, NUM, 'text-muted-foreground')} title={log.ad_number || undefined}>
                      {log.ad_number ? `…${log.ad_number.slice(-8)}` : '—'}
                    </td>
                    <td className={cn(CELL, 'pr-4')}>
                      {(log.was_capped || log.was_rate_limited) ? (
                        <span className="flex gap-1">
                          {log.was_capped && <Chip title="Held at the rule's ceiling or floor">Capped</Chip>}
                          {log.was_rate_limited && <Chip tone="warning" title="Held back by the max change per cycle">Rate-limited</Chip>}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
