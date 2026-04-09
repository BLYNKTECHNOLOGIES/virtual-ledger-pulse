import React, { useState, useRef } from 'react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { INDIAN_STATES_AND_UTS } from '@/data/indianStatesAndUTs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SalesOrderDetailsDialog } from '@/components/sales/SalesOrderDetailsDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  FileText, 
  Video, 
  AlertCircle,
  ExternalLink,
  Download,
  UserCheck,
  UserPlus,
  Pencil,
  AlertTriangle,
  Plus,
  X,
  CalendarIcon,
  Upload
} from 'lucide-react';
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";

interface BankEntry {
  bankName: string;
  lastFourDigits: string;
  statementFile: File | null;
  statementPeriodFrom: Date | undefined;
  statementPeriodTo: Date | undefined;
}

interface ClientOnboardingApproval {
  id: string;
  sales_order_id: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_state?: string;
  order_amount: number;
  order_date: string;
  aadhar_front_url?: string;
  aadhar_back_url?: string;
  additional_documents_url?: string[];
  binance_id_screenshot_url?: string;
  vkyc_recording_url?: string;
  vkyc_notes?: string;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW';
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  aadhar_number?: string;
  address?: string;
  purpose_of_buying?: string;
  proposed_monthly_limit?: number;
  risk_assessment?: string;
  compliance_notes?: string;
  created_at: string;
  updated_at: string;
}

interface ExistingClientMatch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  client_id: string;
  kyc_status: string;
  monthly_limit: number | null;
  is_buyer: boolean | null;
  is_seller: boolean | null;
  date_of_onboarding: string;
  pan_card_number: string | null;
  buying_purpose: string | null;
  current_month_used: number | null;
  risk_appetite: string | null;
  first_order_value: number | null;
  client_type: string | null;
  default_risk_level: string | null;
  assigned_operator: string | null;
}

