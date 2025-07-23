import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Wallet, TrendingUp, TrendingDown, Edit, Trash2, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Wallet {
  id: string;
  wallet_name: string;
  wallet_address: string;
  wallet_type: string;
  current_balance: number;
  total_received: number;
  total_sent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WalletTransaction {
  id: string;
  wallet_id: string;
  transaction_type: string;
  amount: number;
  reference_type: string;
  reference_id: string;
  description: string;
  balance_before: number;
  balance_after: number;
  created_at: string;
  wallets?: Wallet;
}

export function WalletManagementTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddWalletDialog, setShowAddWalletDialog] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);

  // Fetch wallets
  const { data: wallets, isLoading: walletsLoading } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Wallet[];
    },
  });

  // Fetch wallet transactions
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['wallet_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          wallets (
            wallet_name,
            wallet_type
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as WalletTransaction[];
    },
  });

  // Add wallet mutation
  const addWalletMutation = useMutation({
    mutationFn: async (walletData: {
      wallet_name: string;
      wallet_address: string;
      wallet_type: string;
      current_balance: number;
    }) => {
      const { error } = await supabase
        .from('wallets')
        .insert([walletData]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Wallet added successfully" });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      setShowAddWalletDialog(false);
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to add wallet", 
        variant: "destructive" 
      });
      console.error('Error adding wallet:', error);
    }
  });

  // Update wallet mutation
  const updateWalletMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Wallet> }) => {
      const { error } = await supabase
        .from('wallets')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Wallet updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      setEditingWallet(null);
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to update wallet", 
        variant: "destructive" 
      });
      console.error('Error updating wallet:', error);
    }
  });

  // Add manual transaction mutation
  const addTransactionMutation = useMutation({
    mutationFn: async (transactionData: {
      wallet_id: string;
      transaction_type: string;
      amount: number;
      description: string;
    }) => {
      // Get current balance first
      const { data: wallet } = await supabase
        .from('wallets')
        .select('current_balance')
        .eq('id', transactionData.wallet_id)
        .single();

      if (!wallet) throw new Error('Wallet not found');

      const balanceBefore = wallet.current_balance;
      const balanceAfter = transactionData.transaction_type === 'CREDIT' 
        ? balanceBefore + transactionData.amount
        : balanceBefore - transactionData.amount;

      const { error } = await supabase
        .from('wallet_transactions')
        .insert([{
          ...transactionData,
          reference_type: 'MANUAL_ADJUSTMENT',
          balance_before: balanceBefore,
          balance_after: balanceAfter
        }]);
      
      if (error) throw error;

      // Sync USDT stock
      await supabase.rpc('sync_usdt_stock');
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Transaction added successfully" });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions', 'wallets'] });
      setShowTransactionDialog(false);
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to add transaction", 
        variant: "destructive" 
      });
      console.error('Error adding transaction:', error);
    }
  });

  // Sync USDT stock mutation
  const syncStockMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('sync_usdt_stock');
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "USDT stock synced with wallet balances" });
      queryClient.invalidateQueries({ queryKey: ['products', 'wallets'] });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to sync USDT stock", 
        variant: "destructive" 
      });
      console.error('Error syncing stock:', error);
    }
  });

  const AddWalletDialog = () => {
    const [formData, setFormData] = useState({
      wallet_name: '',
      wallet_address: '',
      wallet_type: 'USDT',
      current_balance: 0
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      addWalletMutation.mutate(formData);
    };

    return (
      <Dialog open={showAddWalletDialog} onOpenChange={setShowAddWalletDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Wallet</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="wallet_name">Wallet Name</Label>
              <Input
                id="wallet_name"
                value={formData.wallet_name}
                onChange={(e) => setFormData({ ...formData, wallet_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="wallet_address">Wallet Address</Label>
              <Input
                id="wallet_address"
                value={formData.wallet_address}
                onChange={(e) => setFormData({ ...formData, wallet_address: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="wallet_type">Wallet Type</Label>
              <Select value={formData.wallet_type} onValueChange={(value) => setFormData({ ...formData, wallet_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="BTC">Bitcoin</SelectItem>
                  <SelectItem value="ETH">Ethereum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="current_balance">Initial Balance</Label>
              <Input
                id="current_balance"
                type="number"
                step="0.01"
                value={formData.current_balance}
                onChange={(e) => setFormData({ ...formData, current_balance: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={addWalletMutation.isPending}>
                {addWalletMutation.isPending ? 'Adding...' : 'Add Wallet'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowAddWalletDialog(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  const AddTransactionDialog = () => {
    const [formData, setFormData] = useState({
      wallet_id: '',
      transaction_type: 'CREDIT',
      amount: 0,
      description: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      addTransactionMutation.mutate(formData);
    };

    return (
      <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Transaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="wallet_id">Select Wallet</Label>
              <Select value={formData.wallet_id} onValueChange={(value) => setFormData({ ...formData, wallet_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets?.filter(w => w.is_active).map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} ({wallet.wallet_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="transaction_type">Transaction Type</Label>
              <Select value={formData.transaction_type} onValueChange={(value) => setFormData({ ...formData, transaction_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CREDIT">Credit (Add Funds)</SelectItem>
                  <SelectItem value="DEBIT">Debit (Remove Funds)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Transaction description"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={addTransactionMutation.isPending}>
                {addTransactionMutation.isPending ? 'Adding...' : 'Add Transaction'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowTransactionDialog(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  const totalBalance = wallets?.reduce((sum, wallet) => wallet.is_active ? sum + wallet.current_balance : sum, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Wallet Management</h2>
          <p className="text-gray-600">Manage USDT and cryptocurrency wallets</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => syncStockMutation.mutate()} variant="outline" disabled={syncStockMutation.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync USDT Stock
          </Button>
          <Button onClick={() => setShowTransactionDialog(true)} variant="outline">
            <TrendingUp className="h-4 w-4 mr-2" />
            Add Transaction
          </Button>
          <Button onClick={() => setShowAddWalletDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Wallet
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Wallet Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBalance.toLocaleString()} USDT</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Wallets</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{wallets?.filter(w => w.is_active).length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Wallets</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{wallets?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Wallets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Wallets</CardTitle>
        </CardHeader>
        <CardContent>
          {walletsLoading ? (
            <div className="text-center py-4">Loading wallets...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Total Received</TableHead>
                  <TableHead>Total Sent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets?.map((wallet) => (
                  <TableRow key={wallet.id}>
                    <TableCell className="font-medium">{wallet.wallet_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{wallet.wallet_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {wallet.wallet_address.substring(0, 10)}...{wallet.wallet_address.substring(wallet.wallet_address.length - 6)}
                    </TableCell>
                    <TableCell>{wallet.current_balance.toLocaleString()}</TableCell>
                    <TableCell>{wallet.total_received.toLocaleString()}</TableCell>
                    <TableCell>{wallet.total_sent.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={wallet.is_active ? "default" : "secondary"}>
                        {wallet.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingWallet(wallet)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="text-center py-4">Loading transactions...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Balance After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions?.slice(0, 10).map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{new Date(transaction.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{transaction.wallets?.wallet_name}</TableCell>
                    <TableCell>
                      <Badge variant={transaction.transaction_type === 'CREDIT' ? "default" : "destructive"}>
                        {transaction.transaction_type === 'CREDIT' ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {transaction.transaction_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{transaction.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{transaction.reference_type}</Badge>
                    </TableCell>
                    <TableCell>{transaction.description}</TableCell>
                    <TableCell>{transaction.balance_after.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddWalletDialog />
      <AddTransactionDialog />
    </div>
  );
}