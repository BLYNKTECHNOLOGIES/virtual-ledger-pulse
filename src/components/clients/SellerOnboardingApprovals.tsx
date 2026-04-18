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
import { usePermissions } from "@/hooks/usePermissions";
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
  const { hasPermission } = usePermissions();

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

  // Fetch first order info for all sellers in one batch query
  const sellerNames = pendingSellers?.map(s => s.name) || [];
  const { data: sellerOrders } = useQuery({
    queryKey: ['seller-first-orders', sellerNames.sort().join(',')],
    queryFn: async () => {
      if (sellerNames.length === 0) return {};
      
      // Use a single RPC-style query: fetch earliest order per supplier using distinct on
      // Supabase doesn't support DISTINCT ON via JS SDK, so we fetch all first orders at once
      // by querying with .in() and then picking the earliest per supplier client-side
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('supplier_name, order_date, total_amount, order_number')
        .in('supplier_name', sellerNames)
        .order('order_date', { ascending: true });
      
      if (error) throw error;
      
      const ordersBySupplier: Record<string, any> = {};
      for (const row of (data || [])) {
        // Keep only the first (earliest) order per supplier
        if (!ordersBySupplier[row.supplier_name]) {
          ordersBySupplier[row.supplier_name] = row;
        }
      }
      return ordersBySupplier;
    },
    enabled: sellerNames.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Enrich sellers with Binance nicknames via terminal_purchase_sync → p2p_order_records
  const { data: sellerNicknameMap } = useQuery({
    queryKey: ['seller-approval-nicknames', sellerNames.sort().join(',')],
    queryFn: async () => {
      if (sellerNames.length === 0) return {} as Record<string, { nickname: string; existingClient?: { id: string; name: string } }>;

      const { data: syncRows } = await supabase
        .from('terminal_purchase_sync')
        .select('counterparty_name, binance_order_number')
        .in('counterparty_name', sellerNames);

      if (!syncRows?.length) return {};

      const orderNumberToName: Record<string, string> = {};
      for (const row of syncRows) {
        if (row.binance_order_number && row.counterparty_name) {
          orderNumberToName[row.binance_order_number] = row.counterparty_name;
        }
      }

      const orderNumbers = Object.keys(orderNumberToName);
      if (orderNumbers.length === 0) return {};

      const { data: p2pRows } = await supabase
        .from('p2p_order_records')
        .select('binance_order_number, counterparty_nickname')
        .in('binance_order_number', orderNumbers)
        .not('counterparty_nickname', 'is', null);

      if (!p2pRows?.length) return {};

      const nameToNickname: Record<string, string> = {};
      const allNicknames = new Set<string>();
      for (const row of p2pRows) {
        const nick = row.counterparty_nickname?.trim();
        if (!nick || nick.includes('*')) continue; // Skip masked nicknames
        const sellerName = orderNumberToName[row.binance_order_number];
        if (sellerName && !nameToNickname[sellerName]) {
          nameToNickname[sellerName] = nick;
          allNicknames.add(nick);
        }
      }

      const nickArr = Array.from(allNicknames);
      let nicknameToClient: Record<string, { id: string; name: string }> = {};
      if (nickArr.length > 0) {
        const { data: linkRows } = await supabase
          .from('client_binance_nicknames')
          .select('nickname, client_id')
          .in('nickname', nickArr)
          .eq('is_active', true);

        if (linkRows?.length) {
          const clientIds = linkRows.map(r => r.client_id);
          const { data: clientRows } = await supabase
            .from('clients')
            .select('id, name')
            .in('id', clientIds)
            .eq('is_deleted', false);

          const clientMap = new Map((clientRows || []).map(c => [c.id, c.name]));
          for (const link of linkRows) {
            const clientName = clientMap.get(link.client_id);
            if (clientName) {
              nicknameToClient[link.nickname] = { id: link.client_id, name: clientName };
            }
          }
        }
      }

      const result: Record<string, { nickname: string; existingClient?: { id: string; name: string } }> = {};
      for (const [name, nick] of Object.entries(nameToNickname)) {
        result[name] = { nickname: nick, existingClient: nicknameToClient[nick] };
      }
      return result;
    },
    enabled: sellerNames.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // "Same User" detection for sellers
  const sellerSameUser = new Map<string, string>();
  if (sellerNicknameMap) {
    const groups = new Map<string, string[]>();
    for (const [name, info] of Object.entries(sellerNicknameMap)) {
      const arr = groups.get(info.nickname) || [];
      if (!arr.includes(name)) arr.push(name);
      groups.set(info.nickname, arr);
    }
    for (const [nick, names] of groups) {
      if (names.length > 1) {
        for (const n of names) sellerSameUser.set(n, nick);
      }
    }
  }

  // Verified-name & display-name collision check against existing approved/active clients
  // (clients other than the pending sellers in this view). Used for the 4-state badge.
  const { data: collisionMap } = useQuery({
    queryKey: ['seller-approval-collisions', sellerNames.sort().join(',')],
    enabled: sellerNames.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const result: Record<string, { verifiedNameClient?: { id: string; name: string }; displayNameClient?: { id: string; name: string } }> = {};
      const pendingIds = pendingSellers?.map(s => s.id) || [];

      // Verified name match: any other client whose client_verified_names contains this seller's name
      const { data: vnRows } = await supabase
        .from('client_verified_names')
        .select('verified_name, client_id')
        .in('verified_name', sellerNames);
      const vnIds = Array.from(new Set((vnRows || []).map(r => r.client_id).filter(id => !pendingIds.includes(id))));
      let vnClientMap = new Map<string, { id: string; name: string }>();
      if (vnIds.length > 0) {
        const { data: vnClients } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', vnIds)
          .eq('is_deleted', false);
        for (const c of vnClients || []) vnClientMap.set(c.id, { id: c.id, name: c.name });
      }
      for (const row of vnRows || []) {
        if (pendingIds.includes(row.client_id)) continue;
        const client = vnClientMap.get(row.client_id);
        if (client && !result[row.verified_name]?.verifiedNameClient) {
          result[row.verified_name] = { ...(result[row.verified_name] || {}), verifiedNameClient: client };
        }
      }

      // Display-name collision: another non-pending client with same name (case-insensitive)
      const { data: dnClients } = await supabase
        .from('clients')
        .select('id, name')
        .in('name', sellerNames)
        .eq('is_deleted', false);
      for (const c of dnClients || []) {
        if (pendingIds.includes(c.id)) continue;
        if (!result[c.name]?.displayNameClient) {
          result[c.name] = { ...(result[c.name] || {}), displayNameClient: { id: c.id, name: c.name } };
        }
      }
      return result;
    },
  });

  // Compute 4-state identity for each pending seller
  const computeSellerIdentityState = (sellerName: string): 'linked_known' | 'verified_name_match' | 'name_collision' | 'new_client' => {
    const nickInfo = sellerNicknameMap?.[sellerName];
    if (nickInfo?.existingClient) return 'linked_known';
    const collision = collisionMap?.[sellerName];
    if (collision?.verifiedNameClient) return 'verified_name_match';
    if (collision?.displayNameClient) return 'name_collision';
    return 'new_client';
  };

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
    onSuccess: async (_data, sellerId) => {
      // Auto-capture Binance nickname → client link
      const seller = pendingSellers?.find(s => s.id === sellerId);
      if (seller) {
        const nickInfo = sellerNicknameMap?.[seller.name];
        if (nickInfo?.nickname && !nickInfo.nickname.includes('*')) {
          try {
            await supabase.from('client_binance_nicknames').upsert({
              client_id: sellerId,
              nickname: nickInfo.nickname,
              source: 'approval',
              last_seen_at: new Date().toISOString(),
            }, { onConflict: 'nickname' });
          } catch (e) {
            console.error('Failed to auto-capture seller nickname link:', e);
          }
        }
        // Auto-capture verified name (seller.name is KYC-verified)
        try {
          await supabase.from('client_verified_names').upsert({
            client_id: sellerId,
            verified_name: seller.name.trim(),
            source: 'approval',
            last_seen_at: new Date().toISOString(),
          }, { onConflict: 'client_id,verified_name' });
        } catch (e) {
          console.error('Failed to auto-capture seller verified name:', e);
        }
      }

      toast({
        title: "Seller Approved",
        description: "The seller has been approved successfully.",
      });
      queryClient.setQueryData(['pending-seller-approvals'], (old: any[] | undefined) =>
        old ? old.filter(s => s.id !== sellerId) : []
      );
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['seller-approval-nicknames'] });
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
      // Remove rejected seller from cache without refetching
      queryClient.setQueryData(['pending-seller-approvals'], (old: any[] | undefined) =>
        old ? old.filter(s => s.id !== sellerToReject?.id) : []
      );
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
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Binance ID</th>
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
                    const nickInfo = sellerNicknameMap?.[seller.name];
                    const isSameUser = sellerSameUser.has(seller.name);
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
                          {isSameUser && (
                            <Badge className="mt-1 bg-purple-100 text-purple-800 text-xs">
                              ⚠ Same User — different name
                            </Badge>
                          )}
                          {nickInfo?.existingClient && !isSameUser && (
                            <Badge className="mt-1 bg-blue-100 text-blue-800 text-xs">
                              🔗 Known: {nickInfo.existingClient.name}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm">{nickInfo?.nickname || '—'}</span>
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
                            ? `₹${firstOrder.total_amount.toLocaleString('en-IN')}` 
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
                            {hasPermission('clients_destructive') && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRejectClick(seller)}
                                disabled={rejectMutation.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            )}
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
