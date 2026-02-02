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
import { Loader2, DollarSign, Calendar, Building, ArrowRight, CreditCard, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";
import { useAuth } from "@/hooks/useAuth";

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
    upi_id?: string;
    settlement_cycle: string | null;
    settlement_days: number | null;
    payment_gateway: boolean;
    bank_account?: {
      id: string;
      account_name: string;
      bank_name: string;
      account_number: string;
    };
  };
  bank_account?: {
    id: string;
    account_name: string;
    bank_name: string;
    account_number: string;
  };
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
}

interface GatewayGroup {
  paymentMethodId: string;
  gatewayType: string;
  gatewayName: string;
  settlementBankAccount: BankAccount | null;
  sales: PendingSale[];
  totalAmount: number;
}

export function PendingSettlements() {
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [gatewayGroups, setGatewayGroups] = useState<GatewayGroup[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState("");
  const [mdrAmount, setMdrAmount] = useState("0");
  const [deductMdr, setDeductMdr] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [settlingIndividualId, setSettlingIndividualId] = useState<string | null>(null);
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

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
            upi_id,
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
        setGatewayGroups([]);
        return;
      }

      // Transform data
      const transformedData = data.map((settlement: any) => ({
        ...settlement,
        sales_payment_method: settlement.sales_payment_methods || {
          id: settlement.payment_method_id,
          type: 'Gateway',
          settlement_cycle: settlement.settlement_cycle,
          settlement_days: settlement.settlement_days,
          payment_gateway: true,
          bank_account: settlement.bank_accounts
        },
        bank_account: settlement.bank_accounts
      }));

      // Group sales by payment gateway (payment_method_id)
      const groups: { [key: string]: GatewayGroup } = {};
      
      transformedData.forEach((settlement: any) => {
        const paymentMethodId = settlement.payment_method_id || 'unknown';
        const paymentMethod = settlement.sales_payment_method;
        const bankAccount = settlement.bank_accounts || paymentMethod?.bank_account;
        
        if (!groups[paymentMethodId]) {
          // Build gateway name (e.g., "UPI - merchant@upi" or just "UPI")
          let gatewayName = paymentMethod?.type || 'Unknown Gateway';
          if (paymentMethod?.type === 'UPI' && paymentMethod?.upi_id) {
            gatewayName = `UPI - ${paymentMethod.upi_id}`;
          }
          
          groups[paymentMethodId] = {
            paymentMethodId,
            gatewayType: paymentMethod?.type || 'Gateway',
            gatewayName,
            settlementBankAccount: bankAccount || null,
            sales: [],
            totalAmount: 0
          };
        }
        groups[paymentMethodId].sales.push(settlement);
        groups[paymentMethodId].totalAmount += settlement.settlement_amount || settlement.total_amount;
      });

      setPendingSales(transformedData);
      setGatewayGroups(Object.values(groups));
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
    
    setSelectedSales(prev => {
      if (prev.includes(saleId)) {
        const newSelected = prev.filter(id => id !== saleId);
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

  const handleSelectGatewayGroup = (gatewayGroup: GatewayGroup) => {
    const groupSaleIds = gatewayGroup.sales.map(sale => sale.id);
    const allSelected = groupSaleIds.every(id => selectedSales.includes(id));
    
    if (allSelected) {
      setSelectedSales(prev => prev.filter(id => !groupSaleIds.includes(id)));
      // Check if we need to clear bank account
      const remainingSelected = selectedSales.filter(id => !groupSaleIds.includes(id));
      if (remainingSelected.length === 0) {
        setSelectedBankAccount("");
      }
    } else {
      setSelectedSales(prev => [...new Set([...prev, ...groupSaleIds])]);
      // Auto-select the bank account linked to the payment gateway
      if (gatewayGroup.settlementBankAccount) {
        setSelectedBankAccount(gatewayGroup.settlementBankAccount.id);
      }
    }
  };

  const calculateSettlementAmount = (saleIds?: string[]) => {
    const idsToUse = saleIds || selectedSales;
    const totalAmount = idsToUse.reduce((sum, saleId) => {
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

  const settleTransactions = async (saleIds: string[], bankAccountId: string, mdrDeduction: number = 0) => {
    const totalAmount = saleIds.reduce((sum, saleId) => {
      const sale = pendingSales.find(s => s.id === saleId);
      return sum + (sale?.total_amount || 0);
    }, 0);
    const settlementAmount = totalAmount - mdrDeduction;
    const selectedBankAcc = bankAccounts.find(acc => acc.id === bankAccountId);
    const settlementBatchId = `PGS-${Date.now()}`;

    // Create settlement record
    const { data: settlement, error: settlementError } = await supabase
      .from('payment_gateway_settlements')
      .insert({
        settlement_batch_id: settlementBatchId,
        bank_account_id: bankAccountId,
        total_amount: totalAmount,
        mdr_amount: mdrDeduction,
        net_amount: settlementAmount,
        mdr_rate: totalAmount > 0 ? (mdrDeduction / totalAmount) * 100 : 0,
        settlement_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (settlementError) throw settlementError;

    // Create settlement items
    const settlementItems = saleIds.map(settlementId => {
      const pendingSettlement = pendingSales.find(s => s.id === settlementId);
      return {
        settlement_id: settlement.id,
        sales_order_id: pendingSettlement?.sales_order_id,
        amount: pendingSettlement?.total_amount || 0
      };
    });

    const { error: itemsError } = await supabase
      .from('payment_gateway_settlement_items')
      .insert(settlementItems);

    if (itemsError) throw itemsError;

    // Create bank transaction for settlement (credit to bank account)
    const { error: transactionError } = await supabase
      .from('bank_transactions')
      .insert({
        bank_account_id: bankAccountId,
        transaction_type: 'INCOME',
        amount: settlementAmount,
        description: `Payment Gateway Settlement - ${saleIds.length} sale(s)${mdrDeduction > 0 ? ` (MDR: ₹${mdrDeduction.toFixed(2)})` : ''}`,
        transaction_date: new Date().toISOString().split('T')[0],
        category: 'Payment Gateway Settlement',
        reference_number: settlementBatchId,
        created_by: user?.id || null, // Persist user ID for audit trail
      });

    if (transactionError) throw transactionError;

    // Update pending settlements status
    const successfullySettledIds: string[] = [];
    for (const settlementId of saleIds) {
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

      if (!updateError && updatedSettlement && updatedSettlement.length > 0) {
        successfullySettledIds.push(settlementId);
      }
    }

    // Reset payment method usage
    const paymentMethodIds = [...new Set(successfullySettledIds.map(saleId => {
      const sale = pendingSales.find(s => s.id === saleId);
      return sale?.sales_payment_method?.id;
    }).filter(Boolean))];

    for (const methodId of paymentMethodIds) {
      const settledAmount = successfullySettledIds.reduce((sum, saleId) => {
        const sale = pendingSales.find(s => s.id === saleId);
        return sale?.sales_payment_method?.id === methodId ? sum + (sale?.total_amount || 0) : sum;
      }, 0);

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

    // Delete settled records
    if (successfullySettledIds.length > 0) {
      await supabase
        .from('pending_settlements')
        .delete()
        .in('id', successfullySettledIds);
    }

    return { settlementAmount, successfullySettledIds, selectedBankAcc };
  };

  const handleSettleIndividual = async (sale: PendingSale) => {
    const bankAccountId = sale.bank_account_id || sale.sales_payment_method?.bank_account?.id;
    
    if (!bankAccountId) {
      toast({
        title: "Error",
        description: "No settlement bank account configured for this gateway",
        variant: "destructive",
      });
      return;
    }

    setSettlingIndividualId(sale.id);
    
    try {
      const { settlementAmount, successfullySettledIds, selectedBankAcc } = await settleTransactions(
        [sale.id],
        bankAccountId,
        0
      );

      // Update local state
      setPendingSales(prev => prev.filter(s => !successfullySettledIds.includes(s.id)));
      setGatewayGroups(prev => prev.map(group => ({
        ...group,
        sales: group.sales.filter(s => !successfullySettledIds.includes(s.id)),
        totalAmount: group.sales
          .filter(s => !successfullySettledIds.includes(s.id))
          .reduce((sum, s) => sum + (s.settlement_amount || s.total_amount), 0)
      })).filter(group => group.sales.length > 0));

      toast({
        title: "Success",
        description: `Settled ₹${settlementAmount.toLocaleString()} to ${selectedBankAcc?.account_name}`,
      });

      fetchPendingSettlements();
    } catch (error) {
      console.error('Error settling payment:', error);
      toast({
        title: "Error",
        description: "Failed to settle payment",
        variant: "destructive",
      });
    } finally {
      setSettlingIndividualId(null);
    }
  };

  const handleSettle = async () => {
    if (isSettling) return;
    
    if (selectedSales.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one transaction to settle",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedBankAccount) {
      toast({
        title: "Error",
        description: "Please select a bank account for settlement",
        variant: "destructive",
      });
      return;
    }

    setIsSettling(true);
    
    try {
      const mdrDeduction = deductMdr ? getMdrAmount() : 0;
      const { settlementAmount, successfullySettledIds, selectedBankAcc } = await settleTransactions(
        selectedSales,
        selectedBankAccount,
        mdrDeduction
      );

      // Update local state
      setPendingSales(prev => prev.filter(sale => !successfullySettledIds.includes(sale.id)));
      setGatewayGroups(prev => prev.map(group => ({
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
          <ViewOnlyWrapper isViewOnly={!hasPermission('bams_manage')}>
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
                                <div className="flex justify-between text-sm text-destructive">
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
                    onClick={handleSettle} 
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
          </ViewOnlyWrapper>
        )}
      </div>

      {pendingSales.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No pending settlements</p>
          <p className="text-sm text-muted-foreground/70 mt-2">
            Instant settlements are processed automatically
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {gatewayGroups.map((gatewayGroup) => {
            const groupSaleIds = gatewayGroup.sales.map(s => s.id);
            const allSelected = groupSaleIds.length > 0 && groupSaleIds.every(id => selectedSales.includes(id));
            const someSelected = groupSaleIds.some(id => selectedSales.includes(id));
            
            return (
              <Card key={gatewayGroup.paymentMethodId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg">{gatewayGroup.gatewayName}</CardTitle>
                        {gatewayGroup.settlementBankAccount && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Building className="h-3 w-3" />
                            <span>Settles to: {gatewayGroup.settlementBankAccount.account_name} ({gatewayGroup.settlementBankAccount.bank_name})</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">₹{gatewayGroup.totalAmount.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">{gatewayGroup.sales.length} transactions</p>
                      </div>
                      <ViewOnlyWrapper isViewOnly={!hasPermission('bams_manage')}>
                        <Button
                          variant={allSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleSelectGatewayGroup(gatewayGroup)}
                          className="flex items-center gap-2"
                        >
                          {allSelected ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Deselect All
                            </>
                          ) : (
                            <>
                              <Checkbox 
                                checked={someSelected ? "indeterminate" : false}
                                className="pointer-events-none"
                              />
                              Select All
                            </>
                          )}
                        </Button>
                      </ViewOnlyWrapper>
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
                        <TableHead>Amount</TableHead>
                        <TableHead>Settlement Bank</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gatewayGroup.sales.map((sale) => {
                        const settlementBank = sale.bank_account || sale.sales_payment_method?.bank_account;
                        
                        return (
                          <TableRow key={sale.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedSales.includes(sale.id)}
                                onCheckedChange={() => handleSelectSale(sale.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{sale.order_number}</TableCell>
                            <TableCell>{sale.client_name}</TableCell>
                            <TableCell>₹{sale.total_amount.toLocaleString()}</TableCell>
                            <TableCell>
                              {settlementBank ? (
                                <div className="flex items-center gap-1">
                                  <Building className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">{settlementBank.account_name}</span>
                                </div>
                              ) : (
                              <Badge variant="secondary">Not configured</Badge>
                              )}
                            </TableCell>
                            <TableCell>{new Date(sale.order_date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <ViewOnlyWrapper isViewOnly={!hasPermission('bams_manage')}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSettleIndividual(sale)}
                                  disabled={settlingIndividualId === sale.id || !settlementBank}
                                  className="flex items-center gap-1"
                                >
                                  {settlingIndividualId === sale.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-3 w-3" />
                                  )}
                                  Settle Now
                                </Button>
                              </ViewOnlyWrapper>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
