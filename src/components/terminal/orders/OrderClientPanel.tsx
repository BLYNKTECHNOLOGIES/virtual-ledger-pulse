import type { ReactNode } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle, BadgeCheck, CircleAlert, ExternalLink, FileCheck2, Info,
  Landmark, MapPin, Phone, RefreshCw, ShieldAlert, StickyNote, UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { TerminalOrderClientLinked } from '@/hooks/useTerminalOrderClient';
import { initialsOf } from './initials';

/** What the panel needs to know about the order it sits next to. */
export interface OrderClientContext {
  tradeType: string;
  /** Order total in INR; 0 for orders in another currency. */
  orderTotal: number;
  /** False once the order is cancelled or expired — then it never counts toward the client's monthly usage. */
  orderCounts: boolean;
}

type Tone = 'success' | 'info' | 'neutral' | 'warning' | 'danger';
type AlertLevel = 'danger' | 'warning' | 'info';
interface ClientAlert { level: AlertLevel; text: string }

const CHIP = 'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 text-[10px] font-medium';
const TONE_CHIP: Record<Tone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  info: 'border-primary/30 bg-primary/10 text-primary',
  neutral: 'border-border bg-secondary/60 text-foreground',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
};
// Alert sentences stay in body ink (small coloured text on a tint is below 4.5:1 in the light theme); the icon, tint and border carry the level.
const ALERT_ROW: Record<AlertLevel, string> = {
  danger: 'border-destructive/35 bg-destructive/10',
  warning: 'border-warning/35 bg-warning/10',
  info: 'border-primary/25 bg-primary/5',
};
const ALERT_ICON: Record<AlertLevel, string> = { danger: 'text-destructive', warning: 'text-warning', info: 'text-primary' };
const SECTION_LABEL = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';
const NEW_TAB = ' (opens in a new tab)';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** ₹4.85L / ₹1.2Cr — how operators read limits at a glance. */
function inrShort(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 1 : 2).replace(/\.?0+$/, '')}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

const orders = (n: number) => `${n} ${n === 1 ? 'order' : 'orders'}`;

function dateText(value: string | null | undefined, pattern: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : format(d, pattern);
}

const isSellOrder = (ctx: OrderClientContext) => String(ctx.tradeType).toUpperCase() === 'SELL';

/** The ERP approval that matters for this order: buyer on our SELL orders, seller on our BUY orders. */
function sideApproval(data: TerminalOrderClientLinked, ctx: OrderClientContext): { label: string; tone: Tone; approved: boolean } {
  const sell = isSellOrder(ctx);
  const role = sell ? 'buyer' : 'seller';
  const s = String((sell ? data.client.buyer_status : data.client.seller_status) || '').toUpperCase();
  if (s === 'APPROVED') return { label: `Approved ${role}`, tone: 'success', approved: true };
  if (s === 'PENDING' || s === 'PENDING_APPROVAL') return { label: `${role === 'buyer' ? 'Buyer' : 'Seller'} approval pending`, tone: 'warning', approved: false };
  if (s === 'REJECTED') return { label: `Rejected as ${role}`, tone: 'danger', approved: false };
  return { label: `Not onboarded as ${role}`, tone: 'warning', approved: false };
}

function kycChip(status: string | null): { label: string; tone: Tone } {
  const s = String(status || '').toUpperCase();
  if (s === 'VERIFIED' || s === 'COMPLETED') return { label: 'KYC verified', tone: 'success' };
  if (s === 'PENDING') return { label: 'KYC pending', tone: 'warning' };
  if (s === 'REJECTED') return { label: 'KYC rejected', tone: 'danger' };
  return { label: 'KYC not recorded', tone: 'neutral' };
}

function riskChip(appetite: string | null): { label: string; tone: Tone } | null {
  const s = String(appetite || '').toUpperCase();
  if (s === 'PREMIUM') return { label: 'Premium', tone: 'success' };
  if (s === 'ESTABLISHED') return { label: 'Established', tone: 'info' };
  if (s === 'STANDARD') return { label: 'Standard risk', tone: 'neutral' };
  if (s === 'CAUTIOUS') return { label: 'Cautious', tone: 'warning' };
  if (s === 'HIGH_RISK' || s === 'HIGH') return { label: 'High risk', tone: 'danger' };
  return null;
}

