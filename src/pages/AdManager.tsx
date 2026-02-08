import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Megaphone } from 'lucide-react';
import { AdManagerFilters } from '@/components/ad-manager/AdManagerFilters';
import { AdTable } from '@/components/ad-manager/AdTable';
import { CreateEditAdDialog } from '@/components/ad-manager/CreateEditAdDialog';
import { useBinanceAdsList, useUpdateAdStatus, AdFilters, BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';

interface AdManagerProps {
  darkMode?: boolean;
}

export default function AdManager({ darkMode = false }: AdManagerProps) {
  const [filters, setFilters] = useState<AdFilters>({ page: 1, rows: 20 });
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<BinanceAd | null>(null);

  // Compute advStatus filter based on tab
  const effectiveFilters: AdFilters = {
    ...filters,
    advStatus: activeTab === 'active' ? BINANCE_AD_STATUS.ONLINE : activeTab === 'inactive' ? BINANCE_AD_STATUS.OFFLINE : filters.advStatus,
  };

  const { data, isLoading, refetch, isFetching } = useBinanceAdsList(effectiveFilters);
  const updateStatus = useUpdateAdStatus();

  const ads: BinanceAd[] = data?.data || data?.list || [];
  const total = data?.total || ads.length;

  const handleEdit = (ad: BinanceAd) => {
    setEditingAd(ad);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingAd(null);
    setDialogOpen(true);
  };

  const handleToggleStatus = (advNo: string, currentStatus: number) => {
    const newStatus = currentStatus === BINANCE_AD_STATUS.ONLINE ? BINANCE_AD_STATUS.OFFLINE : BINANCE_AD_STATUS.ONLINE;
    updateStatus.mutate({ advNos: [advNo], advStatus: newStatus });
  };

  const d = darkMode;

  return (
    <div className={`space-y-6 p-6 ${d ? 'text-gray-100' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${d ? 'bg-amber-500/10' : 'bg-amber-100'}`}>
            <Megaphone className={`h-6 w-6 ${d ? 'text-amber-500' : 'text-amber-600'}`} />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${d ? 'text-gray-100' : 'text-gray-900'}`}>Ad Manager</h1>
            <p className={`text-sm ${d ? 'text-gray-500' : 'text-muted-foreground'}`}>Manage your Binance P2P merchant ads</p>
          </div>
        </div>
        <Button
          onClick={handleCreate}
          className={d ? 'bg-amber-500 hover:bg-amber-600 text-black font-semibold' : ''}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create New Ad
        </Button>
      </div>

      {/* Filters */}
      <Card className={d ? 'bg-[#111827] border-gray-800/60 shadow-none' : ''}>
        <CardContent className="pt-4 pb-4">
          <AdManagerFilters
            filters={filters}
            onFiltersChange={setFilters}
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
            darkMode={d}
          />
        </CardContent>
      </Card>

      {/* Tabs & Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={d ? 'bg-[#111827] border border-gray-800/60' : ''}>
          <TabsTrigger value="all" className={d ? 'data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400 text-gray-400' : ''}>All Ads</TabsTrigger>
          <TabsTrigger value="active" className={d ? 'data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400 text-gray-400' : ''}>Active</TabsTrigger>
          <TabsTrigger value="inactive" className={d ? 'data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400 text-gray-400' : ''}>Inactive</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card className={d ? 'bg-[#111827] border-gray-800/60 shadow-none' : ''}>
            <CardHeader className="pb-3">
              <CardTitle className={`text-lg flex items-center justify-between ${d ? 'text-gray-100' : ''}`}>
                <span>
                  {activeTab === 'active' ? 'Active' : activeTab === 'inactive' ? 'Inactive' : 'All'} Ads
                </span>
                <span className={`text-sm font-normal ${d ? 'text-gray-500' : 'text-muted-foreground'}`}>
                  {total} ad{total !== 1 ? 's' : ''} found
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${d ? 'border-amber-500' : 'border-blue-600'}`} />
                </div>
              ) : (
                <AdTable
                  ads={ads}
                  onEdit={handleEdit}
                  onToggleStatus={handleToggleStatus}
                  isTogglingStatus={updateStatus.isPending}
                  darkMode={d}
                />
              )}

              {/* Pagination */}
              {total > (filters.rows || 20) && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(filters.page || 1) <= 1}
                    onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}
                    className={d ? 'border-gray-700 text-gray-400 hover:bg-gray-800' : ''}
                  >
                    Previous
                  </Button>
                  <span className={`text-sm ${d ? 'text-gray-500' : 'text-muted-foreground'}`}>
                    Page {filters.page || 1} of {Math.ceil(total / (filters.rows || 20))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(filters.page || 1) >= Math.ceil(total / (filters.rows || 20))}
                    onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}
                    className={d ? 'border-gray-700 text-gray-400 hover:bg-gray-800' : ''}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreateEditAdDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingAd={editingAd}
      />
    </div>
  );
}
