
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, TrendingUp, Settings, FileText, BarChart } from "lucide-react";
import { ProductListingTab } from "@/components/stock/ProductListingTab";
import { StockTransactionsTab } from "@/components/stock/StockTransactionsTab";
import { StockAdjustmentTab } from "@/components/stock/StockAdjustmentTab";
import { InventoryValuationTab } from "@/components/stock/InventoryValuationTab";
import { StockReportsTab } from "@/components/stock/StockReportsTab";

export default function StockManagement() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Stock Management System</h1>
        <p className="text-gray-600 mt-2">Comprehensive inventory and stock control</p>
      </div>

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Product Listing
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Stock In/Out
          </TabsTrigger>
          <TabsTrigger value="adjustment" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Stock Adjustment
          </TabsTrigger>
          <TabsTrigger value="valuation" className="flex items-center gap-2">
            <BarChart className="h-4 w-4" />
            Inventory Valuation
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Stock Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductListingTab />
        </TabsContent>

        <TabsContent value="transactions">
          <StockTransactionsTab />
        </TabsContent>

        <TabsContent value="adjustment">
          <StockAdjustmentTab />
        </TabsContent>

        <TabsContent value="valuation">
          <InventoryValuationTab />
        </TabsContent>

        <TabsContent value="reports">
          <StockReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
