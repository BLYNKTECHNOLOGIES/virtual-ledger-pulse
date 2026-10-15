import { useState, type ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Pencil, Trash2, Play, RotateCcw, AlertTriangle, CheckCircle2, XCircle, Bell, ScrollText, ArrowLeft,
  CircleDashed, Clock3, X, ChevronRight, PauseCircle, Tags, Crosshair,
} from 'lucide-react';
import {
  useAutoPricingRules,
  useUpdateAutoPricingRule,
  useDeleteAutoPricingRule,
  useManualTriggerRule,
  useResetRuleState,
  useDismissRuleAlert,
  useLatestAssetLogs,
  getRuleAlertState,
  AutoPricingRule,
  AssetAlertInfo,
} from '@/hooks/useAutoPricingRules';
import { AutoPricingRuleDialog } from './AutoPricingRuleDialog';
import { AutoPricingLogs, pricingErrorText, pricingReasonLabel } from './AutoPricingLogs';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  CONFIRM_CANCEL, CONFIRM_CONTENT, CONFIRM_DELETE_DARK, CONFIRM_DESC, CONFIRM_FOOTER, CONFIRM_HEADER, CONFIRM_TITLE,
  Chip, ICON_BTN, ICON_BTN_DANGER, InlineNotice, Panel, PanelHead, PanelState, ShimmerRows, SideChip, SWITCH, TONE_CHIP, type Tone,
} from './automationUi';

interface AutoPricingRulesProps {
  canManage?: boolean;
  canToggle?: boolean;
  canDelete?: boolean;
}

type AlertState = ReturnType<typeof getRuleAlertState>;

const STRIPE: Partial<Record<Tone, string>> = { danger: 'bg-trade-sell', warning: 'bg-warning', neutral: 'bg-muted-foreground/40' };
const NOTICE_BOX = { danger: 'border-destructive/40 bg-destructive/[0.06]', warning: 'border-warning/40 bg-warning/[0.06]' } as const;
/** Asset label in the alert strip: an opaque outlined chip (a tinted chip on the tinted strip is below AA), ink by status. */
const ISSUE_INK = {
  rule: 'text-foreground [html.terminal-light_&]:text-foreground',
  error: 'text-trade-sell [html.terminal-light_&]:text-trade-sell',
  skipped: 'text-warning [html.terminal-light_&]:text-warning',
} as const;

/** One status word per rule (C-S4). Same counters and thresholds as the old health icon; the word carries the meaning,
 *  colour only supports it. A manual pause is neutral; red is kept for auto-pause and failures.
 *  `erroredAssets` = assets whose latest run (the asset chips on the card) is an error: with fine counters the card says
 *  "Asset error" instead of "Healthy" (display only). Skips are routine (ad offline, outside hours) and don't count. */
function ruleHealth(rule: AutoPricingRule, alert: AlertState, erroredAssets: string[]): { word: string; tone: Tone; icon: ReactNode; detail?: string } {
  if (!rule.is_active) {
    return alert.alertType === 'auto_paused'
      ? { word: 'Auto-paused', tone: 'danger', icon: <PauseCircle /> }
      : { word: 'Paused', tone: 'neutral', icon: <PauseCircle /> };
  }
  if (rule.consecutive_errors > 10 || ((rule.auto_pause_after_deviations ?? 0) > 0 && rule.consecutive_deviations >= rule.auto_pause_after_deviations)) {
    return { word: 'Failing', tone: 'danger', icon: <XCircle /> };
  }
  if (rule.consecutive_errors > 3 || rule.consecutive_deviations > 2) return { word: 'Warning', tone: 'warning', icon: <AlertTriangle /> };
  // Counters are fine but the rule still carries an alert: say which kind instead of "Healthy".
  if (alert.hasAlert) {
    if (alert.alertType === 'error') return { word: 'Error', tone: 'danger', icon: <XCircle /> };
    return { word: alert.alertType === 'merchant_missing' ? 'Merchant missing' : 'Deviation', tone: 'warning', icon: <AlertTriangle /> };
  }
  // Amber, like "Warning": the counters are still below the warning threshold, but an asset's latest run failed.
  if (erroredAssets.length > 0) {
    return { word: 'Asset error', tone: 'warning', icon: <AlertTriangle />, detail: `Latest run failed: ${erroredAssets.join(', ')}` };
  }
  return { word: 'Healthy', tone: 'success', icon: <CheckCircle2 /> };
}

