import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { adZone, ZONE_LABEL, ZONE_SHORT } from '@/lib/adZone';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, User, AlertTriangle, X, GripVertical, Plus, Trash2, Info, Check, ExternalLink, RotateCcw,
  SlidersHorizontal, Crosshair, Coins, ShieldCheck, Clock,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import {
  useCreateAutoPricingRule,
  useUpdateAutoPricingRule,
  useSearchMerchant,
  AutoPricingRule,
  AssetConfig,
} from '@/hooks/useAutoPricingRules';
import { useBinanceAdsList, BinanceAd, getAdStatusLabel, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useExcludedAds } from '@/hooks/useAdAutomationExclusion';
import {
  Chip, HINT, ICON_BTN, ICON_BTN_DANGER, InlineNotice, LABEL, SCROLL_BOX, SEG_LIST, SEG_TRIGGER, SWITCH, UNIT,
} from './automationUi';

/* ── Presentation only: classes and small layout helpers for this dialog ─────────────────────────── */
/** Inputs and select triggers (the Terminal theme CSS draws their edge in both themes). */
const CONTROL = 'h-9 border-border';
const NUMERIC = 't-mono tabular-nums';
/** Numeric inputs: mono digits, placeholder in the UI face. */
const NUMERIC_INPUT = 't-mono tabular-nums placeholder:font-sans';
const SECTION_ITEM = 'border-b border-border last:border-b-0';
const SECTION_TRIGGER =
  'gap-3 rounded-md py-3.5 text-left hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:text-muted-foreground';
const SECTION_BODY = 'space-y-5 px-1 pb-5 pt-1';
/** Checkbox / switch rows on a light tint: their text stays in foreground colours (readable in the light theme). */
const TINT_ROW = 'rounded-md border border-border bg-secondary/20';

/** Help icon next to a label: tooltip on hover or keyboard focus. The hit area is padded to 32 px. */
function FieldHelp({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Help"
            className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-xs leading-5">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Label (+ optional help icon) above a control, optional hint below. The label text sits alone in its <label>. */
function FormField({
  id, label, help, hint, className, children,
}: { id: string; label: string; help?: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="flex min-h-4 items-center gap-1.5">
        <label htmlFor={id} className={LABEL}>{label}</label>
        {help ? <FieldHelp>{help}</FieldHelp> : null}
      </div>
      {children}
      {hint ? <p id={`${id}-hint`} className={HINT}>{hint}</p> : null}
    </div>
  );
}

/** Input with a unit (₹, %, min, s). The unit repeats the label's unit, so it is hidden from screen readers.
 *  A ₹ prefix sits inside the box on the left; a suffix (%, min, s) sits NEXT TO the box: inside it, the native spin
 *  buttons of a number field move under the field's centre, where a plain click would change the value.
 *  `wrapClassName` sizes the whole control (input + unit). */
function UnitInput({
  unit, unitSide = 'suffix', wrapClassName, className, ...props
}: React.ComponentProps<'input'> & { unit: string; unitSide?: 'prefix' | 'suffix'; wrapClassName?: string }) {
  if (unitSide === 'prefix') {
    return (
      <div className={cn('relative', wrapClassName)}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{unit}</span>
        <Input {...props} className={cn(CONTROL, NUMERIC_INPUT, 'pl-7', className)} />
      </div>
    );
  }
  return (
    <div className={cn('flex items-center gap-2', wrapClassName)}>
      <Input {...props} className={cn(CONTROL, NUMERIC_INPUT, 'min-w-0 flex-1', className)} />
      <span aria-hidden="true" className={UNIT}>{unit}</span>
    </div>
  );
}

/** Accordion section title: icon tile, title, muted live summary. The title is a text node in the same element as
 *  its summary, so "Competitor Target …" reads as one piece of text. */
function SectionTitle({ icon, children, summary }: { icon: React.ReactNode; children: string; summary?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary [&_svg]:h-3.5 [&_svg]:w-3.5"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left text-sm font-semibold leading-5 text-foreground">
        {children}{' '}
        {summary ? <span className="min-w-0 text-xs font-normal leading-4 text-muted-foreground">{summary}</span> : null}
      </span>
    </span>
  );
}

function ToggleCard({
  id, checked, onChange, label, description,
}: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <div className={cn(TINT_ROW, 'flex min-h-11 items-center gap-3 px-3 py-2')}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className={cn('shrink-0', SWITCH)} />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-xs font-medium leading-4 text-foreground">{label}</label>
      <FieldHelp>{description}</FieldHelp>
    </div>
  );
}

/** Asset picker toggle (aria-pressed). Plus / check icon keeps the width steady and shows the state without colour. */
const assetToggle = (on: boolean) =>
  cn(
    'inline-flex h-8 items-center gap-1 rounded-md border px-2.5 t-mono text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0',
    on
      ? 'border-primary/60 bg-primary/10 text-foreground [&_svg]:text-primary'
      : 'border-border text-muted-foreground hover:border-ring/40 hover:text-foreground',
  );

const ASSETS = ['USDT', 'BTC', 'USDC', 'FDUSD', 'BNB', 'ETH', 'TRX', 'SHIB', 'XRP', 'SOL', 'TON'];

const DEFAULT_ASSET_CONFIG: AssetConfig = {
  ad_numbers: [],
  offset_amount: 0,
  offset_pct: 0,
  max_ceiling: null,
  min_floor: null,
  max_ratio_ceiling: null,
  min_ratio_floor: null,
};

interface AutoPricingRuleDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingRule: AutoPricingRule | null;
}

