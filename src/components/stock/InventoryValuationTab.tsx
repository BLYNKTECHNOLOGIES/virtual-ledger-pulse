
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, AlertTriangle, DollarSign } from "lucide-react";
import { useProductStockWithCost } from "@/hooks/useWalletStockWithCost";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function InventoryValuationTab() {
  const { data: products, isLoading } = useProductStockWithCost();

  if (isLoading) {
    return <div className="text-center py-8">Loading inventory valuation...</div>;
  }

  // Only products with stock > 0
  const activeProducts = products?.filter(p => p.total_stock > 0) || [];

  const totalValue = activeProducts.reduce((sum, p) => sum + p.total_value, 0);
  const totalUnits = activeProducts.reduce((sum, p) => sum + p.total_stock, 0);
  const lowStockItems = activeProducts.filter(p => p.total_stock <= 10 && p.total_stock > 0).length;
  const zeroStockItems = (products?.length || 0) - activeProducts.length;

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
            <div className="text-2xl font-bold">₹{totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">
              Based on average buying price
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {totalUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} total units across {activeProducts.length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{zeroStockItems}</div>
            <p className="text-xs text-muted-foreground">
              {lowStockItems} low stock items
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="text-right">Avg Cost (₹)</TableHead>
                  <TableHead className="text-right">Total Value (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeProducts.map((product) => (
                  <TableRow key={product.product_id}>
                    <TableCell className="font-medium">{product.product_name} ({product.product_code})</TableCell>
                    <TableCell className="text-right font-mono">
                      {product.total_stock.toLocaleString(undefined, { maximumFractionDigits: 4 })} {product.unit_of_measurement}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {product.average_cost > 0 ? `₹${product.average_cost.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {product.total_value > 0 ? `₹${product.total_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {activeProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No products with stock found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
