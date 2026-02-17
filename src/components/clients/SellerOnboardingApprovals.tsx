import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  Eye,
  UserCheck,
  Clock,
  ShoppingCart
} from "lucide-react";
import { ClientOrderSummaryDialog } from "./ClientOrderSummaryDialog";

export function SellerOnboardingApprovals() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [showOrderSummary, setShowOrderSummary] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [sellerToReject, setSellerToReject] = useState<any>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch pending seller approvals (sellers without KYC documents with PENDING status)
  const { data: pendingSellers, isLoading } = useQuery({
    queryKey: ['pending-seller-approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('is_deleted', false)
        .is('pan_card_url', null)
        .is('aadhar_front_url', null)
        .in('kyc_status', ['PENDING', 'PENDING_APPROVAL'])
        .eq('is_seller', true)
        .neq('seller_approval_status', 'APPROVED')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch first order info for each seller
  const { data: sellerOrders } = useQuery({
    queryKey: ['seller-first-orders', pendingSellers?.map(s => s.name)],
    queryFn: async () => {
      if (!pendingSellers || pendingSellers.length === 0) return {};
      
      const ordersBySupplier: Record<string, any> = {};
      
      for (const seller of pendingSellers) {
        const { data } = await supabase
          .from('purchase_orders')
          .select('order_date, total_amount, order_number')
          .eq('supplier_name', seller.name)
          .order('order_date', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (data) {
          ordersBySupplier[seller.name] = data;
        }
      }
      
      return ordersBySupplier;
    },
    enabled: !!pendingSellers && pendingSellers.length > 0,
  });

  // Approve seller mutation
  const approveMutation = useMutation({
    mutationFn: async (sellerId: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ 
          kyc_status: 'VERIFIED',
          seller_approval_status: 'APPROVED',
          seller_approved_at: new Date().toISOString(),
        })
        .eq('id', sellerId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Seller Approved",
        description: "The seller has been approved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['pending-seller-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to approve seller: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Reject seller mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ sellerId, reason }: { sellerId: string; reason: string }) => {
      const { error } = await supabase
        .from('clients')
        .update({ 
          kyc_status: 'REJECTED',
          operator_notes: reason
        })
        .eq('id', sellerId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Seller Rejected",
        description: "The seller has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ['pending-seller-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowRejectDialog(false);
      setRejectReason("");
      setSellerToReject(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to reject seller: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleApprove = (sellerId: string) => {
    approveMutation.mutate(sellerId);
  };

  const handleRejectClick = (seller: any) => {
    setSellerToReject(seller);
    setShowRejectDialog(true);
  };

  const handleRejectConfirm = () => {
    if (sellerToReject && rejectReason.trim()) {
      rejectMutation.mutate({ 
        sellerId: sellerToReject.id, 
        reason: rejectReason 
      });
    }
  };

  const handleViewOrders = (sellerId: string) => {
    setSelectedSellerId(sellerId);
    setShowOrderSummary(true);
  };

  const filteredSellers = pendingSellers?.filter(seller =>
    seller.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    seller.client_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
      case 'PENDING_APPROVAL':
        return <Badge className="bg-amber-100 text-amber-800"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'VERIFIED':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'REJECTED':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center text-muted-foreground">
            Loading pending approvals...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              New Seller Approvals
            </CardTitle>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {filteredSellers?.length || 0} Pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or client ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {filteredSellers && filteredSellers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Seller Name</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Client ID</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Contact</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">First Order Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">First Order Amount</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSellers.map((seller) => {
                    const firstOrder = sellerOrders?.[seller.name];
                    return (
                      <tr key={seller.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleViewOrders(seller.id)}
                            className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {seller.name}
                            <Eye className="h-3 w-3" />
                          </button>
                        </td>
                        <td className="py-3 px-4 font-mono text-sm">{seller.client_id}</td>
                        <td className="py-3 px-4">{seller.phone || '-'}</td>
                        <td className="py-3 px-4">
                          {firstOrder?.order_date 
                            ? new Date(firstOrder.order_date).toLocaleDateString() 
                            : '-'}
                        </td>
                        <td className="py-3 px-4">
                          {firstOrder?.total_amount 
                            ? `₹${firstOrder.total_amount.toLocaleString()}` 
                            : '-'}
                        </td>
                        <td className="py-3 px-4">{getStatusBadge(seller.kyc_status)}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewOrders(seller.id)}
                            >
                              <ShoppingCart className="h-3 w-3 mr-1" />
                              Orders
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(seller.id)}
                              disabled={approveMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRejectClick(seller)}
                              disabled={rejectMutation.isPending}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <UserCheck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No pending seller approvals</p>
              <p className="text-sm mt-1">New sellers will appear here when created from purchase orders</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Summary Dialog */}
      <ClientOrderSummaryDialog
        open={showOrderSummary}
        onOpenChange={setShowOrderSummary}
        clientId={selectedSellerId}
      />

      {/* Reject Confirmation Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Seller</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to reject <strong>{sellerToReject?.name}</strong>?</p>
            <div>
              <Label htmlFor="rejectReason">Reason for rejection *</Label>
              <Textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRejectConfirm}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
