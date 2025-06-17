
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, FileText, CreditCard } from "lucide-react";

interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_name: string;
  total_amount: number;
  net_payable_amount?: number;
  tds_applied?: boolean;
  tds_amount?: number;
  status: string;
  order_date: string;
  assigned_to?: string;
  contact_number?: string;
  bank_account_name?: string;
  payment_method_type?: string;
}

interface PurchaseOrderCardProps {
  order: PurchaseOrder;
  onView?: (order: PurchaseOrder) => void;
  onEdit?: (order: PurchaseOrder) => void;
  onUpdateStatus?: (orderId: string, status: string) => void;
}

export function PurchaseOrderCard({ order, onView, onEdit, onUpdateStatus }: PurchaseOrderCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'REVIEW_NEEDED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING': return '⏳';
      case 'COMPLETED': return '✅';
      case 'REVIEW_NEEDED': return '⚠️';
      default: return '📋';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              {getStatusIcon(order.status)}
              {order.order_number}
            </CardTitle>
            <p className="text-sm text-gray-600">{order.supplier_name}</p>
            {order.contact_number && (
              <p className="text-sm text-gray-500">📞 {order.contact_number}</p>
            )}
          </div>
          <Badge className={getStatusColor(order.status)}>
            {order.status.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Order Date:</span>
            <p className="font-medium">{format(new Date(order.order_date), 'MMM dd, yyyy')}</p>
          </div>
          <div>
            <span className="text-gray-500">Assigned To:</span>
            <p className="font-medium">{order.assigned_to || 'Unassigned'}</p>
          </div>
        </div>

        {order.bank_account_name && (
          <div className="flex items-center gap-2 text-sm">
            <CreditCard className="h-4 w-4 text-gray-500" />
            <span className="text-gray-500">Payment Account:</span>
            <span className="font-medium">{order.bank_account_name}</span>
          </div>
        )}

        {order.tds_applied && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="text-blue-700 font-medium">TDS Applied (1%)</span>
              <span className="text-blue-800">₹{order.tds_amount?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-gray-600">Net Payable:</span>
              <span className="font-bold text-green-700">₹{order.net_payable_amount?.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t">
          <div>
            <span className="text-gray-500 text-sm">Total Amount:</span>
            <p className="font-bold text-lg text-green-600">₹{order.total_amount.toFixed(2)}</p>
          </div>
          
          <div className="flex gap-2">
            {onView && (
              <Button variant="outline" size="sm" onClick={() => onView(order)}>
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
            )}
            {onEdit && order.status === 'PENDING' && (
              <Button variant="outline" size="sm" onClick={() => onEdit(order)}>
                <FileText className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </div>

        {onUpdateStatus && order.status === 'PENDING' && (
          <div className="flex gap-2 pt-2">
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => onUpdateStatus(order.id, 'COMPLETED')}
            >
              Mark Complete
            </Button>
            <Button 
              size="sm" 
              variant="destructive" 
              className="flex-1"
              onClick={() => onUpdateStatus(order.id, 'REVIEW_NEEDED')}
            >
              Needs Review
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