/** Latest run of one asset, in words (status by word + icon, not colour alone). */
function assetState(log?: AssetAlertInfo): { word: string; tone: Tone; icon: ReactNode; chip: string } {
  if (log?.status === 'applied' || log?.status === 'success') {
    return { word: 'Applied', tone: 'success', icon: <CheckCircle2 />, chip: TONE_CHIP.success };
  }
  if (log?.status === 'skipped') return { word: 'Skipped', tone: 'warning', icon: <AlertTriangle />, chip: TONE_CHIP.warning };
  if (log?.status === 'error') return { word: 'Error', tone: 'danger', icon: <XCircle />, chip: TONE_CHIP.danger };
  return { word: 'No data', tone: 'outline', icon: <CircleDashed />, chip: TONE_CHIP.outline };
}

/** One line of the alert strip: what went wrong for an asset (or for the whole rule), in operator words. */
function issueText(l: AssetAlertInfo): string {
  if (l.status === 'skipped') {
    if (l.reason === 'deviation' || l.reason === 'deviation_exceeded') {
      return `${pricingReasonLabel(l.reason)}${l.deviation_from_market_pct != null ? ` (${Number(l.deviation_from_market_pct).toFixed(2)}%)` : ''}`;
    }
    return l.reason ? pricingReasonLabel(l.reason) : l.error ? pricingErrorText(l.error) : 'Skipped';
  }
  return l.error ? pricingErrorText(l.error) : 'Unknown error';
}

/** Message of a failed read; Supabase errors are plain `{ message, code }` objects, not Error instances. */
const errorText = (e: unknown) => (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '');

