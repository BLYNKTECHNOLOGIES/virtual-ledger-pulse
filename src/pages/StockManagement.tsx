
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, TrendingUp, Settings, FileText, BarChart, Building, Grid } from "lucide-react";
import { ProductCardListingTab } from "@/components/stock/ProductCardListingTab";
import { StockTransactionsTab } from "@/components/stock/StockTransactionsTab";
import { InventoryValuationTab } from "@/components/stock/InventoryValuationTab";
import { StockReportsTab } from "@/components/stock/StockReportsTab";
import { WalletManagementTab } from "@/components/stock/WalletManagementTab";

export default function StockManagement() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-cyan-200 via-blue-200 to-indigo-200 text-slate-800 rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-cyan-100 rounded-xl shadow-lg">
                  <Package className="h-8 w-8 text-cyan-700" />
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

      <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Stock Management System</h1>
        <p className="text-gray-600 mt-2">Comprehensive inventory and stock control</p>
      </div>

      <Tabs defaultValue="quickview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="quickview" className="flex items-center gap-2">
            <Grid className="h-4 w-4" />
            Quick View
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="warehouse" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Wallets
          </TabsTrigger>
          <TabsTrigger value="valuation" className="flex items-center gap-2">
            <BarChart className="h-4 w-4" />
            Valuation
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Reports
          </TabsTrigger>
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

        <TabsContent value="valuation">
          <InventoryValuationTab />
        </TabsContent>

        <TabsContent value="reports">
          <StockReportsTab />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
