import { RestTimerBanner } from './RestTimerBanner';
import { MerchantStateCard } from './MerchantStateCard';
import { BinanceAd } from '@/hooks/useBinanceAds';
import { safeFormat } from '@/lib/safe-date';
import { RefreshCw } from 'lucide-react';

interface AdCommandStripProps {
  onlineAds: BinanceAd[];
  activeAds: BinanceAd[];
  /** When the ad list was last fetched (display only). */
  syncedAt?: number;
  isSyncing?: boolean;
}

/**
 * Slim horizontal command strip merging the rest-timer controls and the
 * merchant-state badge cluster into a single row under the page header.
 * Both children keep their exact conditional logic and actions verbatim —
 * this only composes them compactly so the ads table sits higher.
 */
export function AdCommandStrip({ onlineAds, activeAds, syncedAt, isSyncing }: AdCommandStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MerchantStateCard />
      <RestTimerBanner onlineAds={onlineAds} activeAds={activeAds} />
      {!!syncedAt && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Last time the ad list was read from Binance">
          <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing…' : <>Synced <span className="t-mono tabular-nums">{safeFormat(syncedAt, 'HH:mm:ss')}</span></>}
        </span>
      )}
    </div>
  );
}
