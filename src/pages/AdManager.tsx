import { useAuth } from "@/hooks/useAuth";
import { isSuperAdminRoleName } from "@/lib/auth/roles";
import { useState, useMemo, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/PermissionGate';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Megaphone, RefreshCw, ArrowDownUp, Link2, Layers, LayoutGrid, Rows3, ListTree, Rows2, X } from 'lucide-react';
import { AdManagerFilters } from '@/components/ad-manager/AdManagerFilters';
import { AdSummaryStrip } from '@/components/ad-manager/AdSummaryStrip';
import { CategorizedAdTable, AdSortMode } from '@/components/ad-manager/CategorizedAdTable';
import { DeskTable } from '@/components/ad-manager/AdTable';
import { BoardView } from '@/components/ad-manager/BoardView';
import { CreateEditAdDialog, CreateAdInitialValues } from '@/components/ad-manager/CreateEditAdDialog';
import { BulkActionToolbar } from '@/components/ad-manager/BulkActionToolbar';
import { BulkEditLimitsDialog } from '@/components/ad-manager/BulkEditLimitsDialog';
import { BulkEditPaymentMethodsDialog } from '@/components/ad-manager/BulkEditPaymentMethodsDialog';
import { BulkFloatingPriceDialog } from '@/components/ad-manager/BulkFloatingPriceDialog';
import { BulkPriceLadderDialog } from '@/components/ad-manager/BulkPriceLadderDialog';
import { BulkHybridAdjustDialog } from '@/components/ad-manager/BulkHybridAdjustDialog';
import { BulkStatusDialog } from '@/components/ad-manager/BulkStatusDialog';
import { BulkRiskGuardDialog } from '@/components/ad-manager/BulkRiskGuardDialog';
import { BulkMaxQuantityDialog } from '@/components/ad-manager/BulkMaxQuantityDialog';
import { AdCommandStrip } from '@/components/ad-manager/AdCommandStrip';
import { cn } from '@/lib/utils';
import { SEG_BTN, SEG_COUNT, SEG_LIST, SEG_TRIGGER, StatusDot } from '@/components/ad-manager/adUi';
import { isBlockAd, adZone } from '@/lib/adZone';
import { useBinanceAdsList, useUpdateAdStatus, AdFilters, BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

const SORT_PREF_KEY = 'terminal_ad_sort_mode';
const AUTOREFRESH_PREF_KEY = 'terminal_ad_auto_refresh';
const TAB_PREF_KEY = 'terminal_ad_side_tab';
const STATUS_CHIPS_PREF_KEY = 'terminal_ad_status_chips';
const VIEW_PREF_KEY = 'terminal_ad_view_mode';
const DENSITY_PREF_KEY = 'terminal_ad_density';

const SORT_OPTIONS: { value: AdSortMode; label: string }[] = [
  { value: 'current', label: 'Default' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'avail-desc', label: 'Remaining ↓' },
  { value: 'avail-asc', label: 'Remaining ↑' },
  { value: 'updated-desc', label: 'Updated ↓' },
];

const STATUS_CHIP_OPTIONS: { value: number; label: string; cls: string }[] = [
  { value: BINANCE_AD_STATUS.ONLINE, label: 'Active', cls: 'aria-pressed:text-success' },
  { value: BINANCE_AD_STATUS.PRIVATE, label: 'Private', cls: 'aria-pressed:text-warning' },
  { value: BINANCE_AD_STATUS.OFFLINE, label: 'Inactive', cls: '' },
];

const VIEW_OPTIONS: { value: 'board' | 'desk' | 'categorized'; label: string; icon: typeof LayoutGrid; hint: string }[] = [
  { value: 'board', label: 'Board', icon: LayoutGrid, hint: 'Cards by desk' },
  { value: 'desk', label: 'Desk', icon: Rows3, hint: 'One table' },
  { value: 'categorized', label: 'Categorized', icon: ListTree, hint: 'Grouped by size and price type' },
];

/** Card-shaped loading placeholder for the Board view. */
function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2" aria-busy="true" aria-label="Loading ads">
      {[0, 1].map((d) => (
        <div key={d} className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}




export default function AdManager() {
   const location = useLocation();
  const isTerminalContext = location.pathname.startsWith('/terminal');
  const { isAllAccounts, visibleAccounts, activeAccountId, colorFor, nameFor } = useExchangeAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  // URL params SEED state (shareable views win); localStorage is the personal fallback.
  const [filters, setFilters] = useState<AdFilters>(() => {
    const f: AdFilters = { page: 1, rows: 50, fetchAll: true };
    const asset = searchParams.get('asset'); if (asset) f.asset = asset;
    const tradeType = searchParams.get('tradeType'); if (tradeType) f.tradeType = tradeType;
    const advStatus = searchParams.get('advStatus'); if (advStatus !== null && advStatus !== '') f.advStatus = Number(advStatus);
    const priceType = searchParams.get('priceType'); if (priceType !== null && priceType !== '') f.priceType = Number(priceType);
    const zone = searchParams.get('zone'); if (zone) f.zone = zone;
    return f;
  });
  const [activeTab, setActiveTab] = useState<string>(() => searchParams.get('tab') || localStorage.getItem(TAB_PREF_KEY) || 'all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<BinanceAd | null>(null);
  // When creating in combined mode we must know which account the ad belongs to.
  const [createAccountId, setCreateAccountId] = useState<string | null>(null);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  // Duplicate Ad: seeds create-mode defaults from a source ad (null = normal create).
  const [duplicateValues, setDuplicateValues] = useState<CreateAdInitialValues | null>(null);

  // Bulk selection state
  const [selectedAdvNos, setSelectedAdvNos] = useState<Set<string>>(new Set());
  const [bulkLimitsOpen, setBulkLimitsOpen] = useState(false);
  const [bulkPayMethodsOpen, setBulkPayMethodsOpen] = useState(false);
  const [bulkFloatingOpen, setBulkFloatingOpen] = useState(false);
  const [bulkLadderOpen, setBulkLadderOpen] = useState(false);
  const [bulkHybridOpen, setBulkHybridOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkRiskGuardOpen, setBulkRiskGuardOpen] = useState(false);
  const [bulkMaxQtyOpen, setBulkMaxQtyOpen] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<number>(BINANCE_AD_STATUS.ONLINE);

  // Sort + auto-refresh + view + density + status-chip prefs (persisted in localStorage).
   const [sortMode, setSortMode] = useState<AdSortMode>(() => (searchParams.get('sort') as AdSortMode) || (localStorage.getItem(SORT_PREF_KEY) as AdSortMode) || 'current');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => searchParams.has('auto') ? searchParams.get('auto') === '1' : localStorage.getItem(AUTOREFRESH_PREF_KEY) === '1');
  const [viewMode, setViewMode] = useState<'categorized' | 'desk' | 'board'>(() => (searchParams.get('view') as 'categorized' | 'desk' | 'board') || (localStorage.getItem(VIEW_PREF_KEY) as 'categorized' | 'desk' | 'board') || 'board');
  const [compact, setCompact] = useState<boolean>(() => searchParams.has('density') ? searchParams.get('density') === '1' : localStorage.getItem(DENSITY_PREF_KEY) === '1');
  const [statusChips, setStatusChips] = useState<Set<number>>(() => {
    const s = searchParams.get('status');
    if (s !== null) return new Set(s ? s.split(',').map(Number).filter((n) => !isNaN(n)) : []);
    try { const raw = localStorage.getItem(STATUS_CHIPS_PREF_KEY); return new Set(raw ? JSON.parse(raw) : []); } catch { return new Set(); }
  });
  useEffect(() => { try { localStorage.setItem(SORT_PREF_KEY, sortMode); } catch { /* ignore */ } }, [sortMode]);
  useEffect(() => { try { localStorage.setItem(AUTOREFRESH_PREF_KEY, autoRefresh ? '1' : '0'); } catch { /* ignore */ } }, [autoRefresh]);
  useEffect(() => { try { localStorage.setItem(VIEW_PREF_KEY, viewMode); } catch { /* ignore */ } }, [viewMode]);
  useEffect(() => { try { localStorage.setItem(DENSITY_PREF_KEY, compact ? '1' : '0'); } catch { /* ignore */ } }, [compact]);
  useEffect(() => { try { localStorage.setItem(TAB_PREF_KEY, activeTab); } catch { /* ignore */ } }, [activeTab]);
   useEffect(() => { try { localStorage.setItem(STATUS_CHIPS_PREF_KEY, JSON.stringify(Array.from(statusChips))); } catch { /* ignore */ } }, [statusChips]);

  // Mirror view state to the URL (replace, not push) so it's shareable.
  useEffect(() => {
    const p = new URLSearchParams();
    if (activeTab !== 'all') p.set('tab', activeTab);
    if (statusChips.size) p.set('status', Array.from(statusChips).join(','));
    if (sortMode !== 'current') p.set('sort', sortMode);
    if (viewMode !== 'board') p.set('view', viewMode);
    if (compact) p.set('density', '1');
    if (autoRefresh) p.set('auto', '1');
    if (filters.asset) p.set('asset', filters.asset);
    if (filters.tradeType) p.set('tradeType', filters.tradeType);
    if (filters.advStatus !== undefined && filters.advStatus !== null) p.set('advStatus', String(filters.advStatus));
    if (filters.priceType !== undefined && filters.priceType !== null) p.set('priceType', String(filters.priceType));
    if (filters.zone) p.set('zone', filters.zone);
    setSearchParams(p, { replace: true });
  }, [activeTab, statusChips, sortMode, viewMode, compact, autoRefresh, filters, setSearchParams]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast({ title: 'Link copied', description: 'Shareable view URL copied to clipboard.' }))
      .catch(() => toast({ title: 'Copy failed', description: 'Could not access clipboard.', variant: 'destructive' }));
  };

  // Per-ad history → pre-filtered logs page (reuses TerminalLogs search).
  const handleHistory = (advNo: string) => navigate(`/terminal/logs?adv=${encodeURIComponent(advNo)}`);
  const { user: currentAuthUser } = useAuth();
  const isSuperAdmin = !!currentAuthUser?.roles?.some(isSuperAdminRoleName);


  // Status and zone are client-side dimensions, so they never go to the API.
  const { zone: zoneFilter, ...serverFilters } = filters;
  const effectiveFilters: AdFilters = { ...serverFilters };

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useBinanceAdsList(effectiveFilters, { refetchInterval: autoRefresh ? 30000 : false });
  const { data: restAdsData } = useBinanceAdsList({ page: 1, rows: 50, fetchAll: true });
  const updateStatus = useUpdateAdStatus();

  const ads: BinanceAd[] = data?.data || [];
  const restAds: BinanceAd[] = restAdsData?.data || [];
  const displayAds = useMemo(() => {
    let list: BinanceAd[];
    if (activeTab === 'block') list = ads.filter(isBlockAd);
    else {
      list = ads.filter(ad => !isBlockAd(ad));
      if (activeTab === 'buy') list = list.filter(ad => ad.tradeType === 'BUY');
      else if (activeTab === 'sell') list = list.filter(ad => ad.tradeType === 'SELL');
    }
    if (zoneFilter === 'p2p' || zoneFilter === 'block') list = list.filter(ad => adZone(ad) === zoneFilter);
    if (statusChips.size > 0) list = list.filter(ad => statusChips.has(ad.advStatus));
    return list;
  }, [ads, activeTab, statusChips, zoneFilter]);

  const total = displayAds.length;
  const assetOptions = useMemo(() => Array.from(new Set(ads.map(a => a.asset).filter(Boolean))) as string[], [ads]);
  const onlineAds = useMemo(() => ads.filter(ad => ad.advStatus === BINANCE_AD_STATUS.ONLINE), [ads]);
  const activeAds = useMemo(() => restAds.filter(ad => ad.advStatus === BINANCE_AD_STATUS.ONLINE || ad.advStatus === BINANCE_AD_STATUS.PRIVATE), [restAds]);

  const selectedAds = useMemo(() => displayAds.filter(ad => selectedAdvNos.has(ad.advNo)), [displayAds, selectedAdvNos]);

  // Counts shown on the tabs and status toggles (display only): what each
  // choice would show, given the other current filters.
  const viewCounts = useMemo(() => {
    const zoneOk = (ad: BinanceAd) => !(zoneFilter === 'p2p' || zoneFilter === 'block') || adZone(ad) === zoneFilter;
    const statusOk = (ad: BinanceAd) => statusChips.size === 0 || statusChips.has(ad.advStatus);
    const inTab = (ad: BinanceAd, tab: string) => (tab === 'block' ? isBlockAd(ad) : !isBlockAd(ad) && (tab === 'all' || (tab === 'buy' ? ad.tradeType === 'BUY' : ad.tradeType === 'SELL')));
    const tabs: Record<string, number> = { all: 0, buy: 0, sell: 0, block: 0 };
    const status: Record<number, number> = { [BINANCE_AD_STATUS.ONLINE]: 0, [BINANCE_AD_STATUS.PRIVATE]: 0, [BINANCE_AD_STATUS.OFFLINE]: 0 };
    for (const ad of ads) {
      if (!zoneOk(ad)) continue;
      for (const t of ['all', 'buy', 'sell', 'block']) if (inTab(ad, t) && statusOk(ad)) tabs[t] += 1;
      if (inTab(ad, activeTab) && status[ad.advStatus] !== undefined) status[ad.advStatus] += 1;
    }
    return { tabs, status };
  }, [ads, zoneFilter, statusChips, activeTab]);

  const toggleStatusChip = (value: number) => {
    setSelectedAdvNos(new Set());
    setStatusChips(prev => { const next = new Set(prev); next.has(value) ? next.delete(value) : next.add(value); return next; });
  };

  const handleEdit = (ad: BinanceAd) => { setDuplicateValues(null); setEditingAd(ad); setDialogOpen(true); };
  const handleCreate = () => {
    setEditingAd(null);
    setDuplicateValues(null);
    // In combined mode we don't know which account to post to — ask first.
    if (isAllAccounts && visibleAccounts.length > 1) {
      setCreateAccountId(null);
      setAccountPickerOpen(true);
      return;
    }
    setCreateAccountId(null);
    setDialogOpen(true);
  };

  // Duplicate: open Create dialog prefilled from source ad (advNo/identifiers excluded),
  // routed to the same account. Reuses the existing dialog's create/submit flow.
  const handleDuplicate = (ad: BinanceAd) => {
    setEditingAd(null);
    setCreateAccountId(ad._exchangeAccountId || null);
    setDuplicateValues({
      tradeType: ad.tradeType,
      asset: ad.asset,
      fiatUnit: ad.fiatUnit,
      priceType: (ad.priceType || 1) as 1 | 2,
      price: String(ad.price || ''),
      priceFloatingRatio: String(ad.priceFloatingRatio || ''),
      initAmount: String(ad.initAmount || ''),
      minSingleTransAmount: String(ad.minSingleTransAmount || ''),
      maxSingleTransAmount: String(ad.maxSingleTransAmount || ''),
      autoReplyMsg: ad.autoReplyMsg || '',
      remarks: ad.remarks || '',
      payTimeLimit: ad.payTimeLimit || 15,
      advStatus: ad.advStatus || BINANCE_AD_STATUS.ONLINE,
      buyerRegDaysLimit: Number.isFinite(Number(ad.buyerRegDaysLimit)) ? Number(ad.buyerRegDaysLimit) : -1,
      buyerBtcPositionLimit: Number.isFinite(Number(ad.buyerBtcPositionLimit)) ? Number(ad.buyerBtcPositionLimit) : -1,
      takerAdditionalKycRequired: ad.takerAdditionalKycRequired || 0,
      selectedPayMethods: ad.tradeMethods || [],
    });
    setDialogOpen(true);
  };

  const startCreateForAccount = (accountId: string) => {
    setDuplicateValues(null);
    setCreateAccountId(accountId);
    setAccountPickerOpen(false);
    setDialogOpen(true);
  };

  // advNo → owning account, so single-row actions route correctly in combined mode.
  const accountForAdv = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const ad of ads) m.set(ad.advNo, ad._exchangeAccountId);
    return m;
  }, [ads]);

   const handleToggleStatus = (advNo: string, currentStatus: number) => {
    const isCurrentlyPrivate = currentStatus === BINANCE_AD_STATUS.PRIVATE;
    const newStatus = currentStatus === BINANCE_AD_STATUS.ONLINE || isCurrentlyPrivate
      ? BINANCE_AD_STATUS.OFFLINE 
      : BINANCE_AD_STATUS.ONLINE;
    updateStatus.mutate({ advNos: [advNo], advStatus: newStatus, fromPrivate: isCurrentlyPrivate, fromStatus: currentStatus, exchangeAccountId: accountForAdv.get(advNo) });
  };

  // Preserve selection after bulk edits so operators can chain actions
  // (e.g. edit rate → edit limits) on the same set. Selection only clears
  // via the explicit Clear button, tab switch, or filter reset.
  const handleBulkComplete = () => { refetch(); };

  const handleBulkActivate = () => { setBulkTargetStatus(BINANCE_AD_STATUS.ONLINE); setBulkStatusOpen(true); };
  const handleBulkDeactivate = () => { setBulkTargetStatus(BINANCE_AD_STATUS.OFFLINE); setBulkStatusOpen(true); };

  // Clear selection on tab change
  const handleTabChange = (tab: string) => { setActiveTab(tab); setSelectedAdvNos(new Set()); };

  // Moves keyboard focus into the floating bulk bar (first enabled, visible button).
  const focusBulkActions = () => {
    const region = document.querySelector('[data-ad-bulk-actions]');
    const target = Array.from(region?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((b) => !b.disabled && b.getClientRects().length > 0);
    target?.focus();
  };

  const viewLabel = activeTab === 'buy' ? 'buy' : activeTab === 'sell' ? 'sell' : activeTab === 'block' ? 'block' : '';
  const hasSelection = selectedAds.length > 0;

  const content = (
    <div className={cn('space-y-4 p-3 sm:p-4 md:p-6', hasSelection && 'pb-32 md:pb-36')}>
      {/* Header — phones: title row with Create ad, then the summary and the other actions; wider: title left, actions right */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 [grid-template-areas:'icon_title_create'_'sub_sub_sub'_'actions_actions_actions'] sm:flex sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
        <div className="contents sm:flex sm:min-w-0 sm:items-center sm:gap-3">
          <div className="shrink-0 rounded-lg border border-primary/20 bg-primary/10 p-2 [grid-area:icon]">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div className="contents sm:block sm:min-w-0">
            <h1 className="min-w-0 truncate text-lg font-semibold leading-tight text-foreground [grid-area:title]">Ads Manager</h1>
            <div className="min-w-0 [grid-area:sub]"><AdSummaryStrip ads={ads} /></div>
          </div>
        </div>
        <div className="contents sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          <div className="flex flex-wrap items-center gap-2 [grid-area:actions] sm:contents">
            <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5" title="Refresh ads from Binance every 30 seconds">
              <Switch id="ad-auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-90" />
              <Label htmlFor="ad-auto-refresh" className="cursor-pointer whitespace-nowrap text-xs font-medium text-foreground">Auto 30s</Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 gap-1.5 px-0 text-xs sm:w-auto sm:px-3"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Sync ads from Binance"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="sr-only sm:not-sr-only">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopyLink}
              title="Copy shareable link to this view"
              aria-label="Copy link to this view"
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 gap-1.5 px-0 text-xs sm:w-auto sm:px-3"
              onClick={() => navigate(isTerminalContext ? '/terminal/ads/zone-book' : '/ad-manager/zone-book')}
              title="Zone Book — compare the P2P and Block order books"
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">Zone book</span>
            </Button>
          </div>
          <Button size="sm" onClick={handleCreate} className="h-8 gap-1.5 text-xs [grid-area:create]">
            <Plus className="h-3.5 w-3.5" />
            Create ad
          </Button>
        </div>
      </div>

      {/* Desk status — merchant state, rest timer, last sync */}
      <AdCommandStrip onlineAds={onlineAds} activeAds={activeAds} syncedAt={dataUpdatedAt} isSyncing={isFetching} />

      {/* Side-first Tabs, filters and views */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="space-y-2.5 rounded-lg border border-border bg-card p-2.5 shadow-xs sm:p-3">
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className={SEG_LIST}>
              {([
                ['all', 'All'],
                ['buy', 'Buy'],
                ['sell', 'Sell'],
                ['block', 'Block'],
              ] as const).map(([value, label]) => (
                <TabsTrigger key={value} value={value} className={SEG_TRIGGER}>
                  {label}
                  <span className={cn(SEG_COUNT, value === 'buy' ? 'bg-trade-buy/10 text-trade-buy' : value === 'sell' ? 'bg-trade-sell/10 text-trade-sell' : 'bg-muted text-muted-foreground')}>
                    {viewCounts.tabs[value]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            <div role="group" aria-label="Show status" className={cn(SEG_LIST, 'inline-flex items-center')}>
              {STATUS_CHIP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-on={statusChips.has(opt.value)}
                  aria-pressed={statusChips.has(opt.value)}
                  onClick={() => toggleStatusChip(opt.value)}
                  className={cn(SEG_BTN, opt.cls)}
                  title={statusChips.has(opt.value) ? `Showing ${opt.label.toLowerCase()} ads — click to stop filtering` : `Show only ${opt.label.toLowerCase()} ads (combine with others)`}
                >
                  <StatusDot status={opt.value} />
                  {opt.label}
                  <span className={cn(SEG_COUNT, 'bg-muted text-muted-foreground')}>{viewCounts.status[opt.value] ?? 0}</span>
                </button>
              ))}
            </div>
            {statusChips.size > 0 && (
              <button
                type="button"
                onClick={() => { setStatusChips(new Set()); setSelectedAdvNos(new Set()); }}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Clear the status filter"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}

            <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
              {/* View toggle */}
              <div role="group" aria-label="View" className={cn(SEG_LIST, 'inline-flex items-center')}>
                {VIEW_OPTIONS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    aria-pressed={viewMode === v.value}
                    onClick={() => setViewMode(v.value)}
                    className={SEG_BTN}
                    title={`${v.label} view — ${v.hint}`}
                  >
                    <v.icon className="h-3.5 w-3.5" />
                    <span className={v.value === 'categorized' ? 'hidden sm:inline' : undefined}>{v.label}</span>
                  </button>
                ))}
              </div>
              {/* Density toggle */}
              <button
                type="button"
                onClick={() => setCompact((c) => !c)}
                aria-pressed={compact}
                className={cn(SEG_LIST, SEG_BTN, 'h-8 aria-pressed:bg-card')}
                title="Toggle row density"
              >
                <Rows2 className="h-3.5 w-3.5" />
                Compact
              </button>
              {/* Sort */}
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as AdSortMode)}>
                <SelectTrigger className="h-8 w-[156px] gap-1.5 text-xs" aria-label="Sort ads">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 text-muted-foreground">Sort</span>
                    <span className="min-w-0 truncate"><SelectValue /></span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
            <AdManagerFilters filters={filters} onFiltersChange={setFilters} onRefresh={() => refetch()} isRefreshing={isFetching} assetOptions={assetOptions} />
            <span className="t-mono ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {total} {viewLabel ? `${viewLabel} ` : ''}ad{total !== 1 ? 's' : ''} shown
            </span>
          </div>
        </div>

        {/* Keyboard shortcut to the floating bulk bar, which sits at the end of the page's tab order */}
        {hasSelection && (
          <button
            type="button"
            onClick={focusBulkActions}
            className="sr-only focus:not-sr-only focus:mt-3 focus:inline-flex focus:h-8 focus:items-center focus:rounded-md focus:border focus:border-primary/40 focus:bg-card focus:px-3 focus:text-xs focus:font-medium focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Go to bulk actions ({selectedAds.length} selected)
          </button>
        )}

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            viewMode === 'board' ? <BoardSkeleton /> : <TableSkeleton rows={8} columns={7} className="bg-card" />
          ) : viewMode === 'board' ? (
            <BoardView
              ads={displayAds}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onHistory={isSuperAdmin ? handleHistory : undefined}
              onDuplicate={handleDuplicate}
              isTogglingStatus={updateStatus.isPending}
              selectedAdvNos={selectedAdvNos}
              onSelectionChange={setSelectedAdvNos}
              sortMode={sortMode}
              compact={compact}
            />
          ) : viewMode === 'desk' ? (
             <DeskTable
              ads={displayAds}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onHistory={isSuperAdmin ? handleHistory : undefined}
              onDuplicate={handleDuplicate}
              isTogglingStatus={updateStatus.isPending}
              selectedAdvNos={selectedAdvNos}
              onSelectionChange={setSelectedAdvNos}
              sortMode={sortMode}
              onSortModeChange={setSortMode}
              compact={compact}
            />
          ) : (
            <CategorizedAdTable
              ads={displayAds}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onHistory={isSuperAdmin ? handleHistory : undefined}
              onDuplicate={handleDuplicate}
              isTogglingStatus={updateStatus.isPending}
              selectedAdvNos={selectedAdvNos}
              onSelectionChange={setSelectedAdvNos}
              sortMode={sortMode}
              compact={compact}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Bulk Action Toolbar — floats at the bottom of the screen while ads are selected */}
      {hasSelection && (
        <BulkActionToolbar
          selectedAds={selectedAds}
          onClearSelection={() => setSelectedAdvNos(new Set())}
          onBulkEditLimits={() => setBulkLimitsOpen(true)}
          onBulkEditPaymentMethods={() => setBulkPayMethodsOpen(true)}
          onBulkFloatingPrice={() => setBulkFloatingOpen(true)}
          onBulkPriceLadder={() => setBulkLadderOpen(true)}
          onBulkHybridAdjust={() => setBulkHybridOpen(true)}
          onBulkRiskGuard={() => setBulkRiskGuardOpen(true)}
          onBulkMaxQuantity={() => setBulkMaxQtyOpen(true)}
          onBulkActivate={handleBulkActivate}
          onBulkDeactivate={handleBulkDeactivate}
          totalAds={displayAds.length}
          onSelectAll={() => setSelectedAdvNos(new Set(displayAds.map(ad => ad.advNo)))}
          aboveBottomNav={!isTerminalContext}
        />
      )}

      <CreateEditAdDialog open={dialogOpen} onOpenChange={setDialogOpen} editingAd={editingAd} createAccountId={createAccountId} initialValues={duplicateValues} />

      {/* Combined-mode: pick which account a new ad belongs to */}
      <AlertDialog open={accountPickerOpen} onOpenChange={setAccountPickerOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Create the ad on which account?</AlertDialogTitle>
            <AlertDialogDescription>
              You're viewing all accounts. Pick the Binance account the new ad goes on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-1">
            {visibleAccounts.map((acc) => (
              <Button
                key={acc.id}
                variant="outline"
                className="h-11 justify-start gap-2.5 text-sm"
                onClick={() => startCreateForAccount(acc.id)}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorFor(acc.id) }} />
                {nameFor(acc.id)}
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <BulkEditLimitsDialog open={bulkLimitsOpen} onOpenChange={setBulkLimitsOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkEditPaymentMethodsDialog open={bulkPayMethodsOpen} onOpenChange={setBulkPayMethodsOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkFloatingPriceDialog open={bulkFloatingOpen} onOpenChange={setBulkFloatingOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkPriceLadderDialog open={bulkLadderOpen} onOpenChange={setBulkLadderOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkHybridAdjustDialog open={bulkHybridOpen} onOpenChange={setBulkHybridOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkMaxQuantityDialog open={bulkMaxQtyOpen} onOpenChange={setBulkMaxQtyOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkRiskGuardDialog open={bulkRiskGuardOpen} onOpenChange={setBulkRiskGuardOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkStatusDialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen} ads={selectedAds} targetStatus={bulkTargetStatus} onComplete={handleBulkComplete} />
    </div>
  );

  if (isTerminalContext) return content;
  return <PermissionGate permissions={["terminal_view"]}>{content}</PermissionGate>;
}
