import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Package, Save, BarChart3, MessageSquareText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logAdAction, AdActionTypes } from '@/hooks/useAdActionLog';
import { Chip, Field, HINT, InlineNotice, NUM, Panel, SectionHead, SettingRow, ShimmerRows, Stat, SWITCH, UNIT } from './automationUi';

/** Saved amount as shown in the read-only "Saved range" line and the preview tile. */
const inr = (v: unknown) => (v == null || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

export function SmallSalesConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['small_sales_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_sales_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: config, isLoading } = configQuery;
  // A failed read (no data at all) is shown as an error instead of looking like a disabled config.
  const configFailed = configQuery.isError && !configQuery.data;

  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [intervalSeconds, setIntervalSeconds] = useState<string>('');

  // Preview impact: count today's orders that would classify as small vs big
  const { data: preview } = useQuery({
    queryKey: ['small_sales_preview', config?.min_amount, config?.max_amount],
    enabled: !!config,
    queryFn: async () => {
      // Today IST start
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const istStart = new Date(istNow);
      istStart.setUTCHours(0, 0, 0, 0);
      const startMs = istStart.getTime() - istOffset;

      const { data: orders } = await supabase
        .from('binance_order_history')
        .select('total_price')
        .eq('trade_type', 'SELL')
        .eq('order_status', 'COMPLETED')
        .gte('create_time', startMs);

      if (!orders) return { small: 0, big: 0 };

      const min = Number(config!.min_amount);
      const max = Number(config!.max_amount);
      let small = 0, big = 0;
      for (const o of orders) {
        const tp = parseFloat(o.total_price || '0');
        if (tp >= min && tp <= max) small++;
        else big++;
      }
      return { small, big };
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: {
      is_enabled?: boolean;
      min_amount?: number;
      max_amount?: number;
      auto_mark_chat_read?: boolean;
      auto_mark_interval_seconds?: number;
      auto_mark_include_buys?: boolean;
    }) => {
      if (!config?.id) return;
      const { error } = await supabase
        .from('small_sales_config')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', config.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['small_sales_config'] });
      queryClient.invalidateQueries({ queryKey: ['small_sales_preview'] });
      queryClient.invalidateQueries({ queryKey: ['small-trade-auto-read-settings'] });
      queryClient.invalidateQueries({ queryKey: ['small-trade-bands'] });
      toast({ title: 'Config updated' });
      if ('is_enabled' in variables) {
        logAdAction({ actionType: AdActionTypes.SMALL_SALES_TOGGLED, adDetails: { is_enabled: variables.is_enabled } });
      }
      if ('min_amount' in variables || 'max_amount' in variables) {
        logAdAction({ actionType: AdActionTypes.SMALL_SALES_RANGE_CHANGED, adDetails: { min_amount: variables.min_amount, max_amount: variables.max_amount } });
      }
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update config', variant: 'destructive' }),
  });

  const handleSaveRange = () => {
    const min = parseFloat(minAmount || String(config?.min_amount || 200));
    const max = parseFloat(maxAmount || String(config?.max_amount || 4000));
    if (min >= max) {
      toast({ title: 'Invalid range', description: 'Min must be less than Max', variant: 'destructive' });
      return;
    }
    updateConfig.mutate({ min_amount: min, max_amount: max });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Panel label="Small sales settings">
          <ShimmerRows rows={4} label="Loading small sales settings…" />
        </Panel>
      </div>
    );
  }

  const autoMarkOn = !!(config as any)?.auto_mark_chat_read;

  return (
    <div className="space-y-4">
      {/* Toggle + Status */}
      <Panel labelledBy="ss-class-title">
        <SectionHead
          icon={<Package />}
          title="Small Sales Classification"
          titleId="ss-class-title"
          description="Orders with total amount between the defined range will be classified as Small Sales and clubbed during sync."
          aside={
            <>
              <Chip tone={config?.is_enabled ? 'success' : 'neutral'}>{config?.is_enabled ? 'Enabled' : 'Disabled'}</Chip>
              <Switch
                aria-label="Small Sales classification"
                className={SWITCH}
                checked={config?.is_enabled ?? false}
                onCheckedChange={(v) => updateConfig.mutate({ is_enabled: v })}
              />
            </>
          }
        />
        <div className="px-4 py-3">
          {configFailed && (
            // Without the config row every save returns early, so nothing typed or switched here is stored.
            <InlineNotice tone="danger" title="Couldn't load the saved settings" className="mb-3">
              The values below are defaults, not what is saved. Changes made now are not stored.
            </InlineNotice>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Min Amount (₹)" htmlFor="ss-min" className="w-36">
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className={UNIT}>₹</span>
                <Input
                  id="ss-min"
                  type="number"
                  placeholder={String(config?.min_amount || 200)}
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  defaultValue={config?.min_amount ? String(config.min_amount) : undefined}
                  className="h-8 min-w-0 text-sm t-mono tabular-nums"
                />
              </div>
            </Field>
            <Field label="Max Amount (₹)" htmlFor="ss-max" className="w-36">
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className={UNIT}>₹</span>
                <Input
                  id="ss-max"
                  type="number"
                  placeholder={String(config?.max_amount || 4000)}
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  defaultValue={config?.max_amount ? String(config.max_amount) : undefined}
                  className="h-8 min-w-0 text-sm t-mono tabular-nums"
                />
              </div>
            </Field>
            <Button size="sm" className="h-8 gap-1.5 px-3 text-xs [&_svg]:size-3.5" onClick={handleSaveRange} disabled={updateConfig.isPending}>
              <Save />
              Save Range
            </Button>
          </div>
          {config && (
            <p className={`${HINT} mt-2`}>
              Saved range: <span className={NUM}>{inr(config.min_amount)} – {inr(config.max_amount)}</span>
            </p>
          )}
        </div>
      </Panel>

      {/* Auto-mark small trade chats as read */}
      <Panel labelledBy="ss-mark-title">
        <SectionHead
          icon={<MessageSquareText />}
          title="Auto-mark Small Trade Chats as Read"
          titleId="ss-mark-title"
          aside={<Chip tone={autoMarkOn ? 'success' : 'neutral'}>{autoMarkOn ? 'Enabled' : 'Disabled'}</Chip>}
        />
        <div className="divide-y divide-border">
          {/* Both switches save immediately: named with aria-labelledby (not <label for>), so clicking the text can't flip them. */}
          <SettingRow
            label="Auto-mark chats as read"
            labelId="ss-mark-label"
            description={
              <>
                When enabled, the terminal clears unread chats of orders inside the small ranges at the interval below,
                so big-value client messages stay visibly unread. Enquiry chats, unknown amounts, and any counterparty
                who also has a big order are never touched.
              </>
            }
          >
            <Switch
              id="ss-mark"
              aria-labelledby="ss-mark-label"
              className={SWITCH}
              checked={(config as any)?.auto_mark_chat_read ?? false}
              onCheckedChange={(v) => updateConfig.mutate({ auto_mark_chat_read: v })}
            />
          </SettingRow>

          <SettingRow label="Include small BUY chats" labelId="ss-mark-buys-label" description="Off = only small SELL order chats are cleared.">
            <Switch
              id="ss-mark-buys"
              aria-labelledby="ss-mark-buys-label"
              className={SWITCH}
              checked={(config as any)?.auto_mark_include_buys ?? true}
              onCheckedChange={(v) => updateConfig.mutate({ auto_mark_include_buys: v })}
            />
          </SettingRow>

          <div className="px-4 py-3">
            <Field
              label="Run every (seconds)"
              htmlFor="ss-interval"
              hint={<>Current interval: every {Number((config as any)?.auto_mark_interval_seconds || 60)} seconds. Allowed range 10–3600.</>}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    id="ss-interval"
                    type="number"
                    min={10}
                    max={3600}
                    placeholder="60"
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(e.target.value)}
                    className="h-8 w-28 text-sm t-mono tabular-nums"
                  />
                  <span aria-hidden="true" className={UNIT}>s</span>
                </div>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs [&_svg]:size-3.5"
                  disabled={updateConfig.isPending}
                  onClick={() => {
                    const secs = Math.round(Number(intervalSeconds || (config as any)?.auto_mark_interval_seconds || 60));
                    if (!Number.isFinite(secs) || secs < 10 || secs > 3600) {
                      toast({ title: 'Invalid interval', description: 'Use 10 to 3600 seconds', variant: 'destructive' });
                      return;
                    }
                    updateConfig.mutate({ auto_mark_interval_seconds: secs });
                  }}
                >
                  <Save />
                  Save Interval
                </Button>
              </div>
            </Field>
          </div>
        </div>
      </Panel>

      {/* Preview Impact */}
      <Panel labelledBy="ss-preview-title">
        <SectionHead
          icon={<BarChart3 />}
          title="Today's Classification Preview"
          titleId="ss-preview-title"
          description="Completed SELL orders today (since midnight IST), split by the saved range."
        />
        <div className="grid grid-cols-2 gap-3 px-4 py-3">
          {/* The saved range, same values as the "Saved range" line (a saved 0 shows as ₹0); defaults only without a config row */}
          <Stat
            label="Small Sales"
            value={preview ? preview.small : '—'}
            hint={config ? `${inr(config.min_amount)} – ${inr(config.max_amount)}` : '₹200 – ₹4,000'}
          />
          <Stat label="Big Sales" value={preview ? preview.big : '—'} hint="Outside range" />
        </div>
      </Panel>
    </div>
  );
}
