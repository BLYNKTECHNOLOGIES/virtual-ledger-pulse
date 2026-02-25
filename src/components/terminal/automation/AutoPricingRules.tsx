import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  Plus, Edit, Trash2, Play, RotateCcw, AlertTriangle, CheckCircle, Clock, XCircle, Bell
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
import { AutoPricingLogs } from './AutoPricingLogs';
import { formatDistanceToNow } from 'date-fns';

const ALERT_STYLES: Record<string, string> = {
  merchant_missing: 'border-amber-500 ring-2 ring-amber-500/30 animate-pulse',
  deviation: 'border-orange-500 ring-2 ring-orange-500/30 animate-pulse',
  error: 'border-destructive ring-2 ring-destructive/30 animate-pulse',
  auto_paused: 'border-destructive ring-2 ring-destructive/40 animate-pulse',
};

const ALERT_BADGE_STYLES: Record<string, string> = {
  merchant_missing: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  deviation: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  error: 'bg-destructive/20 text-destructive border-destructive/40',
  auto_paused: 'bg-destructive/20 text-destructive border-destructive/40',
};

export function AutoPricingRules() {
  const { data: rules = [], isLoading } = useAutoPricingRules();
  const updateRule = useUpdateAutoPricingRule();
  const deleteRule = useDeleteAutoPricingRule();
  const triggerRule = useManualTriggerRule();
  const resetRule = useResetRuleState();
  const dismissAlert = useDismissRuleAlert();
  const ruleIds = rules.map(r => r.id);
  const { data: assetLogsMap = {} } = useLatestAssetLogs(ruleIds);
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

  const getHealthColor = (rule: AutoPricingRule) => {
    if (!rule.is_active) return 'text-muted-foreground';
    if (rule.consecutive_errors > 10 || rule.consecutive_deviations >= rule.auto_pause_after_deviations) return 'text-destructive';
    if (rule.consecutive_errors > 3 || rule.consecutive_deviations > 2) return 'text-warning';
    return 'text-success';
  };

  const getHealthIcon = (rule: AutoPricingRule) => {
    if (!rule.is_active) return <AlertTriangle className="h-4 w-4" />;
    if (rule.consecutive_errors > 3 || rule.consecutive_deviations > 2) return <AlertTriangle className="h-4 w-4" />;
    return <CheckCircle className="h-4 w-4" />;
  };

  if (showLogs) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setShowLogs(false)}>← Back to Rules</Button>
        <AutoPricingLogs ruleId={logRuleId} rules={rules} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline">{rules.length} Rules</Badge>
          <Badge className="bg-success/20 text-success">{activeCount} Active</Badge>
          {pausedCount > 0 && <Badge variant="destructive">{pausedCount} Paused</Badge>}
          {alertCount > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse">
              <Bell className="h-3 w-3 mr-1" /> {alertCount} Alert{alertCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setLogRuleId(undefined); setShowLogs(true); }}>
            <Clock className="h-3.5 w-3.5 mr-1.5" /> View Logs
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Rule
          </Button>
        </div>
      </div>

      {/* Rule Cards */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No auto-pricing rules configured</p>
            <p className="text-xs mt-1">Create rules to automatically match competitor prices</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rules.map(rule => {
            const alertState = getRuleAlertState(rule);
            const alertStyle = alertState.hasAlert && alertState.alertType ? ALERT_STYLES[alertState.alertType] : '';
            const alertBadgeStyle = alertState.hasAlert && alertState.alertType ? ALERT_BADGE_STYLES[alertState.alertType] : '';
            const assetLogs: AssetAlertInfo[] = assetLogsMap[rule.id] || [];
            const assetsInRule = rule.assets?.length > 0 ? rule.assets : [rule.asset];
            const hasAssetIssues = assetLogs.some(l => l.status === 'skipped' || l.status === 'error');

            return (
              <Card key={rule.id} className={`transition-all ${!rule.is_active && !alertState.hasAlert ? 'opacity-60' : ''} ${alertStyle}`}>
                <CardContent className="p-4">
                  {/* Alert Banner with per-asset breakdown */}
                  {alertState.hasAlert && (
                    <div className="mb-3 px-3 py-2 rounded-md bg-destructive/5 border border-destructive/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                          <span className="text-xs font-medium text-foreground">{alertState.alertMessage}</span>
                          <Badge variant="outline" className={`text-[10px] ${alertBadgeStyle}`}>
                            {alertState.alertType?.replace('_', ' ')}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => dismissAlert.mutate({ id: rule.id, ruleName: rule.name, alertMessage: alertState.alertMessage || '' })}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Dismiss
                        </Button>
                      </div>
                      {/* Per-asset issue details inside the alert */}
                      {assetLogs.filter(l => l.status === 'error' || l.status === 'skipped').length > 0 && (
                        <div className="flex flex-col gap-1 pl-6">
                          {assetLogs.filter(l => l.status === 'error' || l.status === 'skipped').map(l => (
                            <div key={l.asset} className="flex items-center gap-2 text-[11px]">
                              <span className={`font-semibold ${l.status === 'error' ? 'text-destructive' : 'text-amber-400'}`}>
                                {l.asset}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-muted-foreground">
                                {l.status === 'skipped'
                                  ? (l.reason === 'no_merchant' ? `Merchant not found in top listings` : l.reason === 'no_listings' ? 'No P2P listings available' : l.reason === 'deviation' ? `Price deviation exceeded limit` : l.reason || 'Skipped')
                                  : (l.error || 'Unknown error')
                                }
                              </span>
                              {l.competitor_merchant && (
                                <span className="text-muted-foreground/60">({l.competitor_merchant})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(v) => updateRule.mutate({ id: rule.id, is_active: v })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{rule.name}</span>
                          <Badge variant={rule.trade_type === 'BUY' ? 'default' : 'secondary'} className="text-[10px]">
                            {rule.trade_type}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">{rule.price_type}</Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {rule.offset_direction}
                          </Badge>
                        </div>

                        {/* Per-Asset Status Badges */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {assetsInRule.map(asset => {
                            const log = assetLogs.find(l => l.asset === asset);
                            const isError = log?.status === 'error';
                            const isSkipped = log?.status === 'skipped';
                            const isApplied = log?.status === 'applied' || log?.status === 'success';
                            const isIssue = isError || isSkipped;

                            let statusClass = 'bg-muted text-muted-foreground border-border'; // unknown/no data

                            if (isApplied) {
                              statusClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
                            } else if (isSkipped) {
                              statusClass = 'bg-amber-500/15 text-amber-400 border-amber-500/40 animate-pulse';
                            } else if (isError) {
                              statusClass = 'bg-destructive/15 text-destructive border-destructive/40 animate-pulse';
                            }

                            return (
                              <Popover key={asset}>
                                <PopoverTrigger asChild>
                                  <button className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer hover:brightness-125 transition-all ${statusClass}`}>
                                    {isIssue && <AlertTriangle className="h-2.5 w-2.5" />}
                                    {isApplied && <CheckCircle className="h-2.5 w-2.5" />}
                                    {asset}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent side="bottom" align="start" className="w-72 p-0">
                                  <div className="p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-sm">{asset}</span>
                                      <Badge variant="outline" className={`text-[10px] ${isApplied ? 'bg-emerald-500/15 text-emerald-400' : isSkipped ? 'bg-amber-500/15 text-amber-400' : isError ? 'bg-destructive/15 text-destructive' : ''}`}>
                                        {isApplied ? 'Applied' : isSkipped ? 'Skipped' : isError ? 'Error' : 'No Data'}
                                      </Badge>
                                    </div>
                                    {log ? (
                                      <div className="space-y-1.5 text-xs">
                                        {/* Issue Reason */}
                                        {(isSkipped || isError) && (
                                          <div className="p-2 rounded bg-destructive/5 border border-destructive/20">
                                            <span className="font-medium text-destructive">
                                              {isSkipped
                                                ? (log.reason === 'no_merchant' ? '⚠ Target merchant not found in top 500 listings'
                                                  : log.reason === 'no_listings' ? '⚠ No P2P listings available for this asset'
                                                  : log.reason === 'deviation_exceeded' ? '⚠ Competitor price deviates too far from market reference'
                                                  : log.reason === 'no_ads' ? '⚠ No ad numbers configured or all excluded'
                                                  : `⚠ ${log.reason || 'Unknown skip reason'}`)
                                                : `✕ ${log.error || 'Unknown error'}`
                                              }
                                            </span>
                                          </div>
                                        )}
                                        {/* Competitor Info */}
                                        {log.competitor_merchant && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Competitor</span>
                                            <span className="font-medium">{log.competitor_merchant}</span>
                                          </div>
                                        )}
                                        {log.competitor_price != null && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Competitor Price</span>
                                            <span className="font-medium">₹{Number(log.competitor_price).toLocaleString('en-IN')}</span>
                                          </div>
                                        )}
                                        {/* Market Reference */}
                                        {log.market_reference_price != null && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Market Ref</span>
                                            <span className="font-medium">₹{Number(log.market_reference_price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                          </div>
                                        )}
                                        {log.deviation_from_market_pct != null && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Deviation</span>
                                            <span className={`font-medium ${Number(log.deviation_from_market_pct) > 3 ? 'text-destructive' : 'text-amber-400'}`}>
                                              {Number(log.deviation_from_market_pct).toFixed(2)}%
                                            </span>
                                          </div>
                                        )}
                                        {/* Applied Price */}
                                        {log.applied_price != null && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Applied Price</span>
                                            <span className="font-medium text-emerald-400">₹{Number(log.applied_price).toLocaleString('en-IN')}</span>
                                          </div>
                                        )}
                                        {log.applied_ratio != null && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Applied Ratio</span>
                                            <span className="font-medium text-emerald-400">{Number(log.applied_ratio).toFixed(4)}%</span>
                                          </div>
                                        )}
                                        {/* Guards */}
                                        {(log.was_capped || log.was_rate_limited) && (
                                          <div className="flex gap-1 pt-1">
                                            {log.was_capped && <Badge variant="outline" className="text-[9px] px-1">Capped</Badge>}
                                            {log.was_rate_limited && <Badge variant="outline" className="text-[9px] px-1">Rate-Limited</Badge>}
                                          </div>
                                        )}
                                        {/* Timestamp */}
                                        {log.created_at && (
                                          <div className="flex justify-between pt-1 border-t border-border/50">
                                            <span className="text-muted-foreground">Last Check</span>
                                            <span className="text-muted-foreground">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">No recent data for this asset</p>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span>P1: <span className="font-medium text-foreground">{rule.target_merchant}</span></span>
                          {rule.fallback_merchants?.length > 0 && <span>+{rule.fallback_merchants.length} priority merchant(s)</span>}
                          <span>{rule.ad_numbers?.length || 0} ad(s)</span>
                          {rule.active_hours_start && (
                            <span>⏰ {rule.active_hours_start?.slice(0,5)}–{rule.active_hours_end?.slice(0,5)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {rule.last_competitor_price && (
                            <span>Competitor: ₹{Number(rule.last_competitor_price).toLocaleString('en-IN')}</span>
                          )}
                          {rule.last_applied_price && rule.price_type === 'FIXED' && (
                            <span>Applied: ₹{Number(rule.last_applied_price).toLocaleString('en-IN')}</span>
                          )}
                          {rule.last_applied_ratio && rule.price_type === 'FLOATING' && (
                            <span>Applied: {Number(rule.last_applied_ratio).toFixed(4)}%</span>
                          )}
                          {rule.last_checked_at && (
                            <span>Checked {formatDistanceToNow(new Date(rule.last_checked_at), { addSuffix: true })}</span>
                          )}
                        </div>
                        {rule.last_error && !alertState.hasAlert && (
                          <p className="text-xs text-destructive mt-1 truncate">{rule.last_error}</p>
                        )}
                      </div>
                    </div>

                    {/* Right: Health + Actions */}
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`${getHealthColor(rule)}`}>{getHealthIcon(rule)}</div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Errors: {rule.consecutive_errors} | Deviations: {rule.consecutive_deviations}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => triggerRule.mutate({ id: rule.id, ruleName: rule.name })} disabled={triggerRule.isPending} title="Manual Trigger">
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      {(rule.consecutive_errors > 0 || rule.consecutive_deviations > 0 || !rule.is_active) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => resetRule.mutate({ id: rule.id, ruleName: rule.name })} title="Reset & Re-enable">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setLogRuleId(rule.id); setShowLogs(true); }} title="View Logs">
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(rule)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setDeleteId(rule.id); setDeleteRuleName(rule.name); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AutoPricingRuleDialog open={dialogOpen} onOpenChange={setDialogOpen} editingRule={editingRule} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this auto-pricing rule and all its logs.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteRule.mutate({ id: deleteId, ruleName: deleteRuleName }); setDeleteId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
