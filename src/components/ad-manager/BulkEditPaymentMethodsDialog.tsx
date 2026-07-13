import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle, Loader2, X, Plus } from 'lucide-react';
import { BinanceAd, useUpdateAd, useBinanceAdsList } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ALLOWED_BUY_PAYMENT_METHODS, resolvePaymentMethod } from '@/data/paymentMethods';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ads: BinanceAd[];
  onComplete: () => void;
}

type ResultStatus = 'pending' | 'success' | 'error';
interface AdResult { advNo: string; status: ResultStatus; message?: string }

// A payment method the operator can pick. For SELL ads payId is required and is
// resolved per-ad at apply time (payId is account/ad specific on Binance).
interface PickMethod { payId?: number; payType: string; identifier: string; tradeMethodName?: string }

const MAX_METHODS = 5;

export function BulkEditPaymentMethodsDialog({ open, onOpenChange, ads, onComplete }: Props) {
  const { toast } = useToast();
  const updateAd = useUpdateAd();

  // Selection can contain both BUY and SELL ads. Binance uses different method
  // pools per trade type, so the operator edits one trade type at a time.
  const buyAds = useMemo(() => ads.filter(a => a.tradeType === 'BUY'), [ads]);
  const sellAds = useMemo(() => ads.filter(a => a.tradeType === 'SELL'), [ads]);
  const hasMix = buyAds.length > 0 && sellAds.length > 0;

  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>(sellAds.length >= buyAds.length ? 'SELL' : 'BUY');
  const targetAds = tradeType === 'BUY' ? buyAds : sellAds;
  const isBuy = tradeType === 'BUY';

  const [selected, setSelected] = useState<PickMethod[]>([]);
  const [step, setStep] = useState<'form' | 'confirm' | 'executing' | 'done'>('form');
  const [results, setResults] = useState<AdResult[]>([]);

  // For SELL ads we need the merchant's bound payment accounts (with real payId).
  // Pull them live per account from existing SELL ads so payId maps correctly.
  const { data: sellAdsData, isLoading: loadingSellPool } = useBinanceAdsList(
    { page: 1, rows: 50, tradeType: 'SELL', fetchAll: true },
    { refetchInterval: false },
  );

  // Per-account map: accountId -> (identifier -> method with payId).
  const sellPoolByAccount = useMemo(() => {
    const map = new Map<string, Map<string, PickMethod>>();
    const pool: BinanceAd[] = sellAdsData?.data || [];
    for (const ad of pool) {
      const acct = ad._exchangeAccountId || '__default__';
      if (!map.has(acct)) map.set(acct, new Map());
      const acctMap = map.get(acct)!;
      for (const m of ad.tradeMethods || []) {
        const key = m.identifier || m.payType;
        if (key && !acctMap.has(key)) {
          acctMap.set(key, {
            payId: m.payId || 0,
            payType: m.payType || m.identifier || '',
            identifier: m.identifier || m.payType || '',
            tradeMethodName: m.tradeMethodName || m.payType || m.identifier || '',
          });
        }
      }
    }
    return map;
  }, [sellAdsData]);

  // Union of available methods to show in the picker for the active trade type.
  const availableMethods = useMemo<PickMethod[]>(() => {
    if (isBuy) {
      return ALLOWED_BUY_PAYMENT_METHODS.map(m => ({
        payType: m.binancePayType,
        identifier: m.identifier,
        tradeMethodName: m.label,
      }));
    }
    // SELL: union across the accounts of the selected SELL ads.
    const acctIds = new Set(targetAds.map(a => a._exchangeAccountId || '__default__'));
    const seen = new Map<string, PickMethod>();
    for (const acct of acctIds) {
      const acctMap = sellPoolByAccount.get(acct);
      if (!acctMap) continue;
      for (const m of acctMap.values()) {
        if (!seen.has(m.identifier)) seen.set(m.identifier, m);
      }
    }
    return Array.from(seen.values());
  }, [isBuy, targetAds, sellPoolByAccount]);

  const pickerMethods = availableMethods.filter(
    m => !selected.some(s => s.identifier === m.identifier),
  );

  const reset = () => { setSelected([]); setStep('form'); setResults([]); };

  const handleClose = (v: boolean) => {
    if (!v) { reset(); if (step === 'done') onComplete(); }
    onOpenChange(v);
  };

  const switchType = (t: 'BUY' | 'SELL') => {
    setTradeType(t);
    setSelected([]);
  };

  const toggleMethod = (m: PickMethod) => {
    setSelected(prev => {
      if (prev.some(s => s.identifier === m.identifier)) {
        return prev.filter(s => s.identifier !== m.identifier);
      }
      if (prev.length >= MAX_METHODS) {
        toast({ title: 'Limit Reached', description: `Maximum ${MAX_METHODS} payment methods allowed`, variant: 'destructive' });
        return prev;
      }
      return [...prev, m];
    });
  };

  const handleConfirm = () => {
    if (selected.length === 0) {
      toast({ title: 'Validation Error', description: 'Select at least one payment method', variant: 'destructive' });
      return;
    }
    setStep('confirm');
  };

  // Build the tradeMethods array for a specific ad. For SELL ads, resolve the
  // real payId from that ad's own account pool — never reuse another account's id.
  const buildTradeMethods = (ad: BinanceAd): PickMethod[] | null => {
    if (isBuy) {
      return selected.map(m => ({
        payType: m.payType || m.identifier,
        identifier: m.identifier,
        tradeMethodName: m.tradeMethodName || resolvePaymentMethod(m.identifier)?.label || m.identifier,
      }));
    }
    const acctMap = sellPoolByAccount.get(ad._exchangeAccountId || '__default__');
    const out: PickMethod[] = [];
    for (const m of selected) {
      const bound = acctMap?.get(m.identifier);
      if (!bound || !bound.payId) return null; // method not bound on this ad's account
      out.push({
        payId: bound.payId,
        payType: bound.payType || bound.identifier,
        identifier: bound.identifier,
        tradeMethodName: bound.tradeMethodName || bound.identifier,
      });
    }
    return out;
  };

  const executeUpdates = async () => {
    setStep('executing');
    const initial: AdResult[] = targetAds.map(ad => ({ advNo: ad.advNo, status: 'pending' }));
    setResults(initial);

    for (let i = 0; i < targetAds.length; i++) {
      const ad = targetAds[i];
      try {
        const tradeMethods = buildTradeMethods(ad);
        if (!tradeMethods) {
          throw new Error('Selected method not available on this ad\u2019s account');
        }
        await new Promise<void>((resolve, reject) => {
          updateAd.mutate({
            advNo: ad.advNo,
            exchange_account_id: ad._exchangeAccountId,
            asset: ad.asset,
            fiatUnit: ad.fiatUnit,
            tradeType: ad.tradeType,
            priceType: ad.priceType,
            initAmount: ad.initAmount,
            surplusAmount: ad.surplusAmount,
            minSingleTransAmount: ad.minSingleTransAmount,
            maxSingleTransAmount: ad.maxSingleTransAmount,
            tradeMethods,
            payTimeLimit: ad.payTimeLimit || 15,
            ...(ad.priceType === 1 ? { price: ad.price } : { priceFloatingRatio: ad.priceFloatingRatio }),
          }, {
            onSuccess: () => resolve(),
            onError: (e) => reject(e),
          });
        });
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'success' } : r));
      } catch (e: any) {
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', message: e?.message || 'Failed' } : r));
      }
    }
    setStep('done');
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Edit Payment Methods</DialogTitle>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 py-2">
            {hasMix && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  BUY and SELL ads use different payment method pools. Choose which set to edit:
                </p>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  <button
                    className={`px-3 py-1 text-sm rounded-md ${tradeType === 'SELL' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                    onClick={() => switchType('SELL')}
                  >
                    Sell ({sellAds.length})
                  </button>
                  <button
                    className={`px-3 py-1 text-sm rounded-md ${tradeType === 'BUY' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                    onClick={() => switchType('BUY')}
                  >
                    Buy ({buyAds.length})
                  </button>
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Set payment methods for <strong>{targetAds.length}</strong> {tradeType.toLowerCase()} ad{targetAds.length !== 1 ? 's' : ''}.
              This <strong>replaces</strong> the existing methods on each selected ad.
            </p>

            {/* Selected methods */}
            {selected.length > 0 && (
              <div className="space-y-2">
                {selected.map(m => {
                  const config = resolvePaymentMethod(m.identifier) || resolvePaymentMethod(m.payType);
                  const accent = config ? `hsl(${config.colorAccent})` : 'hsl(var(--muted-foreground))';
                  const label = config?.label || m.tradeMethodName || m.payType || m.identifier;
                  const icon = config?.iconLabel || label.slice(0, 3).toUpperCase();
                  return (
                    <div key={m.identifier} className="flex items-center justify-between rounded-lg border p-2.5"
                      style={{ borderLeftWidth: 4, borderLeftColor: accent }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: accent }}>{icon}</span>
                        <span className="text-sm font-medium text-foreground">{label}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Remove" onClick={() => toggleMethod(m)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Picker */}
            {!isBuy && loadingSellPool ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading bound payment accounts…
              </div>
            ) : pickerMethods.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <p className="text-xs text-warning">
                  {selected.length >= MAX_METHODS
                    ? `Maximum ${MAX_METHODS} methods selected.`
                    : isBuy
                      ? 'No more methods available.'
                      : 'No bound payment accounts found for these ads\u2019 account(s). Add them on Binance first.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {isBuy ? 'Select from allowed methods' : 'From your bound SELL accounts'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {pickerMethods.map(m => {
                    const config = resolvePaymentMethod(m.identifier) || resolvePaymentMethod(m.payType);
                    const label = config?.label || m.tradeMethodName || m.payType || m.identifier;
                    return (
                      <Button key={m.identifier} variant="outline" size="sm" className="gap-1 text-foreground" onClick={() => toggleMethod(m)}>
                        <Plus className="h-3.5 w-3.5" />
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Confirm Bulk Update</p>
                <p className="text-muted-foreground mt-1">
                  This will <strong>replace</strong> payment methods on <strong>{targetAds.length}</strong> {tradeType.toLowerCase()} ad{targetAds.length !== 1 ? 's' : ''} with:
                </p>
                <ul className="mt-1 list-disc list-inside text-muted-foreground">
                  {selected.map(m => {
                    const config = resolvePaymentMethod(m.identifier);
                    return <li key={m.identifier}>{config?.label || m.tradeMethodName || m.identifier}</li>;
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}

        {(step === 'executing' || step === 'done') && (
          <ScrollArea className="max-h-60">
            <div className="space-y-2 py-2">
              {step === 'done' && (
                <p className="text-sm font-medium mb-2 text-foreground">
                  {failCount === 0 ? '✅ All ads updated successfully' : `⚠️ ${successCount} succeeded, ${failCount} failed`}
                </p>
              )}
              {results.map(r => (
                <div key={r.advNo} className="flex items-center gap-2 text-sm">
                  {r.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {r.status === 'success' && <CheckCircle className="h-4 w-4 text-success" />}
                  {r.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  <span className="font-mono text-xs text-foreground">…{r.advNo.slice(-8)}</span>
                  {r.message && <span className="text-xs text-destructive">{r.message}</span>}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={selected.length === 0 || targetAds.length === 0}>Next</Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
              <Button onClick={executeUpdates}>Confirm & Update</Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => handleClose(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
