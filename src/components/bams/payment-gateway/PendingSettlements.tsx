import { useState, useEffect, useRef } from "react";
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
import { useQueryClient } from "@tanstack/react-query";

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
  const settleInProgressRef = useRef(false);
  const queryClient = useQueryClient();

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
      const remainingSelected = selectedSales.filter(id => !groupSaleIds.includes(id));
      if (remainingSelected.length === 0) {
        setSelectedBankAccount("");
      }
    } else {
      setSelectedSales(prev => [...new Set([...prev, ...groupSaleIds])]);
      if (gatewayGroup.settlementBankAccount) {
        setSelectedBankAccount(gatewayGroup.settlementBankAccount.id);
      }
    }
  };

  const handleSelectDateGroup = (sales: PendingSale[]) => {
    const dateGroupIds = sales.map(s => s.id);
    const allSelected = dateGroupIds.every(id => selectedSales.includes(id));

    if (allSelected) {
      setSelectedSales(prev => {
        const next = prev.filter(id => !dateGroupIds.includes(id));
        if (next.length === 0) setSelectedBankAccount("");
        return next;
      });
    } else {
      setSelectedSales(prev => {
        const next = [...new Set([...prev, ...dateGroupIds])];
        if (prev.length === 0) {
          const bankId = sales[0]?.bank_account_id || sales[0]?.sales_payment_method?.bank_account?.id;
          if (bankId) setSelectedBankAccount(bankId);
        }
        return next;
      });
    }
  };

  const groupSalesByDate = (sales: PendingSale[]) => {
    const groups: { date: string; sales: PendingSale[]; totalAmount: number }[] = [];
    const map: Record<string, PendingSale[]> = {};

    sales.forEach(sale => {
      const dateKey = new Date(sale.order_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(sale);
    });

    // Sort dates descending
    const sortedKeys = Object.keys(map).sort((a, b) => {
      const da = new Date(map[a][0].order_date);
      const db = new Date(map[b][0].order_date);
      return db.getTime() - da.getTime();
    });

    sortedKeys.forEach(dateKey => {
      groups.push({
        date: dateKey,
        sales: map[dateKey],
        totalAmount: map[dateKey].reduce((sum, s) => sum + (s.settlement_amount || s.total_amount), 0),
      });
    });

    return groups;
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
    const selectedBankAcc = bankAccounts.find(acc => acc.id === bankAccountId);

    // Use atomic RPC to prevent duplicate settlements
    // Validate user id is a valid UUID before passing to RPC
    const isValidUuid = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
    const { data, error } = await supabase.rpc('process_payment_gateway_settlement', {
      p_pending_settlement_ids: saleIds,
      p_bank_account_id: bankAccountId,
      p_mdr_amount: mdrDeduction,
      p_created_by: isValidUuid ? user.id : null,
    });

    if (error) throw error;

    const result = data as any;
    if (!result?.success) {
      throw new Error(result?.error || 'Settlement failed');
    }

    return {
      settlementAmount: result.net_amount,
      successfullySettledIds: saleIds,
      selectedBankAcc,
      batchId: result.settlement_batch_id,
    };
  };

  const handleSettleIndividual = async (sale: PendingSale) => {
    if (settleInProgressRef.current) return;
    
    const bankAccountId = sale.bank_account_id || sale.sales_payment_method?.bank_account?.id;
    
    if (!bankAccountId) {
      toast({
        title: "Error",
        description: "No settlement bank account configured for this gateway",
        variant: "destructive",
      });
      return;
    }

    settleInProgressRef.current = true;

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

      // Invalidate caches so expense entries appear in Expenses tab
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_only'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });

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
      settleInProgressRef.current = false;
    }
  };

  const handleSettle = async () => {
    if (isSettling || settleInProgressRef.current) return;
    settleInProgressRef.current = true;
    
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
        description: `Successfully settled ₹${settlementAmount.toLocaleString()} to ${selectedBankAcc?.account_name}${mdrDeduction > 0 ? ` (MDR expense: ₹${mdrDeduction.toLocaleString()})` : ''}`,
      });

      // Reset form
      setSelectedSales([]);
      setSelectedBankAccount("");
      setDeductMdr(false);
      setMdrAmount("0");
      setIsDialogOpen(false);
      
      // Invalidate caches so expense entries appear in Expenses tab
      queryClient.invalidateQueries({ queryKey: ['bank_transactions_only'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });

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
      settleInProgressRef.current = false;
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
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupSalesByDate(gatewayGroup.sales).map((dateGroup) => {
                        const dateAllSelected = dateGroup.sales.every(s => selectedSales.includes(s.id));
                        const dateSomeSelected = dateGroup.sales.some(s => selectedSales.includes(s.id));

                        return (
                          <>
                            <TableRow key={`date-${dateGroup.date}`} className="bg-muted/50 hover:bg-muted/70">
                              <TableCell colSpan={6}>
                                <div className="flex items-center justify-between py-1">
                                  <div className="flex items-center gap-3">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-semibold text-sm">{dateGroup.date}</span>
                                    <Badge variant="secondary" className="text-xs">{dateGroup.sales.length} txn</Badge>
                                    <span className="text-sm font-medium text-muted-foreground">₹{dateGroup.totalAmount.toLocaleString()}</span>
                                  </div>
                                  <ViewOnlyWrapper isViewOnly={!hasPermission('bams_manage')}>
                                    <Button
                                      variant={dateAllSelected ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => handleSelectDateGroup(dateGroup.sales)}
                                      className="h-7 text-xs flex items-center gap-1.5"
                                    >
                                      <Checkbox
                                        checked={dateAllSelected ? true : dateSomeSelected ? "indeterminate" : false}
                                        className="pointer-events-none h-3.5 w-3.5"
                                      />
                                      {dateAllSelected ? "Deselect" : "Select All"}
                                    </Button>
                                  </ViewOnlyWrapper>
                                </div>
                              </TableCell>
                            </TableRow>
                            {dateGroup.sales.map((sale) => {
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
                          </>
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
