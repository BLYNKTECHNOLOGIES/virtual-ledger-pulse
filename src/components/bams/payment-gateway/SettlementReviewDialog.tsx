import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Loader2, FileDown, Eye, TrendingUp, DollarSign, Calendar, Building } from "lucide-react";
import { generateSettlementPDF } from "@/utils/settlementPdfGenerator";

interface SettlementDetails {
  id: string;
  settlement_batch_id: string;
  total_amount: number;
  mdr_amount: number;
  net_amount: number;
  mdr_rate: number;
  settlement_date: string;
  status: string;
  created_at: string;
  settled_by: string | null;
  reversed_by: string | null;
  settled_by_user?: { username: string } | null;
  reversed_by_user?: { username: string } | null;
  bank_accounts: {
    account_name: string;
    bank_name: string;
    account_number: string;
  };
  settlement_items: {
    id: string;
    amount: number;
    sales_orders: {
      id: string;
      order_number: string;
      client_name: string;
      order_date: string;
      total_amount: number;
      settlement_status: string;
    };
  }[];
}

interface SettlementReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settlementBatchId: string;
}

export function SettlementReviewDialog({ 
  open, 
  onOpenChange, 
  settlementBatchId 
}: SettlementReviewDialogProps) {
  const [settlement, setSettlement] = useState<SettlementDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && settlementBatchId) {
      fetchSettlementDetails();
    }
  }, [open, settlementBatchId]);

  const fetchSettlementDetails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_gateway_settlements')
        .select(`
          *,
          bank_accounts (
            account_name,
            bank_name,
            account_number
          ),
          settled_by_user:users!payment_gateway_settlements_settled_by_fkey (
            username
          ),
          reversed_by_user:users!payment_gateway_settlements_reversed_by_fkey (
            username
          ),
          payment_gateway_settlement_items (
            id,
            amount,
            sales_orders (
              id,
              order_number,
              client_name,
              order_date,
              total_amount,
              settlement_status
            )
          )
        `)
        .eq('settlement_batch_id', settlementBatchId)
        .single();

      if (error) throw error;
      
      const transformedData = {
        ...data,
        settlement_items: data.payment_gateway_settlement_items || []
      };

      setSettlement(transformedData);
    } catch (error) {
      console.error('Error fetching settlement details:', error);
      toast({
        title: "Error",
        description: "Failed to fetch settlement details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!settlement) return;
    
    setGeneratingPdf(true);
    try {
      await generateSettlementPDF(settlement);
      toast({
        title: "Success",
        description: "Settlement PDF report generated successfully",
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF report",
        variant: "destructive",
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!settlement) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="text-center py-8">
            <p className="text-gray-500">Settlement details not found</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Settlement Review - {settlement.settlement_batch_id}
            </DialogTitle>
            <Button 
              onClick={handleGeneratePDF}
              disabled={generatingPdf}
              className="flex items-center gap-2"
            >
              {generatingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Generate PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Settlement Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Gross Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                  <span className="text-lg font-bold text-blue-600">
                    ₹{settlement.total_amount.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">MDR Charges</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-red-600" />
                  <span className="text-lg font-bold text-red-600">
                    ₹{settlement.mdr_amount.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Rate: {settlement.mdr_rate}%
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Net Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="text-lg font-bold text-green-600">
                    ₹{settlement.net_amount.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Settlement Date</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium">
                    {format(new Date(settlement.settlement_date), 'MMM dd, yyyy')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {format(new Date(settlement.settlement_date), 'HH:mm')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Bank Account Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Bank Account Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Account Name</p>
                  <p className="font-medium">{settlement.bank_accounts.account_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Bank Name</p>
                  <p className="font-medium">{settlement.bank_accounts.bank_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Account Number</p>
                  <p className="font-medium">{settlement.bank_accounts.account_number}</p>
                </div>
              </div>

              {/* Settled By / Reversed By */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Settled By</p>
                  <p className="font-medium">
                    {settlement.settled_by_user?.username || '—'}
                  </p>
                </div>
                {settlement.status === 'REVERSED' && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Reversed By</p>
                    <p className="font-medium text-orange-600">
                      {settlement.reversed_by_user?.username || '—'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Transaction Details */}
          <Card>
            <CardHeader>
              <CardTitle>
                Transaction Details ({settlement.settlement_items.length} orders)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order Number</TableHead>
                    <TableHead>Client Name</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlement.settlement_items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.sales_orders.order_number}
                      </TableCell>
                      <TableCell>{item.sales_orders.client_name}</TableCell>
                      <TableCell>
                        {format(new Date(item.sales_orders.order_date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>₹{item.amount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          Payment Gateway
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {item.sales_orders.settlement_status || 'SETTLED'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Settlement Reconciliation Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Reconciliation Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Total Orders:</span>
                  <span className="font-medium">{settlement.settlement_items.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Transaction Amount:</span>
                  <span className="font-medium">₹{settlement.total_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Less: MDR Charges ({settlement.mdr_rate}%):</span>
                  <span className="font-medium">-₹{settlement.mdr_amount.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-green-600 font-semibold">
                  <span>Net Settlement Amount:</span>
                  <span>₹{settlement.net_amount.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}