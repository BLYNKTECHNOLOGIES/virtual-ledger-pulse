import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Megaphone, Loader2, Send } from 'lucide-react';
import { useBinanceAdsList, BINANCE_AD_STATUS, type BinanceAd } from '@/hooks/useBinanceAds';
import { PaymentMethodBadge } from '@/components/ad-manager/PaymentMethodBadge';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';


interface Props {
  /** Binance account owning the current order — only its ads are offered. */
  exchangeAccountId?: string | null;
  /** Insert the composed text into the chat input for review before sending. */
  onInsert: (text: string) => void;
}

/**
 * Format one live ad as a plain-text chat message using ONLY real Binance values.
 * When the account's public advertiser number is configured, a real Binance
 * advertiser link is appended so the counterparty can tap through to the live ad.
 */
export function formatAdMessage(ad: BinanceAd, advertiserNo?: string | null): string {
  const lines: string[] = [];
  lines.push(`${ad.tradeType === 'BUY' ? 'We are buying' : 'We are selling'} ${ad.asset} @ ${ad.price} ${ad.fiatUnit}`);
  lines.push(`Available: ${ad.surplusAmount} ${ad.asset}`);
  lines.push(`Limits: ${ad.minSingleTransAmount} - ${ad.maxSingleTransAmount} ${ad.fiatUnit}`);
  const methods = (ad.tradeMethods || [])
    .map((m) => m.tradeMethodName || m.identifier || m.payType)
    .filter(Boolean);
  if (methods.length) lines.push(`Payment: ${methods.join(', ')}`);
  lines.push(`Ad No: ${ad.advNo}`);
  if (advertiserNo) {
    lines.push(`Open on Binance: https://p2p.binance.com/en/advertiserDetail?advertiserNo=${advertiserNo}`);
  }
  return lines.join('\n');
}


export function AttachAdPicker({ exchangeAccountId, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { accounts } = useExchangeAccount();

  const advertiserNo = useMemo(
    () => accounts.find((a) => a.id === exchangeAccountId)?.p2p_advertiser_no ?? null,
    [accounts, exchangeAccountId],
  );

  const { data, isLoading } = useBinanceAdsList(
    { advStatus: BINANCE_AD_STATUS.ONLINE, fetchAll: true },
    { refetchInterval: false },
  );

  const ads: BinanceAd[] = useMemo(() => {
    const list: BinanceAd[] = (data?.data || []) as BinanceAd[];
    const scoped = exchangeAccountId
      ? list.filter((a) => !a._exchangeAccountId || a._exchangeAccountId === exchangeAccountId)
      : list;
    const q = search.trim().toLowerCase();
    const filtered = q
      ? scoped.filter((a) =>
          [a.asset, a.fiatUnit, a.tradeType, a.advNo, String(a.price)]
            .join(' ').toLowerCase().includes(q))
      : scoped;
    return filtered;
  }, [data, exchangeAccountId, search]);

  const pick = (ad: BinanceAd) => {
    onInsert(formatAdMessage(ad, advertiserNo));
    setOpen(false);
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          title="Attach a live ad"
        >
          <Megaphone className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Share a live ad</DialogTitle>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search asset, price or ad number..."
          className="h-8 text-xs"
        />

        <ScrollArea className="h-[360px] pr-2">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {!isLoading && ads.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-10">
              No active ads returned by Binance for this account.
            </p>
          )}
          <div className="space-y-2">
            {ads.map((ad) => (
              <button
                key={ad.advNo}
                onClick={() => pick(ad)}
                className="w-full text-left rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase ${ad.tradeType === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
                      {ad.tradeType}
                    </span>
                    <span className="text-xs font-medium text-foreground">{ad.asset}</span>
                    <Badge variant="outline" className="text-[9px]">{ad.fiatUnit}</Badge>
                  </div>
                  <span className="text-xs t-mono tabular-nums text-foreground">{ad.price}</span>
                </div>
                <div className="mt-1 text-[10px] t-mono text-muted-foreground tabular-nums">
                  Available {String(ad.surplusAmount)} {ad.asset} · Limits {String(ad.minSingleTransAmount)}–{String(ad.maxSingleTransAmount)} {ad.fiatUnit}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {(ad.tradeMethods || []).slice(0, 4).map((m) => (
                    <PaymentMethodBadge key={`${ad.advNo}-${m.payId}-${m.identifier}`} identifier={m.identifier} payType={m.payType} />
                  ))}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-primary">
                  <Send className="h-2.5 w-2.5" /> Insert into chat
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