/** ₹ with Indian grouping; fractions padded to 2 places (₹94.20, not ₹94.2). */
const inr = (v: number | string) => {
  const n = Number(v);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: n < 1 ? 8 : 3 })}`;
};

export function AutoPricingRules({ canManage = true, canToggle = true, canDelete = true }: AutoPricingRulesProps) {
  const rulesQuery = useAutoPricingRules();
  const { data: rules = [], isLoading } = rulesQuery;
  const updateRule = useUpdateAutoPricingRule();
  const deleteRule = useDeleteAutoPricingRule();
  const triggerRule = useManualTriggerRule();
  const resetRule = useResetRuleState();
  const dismissAlert = useDismissRuleAlert();
  const ruleIds = rules.map(r => r.id);
  const assetLogsQuery = useLatestAssetLogs(ruleIds);
  const { data: assetLogsMap = {} } = assetLogsQuery;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoPricingRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteRuleName, setDeleteRuleName] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);
  const [logRuleId, setLogRuleId] = useState<string | undefined>();

  const handleEdit = (rule: AutoPricingRule) => { setEditingRule(rule); setDialogOpen(true); };
  const handleCreate = () => { setEditingRule(null); setDialogOpen(true); };

  const activeCount = rules.filter(r => r.is_active).length;
  const pausedCount = rules.filter(r => !r.is_active).length;
  const alertCount = rules.filter(r => getRuleAlertState(r).hasAlert).length;

  // Read failures must not look like "no rules" (that invites re-creating rules that already claim the same ads).
  const rulesFailed = rulesQuery.isError && !rulesQuery.data;
  const rulesStale = rulesQuery.isError && !!rulesQuery.data;
  const assetLogsFailed = assetLogsQuery.isError && !assetLogsQuery.data;

  if (showLogs) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={() => setShowLogs(false)}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Rules
        </Button>
        <AutoPricingLogs ruleId={logRuleId} rules={rules} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel labelledBy="apr-rules-title">
        <PanelHead
          icon={<Crosshair />}
          title="Auto-pricing rules"
          titleId="apr-rules-title"
          // Counts only once the list has loaded: while loading or after a failed read they would read "0 Rules".
          meta={!isLoading && !rulesFailed ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 font-sans">
              <Chip>{rules.length} {rules.length === 1 ? 'Rule' : 'Rules'}</Chip>
              <Chip tone="success">{activeCount} Active</Chip>
              {pausedCount > 0 && <Chip tone="warning">{pausedCount} Paused</Chip>}
              {alertCount > 0 && (
                <Chip tone="danger">
                  <Bell aria-hidden="true" /> {alertCount} Alert{alertCount > 1 ? 's' : ''}
                </Chip>
              )}
            </span>
          ) : undefined}
          actions={
            <>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={() => { setLogRuleId(undefined); setShowLogs(true); }}>
                <ScrollText className="h-3.5 w-3.5" aria-hidden="true" /> View Logs
              </Button>
              {canManage && (
                <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={handleCreate}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Rule
                </Button>
              )}
            </>
          }
        />

        {rulesStale && (
          <div className="border-b border-border px-3 py-2.5">
            <InlineNotice tone="warning" title="Couldn't refresh the rules">
              Showing the last loaded state; it may be out of date.
            </InlineNotice>
          </div>
        )}

        {isLoading ? (
          <ShimmerRows rows={4} label="Loading pricing rules…" />
        ) : rulesFailed ? (
          <PanelState
            tone="danger"
            icon={<AlertTriangle />}
            title="Couldn't load pricing rules"
            hint={
              <>
                {errorText(rulesQuery.error) && <p className="mb-1 t-mono text-[11px]">{errorText(rulesQuery.error)}</p>}
                <p>Retrying every 30 s. Don't add rules until the list loads: two rules on the same ad block each other.</p>
              </>
            }
          />
        ) : rules.length === 0 ? (
          <PanelState icon={<Tags />} title="No auto-pricing rules configured" hint="Create rules to automatically match competitor prices" />
        ) : (
          <ul className="divide-y divide-border">
            {rules.map(rule => {
              const alertState = getRuleAlertState(rule);
              const assetLogs: AssetAlertInfo[] = assetLogsMap[rule.id] || [];
              const assetsInRule = rule.assets?.length > 0 ? rule.assets : [rule.asset];
              // Same latest-run lookup as the asset chips below, so the status word never contradicts a red chip.
              const erroredAssets = assetsInRule.filter(a => assetLogs.find(l => l.asset === a)?.status === 'error');
              const health = ruleHealth(rule, alertState, erroredAssets);
              const issues = assetLogs.filter(l => l.status === 'error' || l.status === 'skipped');
              const alertTone = alertState.alertType === 'error' || alertState.alertType === 'auto_paused' ? 'danger' : 'warning';
              const nameId = `apr-name-${rule.id}`;
              const alertId = `apr-alert-${rule.id}`;
              const fallbackCount = rule.fallback_merchants?.length || 0;
              const adCount = rule.ad_numbers?.length || 0;
              const stripe = STRIPE[health.tone];

              return (
                <li key={rule.id} className="relative @container">
                  {stripe && <span aria-hidden="true" className={cn('pointer-events-none absolute inset-y-0 left-0 w-[3px]', stripe)} />}
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-3 py-2.5 @[44rem]:grid-cols-[auto_minmax(0,1fr)_auto]">
                    {/* Row 1: switch · name · side / price type / direction · status */}
                    <Switch
                      className={cn('mt-px', SWITCH)}
                      checked={rule.is_active}
                      onCheckedChange={(v) => updateRule.mutate({ id: rule.id, is_active: v })}
                      disabled={!canToggle}
                      aria-label={`Active: ${rule.name}`}
                    />
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p id={nameId} className="min-w-0 break-words text-sm font-medium leading-6 text-foreground">{rule.name}</p>
                      <span className="flex flex-wrap items-center gap-1">
                        <SideChip side={rule.trade_type}>{rule.trade_type}</SideChip>
                        <Chip title={rule.price_type === 'FLOATING' ? 'Floating: price as a % of the Binance index' : rule.price_type === 'FIXED' ? 'Fixed: price in ₹' : undefined}>
                          {rule.price_type === 'FLOATING' ? 'Floating' : rule.price_type === 'FIXED' ? 'Fixed' : rule.price_type}
                        </Chip>
                        <Chip title={rule.offset_direction === 'OVERCUT' ? 'Overcut (+): competitor price plus the offset' : rule.offset_direction === 'UNDERCUT' ? 'Undercut (−): competitor price minus the offset' : undefined}>
                          {rule.offset_direction === 'OVERCUT' ? 'Overcut' : rule.offset_direction === 'UNDERCUT' ? 'Undercut' : rule.offset_direction}
                        </Chip>
                      </span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Chip
                              tone={health.tone}
                              tabIndex={0}
                              className="cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {health.icon}
                              <span className="sr-only">Health: </span>
                              {health.word}
                            </Chip>
                          </TooltipTrigger>
                          {/* Portalled (as on Assets): inside the @container row the fixed-position tooltip was drawn near the top of the page. */}
                          <TooltipPrimitive.Portal>
                            <TooltipContent className="text-xs">
                              <p>Errors: {rule.consecutive_errors ?? '—'} | Deviations: {rule.consecutive_deviations ?? '—'}</p>
                              {health.detail && <p className="mt-0.5">{health.detail}</p>}
                            </TooltipContent>
                          </TooltipPrimitive.Portal>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* Row 2: per-asset status (popovers) + what the rule targets and last did. The meta items are direct
                        flex items (`contents`), so they wrap next to the asset chips instead of dropping as one block. */}
                    <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground @[44rem]:col-[2/4]">
                      <div className="flex flex-wrap items-center gap-1">
                        {assetsInRule.map(asset => {
                          const log = assetLogs.find(l => l.asset === asset);
                          const isError = log?.status === 'error';
                          const isSkipped = log?.status === 'skipped';
                          const isApplied = log?.status === 'applied' || log?.status === 'success';
                          const st = assetState(log);

                          return (
                            <Popover key={asset}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`${asset}: ${st.word}`}
                                  title={`${asset}: ${st.word} — latest run details`}
                                  className={cn(
                                    'inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 t-mono text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:ring-1 hover:ring-inset hover:ring-current data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-current @[44rem]:h-7 [&_svg]:h-3 [&_svg]:w-3',
                                    st.chip,
                                  )}
                                >
                                  <span aria-hidden="true" className="flex">{st.icon}</span>
                                  {asset}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" align="start" collisionPadding={12} className="w-[22rem] max-w-[calc(100vw-24px)] max-h-[80vh] overflow-y-auto p-0 t-scale-in">
                                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                                  <span className="t-mono text-sm font-semibold text-foreground">{asset}</span>
                                  <Chip tone={st.tone}>{st.icon}{st.word}</Chip>
                                </div>
                                {log ? (
                                  <div className="space-y-3 px-3 py-2.5 text-xs">
                                    {/* Issue reason */}
                                    {(isSkipped || isError) && (
                                      <div className={cn('flex items-start gap-2 rounded-md border px-2.5 py-2', isError ? NOTICE_BOX.danger : NOTICE_BOX.warning)}>
                                        {isError
                                          ? <XCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                                          : <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />}
                                        <p className="min-w-0 break-words font-medium leading-5 text-foreground" title={log.reason ? `Code: ${log.reason}` : undefined}>
                                          {isSkipped
                                            ? (log.reason === 'no_merchant' ? 'Target merchant not found in top 500 listings'
                                              : log.reason === 'no_listings' ? 'No P2P listings available for this asset'
                                              : log.reason === 'deviation_exceeded' ? `Competitor price deviates ${log.deviation_from_market_pct != null ? `${Number(log.deviation_from_market_pct).toFixed(2)}% from market reference (limit ${rule.max_deviation_from_market_pct ?? 5}%)` : 'too far from market reference'}`
                                              : log.reason === 'no_ads' ? 'No ad numbers configured or all excluded'
                                              // safety_limit_blocked carries the exact limit and the ratio it blocked —
                                              // showing only the code made it look like the deviation caused the skip.
                                              : log.error ? pricingErrorText(log.error)
                                              : (pricingReasonLabel(log.reason) || 'Unknown skip reason'))
                                            : (log.error ? pricingErrorText(log.error) : 'Unknown error')
                                          }
                                        </p>
                                      </div>
                                    )}
                                    {log.competitor_merchant && (
                                      <p className="break-words text-muted-foreground">vs <span className="font-medium text-foreground">{log.competitor_merchant}</span></p>
                                    )}
                                    {(() => {
                                      const idx = Number(log.binance_index_price || 0);
                                      const comp = Number(log.competitor_price || 0);
                                      const ratio = Number(log.applied_ratio ?? (isSkipped ? log.calculated_ratio : null) ?? 0);
                                      const ours = log.applied_price != null ? Number(log.applied_price) : idx > 0 && ratio > 0 ? ratio / 100 * idx : null;
                                      const estimated = log.applied_price == null;
                                      const gap = ours != null && comp > 0 ? ours - comp : null;
                                      const ahead = gap != null && (rule.trade_type === 'BUY' ? gap > 0 : gap < 0);
                                      const fd = { maximumFractionDigits: comp < 1 ? 8 : 2 };
                                      const money = (value: number) => `₹${value.toLocaleString('en-IN', fd)}`;
                                      return (
                                        <div className="space-y-3">
                                          {isApplied && gap != null && (
                                            <div className={cn('border-l-2 pl-3', ahead ? 'border-trade-buy text-trade-buy' : 'border-trade-sell text-trade-sell')}>
                                              <p className="text-xs font-semibold">{estimated ? 'Estimated lead' : 'Price lead'}: {gap === 0 ? 'Same price' : ahead ? 'Ahead' : 'Behind'}</p>
                                              <p className="mt-0.5 t-mono text-lg font-semibold tabular-nums break-words">{money(Math.abs(gap))} <span className="text-xs font-medium">({Math.abs(gap / comp * 100).toFixed(3)}%) {gap >= 0 ? 'higher' : 'lower'}</span></p>
                                            </div>
                                          )}
                                          <div className="grid grid-cols-2 gap-3 rounded-md border border-border px-2.5 py-2">
                                            <div className="min-w-0">
                                              <p className="text-[11px] text-muted-foreground">Competitor price</p>
                                              <p className="mt-0.5 t-mono font-semibold tabular-nums break-words text-foreground">{comp > 0 ? money(comp) : '—'}</p>
                                              {idx > 0 && comp > 0 && <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">Ratio {(comp / idx * 100).toFixed(2)}%</p>}
                                              {(() => {
                                                // Deviation from the market reference, shown as amount AND
                                                // percentage so the size of the gap is readable at a glance.
                                                const mkt = Number(log.market_reference_price || 0);
                                                const devPct = log.deviation_from_market_pct != null ? Number(log.deviation_from_market_pct) : null;
                                                if (comp <= 0 || (mkt <= 0 && devPct == null)) return null;
                                                const diff = mkt > 0 ? comp - mkt : null;
                                                const pctText = devPct != null
                                                  ? devPct.toFixed(2)
                                                  : diff != null && mkt > 0 ? Math.abs(diff / mkt * 100).toFixed(2) : null;
                                                const overLimit = devPct != null && devPct > (rule.max_deviation_from_market_pct ?? 5);
                                                return (
                                                  <p className={cn('mt-0.5 text-[11px] tabular-nums', overLimit ? 'font-medium text-warning' : 'text-muted-foreground')}>
                                                    {diff != null && Math.abs(diff) > 0
                                                      ? `${diff > 0 ? '+' : '−'}₹${Math.abs(diff).toLocaleString('en-IN', fd)} (${pctText}%) vs market`
                                                      : `${pctText}% vs market reference`}
                                                  </p>
                                                );
                                              })()}
                                            </div>
                                            <div className="min-w-0">
                                              <p className="text-[11px] text-muted-foreground">{isApplied ? estimated ? 'Your price · est.' : 'Your price' : 'Required price · est.'}</p>
                                              <p className="mt-0.5 t-mono font-semibold tabular-nums break-words text-foreground">{ours != null ? money(ours) : '—'}</p>
                                              {ratio > 0 && <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">Ratio {ratio.toFixed(2)}%</p>}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    <details className="group text-[11px]">
                                      <summary className="flex cursor-pointer list-none items-center gap-1 rounded py-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                                        <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
                                        Safety & pricing details
                                      </summary>
                                      <dl className="mt-1.5 space-y-1.5 pl-4">
                                        {log.binance_index_price != null && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Binance index</dt><dd className="t-mono text-right tabular-nums text-foreground">₹{Number(log.binance_index_price).toLocaleString('en-IN', { maximumFractionDigits: 8 })}</dd></div>}
                                        {log.market_reference_price != null && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Market reference</dt><dd className="t-mono text-right tabular-nums text-foreground">₹{Number(log.market_reference_price).toLocaleString('en-IN', { maximumFractionDigits: 8 })}</dd></div>}
                                        {log.deviation_from_market_pct != null && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Market deviation</dt><dd className="t-mono text-right tabular-nums text-foreground">{Number(log.deviation_from_market_pct).toFixed(2)}% / {Number(rule.max_deviation_from_market_pct ?? 5)}% limit</dd></div>}
                                      </dl>
                                    </details>
                                    {/* Guards */}
                                    {(log.was_capped || log.was_rate_limited) && (
                                      <div className="flex flex-wrap gap-1">
                                        {log.was_capped && <Chip title="Held at the rule's ceiling or floor">Capped</Chip>}
                                        {log.was_rate_limited && <Chip tone="warning" title="Held back by the max change per cycle">Rate-limited</Chip>}
                                      </div>
                                    )}
                                    {/* Timestamp */}
                                    {log.created_at && (
                                      <div className="flex justify-between gap-3 border-t border-border pt-2">
                                        <span className="text-muted-foreground">Last Check</span>
                                        <span className="text-foreground" title={format(new Date(log.created_at), 'dd MMM yyyy, HH:mm:ss')}>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-1.5 px-3 py-3 text-xs">
                                    <p className="text-muted-foreground">No recent data for this asset</p>
                                    {assetLogsFailed && (
                                      <p className="flex items-start gap-1.5 text-destructive">
                                        <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        Couldn't load the latest runs, so this status may not be real.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          );
                        })}
                      </div>

                      <div className="contents">
                        {rule.competitor_mode === 'top_badged' ? (
                          <span>
                            Target <span className="font-medium text-foreground">Top {(rule.competitor_badges || []).join('/') || 'badged'} merchant</span>
                            <span> · {rule.competitor_zone === 'block' ? 'Block' : 'P2P'} zone</span>
                          </span>
                        ) : (
                          <span
                            className="min-w-0 break-words"
                            title={fallbackCount > 0 ? `Priority list: ${[rule.target_merchant, ...(rule.fallback_merchants || [])].map((m, i) => `${i + 1}. ${m}`).join('  ')}` : undefined}
                          >
                            Target <span className="font-medium text-foreground">{rule.target_merchant}</span>
                            {fallbackCount > 0 && <span> +{fallbackCount} more</span>}
                          </span>
                        )}
                        <span className="whitespace-nowrap">{adCount} {adCount === 1 ? 'ad' : 'ads'}</span>
                        {rule.active_hours_start && (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap t-mono tabular-nums" title="Active hours (IST)">
                            <Clock3 aria-hidden="true" className="h-3 w-3" />
                            {rule.active_hours_start?.slice(0,5)}–{rule.active_hours_end?.slice(0,5)}
                          </span>
                        )}
                        {(rule.last_matched_merchant || rule.last_competitor_price) && (
                          <span className="min-w-0 break-words">
                            Countering <span className="font-medium text-foreground">{rule.last_matched_merchant || '—'}</span>
                            {rule.last_competitor_price ? <> @ <span className="t-mono tabular-nums text-foreground">{inr(rule.last_competitor_price)}</span></> : ''}
                          </span>
                        )}
                        {rule.last_applied_price && rule.price_type === 'FIXED' && (
                          <span className="whitespace-nowrap">Applied <span className="t-mono font-medium tabular-nums text-foreground">{inr(rule.last_applied_price)}</span></span>
                        )}
                        {rule.last_applied_ratio && rule.price_type === 'FLOATING' && (
                          <span className="whitespace-nowrap">Applied <span className="t-mono font-medium tabular-nums text-foreground">{Number(rule.last_applied_ratio).toFixed(4)}%</span></span>
                        )}
                        {rule.last_checked_at && (
                          <span className="whitespace-nowrap" title={format(new Date(rule.last_checked_at), 'dd MMM yyyy, HH:mm:ss')}>
                            Checked {formatDistanceToNow(new Date(rule.last_checked_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      {rule.last_error && !alertState.hasAlert && (
                        <p className="line-clamp-2 basis-full break-words text-xs text-trade-sell" title={rule.last_error}>{rule.last_error}</p>
                      )}
                    </div>

                    {/* Alert strip: the rule's alert + the latest per-asset issue lines */}
                    {alertState.hasAlert && (
                      <div className={cn('col-span-2 rounded-md border px-3 py-2 @[44rem]:col-[2/4]', NOTICE_BOX[alertTone])}>
                        <div className="flex items-start gap-2">
                          {alertTone === 'danger'
                            ? <XCircle aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-destructive" />
                            : <AlertTriangle aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-warning" />}
                          <p id={alertId} className="min-w-0 flex-1 break-words text-xs font-medium leading-5 text-foreground">{alertState.alertMessage}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-my-1 -mr-1.5 h-8 shrink-0 gap-1 px-2 text-xs text-foreground/80 hover:text-foreground @[44rem]:h-7"
                            aria-describedby={alertId}
                            onClick={() => dismissAlert.mutate({ id: rule.id, ruleName: rule.name, alertMessage: alertState.alertMessage || '' })}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" /> Dismiss
                          </Button>
                        </div>
                        {/* Per-asset issue details inside the alert */}
                        {issues.length > 0 && (
                          <ul className="mt-1 space-y-1 pl-[22px]">
                            {issues.map(l => (
                              <li key={l.asset} className="flex min-w-0 items-start gap-2 text-[11px] leading-5">
                                <Chip
                                  tone="outline"
                                  mono={!!l.asset}
                                  className={cn('mt-0.5 bg-card font-semibold', ISSUE_INK[!l.asset ? 'rule' : l.status === 'error' ? 'error' : 'skipped'])}
                                >
                                  {l.asset || 'Rule'}
                                </Chip>
                                <span
                                  className="min-w-0 break-words text-foreground"
                                  title={[l.error, l.reason ? `Code: ${l.reason}` : null].filter(Boolean).join('\n') || undefined}
                                >
                                  {issueText(l)}
                                  {l.competitor_merchant && <span className="font-medium"> · vs {l.competitor_merchant}</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Actions: top-right on wide rows, a footer line on narrow ones (no rule of its own: the list divider follows) */}
                    <div className="col-span-2 -mx-1 -mb-1 flex flex-wrap items-center justify-end gap-0.5 @[44rem]:col-[3/4] @[44rem]:row-start-1 @[44rem]:-my-1 @[44rem]:mx-0">
                      <button
                        type="button"
                        className={ICON_BTN}
                        onClick={() => triggerRule.mutate({ id: rule.id, ruleName: rule.name })}
                        disabled={triggerRule.isPending}
                        aria-label="Manual Trigger"
                        aria-describedby={nameId}
                        title="Manual Trigger — run this rule now"
                      >
                        <Play />
                      </button>
                      {(rule.consecutive_errors > 0 || rule.consecutive_deviations > 0 || !rule.is_active) ? (
                        <button
                          type="button"
                          className={ICON_BTN}
                          onClick={() => resetRule.mutate({ id: rule.id, ruleName: rule.name })}
                          aria-label="Reset & Re-enable"
                          aria-describedby={nameId}
                          title="Reset & Re-enable — clear the error and deviation counts and switch the rule on"
                        >
                          <RotateCcw />
                        </button>
                      ) : (
                        // keeps Logs / Edit / Delete in the same column on every wide card
                        <span aria-hidden="true" className="hidden h-8 w-8 shrink-0 @[44rem]:block" />
                      )}
                      <button
                        type="button"
                        className={ICON_BTN}
                        onClick={() => { setLogRuleId(rule.id); setShowLogs(true); }}
                        aria-label="View Logs"
                        aria-describedby={nameId}
                        title="View Logs"
                      >
                        <ScrollText />
                      </button>
                      {canManage && (
                        <button type="button" className={ICON_BTN} onClick={() => handleEdit(rule)} aria-label={`Edit rule ${rule.name}`} title="Edit rule">
                          <Pencil />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className={ICON_BTN_DANGER}
                          onClick={() => { setDeleteId(rule.id); setDeleteRuleName(rule.name); }}
                          aria-label={`Delete rule ${rule.name}`}
                          title="Delete rule"
                        >
                          <Trash2 />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <AutoPricingRuleDialog open={dialogOpen} onOpenChange={setDialogOpen} editingRule={editingRule} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className={CONFIRM_CONTENT}>
          <AlertDialogHeader className={CONFIRM_HEADER}>
            <AlertDialogTitle className={CONFIRM_TITLE}>Delete Rule?</AlertDialogTitle>
            <AlertDialogDescription className={CONFIRM_DESC}>
              {deleteRuleName?.trim() ? `“${deleteRuleName}”` : 'This rule'} and all its logs will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={CONFIRM_FOOTER}>
            <AlertDialogCancel className={CONFIRM_CANCEL}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: 'destructive' }), CONFIRM_DELETE_DARK)} onClick={() => { if (deleteId) deleteRule.mutate({ id: deleteId, ruleName: deleteRuleName }); setDeleteId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
