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
import { Loader2, DollarSign, Calendar, Building, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PendingSale {
  id: string;
  order_number: string;
  client_name: string;
  total_amount: number;
  order_date: string;
  payment_status: string;
  sales_payment_method: {
    id: string;
    type: string;
    settlement_cycle: string | null;
    settlement_days: number | null;
  };
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
}

export function PendingSettlements() {
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState("");
  const [mdrRate, setMdrRate] = useState("2.5");
  const [deductMdr, setDeductMdr] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingSettlements();
    fetchBankAccounts();
  }, []);

  const fetchPendingSettlements = async () => {
    try {
      console.log('Fetching pending settlements...');
      
      const { data, error } = await supabase
        .from('sales_orders')
        .select(`
          id,
          order_number,
          client_name,
          total_amount,
          order_date,
          payment_status,
          settlement_status,
          sales_payment_methods (
            id,
            type,
            settlement_cycle,
            settlement_days,
            payment_gateway
          )
        `)
        .eq('settlement_status', 'PENDING')
        .eq('payment_status', 'COMPLETED')
        .not('sales_payment_method_id', 'is', null);

      console.log('Query result:', { data, error });

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }
      
      if (!data) {
        console.log('No data returned from query');
        setPendingSales([]);
        return;
      }

      // Filter for payment gateway sales only
      const gatewayData = data.filter((sale: any) => {
        const hasPaymentMethod = sale.sales_payment_methods;
        const isGateway = hasPaymentMethod?.payment_gateway === true;
        console.log('Sale filter check:', {
          orderId: sale.id,
          orderNumber: sale.order_number,
          hasPaymentMethod: !!hasPaymentMethod,
          isGateway,
          paymentMethod: hasPaymentMethod
        });
        return hasPaymentMethod && isGateway;
      });

      console.log('Filtered gateway data:', gatewayData);
      
      // Filter sales that need settlement based on settlement cycle
      const pendingData = gatewayData.filter((sale: any) => {
        const settlementCycle = sale.sales_payment_methods.settlement_cycle;
        const settlementDays = sale.sales_payment_methods.settlement_days;
        const orderDate = new Date(sale.order_date);
        const now = new Date();
        
        console.log('Settlement cycle check:', {
          orderId: sale.id,
          settlementCycle,
          settlementDays,
          orderDate: orderDate.toISOString(),
          now: now.toISOString()
        });
        
        if (!settlementCycle) return true; // Show if no cycle configured
        
        if (settlementCycle === "Instant Settlement") {
          return true; // Always show for instant settlement
        } else if (settlementCycle === "T+1 Day") {
          const nextDay = new Date(orderDate);
          nextDay.setDate(nextDay.getDate() + 1);
          return now >= nextDay;
        } else if (settlementCycle === "Custom" && settlementDays) {
          const settlementDate = new Date(orderDate);
          settlementDate.setDate(settlementDate.getDate() + settlementDays);
          return now >= settlementDate;
        }
        
        return true;
      }).map((sale: any) => ({
        ...sale,
        sales_payment_method: sale.sales_payment_methods
      }));

      console.log('Final pending data:', pendingData);
      setPendingSales(pendingData);
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
    setSelectedSales(prev => 
      prev.includes(saleId) 
        ? prev.filter(id => id !== saleId)
        : [...prev, saleId]
    );
  };

  const handleSelectAll = () => {
    if (selectedSales.length === pendingSales.length) {
      setSelectedSales([]);
    } else {
      setSelectedSales(pendingSales.map(sale => sale.id));
    }
  };

  const calculateSettlementAmount = () => {
    const totalAmount = selectedSales.reduce((sum, saleId) => {
      const sale = pendingSales.find(s => s.id === saleId);
      return sum + (sale?.total_amount || 0);
    }, 0);

    if (deductMdr) {
      const mdrAmount = (totalAmount * parseFloat(mdrRate)) / 100;
      return totalAmount - mdrAmount;
    }
    
    return totalAmount;
  };

  const getMdrAmount = () => {
    const totalAmount = selectedSales.reduce((sum, saleId) => {
      const sale = pendingSales.find(s => s.id === saleId);
      return sum + (sale?.total_amount || 0);
    }, 0);

    return (totalAmount * parseFloat(mdrRate)) / 100;
  };

  const handleSettle = async () => {
    if (selectedSales.length === 0 || !selectedBankAccount) {
      toast({
        title: "Error",
        description: "Please select sales and bank account",
        variant: "destructive",
      });
      return;
    }

    setIsSettling(true);
    try {
      const settlementAmount = calculateSettlementAmount();
      const mdrAmount = deductMdr ? getMdrAmount() : 0;
      const totalAmount = selectedSales.reduce((sum, saleId) => {
        const sale = pendingSales.find(s => s.id === saleId);
        return sum + (sale?.total_amount || 0);
      }, 0);
      const selectedBankAcc = bankAccounts.find(acc => acc.id === selectedBankAccount);
      const settlementBatchId = `PGS-${Date.now()}`;

      // Create settlement record
      const { data: settlement, error: settlementError } = await supabase
        .from('payment_gateway_settlements')
        .insert({
          settlement_batch_id: settlementBatchId,
          bank_account_id: selectedBankAccount,
          total_amount: totalAmount,
          mdr_amount: mdrAmount,
          net_amount: settlementAmount,
          mdr_rate: parseFloat(mdrRate),
          settlement_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

      if (settlementError) throw settlementError;

      // Create settlement items
      const settlementItems = selectedSales.map(saleId => {
        const sale = pendingSales.find(s => s.id === saleId);
        return {
          settlement_id: settlement.id,
          sales_order_id: saleId,
          amount: sale?.total_amount || 0
        };
      });

      const { error: itemsError } = await supabase
        .from('payment_gateway_settlement_items')
        .insert(settlementItems);

      if (itemsError) throw itemsError;

      // Create bank transaction for settlement
      const { error: transactionError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: selectedBankAccount,
          transaction_type: 'INCOME',
          amount: settlementAmount,
          description: `Payment Gateway Settlement - ${selectedSales.length} sales${deductMdr ? ` (MDR: ₹${mdrAmount.toFixed(2)})` : ''}`,
          transaction_date: new Date().toISOString().split('T')[0],
          category: 'Payment Gateway Settlement',
          reference_number: settlementBatchId
        });

      if (transactionError) throw transactionError;

      // Update sales orders settlement status
      const { error: updateError } = await supabase
        .from('sales_orders')
        .update({ 
          settlement_status: 'SETTLED',
          settlement_batch_id: settlementBatchId,
          settled_at: new Date().toISOString()
        })
        .in('id', selectedSales);

      if (updateError) throw updateError;


      toast({
        title: "Success",
        description: `Successfully settled ₹${settlementAmount.toLocaleString()} to ${selectedBankAcc?.account_name}`,
      });

      // Reset form and refresh data
      setSelectedSales([]);
      setSelectedBankAccount("");
      setDeductMdr(false);
      setMdrRate("2.5");
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
          <Dialog>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
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
                    <Label htmlFor="mdrRate">MDR Rate (%)</Label>
                    <Input
                      id="mdrRate"
                      type="number"
                      step="0.1"
                      value={mdrRate}
                      onChange={(e) => setMdrRate(e.target.value)}
                      placeholder="2.5"
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
                      <span>MDR Charges ({mdrRate}%):</span>
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
        )}
      </div>

      {pendingSales.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No pending settlements</p>
          <p className="text-sm text-gray-400 mt-2">
            Sales requiring settlement will appear here
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Sales Pending Settlement</CardTitle>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="selectAll"
                  checked={selectedSales.length === pendingSales.length}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="selectAll">Select All</Label>
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSales.map((sale) => (
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
                    <TableCell>
                      <Badge variant="outline">Pending Settlement</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}