import { useMemo } from 'react';
import { BinanceAd, BINANCE_AD_STATUS, getAdHiddenReason } from '@/hooks/useBinanceAds';
import { StatusDot } from './adUi';

interface AdSummaryStripProps {
  ads: BinanceAd[];
}

/**
 * Compact, client-side counts derived entirely from the fetched ads already in
 * memory — no extra queries. Shows status counts, total ads, and how many
 * "Active" ads Binance is actually hiding from the book. Sits under the title.
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

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
      <span className="hidden xl:inline">Binance P2P merchant ads</span>
      {ads.length > 0 && (
        <>
          <span aria-hidden="true" className="hidden text-muted-foreground/50 xl:inline">·</span>
          <span className="tabular-nums"><span className="text-foreground">{stats.total}</span> ads</span>
          <span className="inline-flex items-center gap-1 tabular-nums" title="Active ads">
            <StatusDot status={BINANCE_AD_STATUS.ONLINE} /><span className="text-foreground">{stats.online}</span> active
          </span>
          {stats.priv > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title="Private ads (only visible by direct link)">
              <StatusDot status={BINANCE_AD_STATUS.PRIVATE} /><span className="text-foreground">{stats.priv}</span> private
            </span>
          )}
          <span className="inline-flex items-center gap-1 tabular-nums" title="Inactive ads">
            <StatusDot status={BINANCE_AD_STATUS.OFFLINE} /><span className="text-foreground">{stats.offline}</span> inactive
          </span>
          {stats.hidden > 0 && (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 text-[10px] font-semibold text-destructive"
              title="Active ads that Binance is hiding from the order book"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden="true" />
              {stats.hidden} not visible
            </span>
          )}
        </>
      )}
    </div>
  );
}
