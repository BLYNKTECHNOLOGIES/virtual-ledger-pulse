import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, User, AlertTriangle } from 'lucide-react';
import {
  useCreateAutoPricingRule,
  useUpdateAutoPricingRule,
  useSearchMerchant,
  AutoPricingRule,
} from '@/hooks/useAutoPricingRules';
import { useBinanceAdsList, BinanceAd } from '@/hooks/useBinanceAds';
import { useExcludedAds } from '@/hooks/useAdAutomationExclusion';

const ASSETS = ['USDT', 'BTC', 'USDC', 'FDUSD', 'BNB', 'ETH', 'TRX', 'SHIB', 'XRP', 'SOL', 'TON'];

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
  const [asset, setAsset] = useState('USDT');
  const [fiat] = useState('INR');
  const [tradeType, setTradeType] = useState('BUY');
  const [priceType, setPriceType] = useState('FIXED');
  const [targetMerchant, setTargetMerchant] = useState('');
  const [fallback1, setFallback1] = useState('');
  const [fallback2, setFallback2] = useState('');
  const [fallback3, setFallback3] = useState('');
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [pauseNoMerchant, setPauseNoMerchant] = useState(false);
  const [selectedAdNos, setSelectedAdNos] = useState<Set<string>>(new Set());
  const [offsetDirection, setOffsetDirection] = useState('UNDERCUT');
  const [offsetAmount, setOffsetAmount] = useState('0');
  const [offsetPct, setOffsetPct] = useState('0');
  const [maxCeiling, setMaxCeiling] = useState('');
  const [minFloor, setMinFloor] = useState('');
  const [maxRatioCeiling, setMaxRatioCeiling] = useState('');
  const [minRatioFloor, setMinRatioFloor] = useState('');
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

  // Merchant search preview
  const [searchResult, setSearchResult] = useState<any>(null);

  // Fetch ads for ad selection
  const { data: adsData } = useBinanceAdsList({ page: 1, rows: 100 });
  const allAds: BinanceAd[] = adsData?.data || [];

  // Filter ads by selected asset and trade type  
  const filteredAds = allAds.filter(ad => {
    if (ad.asset !== asset) return false;
    // Terminal BUY = Binance SELL, Terminal SELL = Binance BUY
    // But our ads from listAds show the raw tradeType, so:
    if (tradeType === 'BUY' && ad.tradeType !== 'BUY') return false;
    if (tradeType === 'SELL' && ad.tradeType !== 'SELL') return false;
    return true;
  });

  useEffect(() => {
    if (editingRule) {
      setName(editingRule.name);
      setAsset(editingRule.asset);
      setTradeType(editingRule.trade_type);
      setPriceType(editingRule.price_type);
      setTargetMerchant(editingRule.target_merchant);
      const fb = editingRule.fallback_merchants || [];
      setFallback1(fb[0] || '');
      setFallback2(fb[1] || '');
      setFallback3(fb[2] || '');
      setOnlyOnline(editingRule.only_counter_when_online);
      setPauseNoMerchant(editingRule.pause_if_no_merchant_found);
      setSelectedAdNos(new Set(editingRule.ad_numbers || []));
      setOffsetDirection(editingRule.offset_direction);
      setOffsetAmount(String(editingRule.offset_amount || 0));
      setOffsetPct(String(editingRule.offset_pct || 0));
      setMaxCeiling(editingRule.max_ceiling ? String(editingRule.max_ceiling) : '');
      setMinFloor(editingRule.min_floor ? String(editingRule.min_floor) : '');
      setMaxRatioCeiling(editingRule.max_ratio_ceiling ? String(editingRule.max_ratio_ceiling) : '');
      setMinRatioFloor(editingRule.min_ratio_floor ? String(editingRule.min_ratio_floor) : '');
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
      // Reset to defaults
      setName(''); setAsset('USDT'); setTradeType('BUY'); setPriceType('FIXED');
      setTargetMerchant(''); setFallback1(''); setFallback2(''); setFallback3('');
      setOnlyOnline(false); setPauseNoMerchant(false); setSelectedAdNos(new Set());
      setOffsetDirection('UNDERCUT'); setOffsetAmount('0'); setOffsetPct('0');
      setMaxCeiling(''); setMinFloor(''); setMaxRatioCeiling(''); setMinRatioFloor('');
      setMaxDeviation('5'); setMaxPriceChange(''); setMaxRatioChange('');
      setAutoPauseDeviations('5'); setCooldownMinutes('0');
      setActiveStart(''); setActiveEnd(''); setRestingPrice(''); setRestingRatio('');
      setCheckInterval('120');
    }
    setSearchResult(null);
  }, [editingRule, open]);

  const handleSearchMerchant = (nickname: string) => {
    if (!nickname.trim()) return;
    searchMerchant.mutate({ asset, fiat, tradeType, nickname }, {
      onSuccess: (data) => setSearchResult(data),
    });
  };

  const toggleAd = (advNo: string) => {
    const next = new Set(selectedAdNos);
    next.has(advNo) ? next.delete(advNo) : next.add(advNo);
    setSelectedAdNos(next);
  };

  const selectAllFiltered = () => {
    const allNos = filteredAds.map(a => a.advNo);
    const allSelected = allNos.every(no => selectedAdNos.has(no));
    const next = new Set(selectedAdNos);
    if (allSelected) {
      allNos.forEach(no => next.delete(no));
    } else {
      allNos.forEach(no => next.add(no));
    }
    setSelectedAdNos(next);
  };

  const handleSave = () => {
    const fallbacks = [fallback1, fallback2, fallback3].filter(Boolean);
    const payload: any = {
      name,
      asset,
      fiat,
      trade_type: tradeType,
      price_type: priceType,
      target_merchant: targetMerchant,
      fallback_merchants: fallbacks,
      ad_numbers: Array.from(selectedAdNos),
      offset_direction: offsetDirection,
      offset_amount: parseFloat(offsetAmount) || 0,
      offset_pct: parseFloat(offsetPct) || 0,
      max_ceiling: maxCeiling ? parseFloat(maxCeiling) : null,
      min_floor: minFloor ? parseFloat(minFloor) : null,
      max_ratio_ceiling: maxRatioCeiling ? parseFloat(maxRatioCeiling) : null,
      min_ratio_floor: minRatioFloor ? parseFloat(minRatioFloor) : null,
      max_deviation_from_market_pct: parseFloat(maxDeviation) || 5,
      max_price_change_per_cycle: maxPriceChange ? parseFloat(maxPriceChange) : null,
      max_ratio_change_per_cycle: maxRatioChange ? parseFloat(maxRatioChange) : null,
      auto_pause_after_deviations: parseInt(autoPauseDeviations) || 5,
      manual_override_cooldown_minutes: parseInt(cooldownMinutes) || 0,
      only_counter_when_online: onlyOnline,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{editingRule ? 'Edit' : 'Create'} Auto-Pricing Rule</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <Accordion type="multiple" defaultValue={['basic', 'merchants', 'ads', 'offset', 'limits']} className="space-y-0">
            {/* Section 1: Basic */}
            <AccordionItem value="basic">
              <AccordionTrigger className="text-sm font-semibold">Basic Settings</AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                <div>
                  <Label>Rule Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. USDT Buy Undercut" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Asset</Label>
                    <Select value={asset} onValueChange={setAsset}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ASSETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
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
                      BUY = monitors Binance SELL page, SELL = monitors Binance BUY page
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
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Merchants */}
            <AccordionItem value="merchants">
              <AccordionTrigger className="text-sm font-semibold">Target Merchants</AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Primary Merchant Nickname</Label>
                    <Input value={targetMerchant} onChange={e => setTargetMerchant(e.target.value)} placeholder="e.g. CryptoKing" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleSearchMerchant(targetMerchant)} disabled={searchMerchant.isPending}>
                    <Search className="h-3.5 w-3.5 mr-1" /> Preview
                  </Button>
                </div>

                {searchResult?.target && (
                  <div className="p-3 border rounded-md bg-muted/30 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span className="font-medium">{searchResult.target.nickName}</span>
                      <Badge variant="outline" className="text-[10px]">{searchResult.target.userType}</Badge>
                    </div>
                    <p>Price: ₹{Number(searchResult.target.price).toLocaleString('en-IN')}</p>
                    <p>Completion Rate: {(Number(searchResult.target.completionRate) * 100).toFixed(1)}%</p>
                    <p>Monthly Orders: {searchResult.target.orderCount}</p>
                  </div>
                )}
                {searchResult && !searchResult.target && (
                  <div className="p-3 border rounded-md border-warning bg-warning/10 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span>Merchant not found in top 100 listings</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Fallback 1</Label>
                    <Input value={fallback1} onChange={e => setFallback1(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Fallback 2</Label>
                    <Input value={fallback2} onChange={e => setFallback2(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Fallback 3</Label>
                    <Input value={fallback3} onChange={e => setFallback3(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={onlyOnline} onCheckedChange={setOnlyOnline} />
                    <Label className="text-xs">Only counter when online</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={pauseNoMerchant} onCheckedChange={setPauseNoMerchant} />
                    <Label className="text-xs">Pause if no merchant found</Label>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 3: Ad Selection */}
            <AccordionItem value="ads">
              <AccordionTrigger className="text-sm font-semibold">Ad Selection ({selectedAdNos.size} selected)</AccordionTrigger>
              <AccordionContent className="space-y-2 px-1">
                {filteredAds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No {asset} {tradeType} ads found. Make sure you have active ads.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox
                        checked={filteredAds.length > 0 && filteredAds.every(a => selectedAdNos.has(a.advNo))}
                        onCheckedChange={selectAllFiltered}
                      />
                      <Label className="text-xs">Select All ({filteredAds.length})</Label>
                    </div>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {filteredAds.map(ad => {
                        const isExcluded = excludedAds?.has(ad.advNo);
                        return (
                          <div key={ad.advNo} className={`flex items-center gap-2 p-1.5 rounded text-xs ${isExcluded ? 'opacity-40' : ''}`}>
                            <Checkbox
                              checked={selectedAdNos.has(ad.advNo)}
                              onCheckedChange={() => toggleAd(ad.advNo)}
                              disabled={isExcluded}
                            />
                            <span className="font-mono">…{ad.advNo.slice(-8)}</span>
                            <Badge variant="outline" className="text-[10px]">{ad.priceType === 1 ? 'Fixed' : 'Float'}</Badge>
                            <span>₹{Number(ad.price).toLocaleString('en-IN')}</span>
                            <span className="text-muted-foreground">
                              ₹{Number(ad.minSingleTransAmount).toLocaleString('en-IN')}–₹{Number(ad.maxSingleTransAmount).toLocaleString('en-IN')}
                            </span>
                            {isExcluded && <Badge variant="outline" className="text-[10px] border-destructive text-destructive">Excluded</Badge>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Section 4: Pricing Offset */}
            <AccordionItem value="offset">
              <AccordionTrigger className="text-sm font-semibold">Pricing Offset</AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                <div>
                  <Label>Direction</Label>
                  <Select value={offsetDirection} onValueChange={setOffsetDirection}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OVERCUT">Overcut (price goes UP from competitor)</SelectItem>
                      <SelectItem value="UNDERCUT">Undercut (price goes DOWN from competitor)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isFixed ? (
                  <div>
                    <Label>Offset Amount (INR)</Label>
                    <Input type="number" value={offsetAmount} onChange={e => setOffsetAmount(e.target.value)} placeholder="e.g. 0.05" step="0.01" />
                  </div>
                ) : (
                  <div>
                    <Label>Offset Percentage (%)</Label>
                    <Input type="number" value={offsetPct} onChange={e => setOffsetPct(e.target.value)} placeholder="e.g. 0.05" step="0.01" />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Section 5: Safety Limits */}
            <AccordionItem value="limits">
              <AccordionTrigger className="text-sm font-semibold">Safety Limits</AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                {isFixed ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Max Ceiling (₹)</Label>
                      <Input type="number" value={maxCeiling} onChange={e => setMaxCeiling(e.target.value)} placeholder="No max" />
                    </div>
                    <div>
                      <Label>Min Floor (₹)</Label>
                      <Input type="number" value={minFloor} onChange={e => setMinFloor(e.target.value)} placeholder="No min" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Max Ratio Ceiling (%)</Label>
                      <Input type="number" value={maxRatioCeiling} onChange={e => setMaxRatioCeiling(e.target.value)} placeholder="No max" step="0.01" />
                    </div>
                    <div>
                      <Label>Min Ratio Floor (%)</Label>
                      <Input type="number" value={minRatioFloor} onChange={e => setMinRatioFloor(e.target.value)} placeholder="No min" step="0.01" />
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Section 6: Anti-Exploitation */}
            <AccordionItem value="anti-exploit">
              <AccordionTrigger className="text-sm font-semibold">Anti-Exploitation</AccordionTrigger>
              <AccordionContent className="space-y-3 px-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Max Deviation from Market (%)</Label>
                    <Input type="number" value={maxDeviation} onChange={e => setMaxDeviation(e.target.value)} step="0.5" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Skips update if competitor deviates more than this from fair value</p>
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

            {/* Section 7: Scheduling */}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !targetMerchant.trim() || createRule.isPending || updateRule.isPending}>
            {editingRule ? 'Update Rule' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