export function ClientOnboardingApprovals() {
  const [selectedApproval, setSelectedApproval] = useState<ClientOnboardingApproval | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOrderData, setViewOrderData] = useState<any>(null);
  const [viewOrderOpen, setViewOrderOpen] = useState(false);
  const [existingClientMatch, setExistingClientMatch] = useState<ExistingClientMatch | null>(null);
  const [existingClientTransactions, setExistingClientTransactions] = useState<any[]>([]);
  const [approvalMode, setApprovalMode] = useState<'normal' | 'merge' | 'create_new'>('normal');
  const [formData, setFormData] = useState({
    aadhar_number: '',
    address: '',
    purpose_of_buying: '',
    proposed_monthly_limit: '',
    risk_assessment: 'HIGH',
    compliance_notes: '',
    client_state: '',
    client_phone: ''
  });
  const [phoneEditEnabled, setPhoneEditEnabled] = useState(false);
  const [stateEditEnabled, setStateEditEnabled] = useState(false);
  const [bankEntries, setBankEntries] = useState<BankEntry[]>([
    { bankName: '', lastFourDigits: '', statementFile: null, statementPeriodFrom: undefined, statementPeriodTo: undefined }
  ]);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

  // Fetch approvals - all pending, and all reviewed (history)
  const { data: approvals, isLoading } = useQuery({
    queryKey: ['client_onboarding_approvals'],
    queryFn: async () => {
      const { data: allPending, error: pendingError } = await supabase
        .from('client_onboarding_approvals')
        .select('*')
        .eq('approval_status', 'PENDING')
        .order('created_at', { ascending: false });

      if (pendingError) throw pendingError;

      const { data: history, error: historyError } = await supabase
        .from('client_onboarding_approvals')
        .select('*')
        .neq('approval_status', 'PENDING')
        .order('created_at', { ascending: false });

      if (historyError) throw historyError;

      return [...(allPending || []), ...(history || [])] as ClientOnboardingApproval[];
    }
  });

  const generateClientId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Check for existing client with same name
  const checkExistingClient = async (clientName: string): Promise<ExistingClientMatch | null> => {
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, email, state, client_id, kyc_status, monthly_limit, is_buyer, is_seller, date_of_onboarding, pan_card_number, buying_purpose, current_month_used, risk_appetite, first_order_value, client_type, default_risk_level, assigned_operator')
      .eq('is_deleted', false)
      .ilike('name', clientName.trim())
      .maybeSingle();
    
    // Fetch recent transactions for the matched client
    if (data?.id) {
      const { data: recentOrders } = await supabase
        .from('sales_orders')
        .select('order_number, order_date, total_amount, status, payment_status, quantity, price_per_unit, sale_type, client_phone, client_state')
        .eq('client_id', data.id)
        .order('order_date', { ascending: false })
        .limit(5);
      setExistingClientTransactions(recentOrders || []);
    } else {
      setExistingClientTransactions([]);
    }

    return data as ExistingClientMatch | null;
  };

  // Approve client mutation
  const approveClientMutation = useMutation({
    mutationFn: async (approvalData: {
      id: string;
      clientData: typeof formData;
      mode: 'normal' | 'merge' | 'create_new';
      existingClientId?: string;
    }) => {
      const { id, clientData, mode, existingClientId } = approvalData;
      
      const approval = approvals?.find(a => a.id === id);
      if (!approval) throw new Error('Approval record not found');

      if (mode === 'merge' && existingClientId) {
        // Merge: update existing client with buyer role
        const { error: updateClientError } = await supabase
          .from('clients')
          .update({
            is_buyer: true,
            buyer_approval_status: 'APPROVED',
            buyer_approved_at: new Date().toISOString(),
            kyc_status: 'VERIFIED',
            monthly_limit: parseFloat(clientData.proposed_monthly_limit),
            buying_purpose: clientData.purpose_of_buying,
            risk_appetite: clientData.risk_assessment,
            operator_notes: clientData.compliance_notes || undefined,
            state: clientData.client_state || approval.client_state || undefined,
            phone: clientData.client_phone || approval.client_phone || undefined,
          })
          .eq('id', existingClientId);

        if (updateClientError) throw updateClientError;
      } else {
        // Check by phone/email first for non-name matches
        let existingByContact = null;
        if (mode === 'normal') {
          const { data } = await supabase
            .from('clients')
            .select('id, name')
            .eq('is_deleted', false)
            .or(`phone.eq.${approval.client_phone || ''}`)
            .maybeSingle();
          existingByContact = data;
        }

        if (existingByContact) {
          // Update existing client found by phone/email
          const { error: updateClientError } = await supabase
            .from('clients')
            .update({
              is_buyer: true,
              buyer_approval_status: 'APPROVED',
              buyer_approved_at: new Date().toISOString(),
              kyc_status: 'VERIFIED',
              monthly_limit: parseFloat(clientData.proposed_monthly_limit),
              buying_purpose: clientData.purpose_of_buying,
              risk_appetite: clientData.risk_assessment,
              operator_notes: clientData.compliance_notes || undefined,
              state: clientData.client_state || approval.client_state || undefined,
              phone: clientData.client_phone || approval.client_phone || undefined
            })
            .eq('id', existingByContact.id);

          if (updateClientError) throw updateClientError;
        } else {
          // Create new client
          const clientName = mode === 'create_new' 
            ? approval.client_name // Name will be unique because it's a different person
            : approval.client_name;
          
          const { error: clientError } = await supabase
            .from('clients')
            .insert({
              name: clientName,
              phone: clientData.client_phone || approval.client_phone,
              client_type: 'INDIVIDUAL',
              kyc_status: 'VERIFIED',
              monthly_limit: parseFloat(clientData.proposed_monthly_limit),
              current_month_used: 0,
              first_order_value: approval.order_amount,
              buying_purpose: clientData.purpose_of_buying,
              risk_appetite: clientData.risk_assessment,
              operator_notes: clientData.compliance_notes || null,
              assigned_operator: 'Compliance Team',
              date_of_onboarding: new Date().toISOString().split('T')[0],
              client_id: generateClientId(),
              is_buyer: true,
              is_seller: false,
              buyer_approval_status: 'APPROVED',
              seller_approval_status: 'NOT_APPLICABLE',
              buyer_approved_at: new Date().toISOString(),
              aadhar_front_url: approval.aadhar_front_url,
              aadhar_back_url: approval.aadhar_back_url,
              state: clientData.client_state || approval.client_state || null
            });

          if (clientError) {
            // If still hits unique constraint, provide clear message
            if (clientError.message?.includes('idx_clients_unique_name_active')) {
              throw new Error(`A client named "${approval.client_name}" already exists. Please use "Link to Existing" or contact admin to resolve.`);
            }
            throw clientError;
          }
        }
      }

      // Update this approval record
      const { error: updateError } = await supabase
        .from('client_onboarding_approvals')
        .update({
          approval_status: 'APPROVED',
          reviewed_at: new Date().toISOString(),
          aadhar_number: clientData.aadhar_number || null,
          address: clientData.address || null,
          purpose_of_buying: clientData.purpose_of_buying || null,
          proposed_monthly_limit: clientData.proposed_monthly_limit ? parseFloat(clientData.proposed_monthly_limit) : null,
          risk_assessment: clientData.risk_assessment || null,
          compliance_notes: clientData.compliance_notes || null,
          client_phone: clientData.client_phone || approval.client_phone || null,
          client_state: clientData.client_state || approval.client_state || null
        })
        .eq('id', id);

      if (updateError) {
        console.error('Failed to update approval record:', updateError);
        throw updateError;
      }

      // Also approve all other pending records for the same client name
      const { error: batchError } = await supabase
        .from('client_onboarding_approvals')
        .update({
          approval_status: 'APPROVED',
          reviewed_at: new Date().toISOString(),
          compliance_notes: 'Auto-approved with primary record'
        })
        .eq('approval_status', 'PENDING')
        .ilike('client_name', approval.client_name.trim())
        .neq('id', id);

      if (batchError) {
        console.error('Failed to batch-approve sibling records:', batchError);
      }
    },
    onSuccess: (_, variables) => {
      logActionWithCurrentUser({
        actionType: ActionTypes.CLIENT_BUYER_APPROVED,
        entityType: EntityTypes.CLIENT_ONBOARDING,
        entityId: variables.id,
        module: Modules.CLIENTS,
        metadata: { 
          proposed_monthly_limit: variables.clientData.proposed_monthly_limit,
          mode: variables.mode,
          merged_with: variables.existingClientId || null
        }
      });
      
      toast({
        title: "Client Approved",
        description: variables.mode === 'merge' 
          ? "Client has been linked to existing record and approved"
          : "Client has been successfully onboarded and added to the directory"
      });
      queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error('Approval error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve client",
        variant: "destructive"
      });
    }
  });

  // Reject client mutation
  const rejectClientMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('client_onboarding_approvals')
        .update({
          approval_status: 'REJECTED',
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason
        })
        .eq('id', id);

      if (error) {
        console.error('Failed to reject client:', error);
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      logActionWithCurrentUser({
        actionType: ActionTypes.CLIENT_BUYER_REJECTED,
        entityType: EntityTypes.CLIENT_ONBOARDING,
        entityId: variables.id,
        module: Modules.CLIENTS,
        metadata: { rejection_reason: variables.reason }
      });
      
      toast({
        title: "Client Rejected",
        description: "Client application has been rejected"
      });
      queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject client",
        variant: "destructive"
      });
    }
  });

  const handleApprovalClick = async (approval: ClientOnboardingApproval) => {
    setSelectedApproval(approval);
    const phone = approval.client_phone || '';
    const state = approval.client_state || '';
    setFormData({
      aadhar_number: approval.aadhar_number || '',
      address: approval.address || '',
      purpose_of_buying: approval.purpose_of_buying || '',
      proposed_monthly_limit: approval.proposed_monthly_limit?.toString() || '',
      risk_assessment: approval.risk_assessment || 'HIGH',
      compliance_notes: approval.compliance_notes || '',
      client_state: state,
      client_phone: phone
    });
    // Lock fields if already pre-populated
    setPhoneEditEnabled(!phone);
    setStateEditEnabled(!state);
    
    // Pre-check for existing client with same name
    const existing = await checkExistingClient(approval.client_name);
    setExistingClientMatch(existing);
    if (existing) {
      setApprovalMode('merge');
      // Auto-fill monthly limit from existing client if not already provided in the approval
      if (existing.monthly_limit && !approval.proposed_monthly_limit) {
        setFormData(prev => ({ ...prev, proposed_monthly_limit: existing.monthly_limit!.toString() }));
      }
    } else {
      setApprovalMode('normal');
    }
    setDialogOpen(true);
  };

  const handleApprove = () => {
    if (!selectedApproval) return;
    
    // Buyer mandatory validation: phone and state required
    if (!formData.client_phone?.trim()) {
      toast({
        title: "Missing Information",
        description: "Phone number is mandatory for buyer approval",
        variant: "destructive"
      });
      return;
    }
    
    if (!formData.client_state?.trim()) {
      toast({
        title: "Missing Information",
        description: "State is mandatory for buyer approval",
        variant: "destructive"
      });
      return;
    }
    
    // For merge mode, monthly limit is optional (uses existing client's limit)
    const needsLimit = approvalMode !== 'merge' || !existingClientMatch?.monthly_limit;
    
    if (needsLimit && !formData.proposed_monthly_limit) {
      toast({
        title: "Missing Information",
        description: "Please enter the monthly transaction limit",
        variant: "destructive"
      });
      return;
    }

    // Bank details validation: at least one entry with bank name + last 4 digits
    const hasValidBank = bankEntries.some(e => e.bankName.trim() && e.lastFourDigits.trim().length === 4);
    if (!hasValidBank) {
      toast({
        title: "Missing Information",
        description: "At least one bank account with bank name and last 4 digits is required",
        variant: "destructive"
      });
      return;
    }

    // Validate all filled entries have complete data
    for (const entry of bankEntries) {
      if (entry.bankName.trim() || entry.lastFourDigits.trim()) {
        if (!entry.bankName.trim() || entry.lastFourDigits.trim().length !== 4) {
          toast({
            title: "Incomplete Bank Details",
            description: "Each bank entry must have a bank name and exactly 4 digits",
            variant: "destructive"
          });
          return;
        }
      }
    }

    // If there's a name match and operator hasn't chosen, block
    if (existingClientMatch && approvalMode !== 'merge' && approvalMode !== 'create_new') {
      toast({
        title: "Action Required",
        description: "Please choose to link to existing client or create a new one",
        variant: "destructive"
      });
      return;
    }
    
    approveClientMutation.mutate({
      id: selectedApproval.id,
      clientData: {
        ...formData,
        // For merge: if no new limit provided, pass existing client's limit
        proposed_monthly_limit: formData.proposed_monthly_limit || existingClientMatch?.monthly_limit?.toString() || '',
      },
      mode: approvalMode,
      existingClientId: approvalMode === 'merge' ? existingClientMatch?.id : undefined,
      bankEntries: bankEntries.filter(e => e.bankName.trim() && e.lastFourDigits.trim().length === 4)
    });
  };
  };

  const handleReject = (id: string, reason: string) => {
    rejectClientMutation.mutate({ id, reason });
  };

  // Reject all duplicate approval records for the same client
  const handleRejectAll = (ids: string[], reason: string) => {
    for (const id of ids) {
      rejectClientMutation.mutate({ id, reason });
    }
  };

  const handleViewOrder = async (salesOrderId: string | undefined) => {
    if (!salesOrderId) {
      toast({ title: "No linked order", description: "This approval has no associated sales order", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', salesOrderId)
      .single();
    if (error || !data) {
      toast({ title: "Order not found", description: "Could not fetch the linked sales order", variant: "destructive" });
      return;
    }
    setViewOrderData(data);
    setViewOrderOpen(true);
  };

  const resetForm = () => {
    setFormData({
      aadhar_number: '',
      address: '',
      purpose_of_buying: '',
      proposed_monthly_limit: '',
      risk_assessment: 'HIGH',
      compliance_notes: '',
      client_state: '',
      client_phone: ''
    });
    setSelectedApproval(null);
    setExistingClientMatch(null);
    setApprovalMode('normal');
    setPhoneEditEnabled(false);
    setStateEditEnabled(false);
    setBankEntries([{ bankName: '', lastFourDigits: '', statementFile: null, statementPeriodFrom: undefined, statementPeriodTo: undefined }]);
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'UNDER_REVIEW': 'bg-blue-100 text-blue-800',
      'APPROVED': 'bg-green-100 text-green-800',
      'REJECTED': 'bg-red-100 text-red-800'
    };
    return <Badge className={variants[status as keyof typeof variants]}>{status}</Badge>;
  };

  const openDocument = (url: string) => {
    window.open(url, '_blank');
  };

  // Deduplicate pending approvals by client_name — show each client once with aggregated order info
  const allPending = approvals?.filter(a => a.approval_status === 'PENDING') || [];
  const pendingByClient = new Map<string, { primary: ClientOnboardingApproval; allIds: string[]; totalAmount: number; orderCount: number }>();
  for (const a of allPending) {
    const key = a.client_name.trim().toLowerCase();
    const existing = pendingByClient.get(key);
    if (existing) {
      existing.allIds.push(a.id);
      existing.totalAmount += a.order_amount;
      existing.orderCount += 1;
      // Keep the latest record as primary
      if (new Date(a.created_at) > new Date(existing.primary.created_at)) {
        existing.primary = a;
      }
    } else {
      pendingByClient.set(key, { primary: a, allIds: [a.id], totalAmount: a.order_amount, orderCount: 1 });
    }
  }
  const pendingApprovals = Array.from(pendingByClient.values());
  const reviewedApprovals = approvals?.filter(a => a.approval_status !== 'PENDING') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-6 w-6 text-orange-600" />
        <h2 className="text-2xl font-bold">Client Onboarding Approvals</h2>
        <Badge variant="destructive">{pendingApprovals.length} Pending</Badge>
      </div>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            Pending Client Approvals ({pendingApprovals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading approvals...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Order Details</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>VKYC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApprovals.map((entry) => {
                  const approval = entry.primary;
                  return (
                  <TableRow key={approval.id}>
                    <TableCell className="font-medium">
                      {approval.client_name}
                      {entry.orderCount > 1 && (
                        <Badge variant="outline" className="ml-2 text-xs">{entry.orderCount} orders</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>₹{entry.totalAmount.toLocaleString('en-IN')}</div>
                        <div className="text-muted-foreground">{new Date(approval.order_date).toLocaleDateString()}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{approval.client_phone}</div>
                        {approval.client_state && (
                          <div className="text-muted-foreground">{approval.client_state}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {approval.aadhar_front_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDocument(approval.aadhar_front_url!)}
                          >
                            <FileText className="h-3 w-3" />
                          </Button>
                        )}
                        {approval.binance_id_screenshot_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDocument(approval.binance_id_screenshot_url!)}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {approval.vkyc_recording_url ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDocument(approval.vkyc_recording_url!)}
                        >
                          <Video className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">No VKYC</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(approval.approval_status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {approval.sales_order_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewOrder(approval.sales_order_id)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            View Order
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleApprovalClick(approval)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Review
                        </Button>
                        {hasPermission('clients_destructive') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRejectAll(entry.allIds, 'Insufficient documentation')}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {pendingApprovals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No pending approvals found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reviewed Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Approval History ({reviewedApprovals.length})
            {reviewedApprovals.filter(a => a.approval_status === 'REJECTED').length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {reviewedApprovals.filter(a => a.approval_status === 'REJECTED').length} Rejected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client Name</TableHead>
                <TableHead>Order Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reviewed By</TableHead>
                <TableHead>Review Date</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviewedApprovals.map((approval) => (
                <TableRow key={approval.id} className={approval.approval_status === 'REJECTED' ? 'bg-red-50' : ''}>
                  <TableCell className="font-medium">{approval.client_name}</TableCell>
                  <TableCell>₹{approval.order_amount.toLocaleString('en-IN')}</TableCell>
                  <TableCell>{getStatusBadge(approval.approval_status)}</TableCell>
                  <TableCell>{approval.reviewed_by || '-'}</TableCell>
                  <TableCell>
                    {approval.reviewed_at ? new Date(approval.reviewed_at).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    {approval.approval_status === 'APPROVED' ? (
                      <span className="text-sm text-muted-foreground">
                        Limit: ₹{approval.proposed_monthly_limit?.toLocaleString('en-IN') || '-'}
                      </span>
                    ) : approval.approval_status === 'REJECTED' ? (
                      <span className="text-sm text-destructive">
                        Reason: {approval.rejection_reason || 'Not specified'}
                      </span>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {reviewedApprovals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No reviewed applications yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approval Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="md:max-w-[95vw] lg:max-w-[1400px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Client Onboarding Form</DialogTitle>
          </DialogHeader>

          {selectedApproval && (
            <div className="space-y-6">
              {/* Existing Client Match Warning */}
              {existingClientMatch && (
                <div className="border-2 border-orange-300 bg-orange-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-orange-800 font-semibold">
                    <AlertTriangle className="h-5 w-5" />
                    Existing Client Found with Same Name
                  </div>
                  <p className="text-sm text-orange-700">
                    A client named <strong>"{existingClientMatch.name}"</strong> already exists. Please verify if this is the same person before proceeding.
                  </p>
                  
                  {/* Existing client details */}
                   <div className="bg-white rounded-md p-3 border border-orange-200">
                    <h4 className="font-semibold text-sm mb-2 text-foreground">Existing Client Record</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Client ID:</span> {existingClientMatch.client_id}</div>
                      <div><span className="text-muted-foreground">Phone:</span> {existingClientMatch.phone || 'N/A'}</div>
                      <div><span className="text-muted-foreground">State:</span> {existingClientMatch.state || 'N/A'}</div>
                      <div><span className="text-muted-foreground">State:</span> {existingClientMatch.state || 'N/A'}</div>
                      <div><span className="text-muted-foreground">PAN:</span> {existingClientMatch.pan_card_number || 'N/A'}</div>
                      <div><span className="text-muted-foreground">KYC:</span> {existingClientMatch.kyc_status}</div>
                      <div><span className="text-muted-foreground">Monthly Limit:</span> {existingClientMatch.monthly_limit ? `₹${existingClientMatch.monthly_limit.toLocaleString('en-IN')}` : 'N/A'}</div>
                      <div><span className="text-muted-foreground">Used This Month:</span> ₹{existingClientMatch.current_month_used?.toLocaleString('en-IN') || '0'}</div>
                      <div><span className="text-muted-foreground">First Order:</span> {existingClientMatch.first_order_value ? `₹${existingClientMatch.first_order_value.toLocaleString('en-IN')}` : 'N/A'}</div>
                      <div><span className="text-muted-foreground">Buyer:</span> {existingClientMatch.is_buyer ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground">Seller:</span> {existingClientMatch.is_seller ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground">Client Type:</span> {existingClientMatch.client_type || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Risk Appetite:</span> {existingClientMatch.risk_appetite || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Risk Level:</span> {existingClientMatch.default_risk_level || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Operator:</span> {existingClientMatch.assigned_operator || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Onboarded:</span> {existingClientMatch.date_of_onboarding}</div>
                      <div><span className="text-muted-foreground">Purpose:</span> {existingClientMatch.buying_purpose || 'N/A'}</div>
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  {existingClientTransactions.length > 0 && (
                    <div className="bg-white rounded-md p-3 border border-orange-200">
                      <h4 className="font-semibold text-sm mb-2 text-foreground">Recent Transactions (Last {existingClientTransactions.length})</h4>
                      <div className="w-full">
                        <table className="w-full text-xs table-fixed">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-1 pr-2">Order #</th>
                              <th className="text-left py-1 pr-2">Date</th>
                              <th className="text-left py-1 pr-2">Type</th>
                              <th className="text-right py-1 pr-2">Amount</th>
                              <th className="text-right py-1 pr-2">Qty</th>
                              <th className="text-right py-1 pr-2">Rate</th>
                              <th className="text-left py-1 pr-2">Phone</th>
                              <th className="text-left py-1 pr-2">State</th>
                              <th className="text-left py-1">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {existingClientTransactions.map((tx, idx) => (
                              <tr key={idx} className="border-b border-dashed last:border-0">
                                <td className="py-1 pr-2 font-mono">{tx.order_number}</td>
                                <td className="py-1 pr-2">{new Date(tx.order_date).toLocaleDateString('en-IN')}</td>
                                <td className="py-1 pr-2 capitalize">{tx.sale_type || 'N/A'}</td>
                                <td className="py-1 pr-2 text-right">₹{tx.total_amount?.toLocaleString('en-IN')}</td>
                                <td className="py-1 pr-2 text-right">{tx.quantity}</td>
                                <td className="py-1 pr-2 text-right">₹{tx.price_per_unit?.toLocaleString('en-IN')}</td>
                                <td className="py-1 pr-2">{tx.client_phone || '-'}</td>
                                <td className="py-1 pr-2">{tx.client_state || '-'}</td>
                                <td className="py-1">
                                  <span className={`px-1.5 py-0.5 rounded text-xs ${tx.status === 'APPROVED' ? 'bg-green-100 text-green-700' : tx.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {tx.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-md p-3 border border-orange-200">
                    <h4 className="font-semibold text-sm mb-2 text-foreground">New Onboarding Request</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Name:</span> {selectedApproval.client_name}</div>
                      <div><span className="text-muted-foreground">Phone:</span> {selectedApproval.client_phone || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Email:</span> {selectedApproval.client_email || 'N/A'}</div>
                      <div><span className="text-muted-foreground">State:</span> {selectedApproval.client_state || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Order Amount:</span> ₹{selectedApproval.order_amount.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground">Order Date:</span> {new Date(selectedApproval.order_date).toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                   <div className="flex flex-wrap gap-3">
                    <Button
                      variant={approvalMode === 'merge' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setApprovalMode('merge');
                        // Auto-fill monthly limit from existing client if available and not already set
                        if (existingClientMatch?.monthly_limit && !formData.proposed_monthly_limit) {
                          setFormData(prev => ({ ...prev, proposed_monthly_limit: existingClientMatch.monthly_limit!.toString() }));
                        }
                      }}
                      className={approvalMode === 'merge' ? 'bg-green-600 hover:bg-green-700' : ''}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Same Person — Link to Existing
                    </Button>
                    <Button
                      variant={approvalMode === 'create_new' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setApprovalMode('create_new')}
                      className={approvalMode === 'create_new' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Different Person — Create New
                    </Button>
                  </div>
                  
                  {approvalMode === 'create_new' && (
                    <p className="text-xs text-orange-600">
                      ⚠️ Creating a new client with the same name requires the existing client's name to be disambiguated first. 
                      Please ensure their names differ (e.g., add a middle name or location) to avoid the unique name constraint.
                    </p>
                  )}
                </div>
              )}

              {/* Client Details */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Order Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Client Name:</span> {selectedApproval.client_name}
                  </div>
                  <div>
                    <span className="font-medium">Order Amount:</span> ₹{selectedApproval.order_amount.toLocaleString('en-IN')}
                  </div>
                  <div>
                    <Label htmlFor="client_phone" className="font-medium">Phone *</Label>
                    {phoneEditEnabled ? (
                      <Input
                        id="client_phone"
                        value={formData.client_phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, client_phone: e.target.value }))}
                        placeholder="Enter phone number"
                        className="mt-1"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm">{formData.client_phone || 'N/A'}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPhoneEditEnabled(true)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="client_state_order" className="font-medium">State *</Label>
                    {stateEditEnabled ? (
                      <Select
                        value={formData.client_state}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, client_state: value }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDIAN_STATES_AND_UTS.map((state) => (
                            <SelectItem key={state} value={state}>{state}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm">{formData.client_state || 'N/A'}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setStateEditEnabled(true)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Compliance Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="proposed_monthly_limit">
                    Monthly Transaction Limit (₹) {approvalMode !== 'merge' && '*'}
                    {approvalMode === 'merge' && existingClientMatch?.monthly_limit && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (Auto-filled from existing record — editable)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="proposed_monthly_limit"
                    type="number"
                    value={formData.proposed_monthly_limit}
                    onChange={(e) => setFormData(prev => ({ ...prev, proposed_monthly_limit: e.target.value }))}
                    placeholder={approvalMode === 'merge' ? 'Using existing limit' : 'Enter monthly limit'}
                    required={approvalMode !== 'merge'}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      { label: '₹50,000', value: '50000' },
                      { label: '₹1 Lakh', value: '100000' },
                      { label: '₹2 Lakh', value: '200000' },
                      { label: '₹10 Lakh', value: '1000000' },
                      { label: '₹1 Cr', value: '10000000' },
                    ].map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={formData.proposed_monthly_limit === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFormData(prev => ({ ...prev, proposed_monthly_limit: opt.value }))}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="purpose_of_buying">Purpose of Buying</Label>
                  <Textarea
                    id="purpose_of_buying"
                    value={formData.purpose_of_buying}
                    onChange={(e) => setFormData(prev => ({ ...prev, purpose_of_buying: e.target.value }))}
                    placeholder="Purpose as described during VKYC call"
                  />
                </div>

                <div>
                  <Label htmlFor="risk_assessment">Risk Assessment</Label>
                  <Select
                    value={formData.risk_assessment}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, risk_assessment: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low Risk</SelectItem>
                      <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                      <SelectItem value="HIGH">High Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="aadhar_number">Aadhar Number</Label>
                  <Input
                    id="aadhar_number"
                    value={formData.aadhar_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, aadhar_number: e.target.value }))}
                    placeholder="Enter Aadhar number"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="compliance_notes">Compliance Notes</Label>
                  <Textarea
                    id="compliance_notes"
                    value={formData.compliance_notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, compliance_notes: e.target.value }))}
                    placeholder="Additional compliance observations"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveClientMutation.isPending || (existingClientMatch && approvalMode !== 'merge' && approvalMode !== 'create_new')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {approveClientMutation.isPending 
                    ? 'Approving...' 
                    : approvalMode === 'merge' 
                      ? 'Link & Approve'
                      : 'Approve & Onboard Client'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Order Dialog */}
      <SalesOrderDetailsDialog
        open={viewOrderOpen}
        onOpenChange={(open) => { if (!open) { setViewOrderOpen(false); setViewOrderData(null); } }}
        order={viewOrderData}
      />
    </div>
  );
}
