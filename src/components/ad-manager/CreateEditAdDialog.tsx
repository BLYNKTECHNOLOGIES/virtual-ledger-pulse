import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { X, Plus, Minus, Search, AlertTriangle, RefreshCw, Pencil, Copy, Megaphone } from 'lucide-react';
import { BinanceAd, usePostAd, useUpdateAd, useUpdateAdStatus, useBinanceAdsList, useBinanceReferencePrice, useBinanceAdDetail, useBinanceDigitalCurrencies, useAvailableAdsCategory, useBinancePaymentMethods, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useToast } from '@/hooks/use-toast';
import { useBinanceBalances } from '@/hooks/useBinanceAssets';
import { ALLOWED_BUY_PAYMENT_METHODS, resolvePaymentMethod, type PaymentMethodConfig } from '@/data/paymentMethods';
import { AdZone, ZONE_LABEL, adZone, zoneClassify, parseAvailableZones } from '@/lib/adZone';
import { cn } from '@/lib/utils';
import { AdDialogHeader } from './adUi';

const SECTION = 'space-y-3 rounded-lg border border-border bg-card/60 p-3.5 sm:p-4';
function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Create-mode seed shape (subset of the internal form). Used by "Duplicate Ad". */
export type CreateAdInitialValues = Partial<{
  tradeType: string;
  asset: string;
  fiatUnit: string;
  priceType: 1 | 2;
  price: string;
  priceFloatingRatio: string;
  initAmount: string;
  minSingleTransAmount: string;
  maxSingleTransAmount: string;
  autoReplyMsg: string;
  remarks: string;
  payTimeLimit: number;
  advStatus: number;
  buyerRegDaysLimit: number;
  buyerBtcPositionLimit: number;
  takerAdditionalKycRequired: number;
  selectedPayMethods: Array<{ payId?: number; payType: string; identifier: string; tradeMethodName?: string }>;
}>;

interface CreateEditAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAd?: BinanceAd | null;
  /** Account to create the ad on (combined "All accounts" mode). */
  createAccountId?: string | null;
  /** Seeds create-mode defaults only (Duplicate Ad). Ignored when editingAd is set. */
  initialValues?: CreateAdInitialValues | null;
}

const PAYMENT_TIME_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hr', value: 60 },
  { label: '2 hr', value: 120 },
];

const normalizeTradeMethodKey = (method: { identifier?: string; payType?: string; payId?: number }) =>
  String(method.identifier || method.payType || method.payId || '').trim();

const tradeMethodsChanged = (
  current: Array<{ identifier?: string; payType?: string; payId?: number }> = [],
  next: Array<{ identifier?: string; payType?: string; payId?: number }> = []
) => {
  const currentKeys = current.map(normalizeTradeMethodKey).filter(Boolean).sort();
  const nextKeys = next.map(normalizeTradeMethodKey).filter(Boolean).sort();
  return currentKeys.length !== nextKeys.length || currentKeys.some((key, index) => key !== nextKeys[index]);
};

const changedNumber = (current: unknown, next: unknown) => Number(current ?? 0) !== Number(next ?? 0);
const changedString = (current: unknown, next: unknown) => String(current ?? '') !== String(next ?? '');

// Priority assets shown first in the dropdown
const PRIORITY_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'USDC', 'FDUSD'];

