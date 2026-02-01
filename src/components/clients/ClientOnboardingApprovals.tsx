import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  FileText, 
  Video, 
  AlertCircle,
  ExternalLink,
  Download
} from 'lucide-react';
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";

interface ClientOnboardingApproval {
  id: string;
  sales_order_id: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
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

export function ClientOnboardingApprovals() {
  const [selectedApproval, setSelectedApproval] = useState<ClientOnboardingApproval | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    aadhar_number: '',
    address: '',
    purpose_of_buying: '',
    proposed_monthly_limit: '',
    risk_assessment: 'MEDIUM',
    compliance_notes: ''
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch pending approvals
  const { data: approvals, isLoading } = useQuery({
    queryKey: ['client_onboarding_approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_onboarding_approvals')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ClientOnboardingApproval[];
    }
  });

  // Generate 6-digit alphanumeric client ID
  const generateClientId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Approve client mutation
  const approveClientMutation = useMutation({
    mutationFn: async (approvalData: {
      id: string;
      clientData: typeof formData;
    }) => {
      const { id, clientData } = approvalData;
      
      const approval = approvals?.find(a => a.id === id);
      if (!approval) throw new Error('Approval record not found');

      // Check if client already exists (by phone or email)
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id, name')
        .or(`phone.eq.${approval.client_phone || ''},email.eq.${approval.client_email || ''}`)
        .maybeSingle();

      if (existingClient) {
        // Update existing client to add buyer role
        const { error: updateClientError } = await supabase
          .from('clients')
          .update({
            is_buyer: true,
            buyer_approval_status: 'APPROVED',
            buyer_approved_at: new Date().toISOString(),
            kyc_status: 'VERIFIED',
            monthly_limit: parseFloat(clientData.proposed_monthly_limit),
            buying_purpose: clientData.purpose_of_buying,
            risk_appetite: clientData.risk_assessment
          })
          .eq('id', existingClient.id);

        if (updateClientError) throw updateClientError;
      } else {
        // Create new client record with buyer role
        const { error: clientError } = await supabase
          .from('clients')
          .insert({
            name: approval.client_name,
            email: approval.client_email,
            phone: approval.client_phone,
            client_type: 'INDIVIDUAL',
            kyc_status: 'VERIFIED',
            monthly_limit: parseFloat(clientData.proposed_monthly_limit),
            current_month_used: 0,
            first_order_value: approval.order_amount,
            buying_purpose: clientData.purpose_of_buying,
            risk_appetite: clientData.risk_assessment,
            assigned_operator: 'Compliance Team',
            date_of_onboarding: new Date().toISOString().split('T')[0],
            client_id: generateClientId(),
            is_buyer: true,
            is_seller: false,
            buyer_approval_status: 'APPROVED',
            seller_approval_status: 'NOT_APPLICABLE',
            buyer_approved_at: new Date().toISOString(),
            aadhar_front_url: approval.aadhar_front_url,
            aadhar_back_url: approval.aadhar_back_url
          });

        if (clientError) throw clientError;
      }

      // Update approval record AFTER client is created/updated
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
          compliance_notes: clientData.compliance_notes || null
        })
        .eq('id', id);

      if (updateError) {
        console.error('Failed to update approval record:', updateError);
        throw updateError;
      }
    },
    onSuccess: (_, variables) => {
      // Log the action
      logActionWithCurrentUser({
        actionType: ActionTypes.CLIENT_BUYER_APPROVED,
        entityType: EntityTypes.CLIENT_ONBOARDING,
        entityId: variables.id,
        module: Modules.CLIENTS,
        metadata: { proposed_monthly_limit: variables.clientData.proposed_monthly_limit }
      });
      
      toast({
        title: "Client Approved",
        description: "Client has been successfully onboarded and added to the directory"
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
      // Log the action
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

  const handleApprovalClick = (approval: ClientOnboardingApproval) => {
    setSelectedApproval(approval);
    setFormData({
      aadhar_number: approval.aadhar_number || '',
      address: approval.address || '',
      purpose_of_buying: approval.purpose_of_buying || '',
      proposed_monthly_limit: approval.proposed_monthly_limit?.toString() || '',
      risk_assessment: approval.risk_assessment || 'MEDIUM',
      compliance_notes: approval.compliance_notes || ''
    });
    setDialogOpen(true);
  };

  const handleApprove = () => {
    if (selectedApproval && formData.proposed_monthly_limit) {
      approveClientMutation.mutate({
        id: selectedApproval.id,
        clientData: formData
      });
    } else {
      toast({
        title: "Missing Information",
        description: "Please enter the monthly transaction limit",
        variant: "destructive"
      });
    }
  };

  const handleReject = (id: string, reason: string) => {
    rejectClientMutation.mutate({ id, reason });
  };

  const resetForm = () => {
    setFormData({
      aadhar_number: '',
      address: '',
      purpose_of_buying: '',
      proposed_monthly_limit: '',
      risk_assessment: 'MEDIUM',
      compliance_notes: ''
    });
    setSelectedApproval(null);
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

  const pendingApprovals = approvals?.filter(a => a.approval_status === 'PENDING') || [];
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
                {pendingApprovals.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell className="font-medium">
                      {approval.client_name}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>₹{approval.order_amount.toLocaleString()}</div>
                        <div className="text-gray-500">{new Date(approval.order_date).toLocaleDateString()}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{approval.client_email}</div>
                        <div className="text-gray-500">{approval.client_phone}</div>
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
                        <span className="text-gray-400">No VKYC</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(approval.approval_status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprovalClick(approval)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Review
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(approval.id, 'Insufficient documentation')}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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

      {/* Reviewed Approvals - Including Approved and Rejected */}
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
                  <TableCell>₹{approval.order_amount.toLocaleString()}</TableCell>
                  <TableCell>{getStatusBadge(approval.approval_status)}</TableCell>
                  <TableCell>{approval.reviewed_by || '-'}</TableCell>
                  <TableCell>
                    {approval.reviewed_at ? new Date(approval.reviewed_at).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    {approval.approval_status === 'APPROVED' ? (
                      <span className="text-sm text-muted-foreground">
                        Limit: ₹{approval.proposed_monthly_limit?.toLocaleString() || '-'}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Client Onboarding Form</DialogTitle>
          </DialogHeader>

          {selectedApproval && (
            <div className="space-y-6">
              {/* Client Details */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Order Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Client Name:</span> {selectedApproval.client_name}
                  </div>
                  <div>
                    <span className="font-medium">Order Amount:</span> ₹{selectedApproval.order_amount.toLocaleString()}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span> {selectedApproval.client_email}
                  </div>
                  <div>
                    <span className="font-medium">Phone:</span> {selectedApproval.client_phone}
                  </div>
                </div>
              </div>

              {/* Compliance Form */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="aadhar_number">Aadhar Number</Label>
                  <Input
                    id="aadhar_number"
                    value={formData.aadhar_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, aadhar_number: e.target.value }))}
                    placeholder="Enter 12-digit Aadhar number"
                  />
                </div>

                <div>
                  <Label htmlFor="proposed_monthly_limit">Monthly Transaction Limit (₹) *</Label>
                  <Input
                    id="proposed_monthly_limit"
                    type="number"
                    value={formData.proposed_monthly_limit}
                    onChange={(e) => setFormData(prev => ({ ...prev, proposed_monthly_limit: e.target.value }))}
                    placeholder="Enter monthly limit"
                    required
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="address">Complete Address</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Enter complete address as per Aadhar"
                  />
                </div>

                <div className="col-span-2">
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

                <div className="col-span-2">
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
                  disabled={approveClientMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {approveClientMutation.isPending ? 'Approving...' : 'Approve & Onboard Client'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}