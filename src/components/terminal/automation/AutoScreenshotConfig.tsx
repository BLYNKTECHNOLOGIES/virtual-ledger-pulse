import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Image as ImageIcon, ExternalLink, Save, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import {
  useAutoScreenshotConfig,
  useUpdateAutoScreenshotConfig,
  useAutoScreenshotLog,
} from '@/hooks/useAutoScreenshotAutomation';

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  skipped_out_of_range: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  skipped_non_upi: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  skipped_non_buy: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
};

interface Props {
  canManage: boolean;
}

export function AutoScreenshotConfig({ canManage }: Props) {
  const { data: cfg, isLoading } = useAutoScreenshotConfig();
  const update = useUpdateAutoScreenshotConfig();
  const { data: logs = [] } = useAutoScreenshotLog(50);

  const [form, setForm] = useState({
    is_active: false,
    min_amount: 0,
    max_amount: 0,
    from_name: '',
    from_upi_id: '',
    provider_fee_flat: 10,
  });

  useEffect(() => {
    if (cfg) {
      setForm({
        is_active: cfg.is_active,
        min_amount: Number(cfg.min_amount),
        max_amount: Number(cfg.max_amount),
        from_name: cfg.from_name,
        from_upi_id: cfg.from_upi_id,
        provider_fee_flat: Number(cfg.provider_fee_flat),
      });
    }
  }, [cfg]);

  const dirty = cfg && (
    form.is_active !== cfg.is_active ||
    Number(form.min_amount) !== Number(cfg.min_amount) ||
    Number(form.max_amount) !== Number(cfg.max_amount) ||
    form.from_name !== cfg.from_name ||
    form.from_upi_id !== cfg.from_upi_id ||
    Number(form.provider_fee_flat) !== Number(cfg.provider_fee_flat)
  );

  const handleSave = () => {
    if (!cfg) return;
    if (Number(form.min_amount) > Number(form.max_amount)) {
      return;
    }
    update.mutate({ id: cfg.id, ...form });
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Auto Screenshot Sender
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Sends a UPI receipt PNG to the Binance order chat when a Payer marks an in-range UPI BUY order as Paid.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="active-toggle" className="text-sm">Active</Label>
            <Switch
              id="active-toggle"
              checked={form.is_active}
              onCheckedChange={(v) => setForm(s => ({ ...s, is_active: v }))}
              disabled={!canManage}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Min Amount (₹)</Label>
              <Input type="number" min={0} value={form.min_amount}
                onChange={(e) => setForm(s => ({ ...s, min_amount: Number(e.target.value) }))}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label>Max Amount (₹)</Label>
              <Input type="number" min={0} value={form.max_amount}
                onChange={(e) => setForm(s => ({ ...s, max_amount: Number(e.target.value) }))}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label>Provider Fee (₹, flat)</Label>
              <Input type="number" min={0} value={form.provider_fee_flat}
                onChange={(e) => setForm(s => ({ ...s, provider_fee_flat: Number(e.target.value) }))}
                disabled={!canManage}
              />
            </div>
            <div className="md:col-span-2">
              <Label>From Name (sender)</Label>
              <Input value={form.from_name}
                onChange={(e) => setForm(s => ({ ...s, from_name: e.target.value }))}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label>From UPI ID</Label>
              <Input value={form.from_upi_id}
                onChange={(e) => setForm(s => ({ ...s, from_upi_id: e.target.value }))}
                disabled={!canManage}
              />
            </div>
          </div>

          {Number(form.min_amount) > Number(form.max_amount) && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" /> Min amount cannot be greater than max amount.
            </div>
          )}

          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p><strong>How it works:</strong> Triggers only when a Payer marks a UPI <strong>BUY</strong> order Paid from the Payer tab and the order amount falls within [Min, Max].</p>
            <p>Decimal places are dropped (₹99.99 → ₹99). UPI Transaction ID is auto-generated as a 10-digit number starting with 5, 8, or 9. Date/time uses the moment Mark Paid was clicked.</p>
            <p>The same template as the Utility &gt; Payment Screenshot Generator is used.</p>
          </div>

          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={!dirty || update.isPending}>
                <Save className="h-4 w-4 mr-1.5" /> Save Settings
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Activity</CardTitle>
          <p className="text-xs text-muted-foreground">Last 50 attempts. Updates in realtime.</p>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="text-center py-10 text-xs text-muted-foreground">No activity yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>UPI</TableHead>
                  <TableHead>Txn ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Image</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(l.created_at), 'dd MMM HH:mm:ss')}</TableCell>
                    <TableCell className="font-mono text-xs">{l.order_number}</TableCell>
                    <TableCell className="text-xs">{l.payer_name || '—'}</TableCell>
                    <TableCell className="text-xs">{l.amount_used != null ? `₹${l.amount_used}` : '—'}</TableCell>
                    <TableCell className="text-xs font-mono max-w-[160px] truncate">{l.to_upi_id || '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{l.upi_txn_id || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[l.status] || ''}`}>
                        {l.status.replace(/_/g, ' ')}
                      </Badge>
                      {l.error_message && (
                        <div className="text-[10px] text-destructive mt-0.5 max-w-[200px] truncate" title={l.error_message}>
                          {l.error_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.image_url ? (
                        <a href={l.image_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline text-xs">
                          View <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
