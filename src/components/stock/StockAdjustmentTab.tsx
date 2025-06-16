
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Settings, Plus, ArrowRightLeft, Minus, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function StockAdjustmentTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  
  const [formData, setFormData] = useState({
    product_id: "",
    adjustment_type: "",
    from_warehouse_id: "",
    to_warehouse_id: "",
    quantity: 0,
    reason: "",
    reference_number: "",
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch warehouses
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

  // Fetch stock adjustments
  const { data: adjustments, isLoading } = useQuery({
    queryKey: ['stock_adjustments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select(`
          *,
          products(name, code),
          from_warehouse:warehouses!stock_adjustments_from_warehouse_id_fkey(name),
          to_warehouse:warehouses!stock_adjustments_to_warehouse_id_fkey(name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const createAdjustmentMutation = useMutation({
    mutationFn: async (adjustmentData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create stock adjustment record
      const { data: adjustment, error: adjustmentError } = await supabase
        .from('stock_adjustments')
        .insert({
          ...adjustmentData,
          created_by: user?.id,
        })
        .select()
        .single();

      if (adjustmentError) throw adjustmentError;

      // Update product stock based on adjustment type
      if (adjustmentData.adjustment_type === 'TRANSFER') {
        // For transfers, we need to update warehouse-specific stock
        // This would require implementing warehouse stock tracking
        console.log('Transfer adjustment created:', adjustment);
      } else {
        // For other adjustments, update main stock quantity
        const { data: product } = await supabase
          .from('products')
          .select('current_stock_quantity')
          .eq('id', adjustmentData.product_id)
          .single();
          
        if (product) {
          let newQuantity = product.current_stock_quantity;
          
          if (adjustmentData.adjustment_type === 'ADJUSTMENT') {
            newQuantity += adjustmentData.quantity;
          } else if (adjustmentData.adjustment_type === 'DAMAGE' || adjustmentData.adjustment_type === 'LOSS') {
            newQuantity -= adjustmentData.quantity;
          }
          
          await supabase
            .from('products')
            .update({ current_stock_quantity: Math.max(0, newQuantity) })
            .eq('id', adjustmentData.product_id);
        }
      }

      return adjustment;
    },
    onSuccess: () => {
      toast({
        title: "Stock Adjustment Created",
        description: "Stock adjustment has been successfully recorded.",
      });
      queryClient.invalidateQueries({ queryKey: ['stock_adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      resetForm();
      setShowDialog(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create stock adjustment: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      product_id: "",
      adjustment_type: "",
      from_warehouse_id: "",
      to_warehouse_id: "",
      quantity: 0,
      reason: "",
      reference_number: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.adjustment_type === 'TRANSFER' && !formData.from_warehouse_id) {
      toast({
        title: "Error",
        description: "From warehouse is required for transfers",
        variant: "destructive",
      });
      return;
    }
    
    if (formData.adjustment_type === 'TRANSFER' && !formData.to_warehouse_id) {
      toast({
        title: "Error",
        description: "To warehouse is required for transfers",
        variant: "destructive",
      });
      return;
    }
    
    if (formData.adjustment_type === 'TRANSFER' && formData.from_warehouse_id === formData.to_warehouse_id) {
      toast({
        title: "Error",
        description: "From and To warehouses cannot be the same",
        variant: "destructive",
      });
      return;
    }

    createAdjustmentMutation.mutate({
      ...formData,
      quantity: Math.abs(formData.quantity),
    });
  };

  const getAdjustmentTypeBadge = (type: string) => {
    const configs = {
      'TRANSFER': { color: 'bg-blue-100 text-blue-800', icon: ArrowRightLeft },
      'ADJUSTMENT': { color: 'bg-green-100 text-green-800', icon: Plus },
      'DAMAGE': { color: 'bg-red-100 text-red-800', icon: AlertTriangle },
      'LOSS': { color: 'bg-orange-100 text-orange-800', icon: Minus }
    };
    
    const config = configs[type as keyof typeof configs] || { color: 'bg-gray-100 text-gray-800', icon: Settings };
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {type}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Stock Adjustments
            </CardTitle>
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Adjustment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading stock adjustments...</div>
          ) : adjustments && adjustments.length > 0 ? (
            <div className="space-y-4">
              {adjustments.map((adjustment) => (
                <div key={adjustment.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="font-semibold">{adjustment.products?.name}</h3>
                        <p className="text-sm text-gray-600">Code: {adjustment.products?.code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getAdjustmentTypeBadge(adjustment.adjustment_type)}
                      <span className="text-sm text-gray-500">
                        {format(new Date(adjustment.created_at), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Quantity:</span> {adjustment.quantity}
                    </div>
                    
                    {adjustment.adjustment_type === 'TRANSFER' && (
                      <>
                        <div>
                          <span className="font-medium">From:</span> {adjustment.from_warehouse?.name || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">To:</span> {adjustment.to_warehouse?.name || 'N/A'}
                        </div>
                      </>
                    )}
                    
                    {adjustment.reference_number && (
                      <div>
                        <span className="font-medium">Reference:</span> {adjustment.reference_number}
                      </div>
                    )}
                  </div>
                  
                  {adjustment.reason && (
                    <div className="mt-3 pt-3 border-t">
                      <span className="font-medium text-sm">Reason:</span>
                      <p className="text-sm text-gray-600 mt-1">{adjustment.reason}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Settings className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No stock adjustments recorded</p>
              <Button className="mt-4" onClick={() => setShowDialog(true)}>
                Create Stock Adjustment
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock Adjustment Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Stock Adjustment</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product_id">Product *</Label>
                <Select onValueChange={(value) => setFormData(prev => ({ ...prev, product_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({product.code}) - Stock: {product.current_stock_quantity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="adjustment_type">Adjustment Type *</Label>
                <Select onValueChange={(value) => setFormData(prev => ({ ...prev, adjustment_type: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select adjustment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRANSFER">Transfer Between Warehouses</SelectItem>
                    <SelectItem value="ADJUSTMENT">Stock Adjustment (Add/Remove)</SelectItem>
                    <SelectItem value="DAMAGE">Damage</SelectItem>
                    <SelectItem value="LOSS">Loss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.adjustment_type === 'TRANSFER' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="from_warehouse_id">From Warehouse *</Label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, from_warehouse_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses?.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} {warehouse.location && `(${warehouse.location})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="to_warehouse_id">To Warehouse *</Label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, to_warehouse_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select destination warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses?.filter(w => w.id !== formData.from_warehouse_id).map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} {warehouse.location && `(${warehouse.location})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="reference_number">Reference Number</Label>
                <Input
                  id="reference_number"
                  value={formData.reference_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, reference_number: e.target.value }))}
                  placeholder="ADJ-001"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Reason for stock adjustment..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createAdjustmentMutation.isPending}>
                {createAdjustmentMutation.isPending ? "Creating..." : "Create Adjustment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
