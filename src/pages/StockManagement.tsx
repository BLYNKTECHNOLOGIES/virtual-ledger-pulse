
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, TrendingUp, Settings, FileText, BarChart, Building, Grid, Shield, ArrowLeftRight, Brain, Settings2 } from "lucide-react";
import { ProductCardListingTab } from "@/components/stock/ProductCardListingTab";
import { StockTransactionsTab } from "@/components/stock/StockTransactionsTab";
import { InventoryValuationTab } from "@/components/stock/InventoryValuationTab";
import { StockReportsTab } from "@/components/stock/StockReportsTab";
import { WalletManagementTab } from "@/components/stock/WalletManagementTab";
import { InterProductConversionTab } from "@/components/stock/InterProductConversionTab";
import { AISettingsTab } from "@/components/stock/AISettingsTab";
import { AIReconciliationTab } from "@/components/stock/AIReconciliationTab";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAIReconciliationSetting } from "@/hooks/useAIReconciliationSetting";
import { useErpReconciliationAccess } from "@/hooks/useErpReconciliationAccess";

export default function StockManagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'quickview');
  const { isAdmin } = useAuth();
  const { isEnabled: aiEnabled, isLoading: aiSettingLoading } = useAIReconciliationSetting();
  const { hasAccess: hasReconAccess } = useErpReconciliationAccess();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Show AI Reconciliation tab only when enabled + user has access
  const showAIRecon = aiEnabled && hasReconAccess;
  
  return (
    <PermissionGate
      permissions={["stock_view"]}
      fallback={
        <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
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
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-6 shadow-sm border border-gray-100">
        <div className="px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-cyan-50 rounded-xl shadow-sm">
                  <Package className="h-8 w-8 text-cyan-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    Stock Management
                  </h1>
                  <p className="text-slate-600 text-lg">
                    Inventory, warehouse, and stock control system
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Stock Management System</h1>
        <p className="text-gray-600 mt-2">Comprehensive inventory and stock control</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto gap-1 md:grid" style={{ gridTemplateColumns: `repeat(${6 + (showAIRecon ? 1 : 0) + (isAdmin ? 1 : 0)}, minmax(0, 1fr))` }}>
          <TabsTrigger value="quickview" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Grid className="h-4 w-4" />
            <span className="hidden sm:inline">Quick View</span>
            <span className="sm:hidden">View</span>
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Transactions</span>
            <span className="sm:hidden">Trans.</span>
          </TabsTrigger>
          <TabsTrigger value="warehouse" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Building className="h-4 w-4" />
            Wallets
          </TabsTrigger>
          <TabsTrigger value="conversions" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <ArrowLeftRight className="h-4 w-4" />
            <span className="hidden sm:inline">Conversions</span>
            <span className="sm:hidden">Conv.</span>
          </TabsTrigger>
          <TabsTrigger value="valuation" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <BarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Valuation</span>
            <span className="sm:hidden">Value</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <FileText className="h-4 w-4" />
            Reports
          </TabsTrigger>
          {showAIRecon && (
            <TabsTrigger value="ai-reconciliation" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">AI Reconciliation</span>
              <span className="sm:hidden">AI</span>
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="ai-settings" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">AI Settings</span>
              <span className="sm:hidden">⚙️ AI</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="quickview">
          <ProductCardListingTab />
        </TabsContent>

        <TabsContent value="transactions">
          <StockTransactionsTab />
        </TabsContent>

        <TabsContent value="warehouse">
          <WalletManagementTab />
        </TabsContent>

        <TabsContent value="conversions">
          <InterProductConversionTab />
        </TabsContent>

        <TabsContent value="valuation">
          <InventoryValuationTab />
        </TabsContent>

        <TabsContent value="reports">
          <StockReportsTab />
        </TabsContent>

        {showAIRecon && (
          <TabsContent value="ai-reconciliation">
            <AIReconciliationTab />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="ai-settings">
            <AISettingsTab />
          </TabsContent>
        )}
      </Tabs>
      </div>
    </div>
    </PermissionGate>
  );
}
