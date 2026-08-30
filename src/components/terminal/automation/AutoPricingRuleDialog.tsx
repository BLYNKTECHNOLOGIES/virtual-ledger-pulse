import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { adZone, ZONE_LABEL, ZONE_SHORT } from '@/lib/adZone';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, User, AlertTriangle, X, GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useCreateAutoPricingRule,
  useUpdateAutoPricingRule,
  useSearchMerchant,
  AutoPricingRule,
  AssetConfig,
} from '@/hooks/useAutoPricingRules';
import { useBinanceAdsList, BinanceAd, getAdStatusLabel, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useExcludedAds } from '@/hooks/useAdAutomationExclusion';

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
  const [isDryRun, setIsDryRun] = useState(false);
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
  const [excludeMerchants, setExcludeMerchants] = useState('');

  const [onlyOnline, setOnlyOnline] = useState(false);
  const [competitorIdentities, setCompetitorIdentities] = useState<string[]>([]);
  const [minVipLevel, setMinVipLevel] = useState('');
  const [enforceZoneMatch, setEnforceZoneMatch] = useState(true);
  const [pauseNoMerchant, setPauseNoMerchant] = useState(false);
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
      setIsDryRun(editingRule.is_dry_run || false);
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
      setCompetitorIdentities((editingRule as any).competitor_identities || []);
      setMinVipLevel((editingRule as any).min_vip_level !== null && (editingRule as any).min_vip_level !== undefined ? String((editingRule as any).min_vip_level) : '');
      setEnforceZoneMatch((editingRule as any).enforce_zone_match !== false);
      setExcludeMerchants(((editingRule as any).exclude_merchants || []).join(', '));
      setOnlyOnline(editingRule.only_counter_when_online);

      setPauseNoMerchant(editingRule.pause_if_no_merchant_found);
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
      setName(''); setIsDryRun(false); setSelectedAssets(['USDT']); setActiveAssetTab('USDT');
      setAssetConfigs({}); setRawNumeric({}); setTradeType('BUY'); setPriceType('FIXED');
      setSyncPricingAcrossAssets(false);

      setPriorityMerchants(['']);
      setCompetitorZone('p2p'); setCompetitorMode('nickname');
      setCompetitorBadges(['Block', 'Shield']); setExcludeMerchants('');

      setOnlyOnline(false); setPauseNoMerchant(false);
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
  }, [editingRule, open]);

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
      is_dry_run: isDryRun,
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
      exclude_merchants: excludeMerchants.split(',').map(s => s.trim()).filter(Boolean),

      ad_numbers: allAdNumbers,
      offset_direction: offsetDirection,
      offset_amount: 0, // defaults; per-asset overrides in asset_config
      offset_pct: 0,
      max_ceiling: null,
      min_floor: null,
      max_ratio_ceiling: null,
      min_ratio_floor: null,
      max_deviation_from_market_pct: parseFloat(maxDeviation) || 5,
      max_price_change_per_cycle: maxPriceChange ? parseFloat(maxPriceChange) : null,
      max_ratio_change_per_cycle: maxRatioChange ? parseFloat(maxRatioChange) : null,
      auto_pause_after_deviations: parseInt(autoPauseDeviations) || 5,
      manual_override_cooldown_minutes: parseInt(cooldownMinutes) || 0,
      only_counter_when_online: onlyOnline,
      competitor_identities: competitorMode === 'top_badged' ? competitorIdentities : [],
      min_vip_level: competitorMode === 'top_badged' && minVipLevel !== '' ? Number(minVipLevel) : null,
      enforce_zone_match: enforceZoneMatch,
      pause_if_no_merchant_found: pauseNoMerchant,
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


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="t-scale-in max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{editingRule ? 'Edit' : 'Create'} Auto-Pricing Rule</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <Accordion type="multiple" defaultValue={['basic', 'merchants', 'assets-config', 'anti-exploit']} className="space-y-0">
            {/* Section 1: Basic */}
            <AccordionItem value="basic">
              <AccordionTrigger className="text-sm font-semibold">Basic Settings</AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                <div>
                  <Label>Rule Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Altcoin Buy Undercut" />
                </div>
                <div className="flex items-center gap-2 p-2 rounded-md border border-warning/30 bg-warning/5">
                  <Switch checked={isDryRun} onCheckedChange={setIsDryRun} />
                  <div>
                    <Label className="text-xs font-medium">Dry-Run Mode</Label>
                    <p className="text-[10px] text-muted-foreground">Calculates & logs prices without calling Binance API. Use to test rules safely.</p>
                  </div>
                  {isDryRun && <Badge className="bg-warning/20 text-warning border-warning/40 text-[10px]">DRY RUN</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Trade Type</Label>
                    <Select value={tradeType} onValueChange={setTradeType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BUY">BUY (Terminal)</SelectItem>
                        <SelectItem value="SELL">SELL (Terminal)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      BUY = monitors Binance SELL page
                    </p>
                  </div>
                  <div>
                    <Label>Price Type</Label>
                    <Select value={priceType} onValueChange={setPriceType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">Fixed</SelectItem>
                        <SelectItem value="FLOATING">Floating</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Direction</Label>
                    <Select value={offsetDirection} onValueChange={setOffsetDirection}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OVERCUT">Overcut (+)</SelectItem>
                        <SelectItem value="UNDERCUT">Undercut (−)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Asset Selection */}
                <div>
                  <Label className="mb-2 block">Assets ({selectedAssets.length} selected)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ASSETS.map(a => (
                      <Badge
                        key={a}
                        variant={selectedAssets.includes(a) ? 'default' : 'outline'}
                        className="cursor-pointer text-xs px-2.5 py-1 select-none"
                        onClick={() => toggleAsset(a)}
                      >
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Priority Merchants */}
            <AccordionItem value="merchants">
              <AccordionTrigger className="text-sm font-semibold">
                Competitor Target ({competitorZone === 'block' ? 'Block zone' : 'P2P zone'} · {competitorMode === 'top_badged' ? `top ${competitorBadges.join('/') || 'any'}` : `${priorityMerchants.filter(m => m.trim()).length} merchants`})
              </AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Market Zone</Label>
                    <Select value={competitorZone} onValueChange={setCompetitorZone}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="p2p">P2P zone (mass + profession)</SelectItem>
                        <SelectItem value="block">Block zone (block ads)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Targeting Mode</Label>
                    <Select value={competitorMode} onValueChange={setCompetitorMode}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nickname">Named merchants (priority list)</SelectItem>
                        <SelectItem value="top_badged">Top badged merchant in zone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {competitorMode === 'top_badged' && (
                  <div className="space-y-2 p-3 border rounded-md bg-muted/20">
                    <Label className="text-xs">Trust badge on the advertiser</Label>
                    <div className="flex flex-wrap gap-3">
                      {['Block', 'Shield'].map(b => (
                        <label key={b} className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={competitorBadges.includes(b)}
                            onCheckedChange={(c) => setCompetitorBadges(prev => c ? [...new Set([...prev, b])] : prev.filter(x => x !== b))}
                          />
                          {b} badge
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      The engine follows the highest-placed advertiser in the selected zone carrying any checked badge. Leave both unchecked to follow the plain top advertiser.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Account class</Label>
                        <div className="flex flex-col gap-1 pt-1">
                          {[
                            { v: 'MASS_MERCHANT', l: 'Mass merchant' },
                            { v: 'BLOCK_MERCHANT', l: 'Block merchant' },
                          ].map(o => (
                            <label key={o.v} className="flex items-center gap-1.5 text-xs">
                              <Checkbox
                                checked={competitorIdentities.includes(o.v)}
                                onCheckedChange={(c) => setCompetitorIdentities(prev => c ? [...new Set([...prev, o.v])] : prev.filter(x => x !== o.v))}
                              />
                              {o.l}
                            </label>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground pt-1">Binance advertiser identity, separate from the badge. Leave both unchecked for any class.</p>
                      </div>
                      <div>
                        <Label className="text-xs">Minimum VIP level</Label>
                        <Input
                          value={minVipLevel}
                          onChange={e => setMinVipLevel(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="any"
                          inputMode="numeric"
                          className="h-8 text-xs text-foreground"
                        />
                        <p className="text-[10px] text-muted-foreground pt-1">Skips advertisers whose Binance VIP level is lower.</p>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Exclude nicknames (comma separated)</Label>
                      <Input
                        value={excludeMerchants}
                        onChange={e => setExcludeMerchants(e.target.value)}
                        placeholder="BlynkEx, MyOtherAccount"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}

                {competitorMode === 'nickname' && (<>
                <p className="text-[10px] text-muted-foreground">
                  Priority 1 is always used first. If it fails thresholds or is offline, Priority 2 takes over, and so on. Drag to reorder.
                </p>

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

                {/* Add merchant */}
                <div className="flex gap-2">
                  <Input
                    value={newMerchantInput}
                    onChange={e => setNewMerchantInput(e.target.value)}
                    placeholder="Add merchant nickname..."
                    className="h-8 text-xs"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMerchant())}
                  />
                  <Button variant="outline" size="sm" className="h-8 px-2" onClick={addMerchant} disabled={!newMerchantInput.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Multi-asset search results */}
                {Object.keys(multiAssetSearchResults).length > 0 && (
                  <div className="space-y-2">
                    {searchResult?.target && (
                      <div className="p-3 border rounded-md bg-muted/30 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="font-medium">{searchResult.target.nickName}</span>
                          <Badge variant="outline" className="text-[10px]">{searchResult.target.userType}</Badge>
                        </div>
                        <p>Completion Rate: {(Number(searchResult.target.completionRate) * 100).toFixed(1)}%</p>
                        <p>Monthly Orders: {searchResult.target.orderCount}</p>
                      </div>
                    )}
                    <div className="p-3 border rounded-md bg-muted/20 text-xs space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Availability across assets:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedAssets.map(asset => {
                          const r = multiAssetSearchResults[asset];
                          if (!r) return null;
                          return (
                            <Badge
                              key={asset}
                              variant={r.found ? 'default' : 'outline'}
                              className={`text-[10px] ${r.found ? 'bg-success/80 hover:bg-success' : 'text-muted-foreground opacity-60'}`}
                            >
                              {asset} {r.found ? `₹${Number(r.price).toLocaleString('en-IN')}` : '✕'}
                            </Badge>
                          );
                        })}
                      </div>
                      {Object.values(multiAssetSearchResults).every(r => !r.found) && (
                        <div className="flex items-center gap-2 text-warning mt-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Merchant not found in any selected asset's top 500 listings</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </>)}



                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={onlyOnline} onCheckedChange={setOnlyOnline} />
                    <Label className="text-xs">Only counter when online</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={enforceZoneMatch} onCheckedChange={setEnforceZoneMatch} />
                    <Label className="text-xs">Only price ads in the targeted zone</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={pauseNoMerchant} onCheckedChange={setPauseNoMerchant} />
                    <Label className="text-xs">Pause if no merchant found</Label>
                  </div>

                </div>

              </AccordionContent>
            </AccordionItem>

            {/* Section 3: Per-Asset Configuration */}
            <AccordionItem value="assets-config">
              <AccordionTrigger className="text-sm font-semibold">
                Per-Asset Config ({totalAds} ads across {selectedAssets.length} assets)
              </AccordionTrigger>
              <AccordionContent className="px-1">
                {mismatchedZoneAds.length > 0 && (
                  <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs space-y-1">
                    <p className="font-medium text-foreground">
                      {mismatchedZoneAds.length} selected ad(s) are not in the {ZONE_LABEL[competitorZone as 'p2p' | 'block']}
                    </p>
                    <p className="text-muted-foreground">
                      {enforceZoneMatch
                        ? 'The engine will skip these ads and log a zone_mismatch entry, so they will never be repriced by this rule.'
                        : 'Zone enforcement is OFF — these ads would be repriced against a different order book. Turn on "Only price ads in the targeted zone" or deselect them.'}
                    </p>
                    <p className="t-mono text-muted-foreground">
                      {mismatchedZoneAds.slice(0, 6).map(ad => `…${ad.advNo.slice(-8)} (${ZONE_SHORT[adZone(ad)]})`).join(', ')}
                      {mismatchedZoneAds.length > 6 ? ` +${mismatchedZoneAds.length - 6} more` : ''}
                    </p>
                  </div>
                )}

                {selectedAssets.length > 1 && (
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                    <Checkbox
                      id="sync-pricing-all-assets"
                      checked={syncPricingAcrossAssets}
                      onCheckedChange={c => handleSyncToggle(c === true)}
                    />
                    <Label htmlFor="sync-pricing-all-assets" className="text-xs cursor-pointer">
                      Apply the same offset, max ceiling and min floor to all {selectedAssets.length} assets
                    </Label>
                  </div>
                )}


                <Tabs value={activeAssetTab} onValueChange={setActiveAssetTab}>
                  <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-3">
                    {selectedAssets.map(asset => {
                      const cfg = getConfig(asset);
                      return (
                        <TabsTrigger
                          key={asset}
                          value={asset}
                          className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md border"
                        >
                          {asset}
                          {cfg.ad_numbers.length > 0 && (
                            <span className="ml-1 text-[10px] opacity-70">({cfg.ad_numbers.length})</span>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {selectedAssets.map(asset => {
                    const cfg = getConfig(asset);
                    const filteredAds = getFilteredAds(asset);

                    return (
                      <TabsContent key={asset} value={asset} className="space-y-4 mt-0">
                        {/* Offset for this asset */}
                        <div className="grid grid-cols-2 gap-3">
                          {isFixed ? (
                            <div>
                              <Label className="text-xs">Offset Amount (₹) for {asset}</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'offset_amount', cfg.offset_amount)}
                                onChange={e => handleNumericChange(asset, 'offset_amount', e.target.value)}
                                placeholder="e.g. 0.05"
                                className="h-8 text-xs"
                              />
                            </div>
                          ) : (
                            <div>
                              <Label className="text-xs">Offset % for {asset}</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'offset_pct', cfg.offset_pct)}
                                onChange={e => handleNumericChange(asset, 'offset_pct', e.target.value)}
                                placeholder="e.g. 0.05"
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                          {isFixed ? (
                            <>
                              <div>
                                <Label className="text-xs">Max Ceiling (₹)</Label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={numericDisplay(asset, 'max_ceiling', cfg.max_ceiling)}
                                  onChange={e => handleNumericChange(asset, 'max_ceiling', e.target.value)}
                                  placeholder="No max"
                                  className="h-8 text-xs"
                                />
                              </div>
                            </>
                          ) : (
                            <div>
                              <Label className="text-xs">Max Ratio Ceiling (%)</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'max_ratio_ceiling', cfg.max_ratio_ceiling)}
                                onChange={e => handleNumericChange(asset, 'max_ratio_ceiling', e.target.value)}
                                placeholder="No max"
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {isFixed ? (
                            <div>
                              <Label className="text-xs">Min Floor (₹)</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'min_floor', cfg.min_floor)}
                                onChange={e => handleNumericChange(asset, 'min_floor', e.target.value)}
                                placeholder="No min"
                                className="h-8 text-xs"
                              />
                            </div>
                          ) : (
                            <div>
                              <Label className="text-xs">Min Ratio Floor (%)</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={numericDisplay(asset, 'min_ratio_floor', cfg.min_ratio_floor)}
                                onChange={e => handleNumericChange(asset, 'min_ratio_floor', e.target.value)}
                                placeholder="No min"
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                        </div>

                        {/* Ad Selection for this asset */}
                        <div>
                          <Label className="text-xs font-medium">Ads for {asset} ({cfg.ad_numbers.length} selected)</Label>
                          {filteredAds.length === 0 ? (
                            <p className="text-xs text-muted-foreground mt-1">No {asset} {tradeType} ads found.</p>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mt-1 mb-2">
                                <Checkbox
                                  checked={filteredAds.length > 0 && filteredAds.every(a => cfg.ad_numbers.includes(a.advNo))}
                                  onCheckedChange={() => selectAllAdsForAsset(asset)}
                                />
                                <Label className="text-[10px]">Select All ({filteredAds.length})</Label>
                              </div>
                              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                {filteredAds.map(ad => {
                                  const isExcluded = excludedAds?.has(ad.advNo);
                                  const isSelected = cfg.ad_numbers.includes(ad.advNo);
                                  return (
                                    <div key={ad.advNo} className={`flex items-start gap-2 p-2 rounded border border-border/50 text-xs ${isExcluded ? 'opacity-40' : ''} ${isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/30'}`}>
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleAdForAsset(asset, ad.advNo)}
                                        disabled={isExcluded}
                                        className="mt-0.5"
                                      />
                                      <div className="flex-1 min-w-0 space-y-0.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="t-mono font-medium">…{ad.advNo.slice(-8)}</span>
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ad.priceType === 1 ? 'Fixed' : 'Float'}</Badge>
                                          <Badge
                                            variant="outline"
                                            className={`text-[10px] px-1.5 py-0 ${adZone(ad) === competitorZone ? 'border-border text-muted-foreground' : 'border-warning text-warning'}`}
                                          >
                                            {ZONE_SHORT[adZone(ad)]}
                                          </Badge>
                                          <Badge
                                            variant="outline"
                                            className={`text-[10px] px-1.5 py-0 ${
                                              ad.advStatus === BINANCE_AD_STATUS.ONLINE ? 'border-success text-success'
                                              : ad.advStatus === BINANCE_AD_STATUS.PRIVATE ? 'border-warning text-warning'
                                              : 'border-muted-foreground text-muted-foreground'
                                            }`}
                                          >
                                            {getAdStatusLabel(ad.advStatus)}
                                          </Badge>
                                          {isExcluded && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive text-destructive">Excluded</Badge>}
                                        </div>
                                        <div className="flex items-center gap-3 text-muted-foreground">
                                          <span className="font-semibold text-foreground">₹{Number(ad.price).toLocaleString('en-IN')}</span>
                                          <span>Qty: {Number(ad.surplusAmount || 0).toLocaleString('en-IN')} {ad.asset}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </AccordionContent>
            </AccordionItem>

            {/* Section 4: Anti-Exploitation */}
            <AccordionItem value="anti-exploit">
              <AccordionTrigger className="text-sm font-semibold">Anti-Exploitation & Safety</AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Max Deviation from Market (%)</Label>
                    <Input type="number" value={maxDeviation} onChange={e => setMaxDeviation(e.target.value)} step="0.5" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Skips update if competitor deviates more than this</p>
                  </div>
                  <div>
                    <Label>Auto-Pause After N Deviations</Label>
                    <Input type="number" value={autoPauseDeviations} onChange={e => setAutoPauseDeviations(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{isFixed ? 'Max Price Change/Cycle (₹)' : 'Max Ratio Change/Cycle (%)'}</Label>
                    <Input
                      type="number"
                      value={isFixed ? maxPriceChange : maxRatioChange}
                      onChange={e => isFixed ? setMaxPriceChange(e.target.value) : setMaxRatioChange(e.target.value)}
                      placeholder="Unlimited"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label>Manual Override Cooldown (min)</Label>
                    <Input type="number" value={cooldownMinutes} onChange={e => setCooldownMinutes(e.target.value)} />
                    <p className="text-[10px] text-muted-foreground mt-0.5">0 = disabled</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 5: Scheduling */}
            <AccordionItem value="scheduling">
              <AccordionTrigger className="text-sm font-semibold">Scheduling</AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Active Hours Start (IST)</Label>
                    <Input type="time" value={activeStart} onChange={e => setActiveStart(e.target.value)} />
                  </div>
                  <div>
                    <Label>Active Hours End (IST)</Label>
                    <Input type="time" value={activeEnd} onChange={e => setActiveEnd(e.target.value)} />
                  </div>
                </div>
                {(activeStart || activeEnd) && (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline"
                    onClick={() => { setActiveStart(''); setActiveEnd(''); }}
                  >
                    Reset active hours (switch to 24/7)
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground">Leave empty for 24/7 operation</p>
                <div className="grid grid-cols-2 gap-3">
                  {isFixed ? (
                    <div>
                      <Label>Resting Price (₹)</Label>
                      <Input type="number" value={restingPrice} onChange={e => setRestingPrice(e.target.value)} placeholder="No resting price" />
                    </div>
                  ) : (
                    <div>
                      <Label>Resting Ratio (%)</Label>
                      <Input type="number" value={restingRatio} onChange={e => setRestingRatio(e.target.value)} placeholder="No resting ratio" step="0.01" />
                    </div>
                  )}
                  <div>
                    <Label>Check Interval (seconds)</Label>
                    <Input type="number" value={checkInterval} onChange={e => setCheckInterval(e.target.value)} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
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
                  <p className="text-[11px] text-warning mr-auto flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Add {missing.join(' · ')} to enable {editingRule ? 'updating' : 'creating'} this rule.
                  </p>
                )}
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={blocked || createRule.isPending || updateRule.isPending}>
                  {editingRule ? 'Update Rule' : 'Create Rule'}
                </Button>
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

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-1.5 ${isDragging ? 'z-50' : ''}`}>
      <div
        {...attributes}
        {...listeners}
        className={`shrink-0 p-1 rounded ${isDraggable ? 'cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground' : 'text-muted-foreground/30 cursor-default'}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0.5 t-mono min-w-[18px] text-center">
        P{index + 1}
      </Badge>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={index === 0 ? 'Primary merchant nickname' : 'Merchant nickname'}
        className="h-8 text-xs flex-1"
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0"
        onClick={onPreview}
        disabled={!value.trim() || isSearching}
        title="Preview merchant"
      >
        <Search className="h-3.5 w-3.5" />
      </Button>
      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive"
          onClick={onRemove}
          title="Remove merchant"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