/**
 * Monthly limit view for buyers (our SELL orders); null when no limit applies.
 * "Used" = completed sales posted in ERP + completed Terminal sales not posted yet (both from the server).
 * The open order is added on top only while the server has not counted it and it can still count.
 */
function limitView(data: TerminalOrderClientLinked, ctx: OrderClientContext) {
  const limit = Number(data.client.monthly_limit || 0);
  if (!isSellOrder(ctx) || limit <= 0) return null;
  const posted = Number(data.month?.buy_total || 0);
  const pending = Number(data.month?.pending_total || 0);
  const used = posted + pending;
  const thisOrder = ctx.orderCounts && !data.month?.this_order_counted ? Math.max(0, Number(ctx.orderTotal) || 0) : 0;
  const after = used + thisOrder;
  return {
    limit,
    posted,
    pending,
    used,
    thisOrder,
    left: limit - used,
    leftAfter: limit - after,
    usedPct: Math.min(100, (used / limit) * 100),
    afterPct: Math.min(100, (after / limit) * 100),
    over: after > limit,
    alreadyOver: used > limit,
  };
}

function limitAlerts(data: TerminalOrderClientLinked, ctx: OrderClientContext): ClientAlert[] {
  const lim = limitView(data, ctx);
  if (!lim) return [];
  if (lim.alreadyOver) return [{ level: 'danger', text: `Already over this month's limit by ${inr(lim.used - lim.limit)}` }];
  if (lim.over) return [{ level: 'danger', text: `This order takes the client over this month's limit by ${inr(-lim.leftAfter)}` }];
  const pct = Math.round(lim.afterPct);
  if (pct >= 80) {
    return [{ level: 'warning', text: lim.thisOrder > 0 ? `With this order: ${pct}% of this month's limit` : `${pct}% of this month's limit used` }];
  }
  return [];
}

function buildClientAlerts(data: TerminalOrderClientLinked, ctx: OrderClientContext): ClientAlert[] {
  const alerts: ClientAlert[] = [];
  const side = sideApproval(data, ctx);
  if (!side.approved) {
    alerts.push({ level: side.tone === 'danger' ? 'danger' : 'warning', text: `${side.label} in ERP` });
  }
  const kyc = String(data.client.kyc_status || '').toUpperCase();
  if (kyc === 'REJECTED') alerts.push({ level: 'danger', text: 'KYC rejected in ERP' });
  else if (kyc === 'PENDING') alerts.push({ level: 'warning', text: 'KYC pending in ERP' });
  alerts.push(...limitAlerts(data, ctx));
  const risk = String(data.client.risk_appetite || '').toUpperCase();
  if (risk === 'HIGH_RISK' || risk === 'HIGH') alerts.push({ level: 'danger', text: 'High-risk client' });
  else if (risk === 'CAUTIOUS') alerts.push({ level: 'warning', text: 'Cautious client — check payment carefully' });
  if (data.limit_request_pending) alerts.push({ level: 'info', text: 'Limit increase request pending' });
  return alerts;
}

const DOC_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN card',
  vkyc_video: 'Video KYC',
  bank_statement: 'Bank statement',
  source_of_fund: 'Source of funds',
  trade_history_screenshot: 'Trade history',
  usdt_usage_proof: 'USDT usage proof',
  other: 'Other',
};
const DOC_ORDER = Object.keys(DOC_LABELS);
const docLabel = (t: string) => DOC_LABELS[t] ?? t.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());

/** Document types on file, in a stable order. Chat attachments are not KYC documents. */
function documentTypes(d: TerminalOrderClientLinked['documents']): string[] {
  const raw = Array.isArray(d.types)
    ? d.types.map((t) => String(t).toLowerCase())
    : [d.aadhaar && 'aadhaar', d.vkyc && 'vkyc_video', d.bank_statement && 'bank_statement', d.source_of_fund && 'source_of_fund']
        .filter((t): t is string => !!t);
  const rank = (t: string) => (DOC_ORDER.includes(t) ? DOC_ORDER.indexOf(t) : DOC_ORDER.length);
  return [...new Set(raw)].filter((t) => t && t !== 'communication_attachment').sort((a, b) => rank(a) - rank(b));
}

