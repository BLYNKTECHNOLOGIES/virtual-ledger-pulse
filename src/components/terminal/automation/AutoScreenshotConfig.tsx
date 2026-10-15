import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Image as ImageIcon, ExternalLink, Save, AlertCircle, AlertTriangle, Info, Receipt, CheckCircle2, MinusCircle, XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  useAutoScreenshotConfig,
  useUpdateAutoScreenshotConfig,
  useAutoScreenshotLog,
} from '@/hooks/useAutoScreenshotAutomation';
import {
  Chip, Field, INVALID, InlineNotice, NUM, Panel, PanelHead, PanelState, SCROLL_BOX, SectionHead, ShimmerRows, SWITCH, TD, TH, TH_STICKY,
  type Tone,
} from './automationUi';

/** Status words stay the stored words (capitalised); the title says what each one means. Icons follow the page's shared
 *  map: sent ✓, routine skip –, failed ✕. */
const STATUS: Record<string, { label: string; tone: Tone; icon: ReactNode; title?: string }> = {
  sent: { label: 'Sent', tone: 'success', icon: <CheckCircle2 aria-hidden="true" />, title: 'Receipt posted to the Binance order chat' },
  skipped_out_of_range: { label: 'Skipped out of range', tone: 'neutral', icon: <MinusCircle aria-hidden="true" />, title: 'Order amount outside the Min–Max window' },
  skipped_non_upi: { label: 'Skipped non UPI', tone: 'neutral', icon: <MinusCircle aria-hidden="true" />, title: 'The order is not paid by UPI' },
  skipped_non_buy: { label: 'Skipped non BUY', tone: 'neutral', icon: <MinusCircle aria-hidden="true" />, title: 'Only BUY orders get a receipt' },
  failed: { label: 'Failed', tone: 'danger', icon: <XCircle aria-hidden="true" /> },
};

const HEAD = cn(TH, TH_STICKY);

interface Props {
  canManage: boolean;
}

/** Message of a failed read; Supabase errors are plain `{ message, code }` objects, not Error instances. */
const errorText = (e: unknown) => (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : '');

/** Amount input with a ₹ prefix (left side, clear of the spin buttons); sized for an amount, not the full column. */
function RupeeInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className="relative w-full max-w-[11rem]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">₹</span>
      <Input {...props} className={cn('h-8 pl-7 t-mono tabular-nums', INVALID, className)} />
    </div>
  );
}

