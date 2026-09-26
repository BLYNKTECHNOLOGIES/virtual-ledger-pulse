import { Megaphone, ArrowUpCircle, ArrowDownCircle, Power } from 'lucide-react';
import { useBinanceAdsList, BinanceAd, BINANCE_AD_STATUS, getAdHiddenReason } from '@/hooks/useBinanceAds';

const availableAmount = (ad: BinanceAd) => {
  const amount = Number(ad.surplusAmount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export function AdPerformanceWidget() {
  const { data: allAdsData, isLoading, isError } = useBinanceAdsList({ page: 1, rows: 50, fetchAll: true });
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
    { label: 'Total Ads', value: ads.length, icon: Megaphone, color: 'text-primary' },
    { label: 'Buy Ads', value: buyAds.length, icon: ArrowDownCircle, color: 'text-trade-buy' },
    { label: 'Sell Ads', value: sellAds.length, icon: ArrowUpCircle, color: 'text-trade-sell' },
    { label: 'Online', value: onlineAds.length, icon: Power, color: 'text-trade-buy' },
  ];

  return (
    <div className="t-panel flex flex-col">
      <div className="t-panel-head">
        <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="t-panel-head-title">Ad Performance</span>
      </div>
      <div className="p-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="t-shimmer h-10 w-full rounded-md" />)}
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive">Binance ads could not be loaded.</p>
        ) : (
          <div className="space-y-2">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center justify-between py-2 px-3 rounded-md bg-secondary/50">
                <div className="flex items-center gap-2.5">
                  <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <span className="text-sm font-semibold text-foreground t-mono">{s.value}</span>
              </div>
            ))}

            {visibilityUnknown > 0 && (
              <p className="text-xs text-muted-foreground">Visibility unavailable for {visibilityUnknown} {visibilityUnknown === 1 ? 'ad' : 'ads'}; excluded from Online.</p>
            )}
            {topAds.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Top Active Ads · Available Quantity</p>
                <div className="space-y-1.5">
                  {topAds.map((ad) => (
                    <div key={`${ad._exchangeAccountId || ''}-${ad.advNo}`} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 text-xs py-2 px-2 rounded bg-secondary/30 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${ad.tradeType === 'BUY' ? 'bg-trade-buy' : 'bg-trade-sell'}`} />
                          <span className="text-muted-foreground">{ad.tradeType}</span>
                          <span className="text-foreground font-medium">{ad.asset}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground t-mono break-all">#{ad.advNo}</div>
                      </div>
                      <div className="text-right min-w-0 break-all ml-auto t-mono">
                        <div className="text-foreground">{availableAmount(ad).toLocaleString('en-IN', { maximumFractionDigits: 8 })} {ad.asset}</div>
                        <div className="text-[10px] text-muted-foreground">₹{Number(ad.price).toLocaleString('en-IN')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
