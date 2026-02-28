import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { X, Plus, Minus, Search, AlertTriangle, RefreshCw } from 'lucide-react';
import { BinanceAd, usePostAd, useUpdateAd, useBinanceAdsList, useBinanceReferencePrice, useBinanceDigitalCurrencies, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';
import { ALLOWED_BUY_PAYMENT_METHODS, resolvePaymentMethod, type PaymentMethodConfig } from '@/data/paymentMethods';
import { cn } from '@/lib/utils';

interface CreateEditAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAd?: BinanceAd | null;
}

const PAYMENT_TIME_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hr', value: 60 },
  { label: '2 hr', value: 120 },
];

// Priority assets shown first in the dropdown
const PRIORITY_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'USDC', 'FDUSD'];

export function CreateEditAdDialog({ open, onOpenChange, editingAd }: CreateEditAdDialogProps) {
  const { toast } = useToast();
  const postAd = usePostAd();
  const updateAd = useUpdateAd();
  // Fetch ALL SELL ads to extract available payment methods from the merchant's account
  const { data: sellAdsData, isLoading: isLoadingPayMethods } = useBinanceAdsList({ page: 1, rows: 50, tradeType: 'SELL' });
  const { data: digitalCurrenciesData } = useBinanceDigitalCurrencies();
  const isEditing = !!editingAd;

  const [form, setForm] = useState({
    tradeType: 'SELL',
    asset: 'USDT',
    fiatUnit: 'INR',
    priceType: 1 as 1 | 2,
    price: '',
    priceFloatingRatio: '',
    initAmount: '',
    minSingleTransAmount: '',
    maxSingleTransAmount: '',
    autoReplyMsg: '',
    remarks: '',
    payTimeLimit: 15,
    advStatus: BINANCE_AD_STATUS.ONLINE as number, // 1=online, 2=private, 3=offline
    buyerRegDaysLimit: -1, // -1 means disabled
    buyerBtcPositionLimit: -1, // -1 means disabled
    takerAdditionalKycRequired: 0,
    selectedPayMethods: [] as Array<{ payId?: number; payType: string; identifier: string; tradeMethodName?: string }>,
  });

  // Counterparty condition toggles (enabled = has limit, disabled = -1)
  const regDaysEnabled = form.buyerRegDaysLimit >= 0;
  const btcHoldingEnabled = form.buyerBtcPositionLimit >= 0;

  const [payMethodSearch, setPayMethodSearch] = useState('');
  const [showPayMethodPicker, setShowPayMethodPicker] = useState(false);

  const isBuyAd = form.tradeType === 'BUY';

  // ─── P2P Supported Coins only ─────────────────────────────────
  const P2P_SUPPORTED_COINS: { asset: string; name: string }[] = [
    { asset: "USDT", name: "TetherUS" },
    { asset: "BTC", name: "Bitcoin" },
    { asset: "USDC", name: "USDC" },
    { asset: "FDUSD", name: "First Digital USD" },
    { asset: "BNB", name: "Binance Coin" },
    { asset: "ETH", name: "Ethereum" },
    { asset: "TRX", name: "TRON" },
    { asset: "SHIB", name: "SHIBA INU" },
    { asset: "XRP", name: "XRP" },
    { asset: "SOL", name: "Solana" },
    { asset: "TON", name: "Toncoin" },
  ];
  const assetOptions = P2P_SUPPORTED_COINS;

  // ─── Dynamic Price Range from Binance ────────────────────────
  const { data: refPriceData, isLoading: isLoadingRefPrice, refetch: refetchRefPrice, dataUpdatedAt: refPriceUpdatedAt } = useBinanceReferencePrice(
    form.asset,
    form.tradeType
  );

  const priceRange = useMemo(() => {
    const refData = refPriceData?.data;
    if (!Array.isArray(refData) || refData.length === 0) return null;
    const ref = Number(refData[0]?.referencePrice);
    if (!ref || isNaN(ref)) return null;
    const LOWER_BOUND_PCT = 0.80;
    const UPPER_BOUND_PCT = 1.20;
    return {
      referencePrice: ref,
      min: Math.round(ref * LOWER_BOUND_PCT * 100) / 100,
      max: Math.round(ref * UPPER_BOUND_PCT * 100) / 100,
      priceScale: refData[0]?.priceScale || 2,
    };
  }, [refPriceData]);

  const isPriceOutOfRange = useMemo(() => {
    if (form.priceType !== 1 || !priceRange || !form.price) return false;
    const p = Number(form.price);
    return p < priceRange.min || p > priceRange.max;
  }, [form.priceType, form.price, priceRange]);

  const refPriceAgeSeconds = useMemo(() => {
    if (!refPriceUpdatedAt) return null;
    return Math.floor((Date.now() - refPriceUpdatedAt) / 1000);
  }, [refPriceUpdatedAt]);

  useEffect(() => {
    if (editingAd) {
      // Parse buyerRegDaysLimit: Binance returns -1 for disabled
      const regDays = Number(editingAd.buyerRegDaysLimit);
      const btcPos = Number(editingAd.buyerBtcPositionLimit);

      setForm({
        tradeType: editingAd.tradeType || 'SELL',
        asset: editingAd.asset || 'USDT',
        fiatUnit: editingAd.fiatUnit || 'INR',
        priceType: (editingAd.priceType || 1) as 1 | 2,
        price: String(editingAd.price || ''),
        priceFloatingRatio: String(editingAd.priceFloatingRatio || ''),
        initAmount: String(editingAd.initAmount || ''),
        minSingleTransAmount: String(editingAd.minSingleTransAmount || ''),
        maxSingleTransAmount: String(editingAd.maxSingleTransAmount || ''),
        autoReplyMsg: editingAd.autoReplyMsg || '',
        remarks: editingAd.remarks || '',
        payTimeLimit: editingAd.payTimeLimit || 15,
        advStatus: editingAd.advStatus || BINANCE_AD_STATUS.ONLINE,
        buyerRegDaysLimit: isNaN(regDays) ? -1 : regDays,
        buyerBtcPositionLimit: isNaN(btcPos) ? -1 : btcPos,
        takerAdditionalKycRequired: editingAd.takerAdditionalKycRequired || 0,
        selectedPayMethods: editingAd.tradeMethods || [],
      });
    } else {
      setForm({
        tradeType: 'SELL',
        asset: 'USDT',
        fiatUnit: 'INR',
        priceType: 1,
        price: '',
        priceFloatingRatio: '',
        initAmount: '',
        minSingleTransAmount: '',
        maxSingleTransAmount: '',
        autoReplyMsg: '',
        remarks: '',
        payTimeLimit: 15,
        advStatus: BINANCE_AD_STATUS.ONLINE,
        buyerRegDaysLimit: -1,
        buyerBtcPositionLimit: -1,
        takerAdditionalKycRequired: 0,
        selectedPayMethods: [],
      });
    }
    setShowPayMethodPicker(false);
    setPayMethodSearch('');
  }, [editingAd, open]);

  // ─── Available balance from surplus across all ads ────────────
  const availableBalance = useMemo(() => {
    const allAds: BinanceAd[] = sellAdsData?.data || sellAdsData?.list || [];
    // Find ads with same asset to get surplusAmount context
    // The surplusAmount on the editing ad itself shows remaining balance
    if (editingAd) {
      return Number(editingAd.surplusAmount) || Number(editingAd.initAmount) || 0;
    }
    return null;
  }, [editingAd, sellAdsData]);

  // ─── Payment Methods Logic ────────────────────────────────────
  const sellAdPayMethods = useMemo(() => {
    const ads: BinanceAd[] = sellAdsData?.data || sellAdsData?.list || [];
    const methodMap = new Map<string, any>();
    for (const ad of ads) {
      if (Array.isArray(ad.tradeMethods)) {
        for (const m of ad.tradeMethods) {
          const key = m.identifier || m.payType;
          if (key && !methodMap.has(key)) {
            methodMap.set(key, {
              payId: m.payId || 0,
              payType: m.payType || m.identifier || '',
              identifier: m.identifier || m.payType || '',
              tradeMethodName: m.tradeMethodName || m.payType || m.identifier || '',
            });
          }
        }
      }
    }
    return Array.from(methodMap.values());
  }, [sellAdsData]);

  const buyAdPayMethods = useMemo(() => {
    return ALLOWED_BUY_PAYMENT_METHODS.map(m => ({
      payId: 0,
      payType: m.binancePayType,
      identifier: m.identifier,
      config: m,
    }));
  }, []);

  const filteredPickerMethods = useMemo(() => {
    const search = payMethodSearch.toLowerCase();
    if (isBuyAd) {
      return buyAdPayMethods
        .filter(m => {
          const config = resolvePaymentMethod(m.identifier);
          const label = config?.label || m.payType;
          return label.toLowerCase().includes(search);
        })
        .filter(m => !form.selectedPayMethods.some(s => s.identifier === m.identifier || s.payType === m.payType));
    } else {
      return sellAdPayMethods
        .filter((m: any) => {
          const label = m.payType || m.identifier;
          return label.toLowerCase().includes(search);
        })
        .filter((m: any) => !form.selectedPayMethods.some(s => s.payId === m.payId));
    }
  }, [isBuyAd, buyAdPayMethods, sellAdPayMethods, payMethodSearch, form.selectedPayMethods]);

  const togglePayMethod = (method: { payId?: number; payType: string; identifier: string; tradeMethodName?: string }) => {
    const exists = form.selectedPayMethods.find(
      m => (m.payId && m.payId === method.payId) || m.identifier === method.identifier
    );
    if (exists) {
      setForm({
        ...form,
        selectedPayMethods: form.selectedPayMethods.filter(
          m => m.identifier !== method.identifier
        ),
      });
    } else if (form.selectedPayMethods.length < 5) {
      setForm({ ...form, selectedPayMethods: [...form.selectedPayMethods, method] });
    } else {
      toast({ title: 'Limit Reached', description: 'Maximum 5 payment methods allowed', variant: 'destructive' });
    }
  };

  const isMethodSelected = (method: { payId: number; identifier: string }) => {
    return form.selectedPayMethods.some(
      s => (s.payId && s.payId === method.payId) || s.identifier === method.identifier
    );
  };


  const validate = (): string | null => {
    if (!form.initAmount || Number(form.initAmount) <= 0) return 'Total quantity is required';
    if (!form.minSingleTransAmount || Number(form.minSingleTransAmount) <= 0) return 'Min order limit is required';
    if (!form.maxSingleTransAmount || Number(form.maxSingleTransAmount) <= 0) return 'Max order limit is required';
    if (Number(form.minSingleTransAmount) >= Number(form.maxSingleTransAmount)) return 'Min order must be less than max order';
    if (form.priceType === 1) {
      if (!form.price || Number(form.price) <= 0) return 'Price is required for fixed type';
      if (!priceRange) return 'Unable to fetch Binance price range — please retry';
      if (isPriceOutOfRange) return `Price must be between ${priceRange.min} – ${priceRange.max} ${form.fiatUnit}`;
    }
    if (form.priceType === 2 && (!form.priceFloatingRatio || Number(form.priceFloatingRatio) === 0)) return 'Floating ratio is required';
    if (form.selectedPayMethods.length === 0) return 'At least one payment method is required';
    return null;
  };

  const handleSubmit = () => {
    const error = validate();
    if (error) {
      toast({ title: 'Validation Error', description: error, variant: 'destructive' });
      return;
    }

    const tradeMethods = form.selectedPayMethods.map(m => {
      const config = resolvePaymentMethod(m.identifier);
      const base: Record<string, any> = {
        identifier: m.identifier,
        payType: m.payType || m.identifier,
        tradeMethodName: m.tradeMethodName || config?.label || m.identifier,
      };
      if (!isBuyAd && m.payId) {
        base.payId = m.payId;
      }
      return base;
    });

    // Map our synthetic Private status (2) back to Binance's online (1) for the API call.
    // Private = online + visibility restriction, handled separately by the edge function.
    const binanceAdvStatus = form.advStatus === BINANCE_AD_STATUS.PRIVATE ? BINANCE_AD_STATUS.ONLINE : form.advStatus;

    const adData: Record<string, any> = {
      initAmount: Number(form.initAmount),
      minSingleTransAmount: Number(form.minSingleTransAmount),
      maxSingleTransAmount: Number(form.maxSingleTransAmount),
      tradeMethods,
      payTimeLimit: form.payTimeLimit,
      advStatus: binanceAdvStatus,
      buyerKycLimit: 1,
      buyerRegDaysLimit: form.buyerRegDaysLimit,
      buyerBtcPositionLimit: form.buyerBtcPositionLimit,
      takerAdditionalKycRequired: form.takerAdditionalKycRequired,
      classify: 'profession',
      onlineNow: true,
      onlineDelayTime: 0,
    };

    if (!isEditing) {
      adData.asset = form.asset;
      adData.fiatUnit = form.fiatUnit;
      adData.tradeType = form.tradeType;
      adData.priceType = form.priceType;
    } else {
      adData.advNo = editingAd!.advNo;
      adData.asset = editingAd!.asset;
      adData.fiatUnit = editingAd!.fiatUnit;
      adData.tradeType = editingAd!.tradeType;
      adData.priceType = editingAd!.priceType;
      adData.surplusAmount = Number(editingAd!.surplusAmount) || Number(editingAd!.initAmount);
    }

    if (form.priceType === 1) {
      adData.price = Number(form.price);
    } else {
      adData.priceFloatingRatio = Number(form.priceFloatingRatio);
    }

    if (form.autoReplyMsg) adData.autoReplyMsg = form.autoReplyMsg;
    if (form.remarks) adData.remarks = form.remarks;
    

    if (isEditing) {
      updateAd.mutate(adData, { onSuccess: () => onOpenChange(false) });
    } else {
      postAd.mutate(adData, { onSuccess: () => onOpenChange(false) });
    }
  };

  const adjustPrice = (delta: number) => {
    const current = Number(form.price) || 0;
    let next = current + delta;
    if (priceRange) {
      next = Math.max(priceRange.min, Math.min(priceRange.max, next));
    }
    setForm({ ...form, price: String(Math.max(0, next)) });
  };

  const isSubmitting = postAd.isPending || updateAd.isPending;
  const noSellMethods = !isBuyAd && !isLoadingPayMethods && sellAdPayMethods.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Ad' : 'Create New Ad'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto flex-1 pr-2">
          {/* Trade Type & Asset */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Trade Type</Label>
              <Select value={form.tradeType} onValueChange={(v) => setForm({ ...form, tradeType: v, selectedPayMethods: [] })} disabled={isEditing}>
                <SelectTrigger className={isEditing ? 'opacity-60' : ''}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
              {isEditing && <p className="text-[10px] text-muted-foreground mt-1">Cannot change after creation</p>}
            </div>
            <div>
              <Label>Asset</Label>
              <Select value={form.asset} onValueChange={(v) => setForm({ ...form, asset: v })} disabled={isEditing}>
                <SelectTrigger className={isEditing ? 'opacity-60' : ''}><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {assetOptions.map((opt: { asset: string; name: string }) => (
                    <SelectItem key={opt.asset} value={opt.asset}>
                      {opt.asset}{opt.name !== opt.asset ? ` (${opt.name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEditing && <p className="text-[10px] text-muted-foreground mt-1">Cannot change after creation</p>}
            </div>
            <div>
              <Label>Fiat Currency</Label>
              <Select value={form.fiatUnit} onValueChange={(v) => setForm({ ...form, fiatUnit: v })} disabled={isEditing}>
                <SelectTrigger className={isEditing ? 'opacity-60' : ''}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              {isEditing && <p className="text-[10px] text-muted-foreground mt-1">Cannot change after creation</p>}
            </div>
          </div>

          {/* Price Section */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Price</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isLoadingRefPrice ? (
                  <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Loading price…</span>
                ) : priceRange ? (
                  <>
                    <span>Ref: <span className="font-semibold text-foreground">₹{priceRange.referencePrice}</span></span>
                    <span className="text-muted-foreground/60">|</span>
                    <span>Range: <span className="font-medium text-foreground">{priceRange.min} – {priceRange.max}</span></span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => refetchRefPrice()} title="Refresh price range">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Unable to fetch price range
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => refetchRefPrice()}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </span>
                )}
              </div>
            </div>

            <Select value={String(form.priceType)} onValueChange={(v) => setForm({ ...form, priceType: Number(v) as 1 | 2 })} disabled={isEditing}>
              <SelectTrigger className={`w-[160px] ${isEditing ? 'opacity-60' : ''}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Fixed</SelectItem>
                <SelectItem value="2">Floating</SelectItem>
              </SelectContent>
            </Select>
            {isEditing && <p className="text-[10px] text-muted-foreground">Price type cannot change after creation</p>}

            {form.priceType === 1 ? (
              <div>
                <Label>Price ({form.fiatUnit})</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" type="button" onClick={() => adjustPrice(-0.5)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    step="0.01"
                    min={priceRange?.min}
                    max={priceRange?.max}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className={cn("text-center", isPriceOutOfRange && "border-destructive focus-visible:ring-destructive")}
                  />
                  <Button variant="outline" size="icon" type="button" onClick={() => adjustPrice(0.5)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {priceRange && (
                  <p className={cn(
                    "text-[11px] mt-1",
                    isPriceOutOfRange ? "text-destructive font-medium" : "text-muted-foreground"
                  )}>
                    {isPriceOutOfRange
                      ? `⚠ Price must be between ${priceRange.min} – ${priceRange.max} ${form.fiatUnit}`
                      : `Allowed range: ${priceRange.min} – ${priceRange.max} ${form.fiatUnit}`
                    }
                  </p>
                )}
                {!priceRange && !isLoadingRefPrice && (
                  <p className="text-[11px] mt-1 text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Unable to fetch Binance price range — submission blocked
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label>Floating Ratio (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.priceFloatingRatio}
                  onChange={(e) => setForm({ ...form, priceFloatingRatio: e.target.value })}
                  placeholder="e.g., 1.5 for 1.5% above market"
                />
                {priceRange && (
                  <p className="text-[11px] mt-1 text-muted-foreground">
                    Reference price: ₹{priceRange.referencePrice}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Total Amount */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Total Trading Amount</Label>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Total Quantity ({form.asset})</Label>
                {isEditing && availableBalance !== null && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Available: <span className="font-medium text-foreground">{availableBalance} {form.asset}</span></span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-2 text-xs font-semibold text-primary"
                      onClick={() => setForm({ ...form, initAmount: String(availableBalance) })}
                    >
                      ALL
                    </Button>
                  </div>
                )}
              </div>
              <Input
                type="number"
                value={form.initAmount}
                onChange={(e) => setForm({ ...form, initAmount: e.target.value })}
                placeholder="e.g., 5000"
              />
            </div>

            <Label>Order Limit ({form.fiatUnit})</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  type="number"
                  value={form.minSingleTransAmount}
                  onChange={(e) => setForm({ ...form, minSingleTransAmount: e.target.value })}
                  placeholder="Min"
                />
                <span className="text-xs text-muted-foreground">Min Order</span>
              </div>
              <div>
                <Input
                  type="number"
                  value={form.maxSingleTransAmount}
                  onChange={(e) => setForm({ ...form, maxSingleTransAmount: e.target.value })}
                  placeholder="Max"
                />
                <span className="text-xs text-muted-foreground">Max Order</span>
              </div>
            </div>
          </div>

          {/* ─── Payment Methods ─────────────────────────────────────── */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Payment Method</Label>
              <span className="text-xs text-muted-foreground">
                {isBuyAd ? 'Select from allowed methods' : 'From existing SELL ads'}
              </span>
            </div>

            {form.selectedPayMethods.length > 0 && (
              <div className="space-y-2">
                {form.selectedPayMethods.map((m) => {
                  const config = resolvePaymentMethod(m.identifier) || resolvePaymentMethod(m.payType);
                  const accentColor = config ? `hsl(${config.colorAccent})` : 'hsl(var(--muted-foreground))';
                  const label = config?.label || m.payType || m.identifier;
                  const iconLabel = config?.iconLabel || label.slice(0, 3).toUpperCase();

                  return (
                    <div
                      key={m.identifier || m.payId}
                      className="flex items-center justify-between rounded-lg border p-3"
                      style={{ borderLeftWidth: 4, borderLeftColor: accentColor }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: accentColor }}>{iconLabel}</span>
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePayMethod(m)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {noSellMethods && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No payment methods found in existing SELL ads. Please create a SELL ad on Binance first.
                </p>
              </div>
            )}

            {form.selectedPayMethods.length < 5 && !noSellMethods && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPayMethodPicker(true)}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            )}

            <p className="text-xs text-muted-foreground">Select up to 5 methods</p>

            {/* Payment Method Picker Dialog */}
            <Dialog open={showPayMethodPicker} onOpenChange={setShowPayMethodPicker}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Select payment method</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    {isBuyAd ? 'Select Payment Method (Up to 5 methods)' : 'Select up to 5 methods'}
                  </p>
                </DialogHeader>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={isBuyAd ? 'Enter a payment method' : 'Search'}
                    value={payMethodSearch}
                    onChange={(e) => setPayMethodSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="max-h-[350px] overflow-y-auto space-y-2">
                  {isBuyAd ? (
                    ALLOWED_BUY_PAYMENT_METHODS
                      .filter(m => m.label.toLowerCase().includes(payMethodSearch.toLowerCase()))
                      .map(config => {
                        const selected = isMethodSelected({ payId: 0, identifier: config.identifier });
                        const accentColor = `hsl(${config.colorAccent})`;

                        return (
                          <div
                            key={config.identifier}
                            className={cn(
                              'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
                              selected && 'ring-1 ring-primary'
                            )}
                            style={{
                              borderLeftWidth: 4,
                              borderLeftColor: accentColor,
                              backgroundColor: selected ? config.bgColor : undefined,
                            }}
                            onClick={() => togglePayMethod({
                              payType: config.binancePayType,
                              identifier: config.identifier,
                              tradeMethodName: config.label,
                            })}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold" style={{ color: accentColor }}>
                                {config.iconLabel}
                              </span>
                              <span className="text-sm">{config.label}</span>
                            </div>
                            <Checkbox checked={selected} className="pointer-events-none" />
                          </div>
                        );
                      })
                  ) : (
                    <>
                      {isLoadingPayMethods ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                        </div>
                      ) : sellAdPayMethods.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8">
                          <AlertTriangle className="h-8 w-8 text-amber-500" />
                          <p className="text-sm text-muted-foreground text-center">
                            No payment methods found. Create a SELL ad on Binance first to populate available methods.
                          </p>
                        </div>
                      ) : (
                        sellAdPayMethods
                          .filter((m: any) => (m.payType || m.identifier).toLowerCase().includes(payMethodSearch.toLowerCase()))
                          .map((m: any) => {
                            const config = resolvePaymentMethod(m.identifier) || resolvePaymentMethod(m.payType);
                            const accentColor = config ? `hsl(${config.colorAccent})` : 'hsl(var(--muted-foreground))';
                            const label = config?.label || m.payType || m.identifier;
                            const iconLabel = config?.iconLabel || label.slice(0, 3).toUpperCase();
                            const selected = isMethodSelected(m);

                            return (
                              <div
                                key={m.payId || m.identifier}
                                className={cn(
                                  'flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors',
                                  selected && 'ring-1 ring-primary'
                                )}
                                style={{
                                  borderLeftWidth: 4,
                                  borderLeftColor: accentColor,
                                  backgroundColor: selected && config ? config.bgColor : undefined,
                                }}
                                onClick={() => togglePayMethod({
                                  payId: m.payId,
                                  payType: m.payType,
                                  identifier: m.identifier,
                                })}
                              >
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold" style={{ color: accentColor }}>
                                      {iconLabel}
                                    </span>
                                    <span className="text-sm font-medium">{label}</span>
                                  </div>
                                  {m.name && (
                                    <div className="flex items-center gap-4 ml-8">
                                      <span className="text-[10px] text-muted-foreground">Name: <strong>{m.name}</strong></span>
                                      {m.accountNo && (
                                        <span className="text-[10px] text-muted-foreground">{m.accountNo}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <Checkbox checked={selected} className="pointer-events-none" />
                              </div>
                            );
                          })
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  {!isBuyAd && (
                    <Button variant="outline" size="sm" onClick={() => {}} className="gap-1 invisible">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </Button>
                  )}
                  <div className="ml-auto">
                    <Button size="sm" onClick={() => setShowPayMethodPicker(false)}>
                      Confirm
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div>
              <Label>Payment Time Limit</Label>
              <Select value={String(form.payTimeLimit)} onValueChange={(v) => setForm({ ...form, payTimeLimit: Number(v) })}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TIME_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>


          {/* Terms & Conditions */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Terms and Conditions</Label>
            <div>
              <Label>Remarks (Optional)</Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Terms will be displayed to the counterparty"
                rows={3}
                maxLength={1000}
              />
              <p className="text-[10px] text-muted-foreground text-right mt-0.5">{form.remarks.length}/1000</p>
            </div>
            <div>
              <Label>Auto Reply (Optional)</Label>
              <Textarea
                value={form.autoReplyMsg}
                onChange={(e) => setForm({ ...form, autoReplyMsg: e.target.value })}
                placeholder="Auto reply message sent when order is created"
                rows={2}
              />
            </div>
          </div>

          {/* Counterparty Conditions */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Counterparty Conditions</Label>
            <p className="text-xs text-muted-foreground">Adding counterparty requirements will reduce the exposure of your Ad</p>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.takerAdditionalKycRequired === 1}
                onCheckedChange={(checked) => setForm({ ...form, takerAdditionalKycRequired: checked ? 1 : 0 })}
              />
              <Label>Request additional verification</Label>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={regDaysEnabled}
                  onCheckedChange={(checked) => setForm({
                    ...form,
                    buyerRegDaysLimit: checked ? 0 : -1
                  })}
                />
                <Label className="flex-1">Registered</Label>
                <Input
                  type="number"
                  min="0"
                  value={regDaysEnabled ? form.buyerRegDaysLimit : ''}
                  onChange={(e) => setForm({ ...form, buyerRegDaysLimit: Number(e.target.value) || 0 })}
                  disabled={!regDaysEnabled}
                  className="w-20 text-center"
                  placeholder="0"
                />
                <span className="text-sm text-muted-foreground">day(s) ago</span>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={btcHoldingEnabled}
                  onCheckedChange={(checked) => setForm({
                    ...form,
                    buyerBtcPositionLimit: checked ? 0.01 : -1
                  })}
                />
                <Label className="flex-1">Holdings more than</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={btcHoldingEnabled ? form.buyerBtcPositionLimit : ''}
                  onChange={(e) => setForm({ ...form, buyerBtcPositionLimit: Number(e.target.value) || 0 })}
                  disabled={!btcHoldingEnabled}
                  className="w-24 text-center"
                  placeholder="0.01"
                />
                <span className="text-sm text-muted-foreground">BTC</span>
              </div>
            </div>
          </div>

           {/* Status — Radio Group: Online / Offline */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-base font-semibold">Status</Label>
            <RadioGroup
              value={String(form.advStatus)}
              onValueChange={(v) => setForm({ ...form, advStatus: Number(v) })}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value={String(BINANCE_AD_STATUS.ONLINE)} id="status-online" />
                <Label htmlFor="status-online" className="cursor-pointer">Online</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value={String(BINANCE_AD_STATUS.OFFLINE)} id="status-offline" />
                <Label htmlFor="status-offline" className="cursor-pointer">Offline</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || noSellMethods}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Post'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
