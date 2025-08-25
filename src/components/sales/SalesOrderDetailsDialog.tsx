
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generateInvoicePDF } from "@/utils/invoicePdfGenerator";
import { Download, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SalesOrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function SalesOrderDetailsDialog({ open, onOpenChange, order }: SalesOrderDetailsDialogProps) {
  const { toast } = useToast();

  // Fetch bank account details if sales_payment_method_id exists
  const { data: bankAccountData } = useQuery({
    queryKey: ['bank_account_for_order', order?.sales_payment_method_id],
    queryFn: async () => {
      if (!order?.sales_payment_method_id) return null;
      
      const { data: paymentMethod } = await supabase
        .from('sales_payment_methods')
        .select('bank_account_id')
        .eq('id', order.sales_payment_method_id)
        .single();

      if (!paymentMethod?.bank_account_id) return null;

      const { data: bankAccount } = await supabase
        .from('bank_accounts')
        .select('account_name, bank_name, account_number')
        .eq('id', paymentMethod.bank_account_id)
        .single();

      return bankAccount;
    },
    enabled: !!order?.sales_payment_method_id && open,
  });

  if (!order) return null;

  const handleDownloadPDF = () => {
    console.log('Download PDF clicked for order:', order.order_number);
    try {
      console.log('Generating PDF with data:', { order, bankAccountData });
      const pdf = generateInvoicePDF({ 
        order, 
        bankAccountData: order.payment_status === 'COMPLETED' ? bankAccountData : undefined 
      });
      console.log('PDF generated successfully, saving...');
      pdf.save(`Invoice_${order.order_number}.pdf`);
      console.log('PDF saved successfully');
      toast({
        title: "Success",
        description: "Invoice PDF downloaded successfully",
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: "Error",
        description: `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  };

  const handlePrintPDF = () => {
    console.log('Print PDF clicked for order:', order.order_number);
    try {
      console.log('Generating PDF for printing with data:', { order, bankAccountData });
      const pdf = generateInvoicePDF({ 
        order, 
        bankAccountData: order.payment_status === 'COMPLETED' ? bankAccountData : undefined 
      });
      console.log('PDF generated successfully, opening for print...');
      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');
      console.log('PDF opened for printing');
      toast({
        title: "Success",
        description: "Invoice sent to printer",
      });
    } catch (error) {
      console.error('PDF print error:', error);
      toast({
        title: "Error",
        description: `Failed to print PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-100 text-green-800">Payment Received</Badge>;
      case "PARTIAL":
        return <Badge className="bg-yellow-100 text-yellow-800">Partial Payment</Badge>;
      case "PENDING":
        return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
      case "FAILED":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sales Order Details - {order.order_number}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600">Order Number</label>
              <p className="text-sm font-mono">{order.order_number}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Customer</label>
              <p className="text-sm">{order.client_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Phone</label>
              <p className="text-sm">{order.client_phone || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Platform</label>
              <p className="text-sm">{order.platform || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Total Amount</label>
              <p className="text-sm font-medium">₹{Number(order.total_amount).toLocaleString()}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Quantity</label>
              <p className="text-sm">{order.quantity || 1}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Price per Unit</label>
              <p className="text-sm">₹{Number(order.price_per_unit || order.total_amount).toLocaleString()}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Payment Status</label>
              <div className="mt-1">{getStatusBadge(order.payment_status)}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Order Date</label>
              <p className="text-sm">{format(new Date(order.order_date), 'MMM dd, yyyy')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Created At</label>
              <p className="text-sm">{format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')}</p>
            </div>
          </div>

          {/* Bank Account Information */}
          {bankAccountData && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">Payment Received In</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-blue-700">Bank Account</label>
                  <p className="text-sm text-blue-900">{bankAccountData.account_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-blue-700">Bank Name</label>
                  <p className="text-sm text-blue-900">{bankAccountData.bank_name}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-blue-700">Account Number</label>
                  <p className="text-sm text-blue-900 font-mono">
                    {bankAccountData.account_number ? 
                      `****${bankAccountData.account_number.slice(-4)}` : 
                      'N/A'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {order.description && (
            <div>
              <label className="text-sm font-medium text-gray-600">Description</label>
              <p className="text-sm mt-1 p-3 bg-gray-50 rounded-lg">{order.description}</p>
            </div>
          )}

          {order.cosmos_alert && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium">⚠️ COSMOS Alert was triggered for this order</p>
            </div>
          )}
          
          {/* PDF Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={handleDownloadPDF} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Download Invoice PDF
            </Button>
            <Button onClick={handlePrintPDF} variant="outline" className="flex-1">
              <Printer className="h-4 w-4 mr-2" />
              Print Invoice
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
