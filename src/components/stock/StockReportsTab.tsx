
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, FileText, TrendingUp, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

export function StockReportsTab() {
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [reportType, setReportType] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses_for_reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: stockReports, isLoading: reportsLoading } = useQuery({
    queryKey: ['stock_reports', dateFrom, dateTo, reportType, warehouseFilter],
    queryFn: async () => {
      let query = supabase
        .from('stock_transactions')
        .select(`
          *,
          products(name, code, unit_of_measurement)
        `)
        .gte('transaction_date', format(dateFrom, 'yyyy-MM-dd'))
        .lte('transaction_date', format(dateTo, 'yyyy-MM-dd'))
        .order('transaction_date', { ascending: false });

      if (reportType !== "all") {
        query = query.eq('transaction_type', reportType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: inventoryReport } = useQuery({
    queryKey: ['inventory_report'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: lowStockProducts } = useQuery({
    queryKey: ['low_stock_products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .lte('current_stock_quantity', 10)
        .order('current_stock_quantity');
      if (error) throw error;
      return data;
    },
  });

  const { data: purchaseReport } = useQuery({
    queryKey: ['purchase_report', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          purchase_orders!inner(order_date, supplier_name),
          products(name, code, unit_of_measurement)
        `)
        .gte('purchase_orders.order_date', format(dateFrom, 'yyyy-MM-dd'))
        .lte('purchase_orders.order_date', format(dateTo, 'yyyy-MM-dd'))
        .order('purchase_orders.order_date', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value).replace(/"/g, '""');
          }
          return String(value).replace(/"/g, '""');
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const calculateTotalValue = (products: any[]) => {
    return products?.reduce((total, product) => {
      const avgPrice = product.average_buying_price || product.cost_price || 0;
      return total + (avgPrice * product.current_stock_quantity);
    }, 0) || 0;
  };

  const calculateMovementValue = (transactions: any[]) => {
    return transactions?.reduce((total, transaction) => {
      return total + (transaction.total_amount || 0);
    }, 0) || 0;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventoryReport?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Active products in inventory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{lowStockProducts?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Items with stock ≤ 10</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{calculateTotalValue(inventoryReport || []).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Based on average buying price</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Movement Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{calculateMovementValue(stockReports || []).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => date && setDateFrom(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(date) => date && setDateTo(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Transaction Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="IN">Stock In</SelectItem>
                  <SelectItem value="OUT">Stock Out</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Warehouse</label>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Warehouses</SelectItem>
                  {warehouses?.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock Movement Report */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Stock Movement Report</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(stockReports || [], 'stock_movement_report')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <div className="text-center py-8">Loading reports...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Product</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Unit Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Total Value</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {stockReports?.map((report) => (
                    <tr key={report.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{format(new Date(report.transaction_date), 'dd/MM/yyyy')}</td>
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{report.products?.name}</div>
                          <div className="text-sm text-gray-500">{report.products?.code}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={report.transaction_type === 'IN' ? 'default' : 'destructive'}>
                          {report.transaction_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">{report.quantity} {report.products?.unit_of_measurement}</td>
                      <td className="py-3 px-4">₹{report.unit_price || 0}</td>
                      <td className="py-3 px-4">₹{report.total_amount || 0}</td>
                      <td className="py-3 px-4">{report.reference_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {stockReports?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No stock movements found for the selected period.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Low Stock Alert */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Low Stock Alert</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(lowStockProducts || [], 'low_stock_report')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Product Code</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Product Name</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Current Stock</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Unit</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts?.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-sm">{product.code}</td>
                    <td className="py-3 px-4 font-medium">{product.name}</td>
                    <td className="py-3 px-4">{product.current_stock_quantity}</td>
                    <td className="py-3 px-4">{product.unit_of_measurement}</td>
                    <td className="py-3 px-4">
                      {product.current_stock_quantity === 0 ? (
                        <Badge variant="destructive">Out of Stock</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800">Low Stock</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {lowStockProducts?.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No low stock items found.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Purchase Report */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Purchase Report</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(purchaseReport || [], 'purchase_report')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Product</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Supplier</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Unit Price</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchaseReport?.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">{format(new Date(item.purchase_orders?.order_date), 'dd/MM/yyyy')}</td>
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium">{item.products?.name}</div>
                        <div className="text-sm text-gray-500">{item.products?.code}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">{item.purchase_orders?.supplier_name}</td>
                    <td className="py-3 px-4">{item.quantity} {item.products?.unit_of_measurement}</td>
                    <td className="py-3 px-4">₹{item.unit_price}</td>
                    <td className="py-3 px-4">₹{item.total_price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {purchaseReport?.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No purchase data found for the selected period.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
