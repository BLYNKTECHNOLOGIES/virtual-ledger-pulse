
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, TrendingUp, AlertTriangle, DollarSign } from "lucide-react";

export function InventoryValuationTab() {
  const { data: inventoryData, isLoading } = useQuery({
    queryKey: ['inventory_valuation'],
    queryFn: async () => {
      // Sync USDT stock with wallets to ensure accuracy
      console.log('🔄 Syncing USDT stock with wallets...');
      const { error: usdtSyncError } = await supabase.rpc('sync_usdt_stock');
      if (usdtSyncError) {
        console.error('❌ USDT sync failed:', usdtSyncError);
      }

      // Fetch products with stock and pricing
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*');

      if (productsError) throw productsError;

      // Fetch all stock transactions to calculate real averages
      const { data: transactions, error: transactionsError } = await supabase
        .from('stock_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (transactionsError) throw transactionsError;

      // Process each product with real transaction data
      const processedProducts = products?.map(product => {
        // Get sales transactions for this product
        const salesTransactions = transactions?.filter(t => 
          t.product_id === product.id && 
          t.transaction_type === 'Sales' && 
          t.quantity < 0 // Sales have negative quantity
        ) || [];

        // Get purchase transactions for this product
        const purchaseTransactions = transactions?.filter(t => 
          t.product_id === product.id && 
          t.transaction_type === 'Purchase' && 
          t.quantity > 0 // Purchases have positive quantity
        ) || [];

        // Calculate total sales amount and quantity
        const totalSalesAmount = salesTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
        const totalSalesQuantity = Math.abs(salesTransactions.reduce((sum, t) => sum + (t.quantity || 0), 0));

        // Calculate total purchase amount and quantity
        const totalPurchaseAmount = purchaseTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
        const totalPurchaseQuantity = purchaseTransactions.reduce((sum, t) => sum + (t.quantity || 0), 0);

        // Calculate real average prices
        const realAvgSellingPrice = totalSalesQuantity > 0 ? totalSalesAmount / totalSalesQuantity : 0;
        const realAvgBuyingPrice = totalPurchaseQuantity > 0 ? totalPurchaseAmount / totalPurchaseQuantity : 0;

        return {
          ...product,
          real_avg_selling_price: realAvgSellingPrice,
          real_avg_buying_price: realAvgBuyingPrice,
          total_sales_amount: totalSalesAmount,
          total_sales_quantity: totalSalesQuantity,
          total_purchase_amount: totalPurchaseAmount,
          total_purchase_quantity: totalPurchaseQuantity
        };
      }) || [];

      // Calculate totals using real average prices
      const totalValue = processedProducts.reduce((sum, product) => {
        return sum + (product.current_stock_quantity * product.real_avg_buying_price);
      }, 0) || 0;

      const totalSellingValue = processedProducts.reduce((sum, product) => {
        return sum + (product.current_stock_quantity * product.real_avg_selling_price);
      }, 0) || 0;

      // Count low stock items (using threshold of 10)
      const lowStockItems = processedProducts.filter(product => 
        product.current_stock_quantity <= 10 && product.current_stock_quantity > 0
      ).length || 0;

      // Count out of stock items
      const outOfStockItems = processedProducts.filter(product => 
        product.current_stock_quantity === 0
      ).length || 0;

      // Calculate total units
      const totalUnits = processedProducts.reduce((sum, product) => {
        return sum + product.current_stock_quantity;
      }, 0) || 0;

      return {
        products: processedProducts,
        totalValue,
        totalSellingValue,
        lowStockItems,
        outOfStockItems,
        totalUnits,
        totalProducts: processedProducts.length
      };
    },
    refetchInterval: 30000,
    staleTime: 0,
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading inventory valuation...</div>;
  }

  const potentialProfit = (inventoryData?.totalSellingValue || 0) - (inventoryData?.totalValue || 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{inventoryData?.totalValue?.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Based on average buying price
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potential Selling Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{inventoryData?.totalSellingValue?.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Potential profit: ₹{potentialProfit?.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventoryData?.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              {inventoryData?.totalUnits} total units
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{inventoryData?.outOfStockItems}</div>
            <p className="text-xs text-muted-foreground">
              {inventoryData?.lowStockItems} low stock items
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Inventory Valuation */}
      <Card>
        <CardHeader>
          <CardTitle>Product-wise Inventory Valuation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Product Name</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Current Stock</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Avg Buying Price</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Avg Selling Price</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Total Cost Value</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Total Selling Value</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Potential Profit</th>
                </tr>
              </thead>
              <tbody>
                {inventoryData?.products?.map((product) => {
                  // Use real calculated averages from transactions only
                  const buyingPrice = product.real_avg_buying_price || 0;
                  const sellingPrice = product.real_avg_selling_price || 0;
                  
                  const totalCostValue = product.current_stock_quantity * buyingPrice;
                  const totalSellingValue = product.current_stock_quantity * sellingPrice;
                  const profit = totalSellingValue - totalCostValue;
                  
                  return (
                    <tr key={product.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{product.name}</td>
                      <td className="py-3 px-4">{product.current_stock_quantity} {product.unit_of_measurement}</td>
                      <td className="py-3 px-4">₹{buyingPrice.toFixed(2)}</td>
                      <td className="py-3 px-4">₹{sellingPrice.toFixed(2)}</td>
                      <td className="py-3 px-4 font-medium">₹{totalCostValue.toLocaleString()}</td>
                      <td className="py-3 px-4 font-medium">₹{totalSellingValue.toLocaleString()}</td>
                      <td className="py-3 px-4 font-medium">
                        <span className={profit >= 0 ? "text-green-600" : "text-red-600"}>
                          ₹{profit.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {inventoryData?.products?.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No products found in inventory.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
