import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  Plus, Edit, Trash2, Play, RotateCcw, AlertTriangle, CheckCircle, Clock
} from 'lucide-react';
import {
  useAutoPricingRules,
  useUpdateAutoPricingRule,
  useDeleteAutoPricingRule,
  useManualTriggerRule,
  useResetRuleState,
  AutoPricingRule,
} from '@/hooks/useAutoPricingRules';
import { AutoPricingRuleDialog } from './AutoPricingRuleDialog';
import { AutoPricingLogs } from './AutoPricingLogs';
import { formatDistanceToNow } from 'date-fns';

export function AutoPricingRules() {
  const { data: rules = [], isLoading } = useAutoPricingRules();
  const updateRule = useUpdateAutoPricingRule();
  const deleteRule = useDeleteAutoPricingRule();
  const triggerRule = useManualTriggerRule();
  const resetRule = useResetRuleState();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoPricingRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logRuleId, setLogRuleId] = useState<string | undefined>();

  const handleEdit = (rule: AutoPricingRule) => { setEditingRule(rule); setDialogOpen(true); };
  const handleCreate = () => { setEditingRule(null); setDialogOpen(true); };

  const activeCount = rules.filter(r => r.is_active).length;
  const pausedCount = rules.filter(r => !r.is_active).length;

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
          {rules.map(rule => (
            <Card key={rule.id} className={`${!rule.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
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
                        {(rule.assets?.length > 0 ? rule.assets : [rule.asset]).map(a => (
                          <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                        ))}
                        <Badge variant={rule.trade_type === 'BUY' ? 'default' : 'secondary'} className="text-[10px]">
                          {rule.trade_type}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{rule.price_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {rule.offset_direction}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>Target: <span className="font-medium text-foreground">{rule.target_merchant}</span></span>
                        {rule.fallback_merchants?.length > 0 && <span>+{rule.fallback_merchants.length} fallback(s)</span>}
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
                      {rule.last_error && (
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => triggerRule.mutate(rule.id)} disabled={triggerRule.isPending} title="Manual Trigger">
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    {(rule.consecutive_errors > 0 || rule.consecutive_deviations > 0 || !rule.is_active) && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => resetRule.mutate(rule.id)} title="Reset & Re-enable">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setLogRuleId(rule.id); setShowLogs(true); }} title="View Logs">
                      <Clock className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(rule)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(rule.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
            <AlertDialogAction onClick={() => { if (deleteId) deleteRule.mutate(deleteId); setDeleteId(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
