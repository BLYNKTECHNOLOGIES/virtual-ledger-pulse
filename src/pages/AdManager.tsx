import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PermissionGate } from '@/components/PermissionGate';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Megaphone, RefreshCw, ArrowDownUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { AdManagerFilters } from '@/components/ad-manager/AdManagerFilters';
import { AdSummaryStrip } from '@/components/ad-manager/AdSummaryStrip';
import { CategorizedAdTable, AdSortMode } from '@/components/ad-manager/CategorizedAdTable';
import { DeskTable } from '@/components/ad-manager/AdTable';
import { CreateEditAdDialog } from '@/components/ad-manager/CreateEditAdDialog';
import { BulkActionToolbar } from '@/components/ad-manager/BulkActionToolbar';
import { BulkEditLimitsDialog } from '@/components/ad-manager/BulkEditLimitsDialog';
import { BulkFloatingPriceDialog } from '@/components/ad-manager/BulkFloatingPriceDialog';
import { BulkHybridAdjustDialog } from '@/components/ad-manager/BulkHybridAdjustDialog';
import { BulkStatusDialog } from '@/components/ad-manager/BulkStatusDialog';
import { BulkRiskGuardDialog } from '@/components/ad-manager/BulkRiskGuardDialog';
import { AdCommandStrip } from '@/components/ad-manager/AdCommandStrip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  { value: 'current', label: 'Current' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'avail-desc', label: 'Available ↓' },
  { value: 'avail-asc', label: 'Available ↑' },
  { value: 'updated-desc', label: 'Updated ↓' },
];

const STATUS_CHIP_OPTIONS: { value: number; label: string; cls: string }[] = [
  { value: BINANCE_AD_STATUS.ONLINE, label: 'Active', cls: 'bg-success/10 text-success border-success/30 data-[on=true]:bg-success/20' },
  { value: BINANCE_AD_STATUS.PRIVATE, label: 'Private', cls: 'bg-warning/10 text-warning border-warning/30 data-[on=true]:bg-warning/20' },
  { value: BINANCE_AD_STATUS.OFFLINE, label: 'Inactive', cls: 'bg-muted text-muted-foreground border-border data-[on=true]:bg-muted-foreground/20' },
];



function isBlockAd(ad: BinanceAd) {
  return String(ad.classify || '').toLowerCase() === 'block';
}

