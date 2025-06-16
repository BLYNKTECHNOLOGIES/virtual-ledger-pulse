
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Building, Package, ArrowUpDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

export function WarehouseManagementTab() {
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    product_id: "",
    warehouse_id: "",
    adjustment_type: "",
    quantity: "",
    reason: ""
  });

  const queryClient = useQueryClient();

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products_for_adjustment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, code')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: stockAdjustments, isLoading } = useQuery({
    queryKey: ['stock_adjustments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select(`
          *,
          products(name, code, unit_of_measurement),
          warehouses:warehouse_id(name, location),
          from_warehouses:from_warehouse_id(name),
          to_warehouses:to_warehouse_id(name)
        `)
        .order('adjustment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createAdjustmentMutation = useMutation({
    mutationFn: async (adjustmentData: any) => {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .insert(adjustmentData);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock_adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success("Stock adjustment created successfully");
      setShowAdjustmentDialog(false);
      setAdjustmentForm({
        product_id: "",
        warehouse_id: "",
        adjustment_type: "",
        quantity: "",
        reason: ""
      });
    },
    onError: (error) => {
      toast.error("Failed to create stock adjustment");
      console.error("Error creating adjustment:", error);
    }
  });

  const handleCreateAdjustment = () => {
    if (!adjustmentForm.product_id || !adjustmentForm.warehouse_id || 
        !adjustmentForm.adjustment_type || !adjustmentForm.quantity) {
      toast.error("Please fill in all required fields");
      return;
    }

    const adjustmentData = {
      product_id: adjustmentForm.product_id,
      warehouse_id: adjustmentForm.warehouse_id,
      adjustment_type: adjustmentForm.adjustment_type,
      quantity: parseInt(adjustmentForm.quantity),
      reason: adjustmentForm.reason,
      adjustment_date: new Date().toISOString().split('T')[0]
    };

    createAdjustmentMutation.mutate(adjustmentData);
  };

  const getAdjustmentBadge = (type: string) => {
    switch (type) {
      case 'INCREASE':
        return <Badge className="bg-green-100 text-green-800">Increase</Badge>;
      case 'DECREASE':
        return <Badge className="bg-red-100 text-red-800">Decrease</Badge>;
      case 'TRANSFER':
        return <Badge className="bg-blue-100 text-blue-800">Transfer</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Warehouse Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {warehouses?.map((warehouse) => (
          <Card key={warehouse.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{warehouse.name}</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">{warehouse.location}</div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-gray-600">Active</span>
                <Badge className="bg-green-100 text-green-800">
                  {warehouse.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stock Adjustments */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Stock Adjustments & Transfers</CardTitle>
            <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Adjustment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Stock Adjustment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Product</label>
                    <Select value={adjustmentForm.product_id} onValueChange={(value) => 
                      setAdjustmentForm(prev => ({ ...prev, product_id: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products?.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({product.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Warehouse</label>
                    <Select value={adjustmentForm.warehouse_id} onValueChange={(value) => 
                      setAdjustmentForm(prev => ({ ...prev, warehouse_id: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses?.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Adjustment Type</label>
                    <Select value={adjustmentForm.adjustment_type} onValueChange={(value) => 
                      setAdjustmentForm(prev => ({ ...prev, adjustment_type: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Select adjustment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCREASE">Increase Stock</SelectItem>
                        <SelectItem value="DECREASE">Decrease Stock</SelectItem>
                        <SelectItem value="TRANSFER">Transfer Between Warehouses</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Quantity</label>
                    <Input
                      type="number"
                      value={adjustmentForm.quantity}
                      onChange={(e) => setAdjustmentForm(prev => ({ ...prev, quantity: e.target.value }))}
                      placeholder="Enter quantity"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Reason</label>
                    <Textarea
                      value={adjustmentForm.reason}
                      onChange={(e) => setAdjustmentForm(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Enter reason for adjustment"
                    />
                  </div>

                  <Button onClick={handleCreateAdjustment} className="w-full">
                    Create Adjustment
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading adjustments...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Product</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Warehouse</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Reason</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {stockAdjustments?.map((adjustment) => (
                    <tr key={adjustment.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{format(new Date(adjustment.adjustment_date), 'dd/MM/yyyy')}</td>
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{adjustment.products?.name}</div>
                          <div className="text-sm text-gray-500">{adjustment.products?.code}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getAdjustmentBadge(adjustment.adjustment_type)}
                      </td>
                      <td className="py-3 px-4">
                        {adjustment.warehouses?.name || 
                         (adjustment.adjustment_type === 'TRANSFER' ? 
                          `${adjustment.from_warehouses?.name} → ${adjustment.to_warehouses?.name}` : 
                          'N/A')}
                      </td>
                      <td className="py-3 px-4">{adjustment.quantity} {adjustment.products?.unit_of_measurement}</td>
                      <td className="py-3 px-4">{adjustment.reason || '-'}</td>
                      <td className="py-3 px-4">{adjustment.reference_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {stockAdjustments?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No stock adjustments found.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