function Chip({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return <span className={`${CHIP} ${TONE_CHIP[tone]}`}>{icon}{children}</span>;
}

function AlertRow({ alert }: { alert: ClientAlert }) {
  const Icon = alert.level === 'info' ? Info : alert.level === 'danger' ? CircleAlert : AlertTriangle;
  return (
    <li className={`flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-snug text-foreground ${ALERT_ROW[alert.level]}`}>
      <Icon className={`mt-px h-3 w-3 shrink-0 ${ALERT_ICON[alert.level]}`} aria-hidden="true" />
      <span className="min-w-0">{alert.text}</span>
    </li>
  );
}

/** Alerts are a polite live region, so stepping to an order with a new warning is announced. */
function AlertList({ alerts, className = '' }: { alerts: ClientAlert[]; className?: string }) {
  return (
    <div role="status" className={alerts.length ? className : 'sr-only'}>
      {alerts.length > 0 && <ul className="space-y-1">{alerts.map((a) => <AlertRow key={a.text} alert={a} />)}</ul>}
    </div>
  );
}

function LimitBar({ usedPct, afterPct, over, alreadyOver }: { usedPct: number; afterPct: number; over: boolean; alreadyOver: boolean }) {
  const usedTone = alreadyOver ? 'bg-destructive' : usedPct >= 80 ? 'bg-warning' : 'bg-primary';
  const orderTone = over ? 'bg-destructive/40' : afterPct >= 80 ? 'bg-warning/40' : 'bg-primary/30';
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
      <div className={`absolute inset-y-0 left-0 ${orderTone}`} style={{ width: `${afterPct}%` }} />
      <div className={`absolute inset-y-0 left-0 ${usedTone}`} style={{ width: `${usedPct}%` }} />
    </div>
  );
}

function ErpLink({ clientId, className = '' }: { clientId: string; className?: string }) {
  return (
    <a
      href={`/clients/${clientId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={`Open the full client profile in ERP${NEW_TAB}`}
      aria-label={`Open client in ERP${NEW_TAB}`}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

/**
 * Compact client card pinned at the top of the order's right panel — visible
 * whichever tab is open. Shown only for counterparties that are ERP clients.
 */
export function OrderClientCard({ data, ctx, className = '' }: { data: TerminalOrderClientLinked; ctx: OrderClientContext; className?: string }) {
  const c = data.client;
  const side = sideApproval(data, ctx);
  const kyc = kycChip(c.kyc_status);
  const risk = riskChip(c.risk_appetite);
  const lim = limitView(data, ctx);
  const alerts = limitAlerts(data, ctx);
  const since = dateText(c.since, 'MMM yyyy');
  const initials = initialsOf(c.name);
  return (
    <section aria-label="ERP client" className={`shrink-0 border-b border-border bg-card px-3 py-2.5 ${className}`}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-success/25 bg-success/10">
          {initials ? <span className="text-[11px] font-semibold text-success">{initials}</span> : <UserCheck className="h-3.5 w-3.5 text-success" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">ERP client</p>
          <p className="truncate text-[13px] font-medium leading-tight text-foreground" title={c.name}>{c.name}</p>
          <p className="truncate t-mono text-[10px] text-muted-foreground">
            {[c.code, since ? `since ${since}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        {c.can_open_profile !== false && (
          <ErpLink
            clientId={c.id}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Chip tone={side.tone} icon={side.approved ? <BadgeCheck className="h-3 w-3" aria-hidden="true" /> : undefined}>{side.label}</Chip>
        <Chip tone={kyc.tone}>{kyc.label}</Chip>
        {risk && <Chip tone={risk.tone}>{risk.label}</Chip>}
      </div>
      {lim && (
        <div className="mt-2 space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
            <span>This month</span>
            <span className="t-mono tabular-nums text-foreground">
              {inrShort(lim.used)} <span className="text-muted-foreground">of {inrShort(lim.limit)}</span>
            </span>
          </div>
          <LimitBar usedPct={lim.usedPct} afterPct={lim.afterPct} over={lim.over} alreadyOver={lim.alreadyOver} />
        </div>
      )}
      <AlertList alerts={alerts} className="mt-2" />
      {c.compliance_note && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground" title={`Onboarding note (ERP): ${c.compliance_note}`}>
          <StickyNote className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">Onboarding note: </span>
          <span className="line-clamp-2 min-w-0 break-words text-foreground/90">{c.compliance_note}</span>
        </p>
      )}
    </section>
  );
}

/** Slim retry strip when the client lookup itself failed (never shown for non-clients or people without client access). */
export function OrderClientLookupError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5"><ShieldAlert className="h-3 w-3 text-warning" aria-hidden="true" /> ERP client check unavailable</span>
      <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" /> Retry
      </Button>
    </div>
  );
}

