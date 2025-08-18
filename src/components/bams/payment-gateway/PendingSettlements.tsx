import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, DollarSign, Calendar, Building, ArrowRight, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PendingSale {
  id: string;
  sales_order_id: string;
  order_number: string;
  client_name: string;
  total_amount: number;
  settlement_amount: number;
  order_date: string;
  payment_method_id: string | null;
  bank_account_id: string | null;
  status: string;
  settlement_cycle: string | null;
  settlement_days: number | null;
  expected_settlement_date: string | null;
  mdr_amount: number;
  mdr_rate: number;
  notes: string | null;
  sales_payment_method?: {
    id: string;
    type: string;
    settlement_cycle: string | null;
    settlement_days: number | null;
    bank_account?: {
      id: string;
      account_name: string;
      bank_name: string;
      account_number: string;
    };
  };
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
}

interface BankGroup {
  bankAccountId: string;
  bankName: string;
  accountName: string;
  sales: PendingSale[];
  totalAmount: number;
}

export function PendingSettlements() {
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [bankGroups, setBankGroups] = useState<BankGroup[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState("");
  const [mdrAmount, setMdrAmount] = useState("0");
  const [deductMdr, setDeductMdr] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingSettlements();
    fetchBankAccounts();
  }, []);

  const fetchPendingSettlements = async () => {
    try {
      const { data, error } = await supabase
        .from('pending_settlements')
        .select(`
          *,
          sales_payment_methods!payment_method_id (
            id,
            type,
            settlement_cycle,
            settlement_days,
            payment_gateway,
            bank_accounts (
              id,
              account_name,
              bank_name,
              account_number
            )
          ),
          bank_accounts!bank_account_id (
            id,
            account_name,
            bank_name,
            account_number
          )
        `)
        .eq('status', 'PENDING');

      if (error) throw error;
      
      if (!data) {
        setPendingSales([]);
        setBankGroups([]);
        return;
      }

      // Transform data and group by bank
      const transformedData = data.map((settlement: any) => ({
        ...settlement,
        sales_payment_method: settlement.sales_payment_methods || {
          id: settlement.payment_method_id,
          type: 'Gateway',
          settlement_cycle: settlement.settlement_cycle,
          settlement_days: settlement.settlement_days,
          bank_account: settlement.bank_accounts
        }
      }));

      // Group sales by bank account
      const groups: { [key: string]: BankGroup } = {};
      
      transformedData.forEach((settlement: any) => {
        const bankAccount = settlement.bank_accounts || settlement.sales_payment_method?.bank_account;
        if (bankAccount) {
          const key = bankAccount.id;
          if (!groups[key]) {
            groups[key] = {
              bankAccountId: bankAccount.id,
              bankName: bankAccount.bank_name,
              accountName: bankAccount.account_name,
              sales: [],
              totalAmount: 0
            };
          }
          groups[key].sales.push(settlement);
          groups[key].totalAmount += settlement.settlement_amount || settlement.total_amount;
        }
      });

      setPendingSales(transformedData);
      setBankGroups(Object.values(groups));
    } catch (error) {
      console.error('Error fetching pending settlements:', error);
      toast({
        title: "Error",
        description: "Failed to fetch pending settlements",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number')
        .eq('status', 'ACTIVE');

      if (error) throw error;
      setBankAccounts(data || []);
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
    }
  };

  const handleSelectSale = (saleId: string) => {
    const sale = pendingSales.find(s => s.id === saleId);
    const isAdding = !selectedSales.includes(saleId);
    
    setSelectedSales(prev => {
      if (prev.includes(saleId)) {
        const newSelected = prev.filter(id => id !== saleId);
        // If no sales selected, clear bank account
        if (newSelected.length === 0) {
          setSelectedBankAccount("");
        }
        return newSelected;
      } else {
        const newSelected = [...prev, saleId];
        // Auto-select bank account if this is the first sale selected
        if (prev.length === 0) {
          const bankAccountId = sale?.bank_account_id || sale?.sales_payment_method?.bank_account?.id;
          if (bankAccountId) {
            setSelectedBankAccount(bankAccountId);
          }
        }
        return newSelected;
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedSales.length === pendingSales.length) {
      setSelectedSales([]);
    } else {
      setSelectedSales(pendingSales.map(sale => sale.id));
    }
  };

  const handleSelectBankGroup = (bankGroup: BankGroup) => {
    const groupSaleIds = bankGroup.sales.map(sale => sale.id);
    const allSelected = groupSaleIds.every(id => selectedSales.includes(id));
    
    if (allSelected) {
      setSelectedSales(prev => prev.filter(id => !groupSaleIds.includes(id)));
      setSelectedBankAccount("");
    } else {
      setSelectedSales(prev => [...new Set([...prev, ...groupSaleIds])]);
      // Auto-select the bank account linked to the payment gateway
      setSelectedBankAccount(bankGroup.bankAccountId);
    }
  };

  const calculateSettlementAmount = () => {
    const totalAmount = selectedSales.reduce((sum, saleId) => {
      const sale = pendingSales.find(s => s.id === saleId);
      return sum + (sale?.total_amount || 0);
    }, 0);

    if (deductMdr) {
      return totalAmount - parseFloat(mdrAmount);
    }
    
    return totalAmount;
  };

  const getMdrAmount = () => {
    return parseFloat(mdrAmount);
  };

  const autoSettleInstantSales = async (instantSales: any[]) => {
    for (const sale of instantSales) {
      try {
        const bankAccount = sale.sales_payment_methods.bank_accounts;
        if (!bankAccount) continue;

        const settlementBatchId = `INSTANT-${Date.now()}-${sale.id}`;

        // Create settlement record
        const { data: settlement, error: settlementError } = await supabase
          .from('payment_gateway_settlements')
          .insert({
            settlement_batch_id: settlementBatchId,
            bank_account_id: bankAccount.id,
            total_amount: sale.total_amount,
            mdr_amount: 0,
            net_amount: sale.total_amount,
            mdr_rate: 0,
            settlement_date: new Date().toISOString().split('T')[0]
          })
          .select()
          .single();

        if (settlementError) throw settlementError;

        // Create settlement item
        await supabase
          .from('payment_gateway_settlement_items')
          .insert({
            settlement_id: settlement.id,
            sales_order_id: sale.id,
            amount: sale.total_amount
          });

        // Create bank transaction
        await supabase
          .from('bank_transactions')
          .insert({
            bank_account_id: bankAccount.id,
            transaction_type: 'INCOME',
            amount: sale.total_amount,
            description: `Instant Settlement - ${sale.order_number}`,
            transaction_date: new Date().toISOString().split('T')[0],
            category: 'Payment Gateway Settlement',
            reference_number: settlementBatchId
          });

        // Update sales order
        await supabase
          .from('sales_orders')
          .update({ 
            settlement_status: 'SETTLED',
            settlement_batch_id: settlementBatchId,
            settled_at: new Date().toISOString()
          })
          .eq('id', sale.id);

      } catch (error) {
        console.error('Error auto-settling instant sale:', error);
      }
    }
  };

  const handleSettle = async () => {
    console.log('=== SETTLE FUNCTION CALLED ===');
    console.log('Selected Sales:', selectedSales);
    console.log('Selected Bank Account:', selectedBankAccount);
    console.log('Pending Sales Length:', pendingSales.length);
    console.log('Is Settling:', isSettling);
    
    // Prevent multiple simultaneous settlements
    if (isSettling) {
      console.log('❌ Settlement already in progress, ignoring duplicate call');
      return;
    }
    
    if (selectedSales.length === 0) {
      console.log('❌ No sales selected');
      toast({
        title: "Error",
        description: "Please select at least one transaction to settle",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedBankAccount) {
      console.log('❌ No bank account selected');
      toast({
        title: "Error",
        description: "Please select a bank account for settlement",
        variant: "destructive",
      });
      return;
    }

    console.log('💰 Starting settlement process...');
    setIsSettling(true);
    
    try {
      const settlementAmount = calculateSettlementAmount();
      const mdrDeduction = deductMdr ? getMdrAmount() : 0;
      const totalAmount = selectedSales.reduce((sum, saleId) => {
        const sale = pendingSales.find(s => s.id === saleId);
        return sum + (sale?.total_amount || 0);
      }, 0);
      const selectedBankAcc = bankAccounts.find(acc => acc.id === selectedBankAccount);
      const settlementBatchId = `PGS-${Date.now()}`;

      console.log('Settlement details:', {
        settlementAmount,
        totalAmount,
        mdrDeduction,
        selectedBankAccount,
        selectedSalesCount: selectedSales.length
      });

      // Create settlement record
      console.log('📝 Creating settlement record...');
      const { data: settlement, error: settlementError } = await supabase
        .from('payment_gateway_settlements')
        .insert({
          settlement_batch_id: settlementBatchId,
          bank_account_id: selectedBankAccount,
          total_amount: totalAmount,
          mdr_amount: mdrDeduction,
          net_amount: settlementAmount,
          mdr_rate: totalAmount > 0 ? (mdrDeduction / totalAmount) * 100 : 0,
          settlement_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

      if (settlementError) {
        console.error('❌ Settlement creation failed:', settlementError);
        throw settlementError;
      }
      
      console.log('✅ Settlement record created:', settlement.id);

      // Create settlement items
      console.log('📋 Creating settlement items...');
      const settlementItems = selectedSales.map(settlementId => {
        const pendingSettlement = pendingSales.find(s => s.id === settlementId);
        return {
          settlement_id: settlement.id, // Use the settlement record ID from payment_gateway_settlements
          sales_order_id: pendingSettlement?.sales_order_id, // Use the actual sales order ID
          amount: pendingSettlement?.total_amount || 0
        };
      });

      const { error: itemsError } = await supabase
        .from('payment_gateway_settlement_items')
        .insert(settlementItems);

      if (itemsError) {
        console.error('❌ Settlement items creation failed:', itemsError);
        throw itemsError;
      }
      
      console.log('✅ Settlement items created');

      // Create bank transaction for settlement
      console.log('🏦 Creating bank transaction...');
      const { error: transactionError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: selectedBankAccount,
          transaction_type: 'INCOME',
          amount: settlementAmount,
          description: `Payment Gateway Settlement - ${selectedSales.length} sales${deductMdr ? ` (MDR: ₹${mdrDeduction.toFixed(2)})` : ''}`,
          transaction_date: new Date().toISOString().split('T')[0],
          category: 'Payment Gateway Settlement',
          reference_number: settlementBatchId
        });

      if (transactionError) {
        console.error('❌ Bank transaction creation failed:', transactionError);
        throw transactionError;
      }
      
      console.log('✅ Bank transaction created');

      // Instead of updating sales_orders (which has permission issues), 
      // let's update the pending_settlements status to mark them as settled
      console.log('📊 Starting settlement process for:', selectedSales);
      
      let updateSuccessCount = 0;
      let updateFailCount = 0;
      const successfullySettledIds: string[] = [];
      
      // Process each selected settlement by updating pending_settlements status
      for (const settlementId of selectedSales) {
        const settlement = pendingSales.find(s => s.id === settlementId);
        
        if (!settlement) {
          console.error(`❌ Settlement ${settlementId} not found in pending sales`);
          updateFailCount++;
          continue;
        }
        
        console.log(`🔄 Processing settlement ${settlementId} for client ${settlement.client_name}`);
        
        try {
          // Update the pending_settlement status to SETTLED (we'll delete it later)
          const { data: updatedSettlement, error: updateError } = await supabase
            .from('pending_settlements')
            .update({
              status: 'SETTLED',
              settlement_batch_id: settlementBatchId,
              settled_at: new Date().toISOString(),
              actual_settlement_date: new Date().toISOString().split('T')[0]
            })
            .eq('id', settlementId)
            .select('id');

          if (updateError) {
            console.error(`❌ Failed to update settlement ${settlementId}:`, updateError);
            updateFailCount++;
          } else if (updatedSettlement && updatedSettlement.length > 0) {
            console.log(`✅ Successfully updated settlement ${settlementId} to SETTLED`);
            updateSuccessCount++;
            successfullySettledIds.push(settlementId);
          } else {
            console.warn(`⚠️ No rows updated for settlement ${settlementId}`);
            updateFailCount++;
          }
        } catch (error) {
          console.error(`❌ Exception updating settlement ${settlementId}:`, error);
          updateFailCount++;
        }
      }
      
      console.log(`✅ Sales orders updated: ${updateSuccessCount} success, ${updateFailCount} failed`);
      console.log('🎯 Successfully settled IDs:', successfullySettledIds);
      
      if (updateFailCount > 0) {
        toast({
          title: "Warning", 
          description: `Settlement created but ${updateFailCount} sales orders couldn't be updated. Please refresh to see current status.`,
          variant: "destructive"
        });
        // Force refresh even if some updates failed
        fetchPendingSettlements();
      }

      // Reset payment method usage for successfully settled sales only
      console.log('♻️ Resetting payment method usage...');
      const paymentMethodIds = [...new Set(successfullySettledIds.map(saleId => {
        const sale = pendingSales.find(s => s.id === saleId);
        return sale?.sales_payment_method.id;
      }).filter(Boolean))];

      for (const methodId of paymentMethodIds) {
        const settledAmount = successfullySettledIds.reduce((sum, saleId) => {
          const sale = pendingSales.find(s => s.id === saleId);
          return sale?.sales_payment_method.id === methodId ? sum + (sale?.total_amount || 0) : sum;
        }, 0);

        // Reduce the current usage by the settled amount
        const { data: currentMethod } = await supabase
          .from('sales_payment_methods')
          .select('current_usage')
          .eq('id', methodId)
          .single();

        if (currentMethod) {
          const newUsage = Math.max(0, (currentMethod.current_usage || 0) - settledAmount);
          await supabase
            .from('sales_payment_methods')
            .update({ current_usage: newUsage })
            .eq('id', methodId);
        }
      }
      
      console.log('✅ Payment method usage reset');

      // Delete successfully settled records from pending_settlements table
      if (successfullySettledIds.length > 0) {
        console.log('🗑️ Deleting settled records from pending_settlements...');
        console.log('🗑️ IDs to delete:', successfullySettledIds);
        
        const { data: deleteData, error: deleteError } = await supabase
          .from('pending_settlements')
          .delete()
          .in('id', successfullySettledIds)
          .select(); // Add select to see what was actually deleted

        if (deleteError) {
          console.error('❌ Failed to delete settled records:', deleteError);
          toast({
            title: "Warning",
            description: `Failed to clean up settled records: ${deleteError.message}`,
            variant: "destructive",
          });
        } else {
          console.log(`✅ Successfully deleted ${deleteData?.length || 0} settled records from pending_settlements table`);
          console.log('🗑️ Deleted records:', deleteData);
          
          if (deleteData?.length !== successfullySettledIds.length) {
            console.warn(`⚠️ Expected to delete ${successfullySettledIds.length} but deleted ${deleteData?.length || 0}`);
          }
        }
      }

      // Remove successfully settled orders from local state
      setPendingSales(prev => prev.filter(sale => !successfullySettledIds.includes(sale.id)));
      
      // Update bank groups by removing settled sales
      setBankGroups(prev => prev.map(group => ({
        ...group,
        sales: group.sales.filter(sale => !successfullySettledIds.includes(sale.id)),
        totalAmount: group.sales
          .filter(sale => !successfullySettledIds.includes(sale.id))
          .reduce((sum, sale) => sum + (sale.settlement_amount || sale.total_amount), 0)
      })).filter(group => group.sales.length > 0));

      toast({
        title: "Success",
        description: `Successfully settled ₹${settlementAmount.toLocaleString()} to ${selectedBankAcc?.account_name}`,
      });

      // Reset form
      setSelectedSales([]);
      setSelectedBankAccount("");
      setDeductMdr(false);
      setMdrAmount("0");
      setIsDialogOpen(false);
      
      // Refresh pending settlements data from database
      fetchPendingSettlements();
      
    } catch (error) {
      console.error('Error settling payments:', error);
      toast({
        title: "Error",
        description: "Failed to settle payments",
        variant: "destructive",
      });
    } finally {
      setIsSettling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Pending Settlements</h3>
        {selectedSales.length > 0 && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="flex items-center gap-2"
                onClick={() => setIsDialogOpen(true)}
              >
                <DollarSign className="h-4 w-4" />
                Settle Selected ({selectedSales.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Settlement Configuration</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="bankAccount">Settlement Bank Account</Label>
                  <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.account_name} - {account.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="deductMdr" 
                    checked={deductMdr}
                    onCheckedChange={(checked) => setDeductMdr(checked === true)}
                  />
                  <Label htmlFor="deductMdr">Deduct MDR charges</Label>
                </div>

                {deductMdr && (
                  <div>
                    <Label htmlFor="mdrAmount">MDR Charges (₹)</Label>
                    <Input
                      id="mdrAmount"
                      type="number"
                      step="0.01"
                      value={mdrAmount}
                      onChange={(e) => setMdrAmount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                )}

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Gross Amount:</span>
                    <span>₹{selectedSales.reduce((sum, saleId) => {
                      const sale = pendingSales.find(s => s.id === saleId);
                      return sum + (sale?.total_amount || 0);
                    }, 0).toLocaleString()}</span>
                  </div>
                  {deductMdr && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>MDR Charges:</span>
                      <span>-₹{getMdrAmount().toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-2">
                    <span>Net Settlement:</span>
                    <span>₹{calculateSettlementAmount().toLocaleString()}</span>
                  </div>
                </div>

                <Button 
                  onClick={() => {
                    console.log('Settle button clicked!', { selectedBankAccount, isSettling, selectedSalesCount: selectedSales.length });
                    if (!isSettling && selectedBankAccount) {
                      handleSettle();
                    }
                  }} 
                  disabled={!selectedBankAccount || isSettling}
                  className="w-full"
                >
                  {isSettling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing Settlement...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Settle to Bank
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {pendingSales.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No pending settlements</p>
          <p className="text-sm text-gray-400 mt-2">
            Instant settlements are processed automatically
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {bankGroups.map((bankGroup) => (
            <Card key={bankGroup.bankAccountId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-blue-600" />
                    <div>
                      <CardTitle className="text-lg">{bankGroup.bankName}</CardTitle>
                      <p className="text-sm text-gray-500">{bankGroup.accountName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">₹{bankGroup.totalAmount.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">{bankGroup.sales.length} transactions</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectBankGroup(bankGroup)}
                      className="flex items-center gap-2"
                    >
                      <CreditCard className="h-4 w-4" />
                      {bankGroup.sales.every(sale => selectedSales.includes(sale.id)) ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Gateway</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bankGroup.sales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedSales.includes(sale.id)}
                            onCheckedChange={() => handleSelectSale(sale.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{sale.order_number}</TableCell>
                        <TableCell>{sale.client_name}</TableCell>
                        <TableCell>{sale.sales_payment_method.type}</TableCell>
                        <TableCell>₹{sale.total_amount.toLocaleString()}</TableCell>
                        <TableCell>{new Date(sale.order_date).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}