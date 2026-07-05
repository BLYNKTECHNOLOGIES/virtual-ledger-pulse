import { RestTimerBanner } from './RestTimerBanner';
import { MerchantStateCard } from './MerchantStateCard';
import { BinanceAd } from '@/hooks/useBinanceAds';

interface AdCommandStripProps {
  onlineAds: BinanceAd[];
  activeAds: BinanceAd[];
}

/**
 * Slim horizontal command strip merging the rest-timer controls and the
 * merchant-state badge cluster into a single row under the page header.
 * Both children keep their exact conditional logic and actions verbatim —
 * this only composes them compactly so the ads table sits higher.
 */
export function AdCommandStrip({ onlineAds, activeAds }: AdCommandStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RestTimerBanner onlineAds={onlineAds} activeAds={activeAds} />
      <MerchantStateCard />
    </div>
  );
}
