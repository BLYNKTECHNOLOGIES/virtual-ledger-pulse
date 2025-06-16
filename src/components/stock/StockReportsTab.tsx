
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Download, CalendarIcon, Filter } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function StockReportsTab() {
  const { toast } = useToast();
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [selectedReport, setSelectedReport] = useState("");
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");

  // Fetch products for filter
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, code')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch warehouses for filter
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name, location')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch stock transactions for reports
  const { data: reportData, isLoading } = useQuery({
    queryKey: ['stock_report_data', selectedReport, dateFrom, dateTo, selectedProduct, selectedWarehouse],
    queryFn: async () => {
      if (!selectedReport) return null;

      let query = supabase.from('stock_transactions').select(`
        *,
        products(name, code, category, unit_of_measurement)
      `);

      // Apply date filters
      if (dateFrom) {
        query = query.gte('transaction_date', format(dateFrom, 'yyyy-MM-dd'));
      }
      if (dateTo) {
        query = query.lte('transaction_date', format(dateTo, 'yyyy-MM-dd'));
      }

      // Apply product filter
      if (selectedProduct) {
        query = query.eq('product_id', selectedProduct);
      }

      query = query.order('transaction_date', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!selectedReport,
  });

  const reports = [
    { 
      id: "stock_movement", 
      name: "Stock Movement Report", 
      description: "Track all stock movements for a period" 
    },
    { 
      id: "stock_availability", 
      name: "Stock Availability Report", 
      description: "View current stock levels and availability" 
    },
    { 
      id: "stock_aging", 
      name: "Stock Aging Report", 
      description: "Identify slow-moving inventory" 
    },
    { 
      id: "reorder_report", 
      name: "Reorder Report", 
      description: "Products below reorder level" 
    },
    { 
      id: "stock_valuation", 
      name: "Stock Valuation Report", 
      description: "Current inventory value by product" 
    }
  ];

  const generatePDFReport = async () => {
    if (!reportData || !selectedReport) {
      toast({
        title: "Error",
        description: "No data available to generate report",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create a simple HTML table for the report
      const reportHTML = `
        <html>
          <head>
            <title>${reports.find(r => r.id === selectedReport)?.name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #333; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              .header { margin-bottom: 20px; }
              .filters { background-color: #f9f9f9; padding: 10px; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${reports.find(r => r.id === selectedReport)?.name}</h1>
              <p>Generated on: ${format(new Date(), 'PPP')}</p>
            </div>
            
            <div class="filters">
              <strong>Filters Applied:</strong><br>
              ${dateFrom ? `From: ${format(dateFrom, 'PPP')}` : 'No start date'}<br>
              ${dateTo ? `To: ${format(dateTo, 'PPP')}` : 'No end date'}<br>
              ${selectedProduct ? `Product: ${products?.find(p => p.id === selectedProduct)?.name}` : 'All products'}<br>
              ${selectedWarehouse ? `Warehouse: ${warehouses?.find(w => w.id === selectedWarehouse)?.name}` : 'All warehouses'}
            </div>

            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Transaction Type</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Total Amount</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.map(item => `
                  <tr>
                    <td>${format(new Date(item.transaction_date), 'MMM dd, yyyy')}</td>
                    <td>${item.products?.name} (${item.products?.code})</td>
                    <td>${item.transaction_type}</td>
                    <td>${item.quantity} ${item.products?.unit_of_measurement}</td>
                    <td>₹${item.unit_price || 0}</td>
                    <td>₹${item.total_amount || 0}</td>
                    <td>${item.reference_number || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div style="margin-top: 30px;">
              <strong>Summary:</strong><br>
              Total Transactions: ${reportData.length}<br>
              Total Value: ₹${reportData.reduce((sum, item) => sum + (item.total_amount || 0), 0).toLocaleString()}
            </div>
          </body>
        </html>
      `;

      // Create a blob and download
      const blob = new Blob([reportHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedReport}_${format(new Date(), 'yyyy-MM-dd')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Report Generated",
        description: "Report has been downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Stock Reports
            </CardTitle>
            <Button onClick={() => setShowFilterDialog(true)}>
              <Filter className="h-4 w-4 mr-2" />
              Configure & Generate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {reports.map((report) => (
              <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold">{report.name}</h3>
                  <p className="text-sm text-gray-600">{report.description}</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSelectedReport(report.id);
                    setShowFilterDialog(true);
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Configure
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Report Configuration Dialog */}
      <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Configure Report: {reports.find(r => r.id === selectedReport)?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Select Report Type</Label>
              <Select value={selectedReport} onValueChange={setSelectedReport}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a report type" />
                </SelectTrigger>
                <SelectContent>
                  {reports.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date From</Label>
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
                      {dateFrom ? format(dateFrom, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label>Date To</Label>
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
                      {dateTo ? format(dateTo, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Product Filter</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Products</SelectItem>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({product.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Warehouse Filter</Label>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger>
                    <SelectValue placeholder="All warehouses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Warehouses</SelectItem>
                    {warehouses?.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} {warehouse.location && `(${warehouse.location})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Report Preview */}
            {selectedReport && reportData && (
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                <h4 className="font-semibold mb-2">Report Preview</h4>
                <div className="text-sm space-y-1">
                  <p><strong>Total Records:</strong> {reportData.length}</p>
                  <p><strong>Date Range:</strong> {dateFrom ? format(dateFrom, 'PPP') : 'All time'} - {dateTo ? format(dateTo, 'PPP') : 'Present'}</p>
                  {reportData.length > 0 && (
                    <div className="mt-2">
                      <p><strong>Sample Data:</strong></p>
                      <div className="text-xs bg-gray-50 p-2 rounded">
                        {reportData.slice(0, 3).map((item, index) => (
                          <div key={index} className="py-1">
                            {format(new Date(item.transaction_date), 'MMM dd')} - {item.products?.name} - {item.transaction_type} - Qty: {item.quantity}
                          </div>
                        ))}
                        {reportData.length > 3 && <div className="text-gray-500">... and {reportData.length - 3} more</div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowFilterDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={generatePDFReport}
                disabled={!selectedReport || isLoading}
              >
                <Download className="h-4 w-4 mr-2" />
                {isLoading ? "Loading..." : "Generate & Download"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
