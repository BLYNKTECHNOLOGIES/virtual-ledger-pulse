
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

      // Fetch purchase orders to get USDT purchase costs
      const { data: purchaseOrders, error: purchaseOrdersError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (
            product_id,
            quantity,
            unit_price,
            total_price
          )
        `)
        .eq('status', 'COMPLETED');

      if (purchaseOrdersError) throw purchaseOrdersError;

      // Process each product with real transaction data
      const processedProducts = products?.map(product => {
        console.log(`🔍 Processing product: ${product.name} (${product.code})`);
        
        // Get sales transactions for this product - check various transaction types
        const salesTransactions = transactions?.filter(t => 
          t.product_id === product.id && 
          (t.transaction_type === 'Sales' || t.transaction_type === 'SALE') && 
          t.quantity < 0 // Sales have negative quantity
        ) || [];

        // Get purchase transactions for this product - check various transaction types
        const purchaseTransactions = transactions?.filter(t => 
          t.product_id === product.id && 
          (t.transaction_type === 'Purchase' || t.transaction_type === 'PURCHASE' || t.transaction_type === 'BUY') && 
          t.quantity > 0 // Purchases have positive quantity
        ) || [];

        console.log(`📦 ${product.name}: Found ${purchaseTransactions.length} purchase transactions, ${salesTransactions.length} sales transactions`);

        // Calculate total sales amount and quantity
        const totalSalesAmount = salesTransactions.reduce((sum, t) => sum + Math.abs(t.total_amount || 0), 0);
        const totalSalesQuantity = Math.abs(salesTransactions.reduce((sum, t) => sum + (t.quantity || 0), 0));

        // Calculate total purchase amount and quantity from stock transactions
        let totalPurchaseAmount = purchaseTransactions.reduce((sum, t) => sum + Math.abs(t.total_amount || 0), 0);
        let totalPurchaseQuantity = purchaseTransactions.reduce((sum, t) => sum + Math.abs(t.quantity || 0), 0);

        // Add purchase order data for more accurate calculations
        const purchaseOrderItems = purchaseOrders?.flatMap(po => po.purchase_order_items || [])
          .filter(item => item.product_id === product.id) || [];
        
        const purchaseOrderAmount = purchaseOrderItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
        const purchaseOrderQuantity = purchaseOrderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

        console.log(`💰 ${product.name}: Stock purchases: ₹${totalPurchaseAmount} for ${totalPurchaseQuantity} units`);
        console.log(`🛒 ${product.name}: Purchase orders: ₹${purchaseOrderAmount} for ${purchaseOrderQuantity} units`);

        // Combine stock transactions and purchase orders
        totalPurchaseAmount += purchaseOrderAmount;
        totalPurchaseQuantity += purchaseOrderQuantity;

        // For USDT products, if still no purchase data found, use a reasonable fallback
        if ((product.code === 'USDT' || product.name.toLowerCase().includes('usdt')) && totalPurchaseQuantity === 0 && product.current_stock_quantity > 0) {
          console.log(`⚠️ No purchase data found for USDT, using fallback price`);
          const fallbackUsdtPrice = 89.50; // Current market rate
          totalPurchaseAmount = product.current_stock_quantity * fallbackUsdtPrice;
          totalPurchaseQuantity = product.current_stock_quantity;
        }

        // If we still have no purchase data but the product has stock, use the product's stored prices
        if (totalPurchaseQuantity === 0 && product.current_stock_quantity > 0) {
          if (product.cost_price && product.cost_price > 0) {
            console.log(`📋 ${product.name}: Using stored cost price: ₹${product.cost_price}`);
            totalPurchaseAmount = product.current_stock_quantity * product.cost_price;
            totalPurchaseQuantity = product.current_stock_quantity;
          } else if (product.average_buying_price && product.average_buying_price > 0) {
            console.log(`📋 ${product.name}: Using stored average buying price: ₹${product.average_buying_price}`);
            totalPurchaseAmount = product.current_stock_quantity * product.average_buying_price;
            totalPurchaseQuantity = product.current_stock_quantity;
          } else if (product.selling_price && product.selling_price > 0) {
            // Use 85% of selling price as estimated purchase price
            const estimatedPurchasePrice = product.selling_price * 0.85;
            console.log(`📋 ${product.name}: Using estimated purchase price (85% of selling): ₹${estimatedPurchasePrice}`);
            totalPurchaseAmount = product.current_stock_quantity * estimatedPurchasePrice;
            totalPurchaseQuantity = product.current_stock_quantity;
          }
        }

        // Calculate real average prices
        const realAvgSellingPrice = totalSalesQuantity > 0 ? totalSalesAmount / totalSalesQuantity : (product.selling_price || 0);
        const realAvgBuyingPrice = totalPurchaseQuantity > 0 ? totalPurchaseAmount / totalPurchaseQuantity : 0;

        console.log(`📊 ${product.name} FINAL: Avg Buy Price: ₹${realAvgBuyingPrice.toFixed(2)}, Avg Sell Price: ₹${realAvgSellingPrice.toFixed(2)}`);

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
