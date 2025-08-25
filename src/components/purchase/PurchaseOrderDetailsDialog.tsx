
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { generateInvoicePDF } from "@/utils/invoicePdfGenerator";
import { Download, Printer } from "lucide-react";

interface PurchaseOrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function PurchaseOrderDetailsDialog({ open, onOpenChange, order }: PurchaseOrderDetailsDialogProps) {
  const { toast } = useToast();

  if (!order) return null;

  const orderForPdf = {
    ...order,
    client_name: order.supplier_name,
    client_phone: order.contact_number,
  };

  const handleDownloadPDF = () => {
    try {
      const pdf = generateInvoicePDF({ order: orderForPdf });
      pdf.save(`Purchase_${order.order_number}.pdf`);
      toast({ title: "Success", description: "Receipt PDF downloaded" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const handlePrintPDF = () => {
    try {
      const pdf = generateInvoicePDF({ order: orderForPdf });
      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');
      toast({ title: "Success", description: "Receipt sent to printer" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to print PDF", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "PENDING":
        return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
      case "REVIEW_NEEDED":
        return <Badge className="bg-yellow-100 text-yellow-800">Review</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Purchase Order Details - {order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600">Order Number</label>
              <p className="text-sm font-mono">{order.order_number}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Supplier</label>
              <p className="text-sm">{order.supplier_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Phone</label>
              <p className="text-sm">{order.contact_number || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Assigned To</label>
              <p className="text-sm">{order.assigned_to || 'Unassigned'}</p>
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
              <label className="text-sm font-medium text-gray-600">Product</label>
              <p className="text-sm">{order.product_name || 'N/A'}</p>
              {order.product_category && (
                <p className="text-xs text-gray-500">{order.product_category}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Status</label>
              <div className="mt-1">{getStatusBadge(order.status)}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Order Date</label>
              <p className="text-sm">{format(new Date(order.order_date), 'MMM dd, yyyy')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Updated At</label>
              <p className="text-sm">{format(new Date(order.updated_at), 'MMM dd, yyyy HH:mm')}</p>
            </div>
          </div>

          {order.description && (
            <div>
              <label className="text-sm font-medium text-gray-600">Description</label>
              <p className="text-sm mt-1 p-3 bg-gray-50 rounded-lg">{order.description}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={handleDownloadPDF} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Download Receipt PDF
            </Button>
            <Button onClick={handlePrintPDF} variant="outline" className="flex-1">
              <Printer className="h-4 w-4 mr-2" />
              Print Receipt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
