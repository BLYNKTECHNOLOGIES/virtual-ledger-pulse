import { format } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Wallet, TrendingUp, TrendingDown, Copy, Trash2, RefreshCw, Upload, Pencil, Percent } from "lucide-react";
import { WalletLinkingSection } from "./WalletLinkingSection";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ImportWalletsDialog } from "./ImportWalletsDialog";
import { EditWalletDialog } from "./EditWalletDialog";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { ClickableUser } from "@/components/ui/clickable-user";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WalletType {
  id: string;
  wallet_name: string;
  wallet_address: string;
  chain_name?: string;
  current_balance: number;
  total_received: number;
  total_sent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  fee_percentage?: number;
  is_fee_enabled?: boolean;
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
  wallets?: WalletType;
}

export function WalletManagementTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddWalletDialog, setShowAddWalletDialog] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null);
  const [editingWallet, setEditingWallet] = useState<WalletType | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch wallets with real-time updates
  const { data: wallets, isLoading: walletsLoading, refetch: refetchWallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as WalletType[];
    },
    refetchInterval: 5000, // Live updates every 5 seconds
    staleTime: 0, // Always consider data stale to ensure fresh data
  });

  // Fetch wallet transactions with real-time updates
  const { data: transactions, isLoading: transactionsLoading, refetch: refetchTransactions } = useQuery({
    queryKey: ['wallet_transactions_live'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          wallets (
            wallet_name
          ),
          created_by_user:users!created_by(username, first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000, // Live updates every 5 seconds
    staleTime: 0,
  });

  // Add wallet mutation
  const addWalletMutation = useMutation({
    mutationFn: async (walletData: {
      wallet_name: string;
      wallet_address: string;
      chain_name: string;
      current_balance: number;
      fee_percentage?: number;
      is_fee_enabled?: boolean;
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
      
    }
  });

  // Delete wallet mutation
  const deleteWalletMutation = useMutation({
    mutationFn: async (walletId: string) => {
      const { error } = await supabase
        .from('wallets')
        .delete()
        .eq('id', walletId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Wallet deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to delete wallet", 
        variant: "destructive" 
      });
      
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
      // Get current user ID for attribution - validate UUID format
      const rawUserId = getCurrentUserId();
      const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const createdByUserId = isValidUuid ? rawUserId : null;

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
          balance_after: balanceAfter,
          created_by: createdByUserId
        }]);
      
      if (error) throw error;

      // Stock syncing is handled by database triggers automatically
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Wallet transaction added successfully. Wallet balance updated automatically." });
      // Refresh all wallet-related queries
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      queryClient.invalidateQueries({ queryKey: ['products'] }); // For USDT stock sync
      refetchWallets(); // Force immediate refresh
      setShowTransactionDialog(false);
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to add transaction", 
        variant: "destructive" 
      });
      
    }
  });

  // Copy address to clipboard
  // Delete wallet transaction mutation (with reversal)
  const deleteTransactionMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const rawUserId = getCurrentUserId();
      const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const deletedBy = isValidUuid ? rawUserId : null;

      const { data, error } = await supabase.rpc('delete_wallet_transaction_with_reversal', {
        p_transaction_id: transactionId,
        p_deleted_by: deletedBy
      });

      if (error) throw error;
      const result = data as { success: boolean; error?: string; reversed_amount?: number } | null;
      if (!result?.success) throw new Error(result?.error || 'Failed to delete transaction');
      
      return result;
    },
    onSuccess: (result) => {
      toast({ 
        title: "Transaction Deleted", 
        description: `Transaction deleted and wallet balance reversed by ${Math.abs(result?.reversed_amount || 0).toLocaleString()} USDT` 
      });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions_live'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_transactions'] });
      refetchWallets();
      refetchTransactions();
      setShowDeleteConfirm(false);
      setTransactionToDelete(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete transaction", 
        variant: "destructive" 
      });
    }
  });

  // Check if transaction is deletable (only manual adjustments/transfers)
  const isDeletable = (referenceType: string) => {
    return ['MANUAL_ADJUSTMENT', 'MANUAL_TRANSFER', 'TRANSFER_FEE'].includes(referenceType);
  };

  const handleDeleteTransaction = (transaction: any) => {
    setTransactionToDelete(transaction);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteTransaction = () => {
    if (transactionToDelete) {
      deleteTransactionMutation.mutate(transactionToDelete.id);
    }
  };

  // Copy address to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Wallet address copied to clipboard" });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to copy address", 
        variant: "destructive" 
      });
    }
  };

  // Delete wallet with confirmation
  const handleDeleteWallet = (wallet: WalletType) => {
    if (window.confirm(`Are you sure you want to delete wallet "${wallet.wallet_name}"? This action cannot be undone.`)) {
      deleteWalletMutation.mutate(wallet.id);
    }
  };

  // Handle edit wallet
  const handleEditWallet = (wallet: WalletType) => {
    setEditingWallet(wallet);
    setShowEditDialog(true);
  };

  // Sync USDT stock mutation
  const syncStockMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('sync_usdt_stock');
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "USDT stock synced with wallet balances" });
      // Refresh all wallet-related queries
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      refetchWallets(); // Force immediate refresh
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to sync USDT stock", 
        variant: "destructive" 
      });
      
    }
  });

  const AddWalletDialog = () => {
    const [formData, setFormData] = useState({
      wallet_name: '',
      wallet_address: '',
      chain_name: '',
      current_balance: '',
      fee_percentage: '0',
      is_fee_enabled: true
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      addWalletMutation.mutate({
        ...formData,
        current_balance: parseFloat(formData.current_balance) || 0,
        fee_percentage: parseFloat(formData.fee_percentage) || 0,
        is_fee_enabled: formData.is_fee_enabled
      });
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
              <Label htmlFor="chain_name">Chain Name</Label>
              <Select value={formData.chain_name} onValueChange={(value) => setFormData({ ...formData, chain_name: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select chain" />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-200 shadow-lg z-50">
                  <SelectItem value="Ethereum">Ethereum (ETH)</SelectItem>
                  <SelectItem value="Binance Smart Chain">Binance Smart Chain (BSC)</SelectItem>
                  <SelectItem value="Polygon">Polygon (MATIC)</SelectItem>
                  <SelectItem value="Tron">Tron (TRX)</SelectItem>
                  <SelectItem value="Solana">Solana (SOL)</SelectItem>
                  <SelectItem value="Bitcoin">Bitcoin (BTC)</SelectItem>
                  <SelectItem value="APTOS">APTOS (APT)</SelectItem>
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
                onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                placeholder="Enter initial balance"
                required
              />
            </div>
            
            {/* Platform Fee Settings */}
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Platform Fee Settings
              </h4>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is_fee_enabled">Enable Fee Deduction</Label>
                  <p className="text-xs text-muted-foreground">Auto-deduct fees from orders</p>
                </div>
                <Switch
                  id="is_fee_enabled"
                  checked={formData.is_fee_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_fee_enabled: checked })}
                />
              </div>
              
              <div>
                <Label htmlFor="fee_percentage">Fee Percentage (%)</Label>
                <Input
                  id="fee_percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.fee_percentage}
                  onChange={(e) => setFormData({ ...formData, fee_percentage: e.target.value })}
                  placeholder="e.g., 1.5"
                  disabled={!formData.is_fee_enabled}
                />
              </div>
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
      amount: '',
      description: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        toast({
          title: "Error",
          description: "Please enter a valid amount",
          variant: "destructive"
        });
        return;
      }
      addTransactionMutation.mutate({
        ...formData,
        amount
      });
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
                      {wallet.wallet_name}
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
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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
      {/* Terminal Wallet Links */}
      <WalletLinkingSection />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Wallet Management</h2>
          <p className="text-gray-600">Manage cryptocurrency wallets</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetchWallets()} variant="outline" disabled={walletsLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Wallets
          </Button>
          <Button onClick={() => syncStockMutation.mutate()} variant="outline" disabled={syncStockMutation.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync USDT Stock
          </Button>
          <Button onClick={() => setShowImportDialog(true)} variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Import
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
                  <TableHead>Chain</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Fee %</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets?.map((wallet) => (
                  <TableRow key={wallet.id}>
                    <TableCell className="font-medium">{wallet.wallet_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{wallet.chain_name || "N/A"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span>
                          {wallet.wallet_address 
                            ? `${wallet.wallet_address.substring(0, 10)}...${wallet.wallet_address.substring(wallet.wallet_address.length - 6)}`
                            : 'N/A'
                          }
                        </span>
                        {wallet.wallet_address && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => copyToClipboard(wallet.wallet_address)}
                            className="h-6 w-6 p-0"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{(wallet.current_balance ?? 0).toLocaleString()}</TableCell>
                    <TableCell>
                      {wallet.is_fee_enabled && (wallet.fee_percentage || 0) > 0 ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          <Percent className="h-3 w-3 mr-1" />
                          {(wallet.fee_percentage || 0).toFixed(2)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">No fee</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={wallet.is_active ? "default" : "secondary"}>
                        {wallet.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleEditWallet(wallet)}
                          className="h-7 w-7 p-0"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteWallet(wallet)}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
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
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Balance After</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions?.slice(0, 50).map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{format(new Date(transaction.created_at), 'MMM dd, yyyy')}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(transaction.created_at), 'HH:mm:ss')}
                        </span>
                      </div>
                    </TableCell>
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
                    <TableCell>{(transaction.amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{transaction.reference_type}</Badge>
                    </TableCell>
                    <TableCell>{transaction.description}</TableCell>
                    <TableCell>{(transaction.balance_after ?? 0).toLocaleString()}</TableCell>
                    <TableCell>
                      {(transaction as any).created_by_user && (transaction as any).created_by_user.username ? (
                        <ClickableUser
                          userId={(transaction as any).created_by}
                          username={(transaction as any).created_by_user.username}
                          firstName={(transaction as any).created_by_user.first_name}
                          lastName={(transaction as any).created_by_user.last_name}
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isDeletable(transaction.reference_type) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteTransaction(transaction)}
                          disabled={deleteTransactionMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddWalletDialog />
      <AddTransactionDialog />

      {/* Edit Wallet Dialog */}
      <EditWalletDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        wallet={editingWallet}
      />

      {/* Import Dialog */}
      <ImportWalletsDialog 
        open={showImportDialog} 
        onOpenChange={setShowImportDialog} 
      />

      {/* Delete Transaction Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction & Reverse Balance</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction? This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Delete the transaction record</li>
                <li>Reverse the wallet balance by <strong>{transactionToDelete?.amount?.toLocaleString()} USDT</strong></li>
                {transactionToDelete?.reference_type === 'MANUAL_TRANSFER' && (
                  <li>Delete all related transfer transactions (including fee if any)</li>
                )}
              </ul>
              <p className="mt-3 text-destructive font-medium">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTransactionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteTransaction}
              disabled={deleteTransactionMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTransactionMutation.isPending ? "Deleting..." : "Delete & Reverse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}