export function AutoScreenshotConfig({ canManage }: Props) {
  const cfgQuery = useAutoScreenshotConfig();
  const { data: cfg, isLoading } = cfgQuery;
  const update = useUpdateAutoScreenshotConfig();
  const logQuery = useAutoScreenshotLog(50);
  const { data: logs = [] } = logQuery;

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

  const rangeInvalid = Number(form.min_amount) > Number(form.max_amount);
  // What the form is showing: a failed read and a missing settings row both leave the defaults on screen.
  const cfgFailed = cfgQuery.isError && !cfgQuery.data;
  const cfgMissing = !cfgQuery.isError && cfg === null;
  const logFailed = logQuery.isError && !logQuery.data;
  const rangeProps = { 'aria-invalid': rangeInvalid || undefined, 'aria-describedby': rangeInvalid ? 'ss-range-error' : undefined };

  if (isLoading) {
    return (
      <Panel label="Auto screenshot sender">
        <ShimmerRows rows={4} label="Loading screenshot settings…" />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel labelledBy="ss-config-title">
        <SectionHead
          icon={<ImageIcon />}
          title="Auto screenshot sender"
          titleId="ss-config-title"
          description="Sends a UPI receipt PNG to the Binance order chat when a Payer marks an in-range UPI BUY order as Paid."
          aside={
            <div className="flex items-center gap-2">
              {/* The switch's state in words (it is part of the form: it takes effect on Save). */}
              <Chip tone={form.is_active ? 'success' : 'neutral'}>{form.is_active ? 'Enabled' : 'Disabled'}</Chip>
              <label htmlFor="active-toggle" className="text-sm font-medium text-foreground">Active</label>
              <Switch
                id="active-toggle"
                className={SWITCH}
                checked={form.is_active}
                onCheckedChange={(v) => setForm(s => ({ ...s, is_active: v }))}
                disabled={!canManage}
              />
            </div>
          }
        />
        <div className="space-y-4 px-4 py-3">
          {cfgFailed && (
            <InlineNotice tone="danger" title="Couldn't load the saved settings">
              The values below are defaults, and Save stays unavailable until the settings load.
            </InlineNotice>
          )}
          {cfgMissing && (
            <InlineNotice tone="warning" title="No saved settings yet">
              The values below are defaults. There is no settings record to update, so they can't be saved from here.
            </InlineNotice>
          )}

          {/* One grid for all five fields, so the columns line up row to row. */}
          <div className="grid gap-x-4 gap-y-3 @[40rem]:grid-cols-3">
            <Field label="Min Amount (₹)" htmlFor="ss-min-amount">
              <RupeeInput
                id="ss-min-amount"
                type="number"
                min={0}
                value={form.min_amount}
                onChange={(e) => setForm(s => ({ ...s, min_amount: Number(e.target.value) }))}
                disabled={!canManage}
                {...rangeProps}
              />
            </Field>
            <Field
              label="Max Amount (₹)"
              htmlFor="ss-max-amount"
              errorId="ss-range-error"
              error={rangeInvalid ? (
                <span className="flex items-start gap-1.5">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                  Min amount cannot be greater than max amount.
                </span>
              ) : undefined}
            >
              <RupeeInput
                id="ss-max-amount"
                type="number"
                min={0}
                value={form.max_amount}
                onChange={(e) => setForm(s => ({ ...s, max_amount: Number(e.target.value) }))}
                disabled={!canManage}
                {...rangeProps}
              />
            </Field>
            <Field label="Provider Fee (₹, flat)" htmlFor="ss-provider-fee">
              <RupeeInput
                id="ss-provider-fee"
                type="number"
                min={0}
                value={form.provider_fee_flat}
                onChange={(e) => setForm(s => ({ ...s, provider_fee_flat: Number(e.target.value) }))}
                disabled={!canManage}
              />
            </Field>
            <Field label="From Name (sender)" htmlFor="ss-from-name">
              <Input
                id="ss-from-name"
                className="h-8 @[40rem]:max-w-sm"
                value={form.from_name}
                onChange={(e) => setForm(s => ({ ...s, from_name: e.target.value }))}
                disabled={!canManage}
              />
            </Field>
            <Field label="From UPI ID" htmlFor="ss-from-upi">
              <Input
                id="ss-from-upi"
                className="h-8 t-mono @[40rem]:max-w-sm"
                value={form.from_upi_id}
                onChange={(e) => setForm(s => ({ ...s, from_upi_id: e.target.value }))}
                disabled={!canManage}
              />
            </Field>
          </div>

          <div className="rounded-md border border-border px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-info" /> How it works
            </p>
            <div className="mt-1 space-y-1">
              <p>Triggers only when a Payer marks a UPI <strong className="font-semibold text-foreground">BUY</strong> order Paid from the Payer tab and the order amount falls within [Min, Max].</p>
              <p>Decimal places are dropped (₹99.99 → ₹99). UPI Transaction ID is auto-generated as a 10-digit number starting with 5, 8, or 9. Date/time uses the moment Mark Paid was clicked.</p>
              <p>The same template as the Utility &gt; Payment Screenshot Generator is used.</p>
            </div>
          </div>

          {canManage && (
            <div className="flex justify-end border-t border-border pt-3">
              <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={handleSave} disabled={!dirty || update.isPending}>
                <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save Settings
              </Button>
            </div>
          )}
        </div>
      </Panel>

      <Panel labelledBy="ss-activity-title">
        <PanelHead
          icon={<Receipt />}
          title="Recent activity"
          titleId="ss-activity-title"
          // Like the other logs: "N entries", no count at 0 (the empty state says it), nothing while loading or failed.
          meta={logQuery.isLoading || logFailed || logs.length === 0 ? undefined : `${logs.length} ${logs.length === 1 ? 'entry' : 'entries'} (latest 50) · updates live`}
        />
        {logQuery.isLoading ? (
          <ShimmerRows rows={3} label="Loading screenshot activity…" />
        ) : logFailed ? (
          <PanelState
            tone="danger"
            icon={<AlertTriangle />}
            title="Couldn't load recent activity"
            hint={
              <>
                {errorText(logQuery.error) && <p className="mb-1 t-mono text-[11px]">{errorText(logQuery.error)}</p>}
                <p>Retrying every 15 s.</p>
              </>
            }
          />
        ) : logs.length === 0 ? (
          <PanelState icon={<Receipt />} title="No activity yet" hint="Attempts appear here when a Payer marks a UPI BUY order as Paid." />
        ) : (
          // Height cap only on wide panels; on narrow ones the table flows with the page and only scrolls sideways.
          <div className={cn(SCROLL_BOX, 'max-h-none @[52rem]:max-h-[28rem]')} tabIndex={0} role="region" aria-label="Screenshot activity">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th scope="col" className={cn(HEAD, 'pl-4')}>Time</th>
                  <th scope="col" className={HEAD}>Order</th>
                  <th scope="col" className={HEAD}>Status</th>
                  <th scope="col" className={cn(HEAD, 'text-right')}>Amount</th>
                  <th scope="col" className={HEAD}>Payer</th>
                  <th scope="col" className={HEAD}>UPI</th>
                  <th scope="col" className={HEAD}>Txn ID</th>
                  <th scope="col" className={cn(HEAD, 'pr-4 text-right')}>Image</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => {
                  const st = STATUS[l.status] ?? { label: String(l.status ?? '—').replace(/_/g, ' '), tone: 'neutral' as Tone, icon: null };
                  const order = String(l.order_number ?? '');
                  return (
                    <tr key={l.id}>
                      <td className={cn(TD, NUM, 'pl-4 text-muted-foreground')}>{format(new Date(l.created_at), 'dd MMM HH:mm:ss')}</td>
                      {/* Same order reference as the other logs: "…" + last 8 digits, the full number in the tooltip. */}
                      <td className={cn(TD, NUM, 'text-foreground')} title={order || undefined}>{order.length > 8 ? `…${order.slice(-8)}` : order || '—'}</td>
                      <td className={TD}>
                        <Chip tone={st.tone} title={st.title}>{st.icon}{st.label}</Chip>
                        {l.error_message && (
                          <p className="mt-1 line-clamp-2 max-w-[16rem] whitespace-normal break-words text-[11px] leading-4 text-trade-sell" title={l.error_message}>
                            {l.error_message}
                          </p>
                        )}
                      </td>
                      <td className={cn(TD, NUM, 'text-right text-foreground')}>{l.amount_used != null ? `₹${Number(l.amount_used).toLocaleString('en-IN')}` : '—'}</td>
                      <td className={cn(TD, 'whitespace-nowrap text-foreground')}>{l.payer_name || '—'}</td>
                      <td className={cn(TD, 'max-w-[14rem]')}>
                        <span className="block truncate t-mono text-muted-foreground" title={l.to_upi_id || undefined}>{l.to_upi_id || '—'}</span>
                      </td>
                      <td className={cn(TD, NUM, 'text-muted-foreground')}>{l.upi_txn_id || '—'}</td>
                      <td className={cn(TD, 'pr-4 text-right')}>
                        {l.image_url ? (
                          <a
                            href={l.image_url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`View receipt for order …${String(l.order_number).slice(-8)} (opens in a new tab)`}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            View <ExternalLink aria-hidden="true" className="h-3 w-3" />
                          </a>
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
    </div>
  );
}