export function CreateEditAdDialog({ open, onOpenChange, editingAd, createAccountId, initialValues }: CreateEditAdDialogProps) {
  const { toast } = useToast();
  const postAd = usePostAd();
  const updateAd = useUpdateAd();
  const updateAdStatus = useUpdateAdStatus();
  // Payment methods: saved methods on the Binance account + methods already used on SELL ads
  const { data: savedPayMethods, isLoading: isLoadingSavedPayMethods } = useBinancePaymentMethods();
  const { data: sellAdsData, isLoading: isLoadingSellAds } = useBinanceAdsList({ page: 1, rows: 50, tradeType: 'SELL' });
  const isLoadingPayMethods = isLoadingSavedPayMethods || isLoadingSellAds;
  const { data: digitalCurrenciesData } = useBinanceDigitalCurrencies();
  const { data: walletBalances } = useBinanceBalances();
  const isEditing = !!editingAd;

  // Market zone (Binance `classify`). Zone is fixed after creation.
  const [zone, setZone] = useState<AdZone>('p2p');
  const { data: adsCategoryData, isLoading: isLoadingZones, isError: zonesError } = useAvailableAdsCategory(
    createAccountId || null,
    open && !isEditing,
  );
  const availableZones = useMemo(() => parseAvailableZones(adsCategoryData), [adsCategoryData]);
  const blockZoneAvailable = availableZones.includes('block');


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

  // ─── Live floating index ─────────────────────────────────────
  // Binance recomputes a floating ad's price from its own INR index continuously.
  // The ad row in the list is a snapshot and goes stale within seconds, so the
  // index back-calculated from it (price / ratio) drifts and the preview shows a
  // different rate than the one Binance applies on update. Pull the ad live.
  const {
    data: adDetailData,
    isFetching: isFetchingAdDetail,
    refetch: refetchAdDetail,
    dataUpdatedAt: adDetailUpdatedAt,
  } = useBinanceAdDetail(
    open && isEditing && Number(editingAd?.priceType) === 2 ? String(editingAd?.advNo || '') : null,
  );

  const liveFloatingIndex = useMemo(() => {
    const raw: any = adDetailData as any;
    const detail: any = raw?.data?.data ?? raw?.data ?? raw;
    const price = Number(detail?.price);
    const ratio = Number(detail?.priceFloatingRatio);
    if (!(price > 0) || !(ratio > 0)) return null;
    return { index: price / (ratio / 100), price, ratio, at: adDetailUpdatedAt };
  }, [adDetailData, adDetailUpdatedAt]);


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
        // Duplicate Ad: seed create-mode defaults from the source ad.
        ...(initialValues || {}),
      });
    }
    setZone(editingAd ? adZone(editingAd) : 'p2p');
    setShowPayMethodPicker(false);
    setPayMethodSearch('');
  }, [editingAd, open, initialValues]);

  // Never keep a zone Binance does not report as available for this account.
  useEffect(() => {
    if (!isEditing && zone === 'block' && adsCategoryData && !blockZoneAvailable) setZone('p2p');
  }, [isEditing, zone, adsCategoryData, blockZoneAvailable]);


  // ─── Available balance from surplus across all ads ────────────
  const availableBalance = useMemo(() => {
    const allAds: BinanceAd[] = sellAdsData?.data || [];
    // Find ads with same asset to get surplusAmount context
    // The surplusAmount on the editing ad itself shows remaining balance
    if (editingAd) {
      return Number(editingAd.surplusAmount) || Number(editingAd.initAmount) || 0;
    }
    return null;
  }, [editingAd, sellAdsData]);

  // ─── Wallet balance for the selected asset (SELL ads only) ────
  const walletAvailable = useMemo(() => {
    if (isBuyAd) return null;
    const row = (walletBalances || []).find((b: any) => b.asset === form.asset);
    if (!row) return null;
    const free = Number(row.total_free ?? row.total_balance ?? 0);
    return Number.isFinite(free) ? free : null;
  }, [walletBalances, form.asset, isBuyAd]);

  // Binance requires whole-number quantities for USDC / FDUSD
  const maxQuantity = useMemo(() => {
    if (walletAvailable === null) return null;
    if (form.asset === 'USDC' || form.asset === 'FDUSD') return Math.floor(walletAvailable);
    return Math.floor(walletAvailable * 1e8) / 1e8;
  }, [walletAvailable, form.asset]);

  // ─── Payment Methods Logic ────────────────────────────────────
  const sellAdPayMethods = useMemo(() => {
    const methodMap = new Map<string, any>();
    // 1) Saved payment methods on the Binance account (authoritative list)
    for (const m of savedPayMethods || []) {
      const key = String(m.payId || m.identifier || m.payType);
      if (key) methodMap.set(key, { ...m });
    }
    // 2) Methods already attached to existing SELL ads (covers anything the
    //    saved-methods endpoint does not return for this account)
    const ads: BinanceAd[] = sellAdsData?.data || [];
    for (const ad of ads) {
      if (Array.isArray(ad.tradeMethods)) {
        for (const m of ad.tradeMethods) {
          const key = String(m.payId || m.identifier || m.payType);
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
  }, [sellAdsData, savedPayMethods]);

  const buyAdPayMethods = useMemo(() => {
    return ALLOWED_BUY_PAYMENT_METHODS.map(m => ({
      payId: 0,
      payType: m.binancePayType,
      identifier: m.identifier,
      config: m,
    }));
  }, []);

  const matchesPayMethodSearch = (m: any, search: string) => {
    if (!search) return true;
    const config = resolvePaymentMethod(m.identifier) || resolvePaymentMethod(m.payType);
    return [config?.label, m.tradeMethodName, m.payType, m.identifier, m.name, m.accountNo]
      .filter(Boolean)
      .some((v: string) => String(v).toLowerCase().includes(search));
  };

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
        .filter((m: any) => matchesPayMethodSearch(m, search))
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

    const fullAdData: Record<string, any> = {
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
      classify: zoneClassify(zone),
      onlineNow: true,
      onlineDelayTime: 0,
    };

    if (!isEditing) {
      fullAdData.asset = form.asset;
      fullAdData.fiatUnit = form.fiatUnit;
      fullAdData.tradeType = form.tradeType;
      fullAdData.priceType = form.priceType;
    } else {
      fullAdData.advNo = editingAd!.advNo;
    }

    if (form.priceType === 1) {
      fullAdData.price = Number(form.price);
    } else {
      fullAdData.priceFloatingRatio = Number(form.priceFloatingRatio);
    }

    if (form.autoReplyMsg) fullAdData.autoReplyMsg = form.autoReplyMsg;
    if (form.remarks) fullAdData.remarks = form.remarks;

    // Private (2) is a visibility state, not a Binance ad status. Detect the
    // transition so it can be applied via the visibility-aware status call.
    const wasPrivate = isEditing && editingAd!.advStatus === BINANCE_AD_STATUS.PRIVATE;
    const wantsPrivate = form.advStatus === BINANCE_AD_STATUS.PRIVATE;
    const visibilityChanged = isEditing && wasPrivate !== wantsPrivate;

    const adData = isEditing ? { advNo: editingAd!.advNo } as Record<string, any> : fullAdData;
    if (isEditing) {
      if (changedNumber(editingAd!.initAmount, form.initAmount)) adData.initAmount = fullAdData.initAmount;
      if (changedNumber(editingAd!.minSingleTransAmount, form.minSingleTransAmount)) adData.minSingleTransAmount = fullAdData.minSingleTransAmount;
      if (changedNumber(editingAd!.maxSingleTransAmount, form.maxSingleTransAmount)) adData.maxSingleTransAmount = fullAdData.maxSingleTransAmount;
      if (tradeMethodsChanged(editingAd!.tradeMethods || [], tradeMethods)) adData.tradeMethods = tradeMethods;
      if (changedNumber(editingAd!.payTimeLimit, form.payTimeLimit)) adData.payTimeLimit = fullAdData.payTimeLimit;
      // Private is Binance online + visibility restriction, so a private
      // transition is applied through updateAdStatus (below), never here.
      if (!visibilityChanged && changedNumber(editingAd!.advStatus, binanceAdvStatus)) adData.advStatus = fullAdData.advStatus;
      if (changedNumber(editingAd!.buyerRegDaysLimit, form.buyerRegDaysLimit)) adData.buyerRegDaysLimit = fullAdData.buyerRegDaysLimit;
      if (changedNumber(editingAd!.buyerBtcPositionLimit, form.buyerBtcPositionLimit)) adData.buyerBtcPositionLimit = fullAdData.buyerBtcPositionLimit;
      if (changedNumber(editingAd!.takerAdditionalKycRequired, form.takerAdditionalKycRequired)) adData.takerAdditionalKycRequired = fullAdData.takerAdditionalKycRequired;
      if (form.priceType === 1 && changedNumber(editingAd!.price, form.price)) adData.price = fullAdData.price;
      if (form.priceType === 2 && changedNumber(editingAd!.priceFloatingRatio, form.priceFloatingRatio)) adData.priceFloatingRatio = fullAdData.priceFloatingRatio;
      if (changedString(editingAd!.autoReplyMsg, form.autoReplyMsg)) adData.autoReplyMsg = form.autoReplyMsg;
      if (changedString(editingAd!.remarks, form.remarks)) adData.remarks = form.remarks;
    }
    

    // Route to the correct Binance account: edits use the ad's own account,
    // creates use the account chosen in combined mode (falls back to active).
    const routedAccountId = isEditing ? editingAd?._exchangeAccountId : (createAccountId || undefined);
    if (routedAccountId) adData.exchange_account_id = routedAccountId;

    const applyVisibility = () => {
      updateAdStatus.mutate(
        {
          advNos: [editingAd!.advNo],
          advStatus: form.advStatus,
          fromPrivate: wasPrivate,
          fromStatus: editingAd!.advStatus,
          exchangeAccountId: routedAccountId || undefined,
        },
        { onSuccess: () => onOpenChange(false) },
      );
    };

    if (isEditing) {
      const hasFieldChanges = Object.keys(adData).some((k) => k !== 'advNo' && k !== 'exchange_account_id');
      if (!hasFieldChanges && visibilityChanged) { applyVisibility(); return; }
      updateAd.mutate(adData, {
        onSuccess: () => { if (visibilityChanged) applyVisibility(); else onOpenChange(false); },
      });
    } else {
      postAd.mutate(adData, { onSuccess: () => onOpenChange(false) });
    }
  };

  const adjustPrice = (delta: number) => {
    setForm(prev => {
      const current = Number(prev.price) || 0;
      // Round to avoid floating-point drift (e.g. 98.66 + 0.01 = 98.6699...)
      const decimals = (String(delta).split('.')[1] || '').length;
      let next = parseFloat((current + delta).toFixed(Math.max(decimals, 2)));
      if (priceRange) {
        next = Math.max(priceRange.min, Math.min(priceRange.max, next));
      }
      return { ...prev, price: String(Math.max(0, next)) };
    });
  };

  const adjustFloatingRatio = (delta: number) => {
    setForm(prev => {
      const current = Number(prev.priceFloatingRatio) || 0;
      const currentDecimals = (String(prev.priceFloatingRatio).split('.')[1] || '').length;
      const decimals = Math.min(Math.max(currentDecimals, 2), 8);
      const next = Math.max(0.01, current + delta);
      return { ...prev, priceFloatingRatio: next.toFixed(decimals) };
    });
  };

  // Press-and-hold: continuously adjust price while button is held down
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = (delta: number) => {
    adjustPrice(delta); // immediate first step
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => adjustPrice(delta), 100);
    }, 400); // 400ms delay before continuous repeat
  };

  const startFloatingRatioHold = (delta: number) => {
    adjustFloatingRatio(delta);
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => adjustFloatingRatio(delta), 100);
    }, 400);
  };

  const stopHold = () => {
    if (holdTimeoutRef.current) { clearTimeout(holdTimeoutRef.current); holdTimeoutRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  };

  // Cleanup on unmount
  useEffect(() => () => stopHold(), []);

  const isSubmitting = postAd.isPending || updateAd.isPending || updateAdStatus.isPending;
  const noSellMethods = !isBuyAd && !isLoadingPayMethods && sellAdPayMethods.length === 0;

  const dialogTitle = isEditing ? 'Edit ad' : initialValues ? 'Duplicate ad' : 'Create ad';
  const dialogDescription = isEditing
    ? <>{form.tradeType === 'BUY' ? 'Buy' : 'Sell'} {form.asset} · {ZONE_LABEL[zone]} · ad <span className="t-mono">…{String(editingAd?.advNo || '').slice(-8)}</span>. Only the fields you change are sent to Binance.</>
    : initialValues
      ? 'Starts from a copy of an existing ad. Check every field, then post.'
      : 'Posts a new ad to Binance.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl lg:max-w-4xl max-h-[92vh] flex flex-col overflow-hidden p-0 md:p-0 gap-0">
        <div className="border-b border-border px-4 py-3 md:px-5">
          <AdDialogHeader icon={isEditing ? Pencil : initialValues ? Copy : Megaphone} title={dialogTitle} description={dialogDescription} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4">
          {/* Trade Type & Asset */}
          <section className={SECTION}>
            <SectionTitle title="Ad type" hint={isEditing ? 'Fixed after the ad is created' : undefined} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label>Trade Type</Label>
              <Select value={form.tradeType} onValueChange={(v) => setForm({ ...form, tradeType: v, selectedPayMethods: [] })} disabled={isEditing}>
                <SelectTrigger className={isEditing ? 'opacity-60' : ''}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="order-last col-span-2 space-y-1.5 sm:order-none sm:col-span-1">
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
            </div>
            <div className="space-y-1.5">
              <Label>Fiat Currency</Label>
              <Select value={form.fiatUnit} onValueChange={(v) => setForm({ ...form, fiatUnit: v })} disabled={isEditing}>
                <SelectTrigger className={isEditing ? 'opacity-60' : ''}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Market Zone (Binance `classify`) — creation only; zone is immutable after posting */}
          {!isEditing && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label>Market Zone</Label>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    P2P zone and Block zone are separate order books with different merchants and price levels.
                  </div>
                </div>
                <Select value={zone} onValueChange={(v) => setZone(v as AdZone)}>
                  <SelectTrigger className="w-[170px] shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p2p">{ZONE_LABEL.p2p}</SelectItem>
                    <SelectItem value="block" disabled={!blockZoneAvailable}>{ZONE_LABEL.block}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isLoadingZones ? (
                <div className="text-[11px] text-muted-foreground">Checking available ad categories with Binance…</div>
              ) : zonesError ? (
                <div className="text-[11px] text-warning">Binance did not return the available ad categories — Block zone stays locked.</div>
              ) : !blockZoneAvailable ? (
                <div className="text-[11px] text-muted-foreground">Binance does not report Block zone as available for this account.</div>
              ) : null}
            </div>
          )}
          </section>


          {/* Price Section */}
          <section className={SECTION}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle title="Price" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isLoadingRefPrice ? (
                  <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Loading price…</span>
                ) : priceRange ? (
                  <>
                    <span>Ref <span className="font-semibold tabular-nums text-foreground">₹{priceRange.referencePrice}</span></span>
                    <span className="text-muted-foreground/60">|</span>
                    <span>Range <span className="font-medium tabular-nums text-foreground">{priceRange.min} – {priceRange.max}</span></span>
                    <Button variant="ghost" size="icon" aria-label="Refresh" className="h-6 w-6" onClick={() => refetchRefPrice()} title="Refresh price range">
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Unable to fetch price range
                    <Button variant="ghost" size="icon" aria-label="Refresh" className="h-6 w-6" onClick={() => refetchRefPrice()}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(form.priceType)} onValueChange={(v) => setForm({ ...form, priceType: Number(v) as 1 | 2 })} disabled={isEditing}>
                <SelectTrigger className={`w-[160px] ${isEditing ? 'opacity-60' : ''}`} aria-label="Price type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Fixed</SelectItem>
                  <SelectItem value="2">Floating</SelectItem>
                </SelectContent>
              </Select>
              {isEditing && <span className="text-[11px] text-muted-foreground">Price type cannot change after creation</span>}
            </div>

            {form.priceType === 1 ? (() => {
              const stableAssets = ['USDT', 'USDC', 'FDUSD'];
              const priceStep = stableAssets.includes(form.asset) ? 0.01 : 0.5;
              return (
              <div className="space-y-1.5">
                <Label>Price ({form.fiatUnit})</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="Decrease" type="button" title={`Down ${priceStep} (hold to repeat)`}
                    onMouseDown={() => startHold(-priceStep)}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={() => startHold(-priceStep)}
                    onTouchEnd={stopHold}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    step="0.01"
                    min={priceRange?.min}
                    max={priceRange?.max}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className={cn("text-center text-lg font-semibold tabular-nums", isPriceOutOfRange && "border-destructive focus-visible:ring-destructive")}
                  />
                  <Button variant="outline" size="icon" aria-label="Increase" type="button" title={`Up ${priceStep} (hold to repeat)`}
                    onMouseDown={() => startHold(priceStep)}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={() => startHold(priceStep)}
                    onTouchEnd={stopHold}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {priceRange && (
                  <div className={cn(
                    "text-[11px]",
                    isPriceOutOfRange ? "text-destructive font-medium" : "text-muted-foreground"
                  )}>
                    {isPriceOutOfRange
                      ? `⚠ Price must be between ${priceRange.min} – ${priceRange.max} ${form.fiatUnit}`
                      : `Allowed range: ${priceRange.min} – ${priceRange.max} ${form.fiatUnit}`
                    }
                  </div>
                )}
                {!priceRange && !isLoadingRefPrice && (
                  <div className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Unable to fetch Binance price range — submission blocked
                  </div>
                )}
              </div>
              );
            })() : (
              <div className="space-y-1.5">
                <Label>Floating Ratio (%)</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="Decrease" type="button" title="Down 0.01 (hold to repeat)"
                    onMouseDown={() => startFloatingRatioHold(-0.01)}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={() => startFloatingRatioHold(-0.01)}
                    onTouchEnd={stopHold}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.priceFloatingRatio}
                    onChange={(e) => setForm({ ...form, priceFloatingRatio: e.target.value })}
                    placeholder="e.g., 1.5 for 1.5% above market"
                    className="text-center text-lg font-semibold tabular-nums"
                  />
                  <Button variant="outline" size="icon" aria-label="Increase" type="button" title="Up 0.01 (hold to repeat)"
                    onMouseDown={() => startFloatingRatioHold(0.01)}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={() => startFloatingRatioHold(0.01)}
                    onTouchEnd={stopHold}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {(() => {
                  const ratio = Number(form.priceFloatingRatio);
                  // Index price = ad price / (ratio / 100). Use the LIVE ad detail;
                  // the list snapshot drifts and produced a wrong preview rate.
                  const snapPrice = editingAd ? Number(editingAd.price) : 0;
                  const snapRatio = editingAd ? Number(editingAd.priceFloatingRatio) : 0;
                  const indexPrice = liveFloatingIndex?.index
                    ?? ((snapPrice > 0 && snapRatio > 0) ? snapPrice / (snapRatio / 100) : null);
                  const isLive = !!liveFloatingIndex;

                  if (indexPrice && ratio > 0) {
                    const effectivePrice = indexPrice * ratio / 100;
                    return (
                      <div className="text-[11px] space-y-0.5">
                        <div className="text-muted-foreground flex items-center gap-1 flex-wrap">
                          Pricing formula: ₹{indexPrice.toFixed(2)} × {ratio}% = <span className="font-semibold text-foreground">₹{effectivePrice.toFixed(2)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            aria-label="Refresh live index"
                            className="h-5 w-5"
                            onClick={() => refetchAdDetail()}
                            title="Refresh live index price from Binance"
                          >
                            <RefreshCw className={cn('h-3 w-3', isFetchingAdDetail && 'animate-spin')} />
                          </Button>
                        </div>
                        {!isLive && (
                          <div className="text-warning flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Index taken from the cached ad row — Binance may apply a slightly different rate. Refresh to load the live index.
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (priceRange) {
                    return (
                      <div className="text-[11px] text-muted-foreground">
                        Highest ad price: ₹{priceRange.referencePrice}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </section>

          {/* Total Amount */}
          <section className={SECTION}>
            <SectionTitle title="Total Trading Amount" />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Total Quantity ({form.asset})</Label>
                {isEditing && availableBalance !== null && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Ad balance: <span className="font-medium tabular-nums text-foreground">{availableBalance} {form.asset}</span></span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs font-semibold text-primary"
                      onClick={() => setForm({ ...form, initAmount: String(availableBalance) })}
                    >
                      ALL
                    </Button>
                  </div>
                )}
                {!isBuyAd && maxQuantity !== null && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Available:{' '}
                      <span className="font-medium tabular-nums text-foreground">
                        {maxQuantity.toLocaleString('en-US', { maximumFractionDigits: 8 })} {form.asset}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs font-semibold text-primary"
                      disabled={maxQuantity <= 0}
                      onClick={() => setForm({ ...form, initAmount: String(maxQuantity) })}
                    >
                      MAX
                    </Button>
                  </div>
                )}
              </div>
              <Input
                type="number"
                value={form.initAmount}
                onChange={(e) => setForm({ ...form, initAmount: e.target.value })}
                placeholder="e.g., 5000"
                className="tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Order Limit ({form.fiatUnit})</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Input
                    type="number"
                    value={form.minSingleTransAmount}
                    onChange={(e) => setForm({ ...form, minSingleTransAmount: e.target.value })}
                    placeholder="Min"
                    className="tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">Min Order</span>
                </div>
                <div className="space-y-1">
                  <Input
                    type="number"
                    value={form.maxSingleTransAmount}
                    onChange={(e) => setForm({ ...form, maxSingleTransAmount: e.target.value })}
                    placeholder="Max"
                    className="tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">Max Order</span>
                </div>
              </div>
            </div>
          </section>
          </div>

          <div className="space-y-4">
          {/* ─── Payment Methods ─────────────────────────────────────── */}
          <section className={SECTION}>
            <div className="flex items-center justify-between gap-2">
              <SectionTitle title="Payment Method" />
              <span className="text-xs text-muted-foreground">
                {isBuyAd ? 'Select from allowed methods' : 'From existing SELL ads'} · {form.selectedPayMethods.length}/5
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
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                      style={{ borderLeftWidth: 4, borderLeftColor: accentColor }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: accentColor }}>{iconLabel}</span>
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <Button variant="ghost" size="icon" aria-label="Remove payment method" className="h-6 w-6" onClick={() => togglePayMethod(m)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {noSellMethods && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <div className="text-xs text-warning">
                  No payment methods found in existing SELL ads. Please create a SELL ad on Binance first.
                </div>
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

            <div className="text-xs text-muted-foreground">Select up to 5 methods</div>

            {/* Payment Method Picker Dialog */}
            <Dialog open={showPayMethodPicker} onOpenChange={setShowPayMethodPicker}>
              <DialogContent className="max-w-md">
                <DialogHeader className="pr-8 text-left">
                  <DialogTitle className="text-base">Select payment method</DialogTitle>
                  <div className="text-xs text-muted-foreground">
                    {isBuyAd ? 'Select Payment Method (Up to 5 methods)' : 'Select up to 5 methods'} · {form.selectedPayMethods.length} selected
                  </div>
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
                              'flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-accent/40',
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
                          <AlertTriangle className="h-8 w-8 text-warning" />
                          <div className="text-sm text-muted-foreground text-center">
                            Binance returned no saved payment methods for this account. Add them in the Binance app (P2P → Payment Methods), then reopen this dialog.
                          </div>
                        </div>
                      ) : sellAdPayMethods.filter((m: any) => matchesPayMethodSearch(m, payMethodSearch.toLowerCase())).length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          No payment method matches “{payMethodSearch}”.
                        </div>
                      ) : (
                        sellAdPayMethods
                          .filter((m: any) => matchesPayMethodSearch(m, payMethodSearch.toLowerCase()))
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
                                  'flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-accent/40',
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

            <div className="space-y-1.5 border-t border-border pt-3">
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
          </section>


          {/* Terms & Conditions */}
          <section className={SECTION}>
            <SectionTitle title="Terms and Conditions" />
            <div className="space-y-1.5">
              <Label>Remarks (Optional)</Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Terms will be displayed to the counterparty"
                rows={3}
                maxLength={1000}
              />
              <div className="text-[10px] text-muted-foreground text-right tabular-nums">{form.remarks.length}/1000</div>
            </div>
            <div className="space-y-1.5">
              <Label>Auto Reply (Optional)</Label>
              <Textarea
                value={form.autoReplyMsg}
                onChange={(e) => setForm({ ...form, autoReplyMsg: e.target.value })}
                placeholder="Auto reply message sent when order is created"
                rows={2}
              />
            </div>
          </section>

          {/* Counterparty Conditions */}
          <section className={SECTION}>
            <SectionTitle title="Counterparty Conditions" />
            <div className="text-xs text-muted-foreground -mt-1">Adding counterparty requirements will reduce the exposure of your Ad</div>
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
                  className="w-20 text-center tabular-nums"
                  placeholder="0"
                />
                <span className="w-16 text-sm text-muted-foreground">day(s) ago</span>
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
                  className="w-20 text-center tabular-nums"
                  placeholder="0.01"
                />
                <span className="w-16 text-sm text-muted-foreground">BTC</span>
              </div>
            </div>
          </section>

           {/* Status — Radio Group: Online / Offline */}
          <section className={SECTION}>
            <SectionTitle title="Status" />
            <RadioGroup
              value={String(form.advStatus)}
              onValueChange={(v) => setForm({ ...form, advStatus: Number(v) })}
              className="flex flex-wrap gap-x-5 gap-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value={String(BINANCE_AD_STATUS.ONLINE)} id="status-online" />
                <Label htmlFor="status-online" className="cursor-pointer">Online</Label>
              </div>
              {isEditing && editingAd?.advStatus === BINANCE_AD_STATUS.PRIVATE && (
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={String(BINANCE_AD_STATUS.PRIVATE)} id="status-private" />
                  <Label htmlFor="status-private" className="cursor-pointer">
                    Private
                    <span className="ml-2 text-xs text-muted-foreground">Visible only via direct link (set in the Binance app)</span>
                  </Label>
                </div>
              )}

              <div className="flex items-center gap-2">
                <RadioGroupItem value={String(BINANCE_AD_STATUS.OFFLINE)} id="status-offline" />
                <Label htmlFor="status-offline" className="cursor-pointer">Offline</Label>
              </div>
            </RadioGroup>
          </section>
          </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-secondary/30 px-4 py-3 sm:gap-0 md:px-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || noSellMethods} className="min-w-[7rem]">
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Post'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
