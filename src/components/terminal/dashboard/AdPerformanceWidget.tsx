import { memo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, ArrowUpCircle, ArrowDownCircle, Power, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBinanceAdsList, BinanceAd, BINANCE_AD_STATUS, getAdHiddenReason } from '@/hooks/useBinanceAds';
import { formatPrice } from './dashFormat';
import { useFocusAfterRetry, useRetryHold } from './dashHooks';

const availableAmount = (ad: BinanceAd) => {
  const amount = Number(ad.surplusAmount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

function AdPerformanceWidgetPanel() {
  const { data: allAdsData, isLoading, isError, refetch, isFetching } = useBinanceAdsList({ page: 1, rows: 50, fetchAll: true });
  const ads: BinanceAd[] = allAdsData?.data || [];

  const buyAds = ads.filter(a => a.tradeType === 'BUY');
  const sellAds = ads.filter(a => a.tradeType === 'SELL');
  // The list status alone cannot prove public visibility. Binance detail supplies
  // the visibility flags; an unsuccessful detail lookup must not credit an ad.
  const onlineAds = ads.filter(a =>
    a.advStatus === BINANCE_AD_STATUS.ONLINE &&
    a.advVisibleRet != null &&
    Number(a.advVisibleRet.userSetVisible) !== 1 &&
    !getAdHiddenReason(a),
  );
  const topAds = [...onlineAds]
    .filter(a => availableAmount(a) > 0)
    .sort((a, b) => availableAmount(b) - availableAmount(a))
    .slice(0, 3);
  const visibilityUnknown = ads.filter(a => a.advStatus === BINANCE_AD_STATUS.ONLINE && a.advVisibleRet == null).length;

  const stats = [
    { label: 'Total ads', value: ads.length, icon: Megaphone, color: 'text-primary' },
    { label: 'Buy ads', value: buyAds.length, icon: ArrowDownCircle, color: 'text-trade-buy' },
    { label: 'Sell ads', value: sellAds.length, icon: ArrowUpCircle, color: 'text-trade-sell' },
    { label: 'Online', value: onlineAds.length, icon: Power, color: 'text-trade-buy' },
  ];

  // Keep the message and its button while a retry runs (focus stays on the button).
  const [retrying, holdRetry] = useRetryHold(isFetching);
  const titleRef = useRef<HTMLSpanElement>(null);
  useFocusAfterRetry(retrying, isError, titleRef);
  const retryButton = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs aria-disabled:opacity-60"
      aria-disabled={isFetching || undefined}
      onClick={() => {
        if (isFetching) return;
        holdRetry();
        refetch();
      }}
    >
      <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} aria-hidden="true" />
      {retrying ? 'Retrying…' : 'Retry'}
    </Button>
  );

  return (
    <div className="t-panel flex h-full flex-col">
      <div className="t-panel-head">
        <Megaphone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span ref={titleRef} tabIndex={-1} className="t-panel-head-title focus:outline-none">Ad performance</span>
        <Link
          to="/terminal/ads"
          className="ml-auto inline-flex items-center gap-1 rounded py-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ads Manager
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <div className="@container flex-1 p-3">
        {isLoading && !retrying ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 @[26rem]:grid-cols-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="t-shimmer h-14 w-full rounded-md" />)}
            </div>
            {[1, 2, 3].map(i => <div key={i} className="t-shimmer h-10 w-full rounded-md" />)}
          </div>
        ) : (isError || retrying) && !allAdsData ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5" role="alert">
            <div className="text-xs text-destructive">{retrying ? 'Loading Binance ads again…' : 'Binance ads could not be loaded.'}</div>
            {retryButton}
          </div>
        ) : (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 @[26rem]:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="min-w-0 rounded-md border border-border px-3 py-2">
                  <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <s.icon className={cn('h-3.5 w-3.5 shrink-0', s.color)} aria-hidden="true" />
                    <span className="truncate">{s.label}</span>
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold leading-7 text-foreground t-mono">{s.value}</dd>
                </div>
              ))}
            </dl>

            {(isError || retrying) && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-destructive" role="alert">
                <span>Couldn't refresh from Binance — showing the last loaded ads.</span>
                {retryButton}
              </div>
            )}
            {visibilityUnknown > 0 && (
              <div className="text-[11px] text-muted-foreground">Visibility unavailable for {visibilityUnknown} {visibilityUnknown === 1 ? 'ad' : 'ads'}; excluded from Online.</div>
            )}
            {ads.length === 0 && <div className="text-[11px] text-muted-foreground">No ads returned by Binance.</div>}
            {topAds.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top active ads · available quantity</div>
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {topAds.map((ad) => (
                    <li key={`${ad._exchangeAccountId || ''}-${ad.advNo}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs">
                      <div className="flex min-w-0 items-start gap-2">
                        <span
                          className={cn(
                            'mt-px inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold',
                            ad.tradeType === 'BUY' ? 'bg-trade-buy/10 text-trade-buy' : 'bg-trade-sell/10 text-trade-sell',
                          )}
                        >
                          {ad.tradeType}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{ad.asset}</div>
                          <div className="break-all text-[10px] text-muted-foreground t-mono">#{ad.advNo}</div>
                        </div>
                      </div>
                      <div className="ml-auto text-right t-mono">
                        <div className="whitespace-nowrap text-foreground">{availableAmount(ad).toLocaleString('en-IN', { maximumFractionDigits: 8 })} {ad.asset}</div>
                        <div className="whitespace-nowrap text-[10px] text-muted-foreground">{formatPrice(Number(ad.price))}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Memoised: the page re-renders on every live-orders poll; this panel only when its own props change.
export const AdPerformanceWidget = memo(AdPerformanceWidgetPanel);
