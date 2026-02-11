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

export function WalletManagementTab() {
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [editingWallet, setEditingWallet] = useState<any>(null);
  const [walletForm, setWalletForm] = useState({
    wallet_name: ""
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    product_id: "",
    wallet_id: "",
    adjustment_type: "",
    quantity: "",
    reason: "",
    from_wallet_id: "",
    to_wallet_id: ""
  });

  const queryClient = useQueryClient();

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: walletTransactions } = useQuery({
    queryKey: ['wallet_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          wallets(wallet_name)
        `)
        .order('created_at', { ascending: false });
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
          products(name, code, unit_of_measurement)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createWalletMutation = useMutation({
    mutationFn: async (walletData: any) => {
      if (editingWallet) {
        const { data, error } = await supabase
          .from('wallets')
          .update(walletData)
          .eq('id', editingWallet.id);
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('wallets')
          .insert(walletData);
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success(editingWallet ? "Wallet updated successfully" : "Wallet created successfully");
      setShowWalletDialog(false);
      setEditingWallet(null);
      setWalletForm({ wallet_name: "" });
    },
    onError: (error) => {
      toast.error("Failed to save wallet");
      console.error("Error saving wallet:", error);
    }
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (walletId: string) => {
      const { data, error } = await supabase
        .from('wallets')
        .update({ is_active: false })
        .eq('id', walletId);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success("Wallet deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete wallet");
      console.error("Error deleting wallet:", error);
    }
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

      // Stock adjustment created successfully

      return adjustment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock_adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success("Stock adjustment created successfully");
      setShowAdjustmentDialog(false);
      setAdjustmentForm({
        product_id: "",
        wallet_id: "",
        adjustment_type: "",
        quantity: "",
        reason: "",
        from_wallet_id: "",
        to_wallet_id: ""
      });
    },
    onError: (error) => {
      toast.error("Failed to create stock adjustment");
      console.error("Error creating adjustment:", error);
    }
  });

  const handleCreateWallet = () => {
    if (!walletForm.wallet_name) {
      toast.error("Please enter wallet name");
      return;
    }

    createWalletMutation.mutate(walletForm);
  };

  const handleEditWallet = (wallet: any) => {
    setEditingWallet(wallet);
    setWalletForm({
      wallet_name: wallet.wallet_name
    });
    setShowWalletDialog(true);
  };

  const handleCreateAdjustment = () => {
    if (!adjustmentForm.product_id || !adjustmentForm.adjustment_type || !adjustmentForm.quantity) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (adjustmentForm.adjustment_type === 'TRANSFER' && (!adjustmentForm.from_wallet_id || !adjustmentForm.to_wallet_id)) {
      toast.error("Please select both source and destination wallets for transfer");
      return;
    }

    if (adjustmentForm.adjustment_type !== 'TRANSFER' && !adjustmentForm.wallet_id) {
      toast.error("Please select a wallet");
      return;
    }

    const adjustmentData = {
      product_id: adjustmentForm.product_id,
      wallet_id: adjustmentForm.adjustment_type !== 'TRANSFER' ? adjustmentForm.wallet_id : null,
      from_wallet_id: adjustmentForm.adjustment_type === 'TRANSFER' ? adjustmentForm.from_wallet_id : null,
      to_wallet_id: adjustmentForm.adjustment_type === 'TRANSFER' ? adjustmentForm.to_wallet_id : null,
      adjustment_type: adjustmentForm.adjustment_type,
      quantity: parseInt(adjustmentForm.quantity),
      reason: adjustmentForm.reason,
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

  const getWalletTransactions = (walletId: string) => {
    return walletTransactions?.filter(transaction => transaction.wallet_id === walletId) || [];
  };

  return (
    <div className="space-y-6">
      {/* Wallet Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Wallet Management</CardTitle>
            <Dialog open={showWalletDialog} onOpenChange={setShowWalletDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingWallet(null);
                  setWalletForm({ wallet_name: "" });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Wallet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingWallet ? 'Edit Wallet' : 'Add New Wallet'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Wallet Name</Label>
                    <Input
                      value={walletForm.wallet_name}
                      onChange={(e) => setWalletForm(prev => ({ ...prev, wallet_name: e.target.value }))}
                      placeholder="Enter wallet name"
                    />
                  </div>
                  <Button onClick={handleCreateWallet} className="w-full">
                    {editingWallet ? 'Update Wallet' : 'Create Wallet'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wallets?.map((wallet) => {
              const transactions = getWalletTransactions(wallet.id);
              const totalTransactions = transactions.length;
              
              return (
                <Card key={wallet.id} className="border">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{wallet.wallet_name}</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEditWallet(wallet)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteWalletMutation.mutate(wallet.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground mb-2">Balance: {wallet.current_balance}</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Balance</span>
                        <Badge variant="outline">{wallet.current_balance}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Total Transactions</span>
                        <Badge className="bg-green-100 text-green-800">{totalTransactions}</Badge>
                      </div>
                      <div className="mt-3">
                        <h4 className="text-sm font-medium mb-2">Recent Transactions</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {transactions.slice(0, 5).map((transaction, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span>{transaction.transaction_type}</span>
                              <span>{transaction.amount}</span>
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
                        <SelectItem value="TRANSFER">Transfer Between Wallets</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {adjustmentForm.adjustment_type === 'TRANSFER' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>From Wallet</Label>
                        <Select value={adjustmentForm.from_wallet_id} onValueChange={(value) => 
                          setAdjustmentForm(prev => ({ ...prev, from_wallet_id: value }))
                        }>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                          <SelectContent>
                            {wallets?.map((wallet) => (
                              <SelectItem key={wallet.id} value={wallet.id}>
                                {wallet.wallet_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>To Wallet</Label>
                        <Select value={adjustmentForm.to_wallet_id} onValueChange={(value) => 
                          setAdjustmentForm(prev => ({ ...prev, to_wallet_id: value }))
                        }>
                          <SelectTrigger>
                            <SelectValue placeholder="Select destination" />
                          </SelectTrigger>
                          <SelectContent>
                            {wallets?.filter(w => w.id !== adjustmentForm.from_wallet_id).map((wallet) => (
                              <SelectItem key={wallet.id} value={wallet.id}>
                                {wallet.wallet_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label>Wallet</Label>
                      <Select value={adjustmentForm.wallet_id} onValueChange={(value) => 
                        setAdjustmentForm(prev => ({ ...prev, wallet_id: value }))
                      }>
                        <SelectTrigger>
                          <SelectValue placeholder="Select wallet" />
                        </SelectTrigger>
                        <SelectContent>
                          {wallets?.map((wallet) => (
                            <SelectItem key={wallet.id} value={wallet.id}>
                              {wallet.wallet_name}
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
                      placeholder="Reason for adjustment"
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
            <div className="text-center py-8">Loading stock adjustments...</div>
          ) : stockAdjustments && stockAdjustments.length > 0 ? (
            <div className="space-y-4">
              {stockAdjustments.map((adjustment) => (
                <div key={adjustment.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold">{adjustment.products?.name}</h3>
                      <p className="text-sm text-gray-600">Code: {adjustment.products?.code}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getAdjustmentBadge(adjustment.adjustment_type)}
                      <span className="text-sm text-gray-500">
                        {format(new Date(adjustment.created_at), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Quantity:</span> {adjustment.quantity} {adjustment.products?.unit_of_measurement}
                    </div>
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
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No stock adjustments recorded</p>
              <Button className="mt-4" onClick={() => setShowAdjustmentDialog(true)}>
                Create Stock Adjustment
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}