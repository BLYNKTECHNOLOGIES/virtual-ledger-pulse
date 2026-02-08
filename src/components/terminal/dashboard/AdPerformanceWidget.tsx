import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Megaphone, ArrowUpCircle, ArrowDownCircle, Circle, Power } from 'lucide-react';
import { useBinanceAdsList, BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';

export function AdPerformanceWidget() {
  const { data: allAdsData, isLoading } = useBinanceAdsList({ page: 1, rows: 50 });
  const ads: BinanceAd[] = allAdsData?.data || allAdsData?.list || [];

  const buyAds = ads.filter(a => a.tradeType === 'BUY');
  const sellAds = ads.filter(a => a.tradeType === 'SELL');
  const onlineAds = ads.filter(a => a.advStatus === BINANCE_AD_STATUS.ONLINE);
  const offlineAds = ads.filter(a => a.advStatus === BINANCE_AD_STATUS.OFFLINE);

  const stats = [
    { label: 'Total Ads', value: ads.length, icon: Megaphone, color: 'text-primary' },
    { label: 'Buy Ads', value: buyAds.length, icon: ArrowDownCircle, color: 'text-trade-buy' },
    { label: 'Sell Ads', value: sellAds.length, icon: ArrowUpCircle, color: 'text-trade-sell' },
    { label: 'Online', value: onlineAds.length, icon: Power, color: 'text-trade-buy' },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          Ad Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center justify-between py-2 px-3 rounded-md bg-secondary/50">
                <div className="flex items-center gap-2.5">
                  <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums">{s.value}</span>
              </div>
            ))}

            {/* Top ads by surplus */}
            {onlineAds.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Top Active Ads</p>
                <div className="space-y-1.5">
                  {onlineAds.slice(0, 3).map((ad) => (
                    <div key={ad.advNo} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-secondary/30">
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${ad.tradeType === 'BUY' ? 'bg-trade-buy' : 'bg-trade-sell'}`} />
                        <span className="text-muted-foreground">{ad.tradeType}</span>
                        <span className="text-foreground font-medium">{ad.asset}</span>
                      </div>
                      <span className="text-foreground tabular-nums">₹{Number(ad.price).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