/** Placeholder for the Client tab while the next order's client is being looked up. */
export function OrderClientDetailsSkeleton() {
  return (
    <div className="flex-1 space-y-3 overflow-hidden p-4" aria-busy="true">
      <span className="sr-only">Loading ERP client</span>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-28" />
      <div className="flex gap-1"><Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-5 w-20 rounded-full" /></div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[11px] text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-xs text-foreground ${mono ? 't-mono tabular-nums' : ''}`}>{children}</dd>
    </div>
  );
}

/** Full client view for the "Client" tab. */
export function OrderClientDetails({ data, ctx }: { data: TerminalOrderClientLinked; ctx: OrderClientContext }) {
  const c = data.client;
  const sell = isSellOrder(ctx);
  const side = sideApproval(data, ctx);
  const kyc = kycChip(c.kyc_status);
  const risk = riskChip(c.risk_appetite);
  const lim = limitView(data, ctx);
  const alerts = buildClientAlerts(data, ctx);
  const since = dateText(c.since, 'dd MMM yyyy');
  const h = data.history;
  const banks = (data.banks || []).filter((b) => b.bank || b.last4);
  const docs = documentTypes(data.documents);
  const pendingCount = Number(data.month?.pending_count || 0);
  const knowsPending = data.month?.pending_total !== undefined;
  return (
    <div className="flex-1 overflow-y-auto">
      <section className="space-y-3 border-b border-border p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{c.name}</p>
          <p className="t-mono text-[11px] text-muted-foreground">
            {[c.code, since ? `client since ${since}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip tone={side.tone} icon={side.approved ? <BadgeCheck className="h-3 w-3" aria-hidden="true" /> : undefined}>{side.label}</Chip>
          <Chip tone={kyc.tone}>{kyc.label}</Chip>
          {risk && <Chip tone={risk.tone}>{risk.label}</Chip>}
        </div>
        <AlertList alerts={alerts} />
        {c.can_open_profile !== false && (
          <a
            href={`/clients/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open full profile in ERP
            <span className="sr-only">{NEW_TAB}</span>
          </a>
        )}
      </section>

      {sell && (
        <section className="space-y-2 border-b border-border p-4">
          <div className={SECTION_LABEL}>Monthly limit</div>
          {lim ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="t-mono text-sm font-semibold tabular-nums text-foreground">{inr(lim.used)}</span>
                <span className="t-mono text-[11px] tabular-nums text-muted-foreground">of {inr(lim.limit)}</span>
              </div>
              <LimitBar usedPct={lim.usedPct} afterPct={lim.afterPct} over={lim.over} alreadyOver={lim.alreadyOver} />
              <dl className="divide-y divide-border/60">
                <Row label="Posted in ERP" mono>{inr(lim.posted)} · {orders(data.month.buy_count)}</Row>
                {(pendingCount > 0 || lim.pending > 0) && (
                  <Row label="Not yet in ERP" mono>{inr(lim.pending)} · {orders(pendingCount)}</Row>
                )}
                <Row label="Left" mono>{lim.left >= 0 ? inr(lim.left) : `over by ${inr(-lim.left)}`}</Row>
                {lim.thisOrder > 0 && (
                  <Row label="With this order" mono>
                    <span className={lim.leftAfter < 0 ? 'text-destructive' : ''}>
                      {lim.leftAfter >= 0 ? `${inr(lim.leftAfter)} left` : `over by ${inr(-lim.leftAfter)}`}
                    </span>
                  </Row>
                )}
              </dl>
              <p className="text-[10px] text-muted-foreground">
                {knowsPending
                  ? 'Completed sales this calendar month (IST): posted in ERP, plus Terminal sales not posted yet.'
                  : 'Completed ERP sales orders this calendar month (IST).'}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">No monthly limit set in ERP.</p>
          )}
        </section>
      )}

      <section className="space-y-2 border-b border-border p-4">
        <div className={SECTION_LABEL}>Bank accounts on file</div>
        {banks.length > 0 ? (
          <>
            <ul className="divide-y divide-border/60 rounded-md border border-border">
              {banks.map((b, i) => (
                <li key={`${b.bank}-${b.last4}-${i}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                    <Landmark className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{b.bank || 'Bank'}</span>
                  </span>
                  <span className="t-mono text-xs tabular-nums text-foreground">{b.last4 ? `•• ${b.last4}` : '—'}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground">
              {sell ? "Check the payer's account against these." : 'Check the payee account against these.'}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">No bank account on file in ERP.</p>
        )}
      </section>

      <section className="space-y-2 border-b border-border p-4">
        <div className={SECTION_LABEL}>KYC &amp; documents</div>
        {docs.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {docs.map((t) => (
              <Chip key={t} tone="success" icon={<FileCheck2 className="h-3 w-3" aria-hidden="true" />}>{docLabel(t)}</Chip>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No KYC documents on file in ERP.</p>
        )}
        <dl className="divide-y divide-border/60">
          {c.pan_masked && <Row label="PAN" mono>{c.pan_masked}</Row>}
          <Row label="Documents on file" mono>{data.documents.count}</Row>
          {c.purpose && <Row label="Purpose">{c.purpose}</Row>}
        </dl>
        {c.compliance_note && (
          <div className="rounded-md border border-border bg-secondary/30 px-2.5 py-2">
            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" aria-hidden="true" /> Onboarding note
            </p>
            <p className="whitespace-pre-wrap break-words text-xs text-foreground">{c.compliance_note}</p>
          </div>
        )}
      </section>

      {data.notes.length > 0 && (
        <section className="space-y-2 border-b border-border p-4">
          <div className={SECTION_LABEL}>Operator notes</div>
          <ul className="space-y-2">
            {data.notes.map((n, i) => (
              <li key={`${n.at}-${i}`} className="rounded-md border border-border bg-secondary/30 px-2.5 py-2">
                <p className="whitespace-pre-wrap break-words text-xs text-foreground">{n.note}</p>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <StickyNote className="h-3 w-3" aria-hidden="true" />
                  {[n.by, dateText(n.at, 'dd MMM yyyy, HH:mm')].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 border-b border-border p-4">
        <div className={SECTION_LABEL}>With us (ERP records)</div>
        <dl className="divide-y divide-border/60">
          <Row label="Bought from us" mono>{orders(h.buy_count)} · {inr(h.buy_total)}</Row>
          {h.last_buy && <Row label="Last bought" mono>{dateText(h.last_buy, 'dd MMM yyyy')}</Row>}
          <Row label="Sold to us" mono>{orders(h.sell_count)} · {inr(h.sell_total)}</Row>
          {h.last_sell && <Row label="Last sold" mono>{dateText(h.last_sell, 'dd MMM yyyy')}</Row>}
        </dl>
        <p className="text-[10px] text-muted-foreground">“Sold to us” counts purchases made through the Terminal.</p>
      </section>

      <section className="space-y-2 p-4">
        <div className={SECTION_LABEL}>Contact</div>
        <dl className="divide-y divide-border/60">
          <Row label="State">
            <span className="inline-flex items-center gap-1">{c.state ? <><MapPin className="h-3 w-3 text-muted-foreground" aria-hidden="true" />{c.state}</> : '—'}</span>
          </Row>
          <Row label="Phone" mono>
            <span className="inline-flex items-center gap-1">{c.phone_masked ? <><Phone className="h-3 w-3 text-muted-foreground" aria-hidden="true" />{c.phone_masked}</> : '—'}</span>
          </Row>
          <Row label="Assigned operator">{c.assigned_operator || '—'}</Row>
        </dl>
        <p className="text-[10px] text-muted-foreground">
          {c.can_open_profile === false ? 'Phone and PAN are masked here.' : 'Phone and PAN are masked here; the full profile is in ERP.'}
        </p>
      </section>
    </div>
  );
}