export function AutoPricingRuleDialog({ open, onOpenChange, editingRule }: AutoPricingRuleDialogProps) {
  const createRule = useCreateAutoPricingRule();
  const updateRule = useUpdateAutoPricingRule();
  const searchMerchant = useSearchMerchant();
  const { data: excludedAds } = useExcludedAds();

  // Form state
  const [name, setName] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<string[]>(['USDT']);
  const [assetConfigs, setAssetConfigs] = useState<Record<string, AssetConfig>>({});
  const [activeAssetTab, setActiveAssetTab] = useState('USDT');
  // When on, offset / ceiling / floor entered on any asset tab applies to every selected asset.
  const [syncPricingAcrossAssets, setSyncPricingAcrossAssets] = useState(false);

  const [fiat] = useState('INR');
  const [tradeType, setTradeType] = useState('BUY');
  const [priceType, setPriceType] = useState('FIXED');
  const [priorityMerchants, setPriorityMerchants] = useState<string[]>(['']);
  const [newMerchantInput, setNewMerchantInput] = useState('');
  const [competitorZone, setCompetitorZone] = useState('p2p');
  const [competitorMode, setCompetitorMode] = useState('nickname');
  const [competitorBadges, setCompetitorBadges] = useState<string[]>(['Block', 'Shield']);
  const [badgeMatch, setBadgeMatch] = useState<'any'|'all'>('any');
  const [excludeMerchants, setExcludeMerchants] = useState('');

  const [onlyOnline, setOnlyOnline] = useState(false);
  const [competitorIdentities, setCompetitorIdentities] = useState<string[]>([]);
  const [minVipLevel, setMinVipLevel] = useState('');
  const [enforceZoneMatch, setEnforceZoneMatch] = useState(true);
  const [pauseNoMerchant, setPauseNoMerchant] = useState(false);
  const [ladderOnConflict, setLadderOnConflict] = useState(false);
  const [offsetDirection, setOffsetDirection] = useState('UNDERCUT');
  const [maxDeviation, setMaxDeviation] = useState('5');
  const [maxPriceChange, setMaxPriceChange] = useState('');
  const [maxRatioChange, setMaxRatioChange] = useState('');
  const [autoPauseDeviations, setAutoPauseDeviations] = useState('5');
  const [cooldownMinutes, setCooldownMinutes] = useState('0');
  const [activeStart, setActiveStart] = useState('');
  const [activeEnd, setActiveEnd] = useState('');
  const [restingPrice, setRestingPrice] = useState('');
  const [restingRatio, setRestingRatio] = useState('');
  const [checkInterval, setCheckInterval] = useState('120');

  // Merchant search preview — per-asset results
  const [searchResult, setSearchResult] = useState<any>(null);
  const [multiAssetSearchResults, setMultiAssetSearchResults] = useState<Record<string, { found: boolean; price?: string; userType?: string }>>({});
  const [isMultiSearching, setIsMultiSearching] = useState(false);

  // Fetch ads for ad selection
  // `fetchAll` is required: Binance's listWithPagination caps a page at ~20 ads
  // regardless of `rows`, so without it Block-zone / later ads never appear here.
  const { data: adsData } = useBinanceAdsList({ page: 1, rows: 50, fetchAll: true });
  const allAds: BinanceAd[] = adsData?.data || [];

  // Get current asset config
  const getConfig = (asset: string): AssetConfig => {
    return assetConfigs[asset] || { ...DEFAULT_ASSET_CONFIG };
  };

  const updateConfig = (asset: string, updates: Partial<AssetConfig>) => {
    setAssetConfigs(prev => ({
      ...prev,
      [asset]: { ...getConfig(asset), ...updates },
    }));
  };

  // Raw string state for numeric config inputs — prevents parseFloat coercion
  // from wiping intermediate text like "0." or ".05" while typing.
  const [rawNumeric, setRawNumeric] = useState<Record<string, string>>({});
  type NumericField = 'offset_amount' | 'offset_pct' | 'max_ceiling' | 'max_ratio_ceiling' | 'min_floor' | 'min_ratio_floor';
  const rawKey = (asset: string, field: NumericField) => `${asset}.${field}`;
  const numericDisplay = (asset: string, field: NumericField, cfgVal: number | null | undefined): string => {
    const raw = rawNumeric[rawKey(asset, field)];
    if (raw !== undefined) return raw;
    if (cfgVal === null || cfgVal === undefined || cfgVal === 0) return '';
    return String(cfgVal);
  };
  const handleNumericChange = (asset: string, field: NumericField, text: string) => {
    // When "apply to all assets" is on, the offset / ceiling / floor entered on
    // any tab is mirrored to every selected asset (raw text + parsed value).
    const targets = syncPricingAcrossAssets ? selectedAssets : [asset];
    setRawNumeric(prev => {
      const next = { ...prev };
      targets.forEach(a => { next[rawKey(a, field)] = text; });
      return next;
    });
    const parsed = text.trim() === '' ? null : parseFloat(text);
    const val = parsed !== null && isFinite(parsed) ? parsed : (field === 'offset_amount' || field === 'offset_pct' ? 0 : null);
    setAssetConfigs(prev => {
      const next = { ...prev };
      targets.forEach(a => {
        next[a] = { ...(prev[a] || { ...DEFAULT_ASSET_CONFIG }), [field]: val } as AssetConfig;
      });
      return next;
    });
  };

  // Turning the sync on immediately pushes the active tab's pricing bounds to
  // every selected asset, so what you see on one tab is what every asset gets.
  const PRICE_FIELDS: NumericField[] = ['offset_amount', 'offset_pct', 'max_ceiling', 'max_ratio_ceiling', 'min_floor', 'min_ratio_floor'];
  const handleSyncToggle = (checked: boolean) => {
    setSyncPricingAcrossAssets(checked);
    if (!checked) return;
    const source = assetConfigs[activeAssetTab] || { ...DEFAULT_ASSET_CONFIG };
    setRawNumeric(prev => {
      const next = { ...prev };
      PRICE_FIELDS.forEach(f => {
        const raw = prev[rawKey(activeAssetTab, f)];
        selectedAssets.forEach(a => {
          if (raw === undefined) delete next[rawKey(a, f)];
          else next[rawKey(a, f)] = raw;
        });
      });
      return next;
    });
    setAssetConfigs(prev => {
      const next = { ...prev };
      selectedAssets.forEach(a => {
        const base = prev[a] || { ...DEFAULT_ASSET_CONFIG };
        next[a] = {
          ...base,
          offset_amount: source.offset_amount,
          offset_pct: source.offset_pct,
          max_ceiling: source.max_ceiling,
          max_ratio_ceiling: source.max_ratio_ceiling,
          min_floor: source.min_floor,
          min_ratio_floor: source.min_ratio_floor,
        } as AssetConfig;
      });
      return next;
    });
  };

  // Assets added while the sync is on inherit the shared pricing bounds too.
  useEffect(() => {
    if (!syncPricingAcrossAssets) return;
    setAssetConfigs(prev => {
      const source = prev[activeAssetTab] || { ...DEFAULT_ASSET_CONFIG };
      let changed = false;
      const next = { ...prev };
      selectedAssets.forEach(a => {
        const base = prev[a] || { ...DEFAULT_ASSET_CONFIG };
        const differs = PRICE_FIELDS.some(f => (base as any)[f] !== (source as any)[f]);
        if (!differs && prev[a]) return;
        changed = true;
        next[a] = {
          ...base,
          offset_amount: source.offset_amount,
          offset_pct: source.offset_pct,
          max_ceiling: source.max_ceiling,
          max_ratio_ceiling: source.max_ratio_ceiling,
          min_floor: source.min_floor,
          min_ratio_floor: source.min_ratio_floor,
        } as AssetConfig;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssets, syncPricingAcrossAssets]);



  // Resolve final numeric value at save time (raw text wins so trailing digits are kept)
  const resolveNumeric = (asset: string, field: NumericField, cfgVal: number | null | undefined): number | null => {
    const raw = rawNumeric[rawKey(asset, field)];
    if (raw !== undefined) {
      if (raw.trim() === '') return field === 'offset_amount' || field === 'offset_pct' ? 0 : null;
      const n = parseFloat(raw);
      return isFinite(n) ? n : (field === 'offset_amount' || field === 'offset_pct' ? 0 : null);
    }
    return cfgVal ?? (field === 'offset_amount' || field === 'offset_pct' ? 0 : null);
  };

  // Filter ads for a specific asset — scoped to the selected market zone so a
  // Block-zone rule only lists Block ads and a P2P rule only lists P2P ads.
  const getFilteredAds = (asset: string) => {
    return allAds.filter(ad => {
      if (ad.asset !== asset) return false;
      if (tradeType === 'BUY' && ad.tradeType !== 'BUY') return false;
      if (tradeType === 'SELL' && ad.tradeType !== 'SELL') return false;
      if (adZone(ad) !== competitorZone) return false;
      return true;
    });
  };

  // When the market zone changes, drop previously selected ads that are
  // CONFIRMED to belong to a different zone. Ads not present in the loaded
  // list are kept — the list loads asynchronously and may be incomplete, so
  // an unknown advNo must never cause a stored selection to be wiped.
  useEffect(() => {
    if (allAds.length === 0) return;
    setAssetConfigs(prev => {
      let changed = false;
      const next: typeof prev = {};
      for (const [asset, cfg] of Object.entries(prev)) {
        const kept = cfg.ad_numbers.filter(no => {
          const ad = allAds.find(a => a.advNo === no);
          return ad ? adZone(ad) === competitorZone : true;
        });
        if (kept.length !== cfg.ad_numbers.length) changed = true;
        next[asset] = kept.length === cfg.ad_numbers.length ? cfg : { ...cfg, ad_numbers: kept };
      }
      return changed ? next : prev;
    });
  }, [competitorZone, allAds]);

  // DnD sensors for priority merchants
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleMerchantDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPriorityMerchants(prev => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const addMerchant = () => {
    const name = newMerchantInput.trim();
    if (!name || priorityMerchants.includes(name)) return;
    setPriorityMerchants(prev => [...prev, name]);
    setNewMerchantInput('');
  };

  const removeMerchant = (nickname: string) => {
    setPriorityMerchants(prev => prev.filter(m => m !== nickname));
  };

  const updateMerchantAt = (index: number, value: string) => {
    setPriorityMerchants(prev => prev.map((m, i) => i === index ? value : m));
  };

  useEffect(() => {
    if (editingRule) {
      setName(editingRule.name);
      const assets = editingRule.assets?.length > 0 ? editingRule.assets : [editingRule.asset];
      setSelectedAssets(assets);
      setActiveAssetTab(assets[0]);
      setAssetConfigs(editingRule.asset_config || {});
      setTradeType(editingRule.trade_type);
      setPriceType(editingRule.price_type);
      // Reconstruct priority list: target_merchant first, then fallbacks
      const merchants = [editingRule.target_merchant, ...(editingRule.fallback_merchants || [])].filter(Boolean);
      setPriorityMerchants(merchants.length > 0 ? merchants : ['']);
      setCompetitorZone((editingRule as any).competitor_zone || 'p2p');
      setCompetitorMode((editingRule as any).competitor_mode || 'nickname');
      setRawNumeric({});
      setCompetitorBadges((editingRule as any).competitor_badges || ['Block', 'Shield']);
      setBadgeMatch((editingRule as any).competitor_badge_match === 'all' ? 'all' : 'any');
      setCompetitorIdentities((editingRule as any).competitor_identities || []);
      setMinVipLevel((editingRule as any).min_vip_level !== null && (editingRule as any).min_vip_level !== undefined ? String((editingRule as any).min_vip_level) : '');
      setEnforceZoneMatch((editingRule as any).enforce_zone_match !== false);
      setExcludeMerchants(((editingRule as any).exclude_merchants || []).join(', '));
      setOnlyOnline(editingRule.only_counter_when_online);

      setPauseNoMerchant(editingRule.pause_if_no_merchant_found);
      setLadderOnConflict((editingRule as any).ladder_conflict_resolution === true);
      setOffsetDirection(editingRule.offset_direction);
      setMaxDeviation(String(editingRule.max_deviation_from_market_pct));
      setMaxPriceChange(editingRule.max_price_change_per_cycle ? String(editingRule.max_price_change_per_cycle) : '');
      setMaxRatioChange(editingRule.max_ratio_change_per_cycle ? String(editingRule.max_ratio_change_per_cycle) : '');
      setAutoPauseDeviations(String(editingRule.auto_pause_after_deviations));
      setCooldownMinutes(String(editingRule.manual_override_cooldown_minutes));
      setActiveStart(editingRule.active_hours_start || '');
      setActiveEnd(editingRule.active_hours_end || '');
      setRestingPrice(editingRule.resting_price ? String(editingRule.resting_price) : '');
      setRestingRatio(editingRule.resting_ratio ? String(editingRule.resting_ratio) : '');
      setCheckInterval(String(editingRule.check_interval_seconds));
    } else {
      setName(''); setSelectedAssets(['USDT']); setActiveAssetTab('USDT');
      setAssetConfigs({}); setRawNumeric({}); setTradeType('BUY'); setPriceType('FIXED');
      setSyncPricingAcrossAssets(false);

      setPriorityMerchants(['']);
      setCompetitorZone('p2p'); setCompetitorMode('nickname');
      setCompetitorBadges(['Block', 'Shield']); setBadgeMatch('any'); setExcludeMerchants('');

      setOnlyOnline(false); setPauseNoMerchant(false); setLadderOnConflict(false);
      setOffsetDirection('UNDERCUT');
      setMaxDeviation('5'); setMaxPriceChange(''); setMaxRatioChange('');
      setAutoPauseDeviations('5'); setCooldownMinutes('0');
      setActiveStart(''); setActiveEnd(''); setRestingPrice(''); setRestingRatio('');
      setCheckInterval('120');
    }
    setSearchResult(null);
    setMultiAssetSearchResults({});
    setIsMultiSearching(false);
    setNewMerchantInput('');
    // Depend on the rule *id*, not the object: the rules list is polled, so a new object
    // identity every refetch would re-seed the form and wipe whatever is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRule?.id, open]);

  const handleSearchMerchant = async (nickname: string) => {
    if (!nickname.trim()) return;
    setIsMultiSearching(true);
    setSearchResult(null);
    setMultiAssetSearchResults({});

    const results: Record<string, { found: boolean; price?: string; userType?: string }> = {};
    let firstFound: any = null;

    // Search across all selected assets in parallel
    const searches = selectedAssets.map(async (asset) => {
      try {
        const data = await searchMerchant.mutateAsync({ asset, fiat, tradeType, nickname });
        if (data?.target) {
          results[asset] = { found: true, price: data.target.price, userType: data.target.userType };
          if (!firstFound) firstFound = data;
        } else {
          results[asset] = { found: false };
        }
      } catch {
        results[asset] = { found: false };
      }
    });

    await Promise.all(searches);
    setMultiAssetSearchResults(results);
    setSearchResult(firstFound);
    setIsMultiSearching(false);
  };

  const toggleAsset = (asset: string) => {
    setSelectedAssets(prev => {
      if (prev.includes(asset)) {
        if (prev.length === 1) return prev; // Must have at least 1
        const next = prev.filter(a => a !== asset);
        if (activeAssetTab === asset) setActiveAssetTab(next[0]);
        return next;
      }
      return [...prev, asset];
    });
  };

  const toggleAdForAsset = (asset: string, advNo: string) => {
    const config = getConfig(asset);
    const adNos = new Set(config.ad_numbers);
    adNos.has(advNo) ? adNos.delete(advNo) : adNos.add(advNo);
    updateConfig(asset, { ad_numbers: Array.from(adNos) });
  };

  const selectAllAdsForAsset = (asset: string) => {
    const filtered = getFilteredAds(asset);
    const config = getConfig(asset);
    const allNos = filtered.map(a => a.advNo);
    const allSelected = allNos.every(no => config.ad_numbers.includes(no));
    if (allSelected) {
      updateConfig(asset, { ad_numbers: config.ad_numbers.filter(no => !allNos.includes(no)) });
    } else {
      updateConfig(asset, { ad_numbers: [...new Set([...config.ad_numbers, ...allNos])] });
    }
  };

  const handleSave = () => {
    const validMerchants = priorityMerchants.filter(m => m.trim());
    const primaryMerchant = validMerchants[0] || '';
    const fallbackMerchants = validMerchants.slice(1);
    
    // Collect all ad_numbers across all assets for backward compat
    const allAdNumbers = selectedAssets.flatMap(a => getConfig(a).ad_numbers);
    
    // Build clean asset_config
    const cleanConfig: Record<string, AssetConfig> = {};
    for (const asset of selectedAssets) {
      const cfg = getConfig(asset);
      cleanConfig[asset] = {
        ad_numbers: cfg.ad_numbers,
        offset_amount: resolveNumeric(asset, 'offset_amount', cfg.offset_amount) || 0,
        offset_pct: resolveNumeric(asset, 'offset_pct', cfg.offset_pct) || 0,
        max_ceiling: resolveNumeric(asset, 'max_ceiling', cfg.max_ceiling),
        min_floor: resolveNumeric(asset, 'min_floor', cfg.min_floor),
        max_ratio_ceiling: resolveNumeric(asset, 'max_ratio_ceiling', cfg.max_ratio_ceiling),
        min_ratio_floor: resolveNumeric(asset, 'min_ratio_floor', cfg.min_ratio_floor),
      };
    }

    const payload: any = {
      name,
      asset: selectedAssets[0], // backward compat
      assets: selectedAssets,
      asset_config: cleanConfig,
      fiat,
      trade_type: tradeType,
      price_type: priceType,
      target_merchant: primaryMerchant,
      fallback_merchants: fallbackMerchants,
      competitor_zone: competitorZone,
      competitor_mode: competitorMode,
      competitor_badges: competitorMode === 'top_badged' ? competitorBadges : [],
      competitor_badge_match: competitorMode === 'top_badged' && badgeMatch === 'all' ? 'all' : 'any',
      exclude_merchants: excludeMerchants.split(',').map(s => s.trim()).filter(Boolean),

      ad_numbers: allAdNumbers,
      offset_direction: offsetDirection,
      offset_amount: 0, // defaults; per-asset overrides in asset_config
      offset_pct: 0,
      max_ceiling: null,
      min_floor: null,
      max_ratio_ceiling: null,
      min_ratio_floor: null,
      max_deviation_from_market_pct: Number.isFinite(parseFloat(maxDeviation)) ? parseFloat(maxDeviation) : 5,
      max_price_change_per_cycle: maxPriceChange ? parseFloat(maxPriceChange) : null,
      max_ratio_change_per_cycle: maxRatioChange ? parseFloat(maxRatioChange) : null,
      auto_pause_after_deviations: Number.isFinite(parseInt(autoPauseDeviations)) ? parseInt(autoPauseDeviations) : 5,
      manual_override_cooldown_minutes: parseInt(cooldownMinutes) || 0,
      only_counter_when_online: onlyOnline,
      competitor_identities: competitorMode === 'top_badged' ? competitorIdentities : [],
      min_vip_level: competitorMode === 'top_badged' && minVipLevel !== '' ? Number(minVipLevel) : null,
      enforce_zone_match: enforceZoneMatch,
      pause_if_no_merchant_found: pauseNoMerchant,
      ladder_conflict_resolution: ladderOnConflict,
      active_hours_start: activeStart || null,
      active_hours_end: activeEnd || null,
      resting_price: restingPrice ? parseFloat(restingPrice) : null,
      resting_ratio: restingRatio ? parseFloat(restingRatio) : null,
      check_interval_seconds: parseInt(checkInterval) || 120,
    };

    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      createRule.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isFixed = priceType === 'FIXED';
  const totalAds = selectedAssets.reduce((sum, a) => sum + getConfig(a).ad_numbers.length, 0);

  // Zone consistency: ads whose live Binance `classify` is outside the targeted zone.
  const mismatchedZoneAds = useMemo(() => {
    const selected = new Set(selectedAssets.flatMap(a => getConfig(a).ad_numbers));
    return allAds.filter(ad => selected.has(ad.advNo) && adZone(ad) !== competitorZone);
  }, [selectedAssets, assetConfigs, allAds, competitorZone]);

  // ── Read-only summaries for the section headers (display only: nothing here is saved) ──
  const shown = (v: string) => (String(v ?? '').trim() !== '' && Number.isFinite(Number(v)) ? String(v).trim() : '—');
  const hhmm = (v: string) => (v ? v.slice(0, 5) : '');
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const isOvercut = offsetDirection === 'OVERCUT';
  const merchantCount = priorityMerchants.filter(m => m.trim()).length;
  const assetList = selectedAssets.length > 3
    ? `${selectedAssets.slice(0, 3).join(', ')} +${selectedAssets.length - 3}`
    : selectedAssets.join(', ');
  const basicSummary = `${tradeType} · ${isFixed ? 'Fixed' : 'Floating'} · ${isOvercut ? 'Overcut' : 'Undercut'} · ${assetList}`;
  const competitorSummary = `${competitorZone === 'block' ? 'Block zone' : 'P2P zone'} · ${competitorMode === 'top_badged' ? `top ${competitorBadges.join(badgeMatch === 'all' ? ' + ' : '/') || 'any'}` : plural(merchantCount, 'merchant')}`;
  const perAssetSummary = `${plural(totalAds, 'ad')} across ${plural(selectedAssets.length, 'asset')}`;
  const autoPause = shown(autoPauseDeviations);
  const safetySummary = [
    shown(maxDeviation) === '—' ? 'max deviation not set' : `max deviation ${shown(maxDeviation)}%`,
    autoPause === '0' ? 'no auto-pause' : autoPause === '—' ? 'auto-pause not set' : `auto-pause after ${autoPause}`,
  ].join(' · ');
  const scheduleSummary = [
    activeStart || activeEnd ? `${hhmm(activeStart) || '…'}–${hhmm(activeEnd) || '…'} IST` : '24/7',
    isFixed ? (restingPrice ? `rests at ₹${restingPrice}` : 'no resting price') : (restingRatio ? `rests at ${restingRatio}%` : 'no resting ratio'),
    shown(checkInterval) === '—' ? 'interval not set' : `every ${shown(checkInterval)} s`,
  ].join(' · ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="t-scale-in flex max-h-[88vh] flex-col gap-0 overflow-hidden border-border bg-card p-0 md:max-h-[90vh] md:max-w-3xl md:p-0 lg:max-w-4xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-12 text-left md:px-6 md:py-4 md:pr-14">
          <DialogTitle className="text-base font-semibold leading-6">{editingRule ? 'Edit' : 'Create'} Auto-Pricing Rule</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Reprices the selected ads against a competitor in one market zone, within the limits set below.
          </DialogDescription>
        </DialogHeader>

        {/* The only scroll region: the header and the footer stay in view. `relative` keeps absolutely positioned
            descendants (sr-only text, adornments) inside it, so the dialog box itself never scrolls on phones. */}
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-6">
          <Accordion type="multiple" defaultValue={['basic', 'merchants', 'assets-config', 'anti-exploit']}>
            {/* Section 1: Basic */}
            <AccordionItem value="basic" className={SECTION_ITEM}>
              <AccordionTrigger className={SECTION_TRIGGER}>
                <SectionTitle icon={<SlidersHorizontal />} summary={basicSummary}>Basic Settings</SectionTitle>
              </AccordionTrigger>
              <AccordionContent className={SECTION_BODY}>
                <FormField id="apr-name" label="Rule Name">
                  <Input
                    id="apr-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Altcoin Buy Undercut"
                    aria-required="true"
                    className={CONTROL}
                  />
                </FormField>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FormField
                    id="apr-trade-type"
                    label="Trade Type"
                    help="Side of your own ads. A terminal BUY ad competes on Binance's SELL page, so that is the book the engine watches."
                  >
                    <Select value={tradeType} onValueChange={setTradeType}>
                      <SelectTrigger id="apr-trade-type" className={CONTROL}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUY">BUY (Terminal)</SelectItem>
                        <SelectItem value="SELL">SELL (Terminal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField
                    id="apr-price-type"
                    label="Price Type"
                    help="Fixed = an absolute ₹ price. Floating = a percentage of the Binance index price."
                  >
                    <Select value={priceType} onValueChange={setPriceType}>
                      <SelectTrigger id="apr-price-type" className={CONTROL}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">Fixed</SelectItem>
                        <SelectItem value="FLOATING">Floating</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField
                    id="apr-direction"
                    label="Direction"
                    help="Overcut places you above the target price, undercut below it, by the offset configured per asset."
                  >
                    <Select value={offsetDirection} onValueChange={setOffsetDirection}>
                      <SelectTrigger id="apr-direction" className={CONTROL}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OVERCUT">Overcut (+)</SelectItem>
                        <SelectItem value="UNDERCUT">Undercut (−)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
                {/* Asset selection: toggle buttons (keyboard + screen reader), same order and click logic */}
                <div className="space-y-2">
                  <p id="apr-assets-label" className={LABEL}>
                    Assets <span className="font-normal text-muted-foreground">({selectedAssets.length} selected)</span>
                  </p>
                  <div role="group" aria-labelledby="apr-assets-label" className="flex flex-wrap gap-1.5">
                    {ASSETS.map(a => {
                      const on = selectedAssets.includes(a);
                      return (
                        <button
                          key={a}
                          type="button"
                          aria-pressed={on}
                          title={on && selectedAssets.length === 1 ? 'At least one asset is required' : undefined}
                          className={assetToggle(on)}
                          onClick={() => toggleAsset(a)}
                        >
                          {on ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                          {a}
                        </button>
                      );
                    })}
                  </div>
                  <p className={HINT}>Each selected asset gets its own offset, limits and ads under Per-Asset Config.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Competitor target */}
            <AccordionItem value="merchants" className={SECTION_ITEM}>
              <AccordionTrigger className={SECTION_TRIGGER}>
                <SectionTitle icon={<Crosshair />} summary={competitorSummary}>Competitor Target</SectionTitle>
              </AccordionTrigger>
              <AccordionContent className={SECTION_BODY}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    id="apr-zone"
                    label="Market Zone"
                    help="Which Binance order book to read: the public P2P book or the block-trading book. They price very differently."
                  >
                    <Select value={competitorZone} onValueChange={setCompetitorZone}>
                      <SelectTrigger id="apr-zone" className={CONTROL}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="p2p">P2P zone (mass + profession)</SelectItem>
                        <SelectItem value="block">Block zone (block ads)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField
                    id="apr-mode"
                    label="Targeting Mode"
                    help="Follow specific nicknames in priority order, or always follow whoever is top of the zone with the chosen badge."
                  >
                    <Select value={competitorMode} onValueChange={setCompetitorMode}>
                      <SelectTrigger id="apr-mode" className={CONTROL}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nickname">Named merchants (priority list)</SelectItem>
                        <SelectItem value="top_badged">Top badged merchant in zone</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>

                {competitorMode === 'top_badged' && (
                  <div className="space-y-4 rounded-md border border-border p-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p id="apr-badges-label" className={LABEL}>Trust badge on the advertiser</p>
                        <a
                          href="https://www.binance.com/en/support/faq/how-to-become-a-p2p-merchant-on-binance-360033161811"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Binance merchant reference
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </div>
                      <div role="group" aria-labelledby="apr-badges-label" className="flex flex-wrap gap-x-6">
                        {[
                          { b: 'Block', d: 'Block-trading merchant badge (large-size OTC style ads)' },
                          { b: 'Shield', d: 'Verified merchant shield — deposit-backed, higher trust tier' },
                        ].map(({ b, d }) => (
                          <div key={b} className="flex min-h-8 items-center gap-2">
                            <Checkbox
                              id={`apr-badge-${b}`}
                              checked={competitorBadges.includes(b)}
                              onCheckedChange={(c) => setCompetitorBadges(prev => c ? [...new Set([...prev, b])] : prev.filter(x => x !== b))}
                            />
                            <label htmlFor={`apr-badge-${b}`} className="cursor-pointer text-xs font-medium text-foreground">{b} badge</label>
                            <FieldHelp>{d}</FieldHelp>
                          </div>
                        ))}
                      </div>
                    </div>
                    {competitorBadges.length > 1 && (
                      <FormField id="apr-badge-match" label="Badge matching" className="sm:max-w-sm">
                        <Select value={badgeMatch} onValueChange={(v) => setBadgeMatch(v === 'all' ? 'all' : 'any')}>
                          <SelectTrigger id="apr-badge-match" className={CONTROL}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any selected badge (Block OR Shield)</SelectItem>
                            <SelectItem value="all">All selected badges (Block AND Shield)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex min-h-4 items-center gap-1.5">
                          <p id="apr-class-label" className={LABEL}>Account class</p>
                          <FieldHelp>Binance advertiser account type, separate from the trust badge. Mass merchants are standard retail merchants; block merchants are approved for block/OTC-size trades.</FieldHelp>
                        </div>
                        <div role="group" aria-labelledby="apr-class-label">
                          {[
                            { v: 'MASS_MERCHANT', l: 'Mass merchant' },
                            { v: 'BLOCK_MERCHANT', l: 'Block merchant' },
                          ].map(o => (
                            <div key={o.v} className="flex min-h-8 items-center gap-2">
                              <Checkbox
                                id={`apr-class-${o.v}`}
                                checked={competitorIdentities.includes(o.v)}
                                onCheckedChange={(c) => setCompetitorIdentities(prev => c ? [...new Set([...prev, o.v])] : prev.filter(x => x !== o.v))}
                              />
                              <label htmlFor={`apr-class-${o.v}`} className="cursor-pointer text-xs font-medium text-foreground">{o.l}</label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <FormField
                        id="apr-min-vip"
                        label="Minimum VIP level"
                        help="Binance VIP tier of the advertiser. Advertisers below this level are ignored when picking the target."
                      >
                        <Input
                          id="apr-min-vip"
                          value={minVipLevel}
                          onChange={e => setMinVipLevel(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="any"
                          inputMode="numeric"
                          className={cn(CONTROL, NUMERIC_INPUT, 'w-24')}
                        />
                      </FormField>
                    </div>

                    <FormField id="apr-exclude" label="Exclude nicknames (comma separated)" hint="Own accounts are auto-skipped.">
                      <Input
                        id="apr-exclude"
                        value={excludeMerchants}
                        onChange={e => setExcludeMerchants(e.target.value)}
                        placeholder="BlynkEx, MyOtherAccount"
                        aria-describedby="apr-exclude-hint"
                        className={CONTROL}
                      />
                    </FormField>
                  </div>
                )}

                {competitorMode === 'nickname' && (
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <p className={LABEL}>Priority list</p>
                      <p className={HINT}>
                        Priority 1 is always used first; if it fails thresholds or is offline, Priority 2 takes over, and so on.
                        Reorder by dragging a handle (keyboard: Space, arrow keys, Space).
                      </p>
                    </div>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMerchantDragEnd}>
                      <SortableContext items={priorityMerchants} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1.5">
                          {priorityMerchants.map((merchant, index) => (
                            <SortableMerchantItem
                              key={merchant || `empty-${index}`}
                              id={merchant || `empty-${index}`}
                              index={index}
                              value={merchant}
                              onChange={(val) => updateMerchantAt(index, val)}
                              onRemove={() => removeMerchant(merchant)}
                              onPreview={() => handleSearchMerchant(merchant)}
                              isSearching={isMultiSearching || searchMerchant.isPending}
                              canRemove={priorityMerchants.length > 1}
                              isDraggable={priorityMerchants.length > 1 && merchant.trim() !== ''}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {/* Add merchant (aligned with the nickname inputs above) */}
                    <div className="flex items-center gap-1.5 pl-16">
                      <Input
                        value={newMerchantInput}
                        onChange={e => setNewMerchantInput(e.target.value)}
                        placeholder="Add merchant nickname..."
                        aria-label="Add merchant nickname"
                        className={cn(CONTROL, 'h-8 min-w-0 flex-1 border-dashed')}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMerchant())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 shrink-0 p-0"
                        onClick={addMerchant}
                        disabled={!newMerchantInput.trim()}
                        aria-label="Add merchant"
                        title="Add merchant"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>

                    {isMultiSearching && (
                      <p role="status" className={cn(HINT, 'flex items-center gap-1.5 pl-16')}>
                        <Search className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Checking the selected assets…
                      </p>
                    )}

                    {/* Merchant preview: profile + availability per selected asset */}
                    {Object.keys(multiAssetSearchResults).length > 0 && (
                      <div className="space-y-3 rounded-md border border-border p-3">
                        {searchResult?.target && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="truncate font-semibold text-foreground">{searchResult.target.nickName}</span>
                              <Chip tone="neutral">{searchResult.target.userType}</Chip>
                            </span>
                            <span className="text-muted-foreground">
                              Completion Rate: <span className={cn(NUMERIC, 'font-medium text-foreground')}>{(Number(searchResult.target.completionRate) * 100).toFixed(1)}%</span>
                            </span>
                            <span className="text-muted-foreground">
                              Monthly Orders: <span className={cn(NUMERIC, 'font-medium text-foreground')}>{searchResult.target.orderCount}</span>
                            </span>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <p className={HINT}>Availability across assets:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedAssets.map(asset => {
                              const r = multiAssetSearchResults[asset];
                              if (!r) return null;
                              return r.found ? (
                                <Chip key={asset} tone="success" mono>
                                  <Check aria-hidden="true" />
                                  {asset} ₹{Number(r.price).toLocaleString('en-IN')}
                                </Chip>
                              ) : (
                                <Chip key={asset} tone="neutral" mono>
                                  <X aria-hidden="true" />
                                  {asset} not found
                                </Chip>
                              );
                            })}
                          </div>
                          {Object.values(multiAssetSearchResults).every(r => !r.found) && (
                            <p className="flex items-center gap-1.5 text-xs text-foreground">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                              Merchant not found in any selected asset's top 500 listings
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <p className={LABEL}>Behaviour</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ToggleCard
                      id="apr-only-online"
                      checked={onlyOnline}
                      onChange={setOnlyOnline}
                      label="Only counter when online"
                      description="Ignore the target merchant while their ad is offline/hidden on Binance, instead of pricing against a stale listing."
                    />
                    <ToggleCard
                      id="apr-enforce-zone"
                      checked={enforceZoneMatch}
                      onChange={setEnforceZoneMatch}
                      label="Enforce targeted zone"
                      description={`Reprice only your ads in the ${competitorZone === 'block' ? 'Block' : 'P2P'} zone. Ads in the other zone are skipped (logged as zone_mismatch).`}
                    />
                    <ToggleCard
                      id="apr-pause-missing"
                      checked={pauseNoMerchant}
                      onChange={setPauseNoMerchant}
                      label="Pause if target not found"
                      description="Pause the rule when none of the target merchants appear in the order book, instead of leaving ads at their last price."
                    />
                    <ToggleCard
                      id="apr-ladder"
                      checked={ladderOnConflict}
                      onChange={setLadderOnConflict}
                      label="Auto price-ladder on 0.5% conflict"
                      description="When Binance rejects the new price because another of your own ads of the same asset sits within 0.5%, re-space every ad of that asset in this zone into a 0.51% ladder (lowest first), then retry this ad."
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 3: Per-asset configuration */}
            <AccordionItem value="assets-config" className={SECTION_ITEM}>
              <AccordionTrigger className={SECTION_TRIGGER}>
                <SectionTitle icon={<Coins />} summary={perAssetSummary}>Per-Asset Config</SectionTitle>
              </AccordionTrigger>
              <AccordionContent className={SECTION_BODY}>
                {mismatchedZoneAds.length > 0 && (
                  <InlineNotice
                    tone="warning"
                    title={`${mismatchedZoneAds.length} selected ${mismatchedZoneAds.length === 1 ? 'ad is' : 'ads are'} not in the ${ZONE_LABEL[competitorZone as 'p2p' | 'block']}`}
                  >
                    <p>
                      {enforceZoneMatch
                        ? 'The engine will skip these ads and log a zone_mismatch entry, so they will never be repriced by this rule.'
                        : 'Zone enforcement is OFF — these ads would be repriced against a different order book. Turn on “Enforce targeted zone” or deselect them.'}
                    </p>
                    <p className="t-mono mt-1 break-all">
                      {mismatchedZoneAds.slice(0, 6).map(ad => `…${ad.advNo.slice(-8)} (${ZONE_SHORT[adZone(ad)]})`).join(', ')}
                      {mismatchedZoneAds.length > 6 ? ` +${mismatchedZoneAds.length - 6} more` : ''}
                    </p>
                  </InlineNotice>
                )}

                {selectedAssets.length > 1 && (
                  <div className={cn(TINT_ROW, 'flex items-start gap-2.5 px-3 py-2.5')}>
                    <Checkbox
                      id="sync-pricing-all-assets"
                      checked={syncPricingAcrossAssets}
                      onCheckedChange={c => handleSyncToggle(c === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="sync-pricing-all-assets" className="cursor-pointer text-xs font-medium leading-5 text-foreground">
                      Apply the same offset, max ceiling and min floor to all {selectedAssets.length} assets
                    </label>
                  </div>
                )}

                <Tabs value={activeAssetTab} onValueChange={setActiveAssetTab}>
                  <TabsList
                    aria-label="Per-asset settings"
                    className={cn(SEG_LIST, 'h-auto min-h-8 w-auto max-w-full flex-wrap justify-start')}
                  >
                    {selectedAssets.map(asset => {
                      const n = getConfig(asset).ad_numbers.length;
                      return (
                        // 32 px tap targets on phones (28 px on wider screens, like the page's segmented strip).
                        <TabsTrigger key={asset} value={asset} className={cn(SEG_TRIGGER, 't-mono max-sm:h-8')}>
                          {asset}
                          {n > 0 && <span className="tabular-nums text-[11px]">({n})</span>}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {selectedAssets.map(asset => {
                    const cfg = getConfig(asset);
                    const filteredAds = getFilteredAds(asset);

                    return (
                      <TabsContent key={asset} value={asset} className="mt-4 space-y-5 focus-visible:ring-offset-card">
                        {/* Offset and limits for this asset */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {isFixed ? (
                            <FormField
                              id={`apr-${asset}-offset`}
                              label={`Offset Amount (₹) for ${asset}`}
                              hint={isOvercut ? 'Added to the target’s price (Overcut).' : 'Subtracted from the target’s price (Undercut).'}
                            >
                              <UnitInput
                                id={`apr-${asset}-offset`}
                                unit="₹"
                                unitSide="prefix"
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'offset_amount', cfg.offset_amount)}
                                onChange={e => handleNumericChange(asset, 'offset_amount', e.target.value)}
                                placeholder="e.g. 0.05"
                                aria-describedby={`apr-${asset}-offset-hint`}
                                wrapClassName="w-full max-w-[10rem]"
                              />
                            </FormField>
                          ) : (
                            <FormField
                              id={`apr-${asset}-offset`}
                              label={`Offset % for ${asset}`}
                              hint={isOvercut ? 'Percent of the target’s ratio, above it (Overcut).' : 'Percent of the target’s ratio, below it (Undercut).'}
                            >
                              <UnitInput
                                id={`apr-${asset}-offset`}
                                unit="%"
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'offset_pct', cfg.offset_pct)}
                                onChange={e => handleNumericChange(asset, 'offset_pct', e.target.value)}
                                placeholder="e.g. 0.05"
                                aria-describedby={`apr-${asset}-offset-hint`}
                                wrapClassName="w-full max-w-[10rem]"
                              />
                            </FormField>
                          )}
                          {isFixed ? (
                            <FormField id={`apr-${asset}-ceiling`} label="Max Ceiling (₹)">
                              <UnitInput
                                id={`apr-${asset}-ceiling`}
                                unit="₹"
                                unitSide="prefix"
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'max_ceiling', cfg.max_ceiling)}
                                onChange={e => handleNumericChange(asset, 'max_ceiling', e.target.value)}
                                placeholder="No max"
                                wrapClassName="w-full max-w-[10rem]"
                              />
                            </FormField>
                          ) : (
                            <FormField id={`apr-${asset}-ceiling`} label="Max Ratio Ceiling (%)">
                              <UnitInput
                                id={`apr-${asset}-ceiling`}
                                unit="%"
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'max_ratio_ceiling', cfg.max_ratio_ceiling)}
                                onChange={e => handleNumericChange(asset, 'max_ratio_ceiling', e.target.value)}
                                placeholder="No max"
                                wrapClassName="w-full max-w-[10rem]"
                              />
                            </FormField>
                          )}
                          {isFixed ? (
                            <FormField id={`apr-${asset}-floor`} label="Min Floor (₹)">
                              <UnitInput
                                id={`apr-${asset}-floor`}
                                unit="₹"
                                unitSide="prefix"
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'min_floor', cfg.min_floor)}
                                onChange={e => handleNumericChange(asset, 'min_floor', e.target.value)}
                                placeholder="No min"
                                wrapClassName="w-full max-w-[10rem]"
                              />
                            </FormField>
                          ) : (
                            <FormField id={`apr-${asset}-floor`} label="Min Ratio Floor (%)">
                              <UnitInput
                                id={`apr-${asset}-floor`}
                                unit="%"
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'min_ratio_floor', cfg.min_ratio_floor)}
                                onChange={e => handleNumericChange(asset, 'min_ratio_floor', e.target.value)}
                                placeholder="No min"
                                wrapClassName="w-full max-w-[10rem]"
                              />
                            </FormField>
                          )}
                        </div>

                        {/* Ad selection for this asset */}
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <p id={`apr-${asset}-ads-label`} className={LABEL}>
                              Ads for {asset} <span className="font-normal text-muted-foreground">({cfg.ad_numbers.length} selected)</span>
                            </p>
                            {filteredAds.length > 0 && (
                              <div className="flex min-h-8 items-center gap-2">
                                <Checkbox
                                  id={`apr-${asset}-select-all`}
                                  checked={filteredAds.length > 0 && filteredAds.every(a => cfg.ad_numbers.includes(a.advNo))}
                                  onCheckedChange={() => selectAllAdsForAsset(asset)}
                                />
                                <label htmlFor={`apr-${asset}-select-all`} className="cursor-pointer text-xs font-medium text-foreground">Select All ({filteredAds.length})</label>
                              </div>
                            )}
                          </div>
                          {filteredAds.length === 0 ? (
                            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No {asset} {tradeType} ads found.</p>
                          ) : (
                            // Own scroll area only from sm up: on phones the list flows in the dialog body (one scroll region).
                            <div
                              role="group"
                              aria-labelledby={`apr-${asset}-ads-label`}
                              tabIndex={0}
                              className={cn(SCROLL_BOX, 'max-h-none divide-y divide-border rounded-md border border-border sm:max-h-64')}
                            >
                              {filteredAds.map(ad => {
                                const isExcluded = excludedAds?.has(ad.advNo);
                                const isSelected = cfg.ad_numbers.includes(ad.advNo);
                                const boxId = `apr-ad-${ad.advNo}`;
                                const inZone = adZone(ad) === competitorZone;
                                const statusTone = ad.advStatus === BINANCE_AD_STATUS.ONLINE ? 'success'
                                  : ad.advStatus === BINANCE_AD_STATUS.PRIVATE ? 'warning' : 'neutral';
                                return (
                                  <div key={ad.advNo} className={cn('flex items-start gap-3 px-3 py-2.5', isSelected && 'bg-primary/[0.06]')}>
                                    <Checkbox
                                      id={boxId}
                                      checked={isSelected}
                                      onCheckedChange={() => toggleAdForAsset(asset, ad.advNo)}
                                      disabled={isExcluded}
                                      aria-describedby={`${boxId}-meta`}
                                      className="mt-0.5"
                                    />
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <label
                                          htmlFor={boxId}
                                          title={ad.advNo}
                                          className={cn('t-mono text-xs font-semibold tabular-nums text-foreground', !isExcluded && 'cursor-pointer')}
                                        >
                                          …{ad.advNo.slice(-8)}
                                        </label>
                                        <Chip tone="neutral">{ad.priceType === 1 ? 'Fixed' : 'Float'}</Chip>
                                        <Chip tone={inZone ? 'neutral' : 'warning'}>{ZONE_SHORT[adZone(ad)]}</Chip>
                                        <Chip tone={statusTone}>{getAdStatusLabel(ad.advStatus)}</Chip>
                                        {isExcluded && <Chip tone="neutral" title="Excluded from automation">Excluded</Chip>}
                                      </div>
                                      <p id={`${boxId}-meta`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-foreground">
                                        <span className={cn(NUMERIC, 'font-semibold')}>₹{Number(ad.price).toLocaleString('en-IN')}</span>
                                        <span>Qty: <span className={NUMERIC}>{Number(ad.surplusAmount || 0).toLocaleString('en-IN')}</span> {ad.asset}</span>
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </AccordionContent>
            </AccordionItem>

            {/* Section 4: Anti-exploitation */}
            <AccordionItem value="anti-exploit" className={SECTION_ITEM}>
              <AccordionTrigger className={SECTION_TRIGGER}>
                <SectionTitle icon={<ShieldCheck />} summary={safetySummary}>Anti-Exploitation & Safety</SectionTitle>
              </AccordionTrigger>
              <AccordionContent className={SECTION_BODY}>
                <p className="text-xs leading-5 text-muted-foreground">
                  Guard rails that stop the engine from chasing a manipulated or fake competitor price — e.g. a merchant who briefly posts a wild price to bait automated repricers.
                </p>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <FormField
                    id="apr-max-deviation"
                    label="Max Deviation from Market (%)"
                    help="If the target merchant's price sits further than this from the wider market reference, the cycle is skipped instead of followed."
                    hint="Skips the update when the competitor is an outlier."
                  >
                    <UnitInput
                      id="apr-max-deviation"
                      unit="%"
                      type="number"
                      value={maxDeviation}
                      onChange={e => setMaxDeviation(e.target.value)}
                      step="0.5"
                      aria-describedby="apr-max-deviation-hint"
                      wrapClassName="w-32"
                    />
                  </FormField>
                  <FormField
                    id="apr-auto-pause"
                    label="Auto-Pause After N Deviations"
                    help="Consecutive outlier readings before the rule pauses itself and waits for an operator."
                    hint="0 = never auto-pause."
                  >
                    <Input
                      id="apr-auto-pause"
                      type="number"
                      value={autoPauseDeviations}
                      onChange={e => setAutoPauseDeviations(e.target.value)}
                      aria-describedby="apr-auto-pause-hint"
                      className={cn(CONTROL, NUMERIC_INPUT, 'w-24')}
                    />
                  </FormField>
                  <FormField
                    id="apr-max-change"
                    label={isFixed ? 'Max Price Change/Cycle (₹)' : 'Max Ratio Change/Cycle (%)'}
                    help="Caps how far a single cycle may move your ad, so one bad reading cannot swing your price violently."
                    hint="Empty = no per-cycle cap."
                  >
                    <UnitInput
                      id="apr-max-change"
                      unit={isFixed ? '₹' : '%'}
                      unitSide={isFixed ? 'prefix' : 'suffix'}
                      type="number"
                      value={isFixed ? maxPriceChange : maxRatioChange}
                      onChange={e => isFixed ? setMaxPriceChange(e.target.value) : setMaxRatioChange(e.target.value)}
                      placeholder="Unlimited"
                      step="0.01"
                      aria-describedby="apr-max-change-hint"
                      wrapClassName="w-36"
                    />
                  </FormField>
                  <FormField
                    id="apr-cooldown"
                    label="Manual Override Cooldown (min)"
                    help="After an operator edits a price by hand, the engine leaves that ad alone for this many minutes."
                    hint="0 = disabled."
                  >
                    <UnitInput
                      id="apr-cooldown"
                      unit="min"
                      type="number"
                      value={cooldownMinutes}
                      onChange={e => setCooldownMinutes(e.target.value)}
                      aria-describedby="apr-cooldown-hint"
                      wrapClassName="w-28"
                    />
                  </FormField>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 5: Scheduling (collapsed by default) */}
            <AccordionItem value="scheduling" className={SECTION_ITEM}>
              <AccordionTrigger className={SECTION_TRIGGER}>
                <SectionTitle icon={<Clock />} summary={scheduleSummary}>Scheduling & Resting Price</SectionTitle>
              </AccordionTrigger>
              <AccordionContent className={SECTION_BODY}>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    <FormField id="apr-active-start" label="Active Hours Start (IST)">
                      <Input
                        id="apr-active-start"
                        type="time"
                        value={activeStart}
                        onChange={e => setActiveStart(e.target.value)}
                        className={cn(CONTROL, 'w-36 tabular-nums')}
                      />
                    </FormField>
                    <FormField id="apr-active-end" label="Active Hours End (IST)">
                      <Input
                        id="apr-active-end"
                        type="time"
                        value={activeEnd}
                        onChange={e => setActiveEnd(e.target.value)}
                        className={cn(CONTROL, 'w-36 tabular-nums')}
                      />
                    </FormField>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className={HINT}>Leave both empty for 24/7 operation.</p>
                    {(activeStart || activeEnd) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2 text-xs"
                        onClick={() => { setActiveStart(''); setActiveEnd(''); }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Reset active hours (switch to 24/7)
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {isFixed ? (
                    <FormField
                      id="apr-resting"
                      label="Resting Price (₹)"
                      help="Price the engine parks your ads at outside active hours, so you never sit at an aggressive market-chasing price while unattended."
                      hint="Applied when the schedule window closes. Empty = ads keep their last live price."
                    >
                      <UnitInput
                        id="apr-resting"
                        unit="₹"
                        unitSide="prefix"
                        type="number"
                        value={restingPrice}
                        onChange={e => setRestingPrice(e.target.value)}
                        placeholder="No resting price"
                        aria-describedby="apr-resting-hint"
                        wrapClassName="w-48"
                      />
                    </FormField>
                  ) : (
                    <FormField
                      id="apr-resting"
                      label="Resting Ratio (%)"
                      help="Floating ratio the engine parks your ads at outside active hours (e.g. 101.5% = 1.5% above the Binance index), so unattended ads sit at a safe, non-competitive level."
                      hint="Applied when the schedule window closes. Empty = ads keep their last live ratio."
                    >
                      <UnitInput
                        id="apr-resting"
                        unit="%"
                        type="number"
                        value={restingRatio}
                        onChange={e => setRestingRatio(e.target.value)}
                        placeholder="No resting ratio"
                        step="0.01"
                        aria-describedby="apr-resting-hint"
                        wrapClassName="w-48"
                      />
                    </FormField>
                  )}
                  <FormField
                    id="apr-interval"
                    label="Check Interval (seconds)"
                    help="How often this rule is allowed to run. The scheduler ticks every minute and skips the rule until this many seconds have passed since its last check."
                    hint="Minimum 60s recommended to stay within Binance rate limits."
                  >
                    <UnitInput
                      id="apr-interval"
                      unit="s"
                      type="number"
                      value={checkInterval}
                      onChange={e => setCheckInterval(e.target.value)}
                      aria-describedby="apr-interval-hint"
                      wrapClassName="w-32"
                    />
                  </FormField>
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:space-x-0 md:px-6">
          {(() => {
            const missing: string[] = [];
            if (!name.trim()) missing.push('a rule name');
            if (selectedAssets.length === 0) missing.push('at least one asset');
            if (totalAds === 0) missing.push('at least one ad selected');
            if (competitorMode === 'nickname' && priorityMerchants.filter(m => m.trim()).length === 0) missing.push('a target merchant (or switch to badge targeting)');
            const blocked = missing.length > 0;
            return (
              <>
                {blocked && (
                  <p id="apr-requirements" className="flex min-w-0 items-start gap-2 text-xs leading-5 text-foreground sm:mr-auto">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                    <span>
                      Add {missing.map((m, i) => (
                        <Fragment key={m}>{i > 0 && ' · '}<span className="font-semibold">{m}</span></Fragment>
                      ))} to enable {editingRule ? 'updating' : 'creating'} this rule.
                    </span>
                  </p>
                )}
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                  <Button type="button" variant="outline" className="h-9 px-4 text-sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button
                    type="button"
                    className="h-9 px-4 text-sm"
                    onClick={handleSave}
                    disabled={blocked || createRule.isPending || updateRule.isPending}
                    loading={createRule.isPending || updateRule.isPending}
                    aria-describedby={blocked ? 'apr-requirements' : undefined}
                  >
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Sortable merchant row component
function SortableMerchantItem({
  id, index, value, onChange, onRemove, onPreview, isSearching, canRemove, isDraggable,
}: {
  id: string;
  index: number;
  value: string;
  onChange: (val: string) => void;
  onRemove: () => void;
  onPreview: () => void;
  isSearching: boolean;
  canRemove: boolean;
  isDraggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const inputId = `apr-merchant-${index}`;

  return (
    <div ref={setNodeRef} style={style} className={cn('flex items-center gap-1.5', isDragging && 'relative z-50')}>
      <div
        {...attributes}
        {...listeners}
        aria-label={`Reorder P${index + 1}`}
        title={isDraggable ? 'Drag to reorder' : undefined}
        className={cn(
          'flex h-8 w-6 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDraggable ? 'cursor-grab text-muted-foreground hover:bg-secondary hover:text-foreground active:cursor-grabbing' : 'cursor-default text-muted-foreground/40',
        )}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <label
        htmlFor={inputId}
        className="inline-flex h-6 min-w-[1.75rem] shrink-0 cursor-pointer items-center justify-center rounded bg-secondary px-1 t-mono text-[11px] font-semibold text-foreground"
      >
        P{index + 1}
      </label>
      <Input
        id={inputId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={index === 0 ? 'Primary merchant nickname' : 'Merchant nickname'}
        aria-label={`P${index + 1} merchant nickname`}
        className={cn(CONTROL, 'h-8 min-w-0 flex-1')}
      />
      <button
        type="button"
        className={ICON_BTN}
        onClick={onPreview}
        disabled={!value.trim() || isSearching}
        aria-label="Preview merchant"
        title="Preview merchant"
      >
        <Search aria-hidden="true" />
      </button>
      {canRemove && (
        <button
          type="button"
          className={ICON_BTN_DANGER}
          onClick={onRemove}
          aria-label="Remove merchant"
          title="Remove merchant"
        >
          <Trash2 aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
