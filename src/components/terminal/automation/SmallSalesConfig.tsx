import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Settings, Save, BarChart3 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logAdAction, AdActionTypes } from '@/hooks/useAdActionLog';

export function SmallSalesConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
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
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Toggle + Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Small Sales Classification</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{config?.is_enabled ? 'Enabled' : 'Disabled'}</span>
              <Switch
                checked={config?.is_enabled ?? false}
                onCheckedChange={(v) => updateConfig.mutate({ is_enabled: v })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Orders with total amount between the defined range will be classified as Small Sales and clubbed during sync.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Min Amount (₹)</Label>
              <Input
                type="number"
                placeholder={String(config?.min_amount || 200)}
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                defaultValue={config?.min_amount ? String(config.min_amount) : undefined}
              />
            </div>
            <div>
              <Label>Max Amount (₹)</Label>
              <Input
                type="number"
                placeholder={String(config?.max_amount || 4000)}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                defaultValue={config?.max_amount ? String(config.max_amount) : undefined}
              />
            </div>
          </div>

          <Button size="sm" onClick={handleSaveRange} disabled={updateConfig.isPending}>
            <Save className="h-4 w-4 mr-1" />
            Save Range
          </Button>
        </CardContent>
      </Card>

      {/* Auto-mark small trade chats as read */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Auto-mark Small Trade Chats as Read</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{(config as any)?.auto_mark_chat_read ? 'Enabled' : 'Disabled'}</span>
              <Switch
                checked={(config as any)?.auto_mark_chat_read ?? false}
                onCheckedChange={(v) => updateConfig.mutate({ auto_mark_chat_read: v })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            When enabled, the terminal clears unread chats of orders inside the small ranges at the interval below,
            so big-value client messages stay visibly unread. Enquiry chats, unknown amounts, and any counterparty
            who also has a big order are never touched.
          </p>

          <div className="grid grid-cols-2 gap-4 items-end">
            <div>
              <Label>Run every (seconds)</Label>
              <Input
                type="number"
                min={10}
                max={3600}
                placeholder="60"
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(e.target.value)}
              />
            </div>
            <Button
              size="sm"
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
              <Save className="h-4 w-4 mr-1" />
              Save Interval
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Include small BUY chats</p>
              <p className="text-xs text-muted-foreground">Off = only small SELL order chats are cleared.</p>
            </div>
            <Switch
              checked={(config as any)?.auto_mark_include_buys ?? true}
              onCheckedChange={(v) => updateConfig.mutate({ auto_mark_include_buys: v })}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Current interval: every {Number((config as any)?.auto_mark_interval_seconds || 60)} seconds.
          </p>
        </CardContent>
      </Card>



      {/* Preview Impact */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Today's Classification Preview</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-warning/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-warning">{preview?.small ?? 0}</p>
              <p className="text-sm text-warning">Small Sales</p>
              <Badge variant="outline" className="mt-1">₹{Number(config?.min_amount || 200).toLocaleString('en-IN')} – ₹{Number(config?.max_amount || 4000).toLocaleString('en-IN')}</Badge>
            </div>
            <div className="p-4 bg-info/10 rounded-lg text-center">
              <p className="text-2xl font-bold text-info">{preview?.big ?? 0}</p>
              <p className="text-sm text-info">Big Sales</p>
              <Badge variant="outline" className="mt-1">Outside range</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
