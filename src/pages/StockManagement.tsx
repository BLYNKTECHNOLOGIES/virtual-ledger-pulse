
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, TrendingUp, FileText, Building, Grid, Shield, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductCardListingTab } from "@/components/stock/ProductCardListingTab";
import { StockTransactionsTab } from "@/components/stock/StockTransactionsTab";
import { StockReportsTab } from "@/components/stock/StockReportsTab";
import { WalletManagementTab } from "@/components/stock/WalletManagementTab";
import { InterProductConversionTab } from "@/components/stock/InterProductConversionTab";
import { usePendingConversions } from "@/hooks/useProductConversions";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useDeepLinkHighlight } from "@/components/transaction-detail";
import { PageHeader } from "@/components/shared/PageHeader";

// Map legacy ?tab= values (pre-restructure bookmarks) onto the new 5-tab model.
const LEGACY_TAB_ALIASES: Record<string, string> = {
  quickview: 'positions',
  valuation: 'positions',
  warehouse: 'wallets',
  transactions: 'ledger',
  integrity: 'positions',
};

const resolveTab = (raw: string | null): string => {
  const value = raw || 'positions';
  return LEGACY_TAB_ALIASES[value] || value;
};

export default function StockManagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: pendingConversions } = usePendingConversions();
  const pendingConversionCount = pendingConversions?.length || 0;
  const [activeTab, setActiveTab] = useState(resolveTab(searchParams.get('tab')));

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(resolveTab(tab));
    }
  }, [searchParams]);

  useDeepLinkHighlight(['txId']);



  return (
    <PermissionGate
      permissions={["stock_view"]}
      fallback={
        <div className="min-h-screen bg-muted/50 p-6 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Stock Management.
                  </p>
                </div>
                <Button onClick={() => navigate("/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
    <div className="min-h-screen bg-muted/50 p-6 page-mount">
      {/* Header */}
      <div className="bg-card rounded-xl mb-6 shadow-sm border border-border">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <PageHeader
                title={
                  <span className="flex items-center gap-3">
                    <span className="p-3 bg-primary/10 rounded-xl shadow-sm">
                      <Package className="h-8 w-8 text-primary" />
                    </span>
                    Stock Management
                  </span>
                }
                description="Inventory, warehouse, and stock control system"
              />
            </div>

          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto scrollbar-hide gap-1 md:grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          <TabsTrigger value="positions" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-3 md:px-4 flex-shrink-0 md:flex-shrink">
            <Grid className="h-4 w-4" />
            Positions
          </TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-3 md:px-4 flex-shrink-0 md:flex-shrink">
            <TrendingUp className="h-4 w-4" />
            Ledger
          </TabsTrigger>
          <TabsTrigger value="wallets" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-3 md:px-4 flex-shrink-0 md:flex-shrink">
            <Building className="h-4 w-4" />
            Wallets
          </TabsTrigger>
          <TabsTrigger value="conversions" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-3 md:px-4 flex-shrink-0 md:flex-shrink">
            <ArrowLeftRight className="h-4 w-4" />
            <span className="hidden sm:inline">Conversions</span>
            <span className="sm:hidden">Conv.</span>
            {pendingConversionCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                {pendingConversionCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-3 md:px-4 flex-shrink-0 md:flex-shrink">
            <FileText className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <ProductCardListingTab />
        </TabsContent>

        <TabsContent value="ledger">
          <StockTransactionsTab />
        </TabsContent>

        <TabsContent value="wallets">
          <WalletManagementTab />
        </TabsContent>

        <TabsContent value="conversions">
          <InterProductConversionTab />
        </TabsContent>

        <TabsContent value="reports">
          <StockReportsTab />
        </TabsContent>
      </Tabs>

      </div>
    </div>
    </PermissionGate>
  );
}
