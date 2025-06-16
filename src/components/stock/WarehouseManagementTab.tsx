
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Building, Package, ArrowUpDown, Edit, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

export function WarehouseManagementTab() {
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [showWarehouseDialog, setShowWarehouseDialog] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<any>(null);
  const [warehouseForm, setWarehouseForm] = useState({
    name: "",
    location: ""
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    product_id: "",
    warehouse_id: "",
    adjustment_type: "",
    quantity: "",
    reason: "",
    from_warehouse_id: "",
    to_warehouse_id: ""
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

  const { data: warehouseStock } = useQuery({
    queryKey: ['warehouse_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_stock_movements')
        .select(`
          warehouse_id,
          product_id,
          movement_type,
          quantity,
          products(name, code, unit_of_measurement),
          warehouses(name)
        `);
      if (error) throw error;
      
      // Aggregate stock by warehouse and product
      const stockMap = new Map();
      data?.forEach(movement => {
        const key = `${movement.warehouse_id}-${movement.product_id}`;
        if (!stockMap.has(key)) {
          stockMap.set(key, {
            warehouse_id: movement.warehouse_id,
            warehouse_name: movement.warehouses?.name,
            product_id: movement.product_id,
            product: movement.products,
            quantity: 0
          });
        }
        
        const stock = stockMap.get(key);
        if (movement.movement_type === 'IN' || movement.movement_type === 'ADJUSTMENT') {
          stock.quantity += movement.quantity;
        } else if (movement.movement_type === 'OUT' || movement.movement_type === 'TRANSFER') {
          stock.quantity -= movement.quantity;
        }
      });
      
      return Array.from(stockMap.values());
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
          warehouse:warehouses!warehouse_id(name, location),
          from_warehouse:warehouses!from_warehouse_id(name),
          to_warehouse:warehouses!to_warehouse_id(name)
        `)
        .order('adjustment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createWarehouseMutation = useMutation({
    mutationFn: async (warehouseData: any) => {
      if (editingWarehouse) {
        const { data, error } = await supabase
          .from('warehouses')
          .update(warehouseData)
          .eq('id', editingWarehouse.id);
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('warehouses')
          .insert(warehouseData);
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(editingWarehouse ? "Warehouse updated successfully" : "Warehouse created successfully");
      setShowWarehouseDialog(false);
      setEditingWarehouse(null);
      setWarehouseForm({ name: "", location: "" });
    },
    onError: (error) => {
      toast.error("Failed to save warehouse");
      console.error("Error saving warehouse:", error);
    }
  });

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (warehouseId: string) => {
      const { data, error } = await supabase
        .from('warehouses')
        .update({ is_active: false })
        .eq('id', warehouseId);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success("Warehouse deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete warehouse");
      console.error("Error deleting warehouse:", error);
    }
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
      queryClient.invalidateQueries({ queryKey: ['warehouse_stock'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success("Stock adjustment created successfully");
      setShowAdjustmentDialog(false);
      setAdjustmentForm({
        product_id: "",
        warehouse_id: "",
        adjustment_type: "",
        quantity: "",
        reason: "",
        from_warehouse_id: "",
        to_warehouse_id: ""
      });
    },
    onError: (error) => {
      toast.error("Failed to create stock adjustment");
      console.error("Error creating adjustment:", error);
    }
  });

  const handleCreateWarehouse = () => {
    if (!warehouseForm.name) {
      toast.error("Please enter warehouse name");
      return;
    }

    createWarehouseMutation.mutate(warehouseForm);
  };

  const handleEditWarehouse = (warehouse: any) => {
    setEditingWarehouse(warehouse);
    setWarehouseForm({
      name: warehouse.name,
      location: warehouse.location || ""
    });
    setShowWarehouseDialog(true);
  };

  const handleCreateAdjustment = () => {
    if (!adjustmentForm.product_id || !adjustmentForm.adjustment_type || !adjustmentForm.quantity) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (adjustmentForm.adjustment_type === 'TRANSFER' && (!adjustmentForm.from_warehouse_id || !adjustmentForm.to_warehouse_id)) {
      toast.error("Please select both source and destination warehouses for transfer");
      return;
    }

    if (adjustmentForm.adjustment_type !== 'TRANSFER' && !adjustmentForm.warehouse_id) {
      toast.error("Please select a warehouse");
      return;
    }

    const adjustmentData = {
      product_id: adjustmentForm.product_id,
      warehouse_id: adjustmentForm.adjustment_type !== 'TRANSFER' ? adjustmentForm.warehouse_id : null,
      from_warehouse_id: adjustmentForm.adjustment_type === 'TRANSFER' ? adjustmentForm.from_warehouse_id : null,
      to_warehouse_id: adjustmentForm.adjustment_type === 'TRANSFER' ? adjustmentForm.to_warehouse_id : null,
      adjustment_type: adjustmentForm.adjustment_type,
      quantity: parseInt(adjustmentForm.quantity),
      reason: adjustmentForm.reason,
      adjustment_date: new Date().toISOString().split('T')[0]
    };

    createAdjustmentMutation.mutate(adjustmentData);
  };

  const getAdjustmentBadge = (type: string) => {
    switch (type) {
      case 'LOST':
        return <Badge className="bg-red-100 text-red-800">Lost</Badge>;
      case 'CORRECTION':
        return <Badge className="bg-yellow-100 text-yellow-800">Correction</Badge>;
      case 'TRANSFER':
        return <Badge className="bg-blue-100 text-blue-800">Transfer</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getWarehouseStock = (warehouseId: string) => {
    return warehouseStock?.filter(stock => stock.warehouse_id === warehouseId) || [];
  };

  return (
    <div className="space-y-6">
      {/* Warehouse Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Warehouse Management</CardTitle>
            <Dialog open={showWarehouseDialog} onOpenChange={setShowWarehouseDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingWarehouse(null);
                  setWarehouseForm({ name: "", location: "" });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Warehouse
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Warehouse Name</Label>
                    <Input
                      value={warehouseForm.name}
                      onChange={(e) => setWarehouseForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter warehouse name"
                    />
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={warehouseForm.location}
                      onChange={(e) => setWarehouseForm(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="Enter warehouse location"
                    />
                  </div>
                  <Button onClick={handleCreateWarehouse} className="w-full">
                    {editingWarehouse ? 'Update Warehouse' : 'Create Warehouse'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {warehouses?.map((warehouse) => {
              const stocks = getWarehouseStock(warehouse.id);
              const totalProducts = stocks.length;
              const totalQuantity = stocks.reduce((sum, stock) => sum + stock.quantity, 0);
              
              return (
                <Card key={warehouse.id} className="border">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{warehouse.name}</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEditWarehouse(warehouse)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteWarehouseMutation.mutate(warehouse.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground mb-2">{warehouse.location}</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Products</span>
                        <Badge variant="outline">{totalProducts}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Total Quantity</span>
                        <Badge className="bg-green-100 text-green-800">{totalQuantity}</Badge>
                      </div>
                      <div className="mt-3">
                        <h4 className="text-sm font-medium mb-2">Stock Details</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {stocks.map((stock, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span>{stock.product?.name}</span>
                              <span>{stock.quantity} {stock.product?.unit_of_measurement}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

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
                    <Label>Product</Label>
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
                    <Label>Adjustment Type</Label>
                    <Select value={adjustmentForm.adjustment_type} onValueChange={(value) => 
                      setAdjustmentForm(prev => ({ ...prev, adjustment_type: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Select adjustment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOST">Lost Stock</SelectItem>
                        <SelectItem value="CORRECTION">Stock Correction</SelectItem>
                        <SelectItem value="TRANSFER">Transfer Between Warehouses</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {adjustmentForm.adjustment_type === 'TRANSFER' ? (
                    <>
                      <div>
                        <Label>From Warehouse</Label>
                        <Select value={adjustmentForm.from_warehouse_id} onValueChange={(value) => 
                          setAdjustmentForm(prev => ({ ...prev, from_warehouse_id: value }))
                        }>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source warehouse" />
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
                        <Label>To Warehouse</Label>
                        <Select value={adjustmentForm.to_warehouse_id} onValueChange={(value) => 
                          setAdjustmentForm(prev => ({ ...prev, to_warehouse_id: value }))
                        }>
                          <SelectTrigger>
                            <SelectValue placeholder="Select destination warehouse" />
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
                    </>
                  ) : (
                    <div>
                      <Label>Warehouse</Label>
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
                  )}

                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={adjustmentForm.quantity}
                      onChange={(e) => setAdjustmentForm(prev => ({ ...prev, quantity: e.target.value }))}
                      placeholder="Enter quantity"
                    />
                  </div>

                  <div>
                    <Label>Reason</Label>
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
                        {adjustment.warehouse?.name || 
                         (adjustment.adjustment_type === 'TRANSFER' ? 
                          `${adjustment.from_warehouse?.name} → ${adjustment.to_warehouse?.name}` : 
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