export default function AdManager() {
  const location = useLocation();
  const isTerminalContext = location.pathname.startsWith('/terminal');
  const { isAllAccounts, visibleAccounts, activeAccountId, colorFor, nameFor } = useExchangeAccount();
  const [filters, setFilters] = useState<AdFilters>({ page: 1, rows: 50, fetchAll: true });
  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem(TAB_PREF_KEY) || 'all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<BinanceAd | null>(null);
  // When creating in combined mode we must know which account the ad belongs to.
  const [createAccountId, setCreateAccountId] = useState<string | null>(null);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  // Bulk selection state
  const [selectedAdvNos, setSelectedAdvNos] = useState<Set<string>>(new Set());
  const [bulkLimitsOpen, setBulkLimitsOpen] = useState(false);
  const [bulkFloatingOpen, setBulkFloatingOpen] = useState(false);
  const [bulkHybridOpen, setBulkHybridOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkRiskGuardOpen, setBulkRiskGuardOpen] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<number>(BINANCE_AD_STATUS.ONLINE);

  // Sort + auto-refresh + view + density + status-chip prefs (persisted in localStorage).
  const [sortMode, setSortMode] = useState<AdSortMode>(() => (localStorage.getItem(SORT_PREF_KEY) as AdSortMode) || 'current');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => localStorage.getItem(AUTOREFRESH_PREF_KEY) === '1');
  const [viewMode, setViewMode] = useState<'categorized' | 'desk'>(() => (localStorage.getItem(VIEW_PREF_KEY) as 'categorized' | 'desk') || 'categorized');
  const [compact, setCompact] = useState<boolean>(() => localStorage.getItem(DENSITY_PREF_KEY) === '1');
  const [statusChips, setStatusChips] = useState<Set<number>>(() => {
    try { const raw = localStorage.getItem(STATUS_CHIPS_PREF_KEY); return new Set(raw ? JSON.parse(raw) : []); } catch { return new Set(); }
  });
  useEffect(() => { try { localStorage.setItem(SORT_PREF_KEY, sortMode); } catch { /* ignore */ } }, [sortMode]);
  useEffect(() => { try { localStorage.setItem(AUTOREFRESH_PREF_KEY, autoRefresh ? '1' : '0'); } catch { /* ignore */ } }, [autoRefresh]);
  useEffect(() => { try { localStorage.setItem(VIEW_PREF_KEY, viewMode); } catch { /* ignore */ } }, [viewMode]);
  useEffect(() => { try { localStorage.setItem(DENSITY_PREF_KEY, compact ? '1' : '0'); } catch { /* ignore */ } }, [compact]);
  useEffect(() => { try { localStorage.setItem(TAB_PREF_KEY, activeTab); } catch { /* ignore */ } }, [activeTab]);
  useEffect(() => { try { localStorage.setItem(STATUS_CHIPS_PREF_KEY, JSON.stringify(Array.from(statusChips))); } catch { /* ignore */ } }, [statusChips]);

  // Status is now a client-side chip dimension, so always fetch all statuses.
  const effectiveFilters: AdFilters = { ...filters };

  const { data, isLoading, refetch, isFetching } = useBinanceAdsList(effectiveFilters, { refetchInterval: autoRefresh ? 30000 : false });
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
    if (statusChips.size > 0) list = list.filter(ad => statusChips.has(ad.advStatus));
    return list;
  }, [ads, activeTab, statusChips]);
  const total = displayAds.length;
  const assetOptions = useMemo(() => Array.from(new Set(ads.map(a => a.asset).filter(Boolean))) as string[], [ads]);
  const onlineAds = useMemo(() => ads.filter(ad => ad.advStatus === BINANCE_AD_STATUS.ONLINE), [ads]);
  const activeAds = useMemo(() => restAds.filter(ad => ad.advStatus === BINANCE_AD_STATUS.ONLINE || ad.advStatus === BINANCE_AD_STATUS.PRIVATE), [restAds]);

  const selectedAds = useMemo(() => displayAds.filter(ad => selectedAdvNos.has(ad.advNo)), [displayAds, selectedAdvNos]);

  const toggleStatusChip = (value: number) => {
    setSelectedAdvNos(new Set());
    setStatusChips(prev => { const next = new Set(prev); next.has(value) ? next.delete(value) : next.add(value); return next; });
  };

  const handleEdit = (ad: BinanceAd) => { setEditingAd(ad); setDialogOpen(true); };
  const handleCreate = () => {
    setEditingAd(null);
    // In combined mode we don't know which account to post to — ask first.
    if (isAllAccounts && visibleAccounts.length > 1) {
      setCreateAccountId(null);
      setAccountPickerOpen(true);
      return;
    }
    setCreateAccountId(null);
    setDialogOpen(true);
  };

  const startCreateForAccount = (accountId: string) => {
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

  const handleBulkComplete = () => { setSelectedAdvNos(new Set()); refetch(); };

  const handleBulkActivate = () => { setBulkTargetStatus(BINANCE_AD_STATUS.ONLINE); setBulkStatusOpen(true); };
  const handleBulkDeactivate = () => { setBulkTargetStatus(BINANCE_AD_STATUS.OFFLINE); setBulkStatusOpen(true); };

  // Clear selection on tab change
  const handleTabChange = (tab: string) => { setActiveTab(tab); setSelectedAdvNos(new Set()); };

  const content = (
    <div className="page-mount space-y-6 p-4 md:p-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="p-2 bg-primary/10 rounded-lg">
              <Megaphone className="h-5 w-5 text-primary" />
            </span>
            Ads Manager
          </span>
        }
        description="Manage your Binance P2P merchant ads"
        actions={
          <>
            <div className="flex items-center gap-1.5 mr-1">
              <Switch id="ad-auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              <Label htmlFor="ad-auto-refresh" className="text-xs text-muted-foreground cursor-pointer">Auto 30s</Label>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Sync ads from Binance"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Ad
            </Button>
          </>
        }
      />

      {/* Condensed command strip — rest timer + merchant state in one slim row */}
      <AdCommandStrip onlineAds={onlineAds} activeAds={activeAds} />

      {/* Summary strip */}
      <AdSummaryStrip ads={ads} />

      {/* Filters + status chips */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <AdManagerFilters filters={filters} onFiltersChange={setFilters} onRefresh={() => refetch()} isRefreshing={isFetching} assetOptions={assetOptions} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            {STATUS_CHIP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                data-on={statusChips.has(opt.value)}
                onClick={() => toggleStatusChip(opt.value)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-all',
                  opt.cls,
                  statusChips.has(opt.value) ? 'ring-1 ring-inset ring-current' : 'opacity-60 hover:opacity-100',
                )}
              >
                {opt.label}
              </button>
            ))}
            {statusChips.size > 0 && (
              <button
                onClick={() => { setStatusChips(new Set()); setSelectedAdvNos(new Set()); }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Action Toolbar */}
      {selectedAds.length > 0 && (
        <BulkActionToolbar
          selectedAds={selectedAds}
          onClearSelection={() => setSelectedAdvNos(new Set())}
          onBulkEditLimits={() => setBulkLimitsOpen(true)}
          onBulkFloatingPrice={() => setBulkFloatingOpen(true)}
          onBulkHybridAdjust={() => setBulkHybridOpen(true)}
          onBulkRiskGuard={() => setBulkRiskGuardOpen(true)}
          onBulkActivate={handleBulkActivate}
          onBulkDeactivate={handleBulkDeactivate}
          totalAds={displayAds.length}
          onSelectAll={() => setSelectedAdvNos(new Set(displayAds.map(ad => ad.advNo)))}
        />
      )}

      {/* Side-first Tabs & Table */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
          <TabsTrigger value="block">Block</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex flex-wrap items-center justify-between gap-2">
                <span>
                  {activeTab === 'buy' ? 'Buy' : activeTab === 'sell' ? 'Sell' : activeTab === 'block' ? 'Block' : 'All'} Ads
                </span>
                <span className="flex flex-wrap items-center gap-3 text-sm font-normal text-muted-foreground">
                  {/* View toggle */}
                  <span className="inline-flex overflow-hidden rounded-md border border-border">
                    <button onClick={() => setViewMode('categorized')} className={cn('px-2.5 py-1 text-xs', viewMode === 'categorized' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>Categorized</button>
                    <button onClick={() => setViewMode('desk')} className={cn('border-l border-border px-2.5 py-1 text-xs', viewMode === 'desk' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>Desk</button>
                  </span>
                  {/* Density toggle */}
                  <button
                    onClick={() => setCompact((c) => !c)}
                    className={cn('rounded-md border border-border px-2.5 py-1 text-xs', compact ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                    title="Toggle row density"
                  >
                    {compact ? 'Compact' : 'Comfortable'}
                  </button>
                  {/* Sort */}
                  <span className="flex items-center gap-1.5">
                    <ArrowDownUp className="h-3.5 w-3.5" />
                    <Select value={sortMode} onValueChange={(v) => setSortMode(v as AdSortMode)}>
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SORT_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                  <span>{total} ad{total !== 1 ? 's' : ''} found</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton rows={8} columns={9} />
              ) : viewMode === 'desk' ? (
                <DeskTable
                  ads={displayAds}
                  onEdit={handleEdit}
                  onToggleStatus={handleToggleStatus}
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
                  isTogglingStatus={updateStatus.isPending}
                  selectedAdvNos={selectedAdvNos}
                  onSelectionChange={setSelectedAdvNos}
                  sortMode={sortMode}
                  compact={compact}
                />
              )}


            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreateEditAdDialog open={dialogOpen} onOpenChange={setDialogOpen} editingAd={editingAd} createAccountId={createAccountId} />

      {/* Combined-mode: pick which account a new ad belongs to */}
      <AlertDialog open={accountPickerOpen} onOpenChange={setAccountPickerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create ad on which account?</AlertDialogTitle>
            <AlertDialogDescription>
              You're viewing all accounts. Choose the Binance account this new ad should be created on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-2">
            {visibleAccounts.map((acc) => (
              <Button
                key={acc.id}
                variant="outline"
                className="justify-start gap-2"
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
      <BulkFloatingPriceDialog open={bulkFloatingOpen} onOpenChange={setBulkFloatingOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkHybridAdjustDialog open={bulkHybridOpen} onOpenChange={setBulkHybridOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkRiskGuardDialog open={bulkRiskGuardOpen} onOpenChange={setBulkRiskGuardOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkStatusDialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen} ads={selectedAds} targetStatus={bulkTargetStatus} onComplete={handleBulkComplete} />
    </div>
  );

  if (isTerminalContext) return content;
  return <PermissionGate permissions={["terminal_view"]}>{content}</PermissionGate>;
}
