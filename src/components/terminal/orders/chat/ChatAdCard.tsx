import { Badge } from '@/components/ui/badge';
import { PaymentMethodBadge } from '@/components/ad-manager/PaymentMethodBadge';

export interface ParsedAdCard {
  advNo?: string;
  asset?: string;
  fiat?: string;
  fiatSymbol?: string;
  price?: number | string;
  tradeType?: string;
  nick?: string;
  tradableQuantity?: number | string;
  minSglTrAmt?: number | string;
  dynMaxSglTrAmt?: number | string;
  maxSglTrAmt?: number | string;
  tradeMethods?: Array<{ sn?: string; identifier?: string; payType?: string; tradeMethodName?: string }>;
}

/** Detect and parse a Binance "share ad card" chat payload (origin ADV_SHARE_ONLINEADCARD). */
export function parseAdCard(text: string | null | undefined): ParsedAdCard | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const p = JSON.parse(trimmed);
    const isAd = String(p.origin || '').toUpperCase().includes('ADCARD') || (p.advNo && p.price && p.asset);
    if (!isAd) return null;
    return p as ParsedAdCard;
  } catch {
    return null;
  }
}

const num = (v: unknown) =>
  v === null || v === undefined || v === '' ? null : Number(v);

const fmt = (v: unknown, digits = 2) => {
  const n = num(v);
  return n === null || Number.isNaN(n) ? null : n.toLocaleString('en-IN', { maximumFractionDigits: digits });
};

/** Rich, readable rendering of a shared Binance ad — no invented fields. */
export function ChatAdCard({ ad }: { ad: ParsedAdCard }) {
  const symbol = ad.fiatSymbol || '';
  const min = fmt(ad.minSglTrAmt, 0);
  const max = fmt(ad.dynMaxSglTrAmt ?? ad.maxSglTrAmt, 0);
  const side = String(ad.tradeType || '').toUpperCase();

  return (
    <div className="w-full max-w-[320px] rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground truncate">{ad.nick || 'Advertiser'}</span>
        {side && (
          <span className={`text-[10px] font-bold uppercase ${side === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
            {side}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[10px] text-muted-foreground">Price</span>
        <span className="text-lg t-mono font-semibold tabular-nums text-foreground">
          {symbol}{fmt(ad.price, 4) ?? String(ad.price ?? '—')}
        </span>
        {ad.asset && <span className="text-[10px] text-muted-foreground">/ {ad.asset}</span>}
      </div>

      <div className="mt-1.5 space-y-0.5 text-[11px] t-mono tabular-nums text-muted-foreground">
        {min && max && <div>Limit {symbol}{min} – {symbol}{max} {ad.fiat || ''}</div>}
        {fmt(ad.tradableQuantity, 2) && <div>Available {fmt(ad.tradableQuantity, 2)} {ad.asset || ''}</div>}
      </div>

      {(ad.tradeMethods || []).length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {(ad.tradeMethods || []).slice(0, 5).map((m, i) => (
            <PaymentMethodBadge
              key={`${ad.advNo}-${i}`}
              identifier={m.identifier || m.sn || m.tradeMethodName || m.payType || ''}
              payType={m.payType || m.identifier || m.sn || ''}
            />
          ))}
        </div>
      )}

      {ad.advNo && (
        <Badge variant="outline" className="mt-2 text-[9px] t-mono">Ad {ad.advNo}</Badge>
      )}
    </div>
  );
}
