import { useMemo } from 'react';
import { BinanceAd, BINANCE_AD_STATUS, getAdHiddenReason } from '@/hooks/useBinanceAds';

interface AdSummaryStripProps {
  ads: BinanceAd[];
}

/**
 * Compact, client-side stat chips derived entirely from the fetched ads
 * already in memory — no extra queries. Shows status counts, total ads,
 * and how many "Active" ads Binance is actually hiding from the book.
 */
export function AdSummaryStrip({ ads }: AdSummaryStripProps) {
  const stats = useMemo(() => {
    let online = 0, priv = 0, offline = 0, hidden = 0;
    for (const ad of ads) {
      if (ad.advStatus === BINANCE_AD_STATUS.ONLINE) online++;
      else if (ad.advStatus === BINANCE_AD_STATUS.PRIVATE) priv++;
      else if (ad.advStatus === BINANCE_AD_STATUS.OFFLINE) offline++;
      if (getAdHiddenReason(ad)) hidden++;
    }
    return { online, priv, offline, hidden, total: ads.length };
  }, [ads]);

  if (!ads.length) return null;

  const chip = (label: string, value: string, tone?: string) => (
    <div key={label} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone || 'text-foreground'}`}>{value}</span>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip('Total', String(stats.total))}
      {chip('Online', String(stats.online), 'text-success')}
      {chip('Private', String(stats.priv), 'text-warning')}
      {chip('Offline', String(stats.offline), 'text-muted-foreground')}
      {stats.hidden > 0 && chip('Not visible', String(stats.hidden), 'text-destructive')}
    </div>
  );
}

