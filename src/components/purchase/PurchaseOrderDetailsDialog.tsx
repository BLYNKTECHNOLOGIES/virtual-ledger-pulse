import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { generateInvoicePDF } from "@/utils/invoicePdfGenerator";
import { Download, Printer, Receipt, ExternalLink, ImageIcon } from "lucide-react";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import { cn } from "@/lib/utils";

interface PurchaseOrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function PurchaseOrderDetailsDialog({ open, onOpenChange, order }: PurchaseOrderDetailsDialogProps) {
  const { toast } = useToast();
  const [selectedReceiptIndex, setSelectedReceiptIndex] = useState(0);

  if (!order) return null;

  const orderForPdf = {
    ...order,
    client_name: order.supplier_name,
    client_phone: order.contact_number,
  };

  // Get payments with receipts
  const payments = order.purchase_order_payments || [];
  const paymentsWithReceipts = payments.filter((p: any) => p.screenshot_url);

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

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purchase Order Details - {order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Order Number</label>
              <p className="text-sm font-mono">{order.order_number}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Supplier</label>
              <p className="text-sm">{order.supplier_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Phone</label>
              <p className="text-sm">{order.contact_number || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Assigned To</label>
              <p className="text-sm">{order.assigned_to || 'Unassigned'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Total Amount</label>
              <p className="text-sm font-medium">₹{Number(order.total_amount).toLocaleString()}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Quantity</label>
              <p className="text-sm">{order.quantity || 1}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Price per Unit</label>
              <p className="text-sm">₹{Number(order.price_per_unit || order.total_amount).toLocaleString()}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Product</label>
              <p className="text-sm">{order.product_name || 'N/A'}</p>
              {order.product_category && (
                <p className="text-xs text-muted-foreground">{order.product_category}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              <div className="mt-1">{getStatusBadge(order.status)}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Order Date</label>
              <p className="text-sm">{format(new Date(order.order_date), 'MMM dd, yyyy')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Updated At</label>
              <p className="text-sm">{format(new Date(order.updated_at), 'MMM dd, yyyy HH:mm')}</p>
            </div>
          </div>

          {order.description && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Description</label>
              <p className="text-sm mt-1 p-3 bg-muted rounded-lg">{order.description}</p>
            </div>
          )}

          {/* Payment Receipts Section */}
          {payments.length > 0 && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="h-4 w-4 text-emerald-500" />
                <label className="text-sm font-medium">Payment Receipts</label>
                <Badge variant="secondary" className="text-xs">
                  {payments.length} payment{payments.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              <div className="space-y-3">
                {payments.map((payment: any, index: number) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-mono font-medium text-sm">
                          {formatAmount(payment.amount_paid)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(payment.created_at), 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {payment.screenshot_url ? (
                        <a
                          href={payment.screenshot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Receipt
                        </a>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          No receipt
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick preview for first receipt with screenshot */}
              {paymentsWithReceipts.length > 0 && (
                <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">Receipt Preview</p>
                    {paymentsWithReceipts.length > 1 && (
                      <div className="flex items-center gap-1">
                        {paymentsWithReceipts.map((_, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedReceiptIndex(idx)}
                            className={cn(
                              "w-2 h-2 rounded-full transition-colors",
                              idx === selectedReceiptIndex
                                ? "bg-primary"
                                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <a
                    href={paymentsWithReceipts[selectedReceiptIndex]?.screenshot_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={paymentsWithReceipts[selectedReceiptIndex]?.screenshot_url}
                      alt="Payment receipt"
                      className="w-full max-h-48 object-contain rounded cursor-zoom-in"
                    />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Activity Timeline for closed orders */}
          {(order.status === 'COMPLETED' || order.status === 'CANCELLED' || order.status === 'EXPIRED') && (
            <ActivityTimeline 
              entityId={order.id} 
              entityType="purchase_order"
            />
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
