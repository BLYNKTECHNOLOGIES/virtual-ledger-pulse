import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X, Plus, CreditCard, ArrowRight } from 'lucide-react';
import { BinanceAd, useUpdateAd, useBinanceAdsList } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ALLOWED_BUY_PAYMENT_METHODS, resolvePaymentMethod } from '@/data/paymentMethods';
import { AdDialogHeader, NoteBox, RunProgress, RunRow, RunSummary, SelectionSummary, StepRail, SEG_BTN, SEG_LIST } from './adUi';
import { cn } from '@/lib/utils';

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

  // The initial useState value can be computed while `ads` is still empty (dialog
  // mounts before selection propagates), which would wrongly lock onto SELL and
  // show "0 sell ads". Re-derive the correct default each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (sellAds.length > 0 && buyAds.length === 0) setTradeType('SELL');
    else if (buyAds.length > 0 && sellAds.length === 0) setTradeType('BUY');
    else if (sellAds.length === 0 && buyAds.length === 0) return; // nothing yet
    else setTradeType(sellAds.length >= buyAds.length ? 'SELL' : 'BUY');
  }, [open, buyAds.length, sellAds.length]);

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
        <AdDialogHeader icon={CreditCard} title="Edit payment methods" description="The methods you pick (up to 5) replace the existing ones on the selected ads of one side." />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SelectionSummary ads={ads} />
          <StepRail steps={['Pick', 'Review', 'Apply']} current={step === 'form' ? 0 : step === 'confirm' ? 1 : 2} />
        </div>

        {step === 'form' && (
          <div className="space-y-3">
            {hasMix && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  BUY and SELL ads use different payment method pools. Choose which set to edit:
                </div>
                <div className={cn(SEG_LIST, 'inline-flex items-center')} role="group" aria-label="Which ads to edit">
                  <button
                    type="button"
                    aria-pressed={tradeType === 'SELL'}
                    className={SEG_BTN}
                    onClick={() => switchType('SELL')}
                  >
                    Sell ({sellAds.length})
                  </button>
                  <button
                    type="button"
                    aria-pressed={tradeType === 'BUY'}
                    className={SEG_BTN}
                    onClick={() => switchType('BUY')}
                  >
                    Buy ({buyAds.length})
                  </button>
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Set payment methods for <strong className="text-foreground">{targetAds.length}</strong> {tradeType.toLowerCase()} ad{targetAds.length !== 1 ? 's' : ''}.
              This <strong className="text-foreground">replaces</strong> the existing methods on each selected ad.
            </div>

            {/* Selected methods */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">Selected</span>
                <span className="tabular-nums text-muted-foreground">{selected.length}/{MAX_METHODS}</span>
              </div>
              {selected.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">Pick at least one method below.</div>
              ) : (
                <div className="space-y-1.5">
                  {selected.map(m => {
                    const config = resolvePaymentMethod(m.identifier) || resolvePaymentMethod(m.payType);
                    const accent = config ? `hsl(${config.colorAccent})` : 'hsl(var(--muted-foreground))';
                    const label = config?.label || m.tradeMethodName || m.payType || m.identifier;
                    const icon = config?.iconLabel || label.slice(0, 3).toUpperCase();
                    return (
                      <div key={m.identifier} className="flex items-center justify-between rounded-lg border border-border bg-card px-2.5 py-2"
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
            </div>

            {/* Picker */}
            {!isBuy && loadingSellPool ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading bound payment accounts…
              </div>
            ) : pickerMethods.length === 0 ? (
              <NoteBox>
                {selected.length >= MAX_METHODS
                  ? `Maximum ${MAX_METHODS} methods selected.`
                  : isBuy
                    ? 'No more methods available.'
                    : 'No bound payment accounts found for these ads\u2019 account(s). Add them on Binance first.'}
              </NoteBox>
            ) : (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-foreground">
                  {isBuy ? 'Select from allowed methods' : 'From your bound SELL accounts'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pickerMethods.map(m => {
                    const config = resolvePaymentMethod(m.identifier) || resolvePaymentMethod(m.payType);
                    const label = config?.label || m.tradeMethodName || m.payType || m.identifier;
                    return (
                      <Button key={m.identifier} variant="outline" size="sm" className="h-8 gap-1 text-xs text-foreground" onClick={() => toggleMethod(m)}>
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
          <NoteBox title={`Replace methods on ${targetAds.length} ${tradeType.toLowerCase()} ad${targetAds.length !== 1 ? 's' : ''}?`}>
            <div>Each ad will have exactly:</div>
            <ul className="mt-1 list-disc list-inside">
              {selected.map(m => {
                const config = resolvePaymentMethod(m.identifier);
                return <li key={m.identifier} className="text-foreground">{config?.label || m.tradeMethodName || m.identifier}</li>;
              })}
            </ul>
          </NoteBox>
        )}

        {(step === 'executing' || step === 'done') && (
          <div className="space-y-2">
            {step === 'executing' && <RunProgress done={results.filter(r => r.status !== 'pending').length} total={results.length} label="Updating payment methods…" />}
            {step === 'done' && <RunSummary ok={successCount} failed={failCount} okText="All ads updated" />}
            <ScrollArea className="max-h-60 rounded-md border border-border">
              <div className="p-1">
                {results.map(r => (
                  <RunRow key={r.advNo} status={r.status} advNo={r.advNo} message={r.message} />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'form' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={selected.length === 0 || targetAds.length === 0} className="gap-1.5">Review <ArrowRight className="h-3.5 w-3.5" /></Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
              <Button onClick={executeUpdates}>Update {targetAds.length} ad{targetAds.length !== 1 ? 's' : ''}</Button>
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
