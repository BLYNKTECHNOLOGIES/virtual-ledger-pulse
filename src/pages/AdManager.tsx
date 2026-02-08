import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Megaphone } from 'lucide-react';
import { AdManagerFilters } from '@/components/ad-manager/AdManagerFilters';
import { AdTable } from '@/components/ad-manager/AdTable';
import { CreateEditAdDialog } from '@/components/ad-manager/CreateEditAdDialog';
import { BulkActionToolbar } from '@/components/ad-manager/BulkActionToolbar';
import { BulkEditLimitsDialog } from '@/components/ad-manager/BulkEditLimitsDialog';
import { BulkFloatingPriceDialog } from '@/components/ad-manager/BulkFloatingPriceDialog';
import { BulkStatusDialog } from '@/components/ad-manager/BulkStatusDialog';
import { RestTimerBanner } from '@/components/ad-manager/RestTimerBanner';
import { useBinanceAdsList, useUpdateAdStatus, AdFilters, BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';

export default function AdManager() {
  const [filters, setFilters] = useState<AdFilters>({ page: 1, rows: 20 });
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<BinanceAd | null>(null);

  // Bulk selection state
  const [selectedAdvNos, setSelectedAdvNos] = useState<Set<string>>(new Set());
  const [bulkLimitsOpen, setBulkLimitsOpen] = useState(false);
  const [bulkFloatingOpen, setBulkFloatingOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<number>(BINANCE_AD_STATUS.ONLINE);

  const effectiveFilters: AdFilters = {
    ...filters,
    advStatus: activeTab === 'active' ? BINANCE_AD_STATUS.ONLINE
      : activeTab === 'inactive' ? BINANCE_AD_STATUS.OFFLINE
      : activeTab === 'private' ? BINANCE_AD_STATUS.PRIVATE
      : filters.advStatus,
  };

  const { data, isLoading, refetch, isFetching } = useBinanceAdsList(effectiveFilters);
  const updateStatus = useUpdateAdStatus();

  const ads: BinanceAd[] = data?.data || data?.list || [];
  const total = data?.total || ads.length;
  const onlineAds = useMemo(() => ads.filter(ad => ad.advStatus === BINANCE_AD_STATUS.ONLINE), [ads]);

  const selectedAds = useMemo(() => ads.filter(ad => selectedAdvNos.has(ad.advNo)), [ads, selectedAdvNos]);

  const handleEdit = (ad: BinanceAd) => { setEditingAd(ad); setDialogOpen(true); };
  const handleCreate = () => { setEditingAd(null); setDialogOpen(true); };

  const handleToggleStatus = (advNo: string, currentStatus: number) => {
    const newStatus = currentStatus === BINANCE_AD_STATUS.ONLINE ? BINANCE_AD_STATUS.OFFLINE : BINANCE_AD_STATUS.ONLINE;
    updateStatus.mutate({ advNos: [advNo], advStatus: newStatus });
  };

  const handleBulkComplete = () => { setSelectedAdvNos(new Set()); refetch(); };

  const handleBulkActivate = () => { setBulkTargetStatus(BINANCE_AD_STATUS.ONLINE); setBulkStatusOpen(true); };
  const handleBulkDeactivate = () => { setBulkTargetStatus(BINANCE_AD_STATUS.OFFLINE); setBulkStatusOpen(true); };

  // Clear selection on tab change
  const handleTabChange = (tab: string) => { setActiveTab(tab); setSelectedAdvNos(new Set()); };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Rest Timer Banner — visible to all when active */}
      <RestTimerBanner onlineAds={onlineAds} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Ads Manager</h1>
            <p className="text-xs text-muted-foreground">Manage your Binance P2P merchant ads</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create Ad
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <AdManagerFilters filters={filters} onFiltersChange={setFilters} onRefresh={() => refetch()} isRefreshing={isFetching} />
        </CardContent>
      </Card>

      {/* Bulk Action Toolbar */}
      {selectedAds.length > 0 && (
        <BulkActionToolbar
          selectedAds={selectedAds}
          onClearSelection={() => setSelectedAdvNos(new Set())}
          onBulkEditLimits={() => setBulkLimitsOpen(true)}
          onBulkFloatingPrice={() => setBulkFloatingOpen(true)}
          onBulkActivate={handleBulkActivate}
          onBulkDeactivate={handleBulkDeactivate}
        />
      )}

      {/* Tabs & Table */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">All Ads</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="private">Private</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>
                  {activeTab === 'active' ? 'Active' : activeTab === 'inactive' ? 'Inactive' : activeTab === 'private' ? 'Private' : 'All'} Ads
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {total} ad{total !== 1 ? 's' : ''} found
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <AdTable
                  ads={ads}
                  onEdit={handleEdit}
                  onToggleStatus={handleToggleStatus}
                  isTogglingStatus={updateStatus.isPending}
                  selectedAdvNos={selectedAdvNos}
                  onSelectionChange={setSelectedAdvNos}
                />
              )}

              {/* Pagination */}
              {total > (filters.rows || 20) && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={(filters.page || 1) <= 1} onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}>Previous</Button>
                  <span className="text-sm text-muted-foreground">Page {filters.page || 1} of {Math.ceil(total / (filters.rows || 20))}</span>
                  <Button variant="outline" size="sm" disabled={(filters.page || 1) >= Math.ceil(total / (filters.rows || 20))} onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}>Next</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreateEditAdDialog open={dialogOpen} onOpenChange={setDialogOpen} editingAd={editingAd} />
      <BulkEditLimitsDialog open={bulkLimitsOpen} onOpenChange={setBulkLimitsOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkFloatingPriceDialog open={bulkFloatingOpen} onOpenChange={setBulkFloatingOpen} ads={selectedAds} onComplete={handleBulkComplete} />
      <BulkStatusDialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen} ads={selectedAds} targetStatus={bulkTargetStatus} onComplete={handleBulkComplete} />
    </div>
  );
}
