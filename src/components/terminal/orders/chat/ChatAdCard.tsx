import { Badge } from '@/components/ui/badge';
import { PaymentMethodBadge } from '@/components/ad-manager/PaymentMethodBadge';
import { ExternalLink } from 'lucide-react';

export interface ParsedAdCard {
  advNo?: string;
  asset?: string;
  fiat?: string;
  fiatSymbol?: string;
  price?: number | string;
  tradeType?: string;
  nick?: string;
  userNo?: string;
  tradableQuantity?: number | string;
  minSglTrAmt?: number | string;
  dynMaxSglTrAmt?: number | string;
  maxSglTrAmt?: number | string;
  tradeMethods?: Array<{ sn?: string; identifier?: string; payType?: string; tradeMethodName?: string }>;
}

/**
 * Detect and parse a Binance "share ad card" chat payload (origin ADV_SHARE_ONLINEADCARD).
 * Only the meaningful fields are kept; scales, colours, badges, VIP level and
 * voucher/template fields in the raw payload are ignored.
 */
export function parseAdCard(text: string | null | undefined): ParsedAdCard | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const p = JSON.parse(trimmed) as Record<string, unknown>;
    const origin = String(p.origin || '').toUpperCase();
    const isAd = origin.includes('ADCARD') || origin.includes('ADV_SHARE') || (!!p.advNo && !!p.price && !!p.asset);
    if (!isAd) return null;
    return {
      advNo: p.advNo as string,
      asset: p.asset as string,
      fiat: p.fiat as string,
      fiatSymbol: p.fiatSymbol as string,
      price: p.price as string,
      tradeType: p.tradeType as string,
      nick: p.nick as string,
      userNo: p.userNo as string,
      tradableQuantity: p.tradableQuantity as string,
      minSglTrAmt: p.minSglTrAmt as string,
      dynMaxSglTrAmt: p.dynMaxSglTrAmt as string,
      maxSglTrAmt: p.maxSglTrAmt as string,
      tradeMethods: (p.tradeMethods as ParsedAdCard['tradeMethods']) || [],
    };
  } catch {
    return null;
  }
}

/** True when the text is a Binance card payload we should never print raw. */
export function isCardPayload(text: string | null | undefined): boolean {
  return parseAdCard(text) !== null;
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

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
  const qty = fmt(ad.tradableQuantity, 2);
  const link = ad.userNo ? `https://p2p.binance.com/en/advertiserDetail?advertiserNo=${ad.userNo}` : null;

  return (
    <div className="w-[280px] max-w-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
        <span className="text-xs font-medium text-foreground truncate">{ad.nick || 'Advertiser'}</span>
        {side && (
          <span className={`text-[10px] font-bold uppercase ${side === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
            {side} {ad.asset || ''}
          </span>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl t-mono font-semibold tabular-nums text-foreground leading-none">
            {symbol}{fmt(ad.price, 4) ?? String(ad.price ?? '—')}
          </span>
          <span className="text-[10px] text-muted-foreground">per {ad.asset || 'unit'}</span>
        </div>

        <div className="space-y-1 text-[11px]">
          {qty && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Available</span>
              <span className="t-mono tabular-nums text-foreground">{qty} {ad.asset || ''}</span>
            </div>
          )}
          {min && max && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Limits</span>
              <span className="t-mono tabular-nums text-foreground">{symbol}{min} – {symbol}{max}</span>
            </div>
          )}
        </div>

        {(ad.tradeMethods || []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {(ad.tradeMethods || []).slice(0, 5).map((m, i) => (
              <PaymentMethodBadge
                key={`${ad.advNo}-${i}`}
                identifier={m.identifier || m.sn || m.tradeMethodName || m.payType || ''}
                payType={m.payType || m.identifier || m.sn || ''}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          {ad.advNo ? (
            <Badge variant="outline" className="text-[9px] t-mono font-normal">Ad {ad.advNo}</Badge>
          ) : <span />}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-primary hover:underline shrink-0"
            >
              View on Binance <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
