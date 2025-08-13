import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Eye, Upload, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface KYCDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
}

export function KYCDocumentsDialog({ open, onOpenChange, client }: KYCDocumentsDialogProps) {
  // Fetch KYC data for the client
  const { data: kycData } = useQuery({
    queryKey: ['client-kyc-documents', client?.id],
    queryFn: async () => {
      if (!client) return [];
      
      const { data, error } = await supabase
        .from('kyc_approval_requests')
        .select('*')
        .eq('counterparty_name', client.name)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!client && open,
  });

  // Fetch client onboarding approvals for additional documents
  const { data: onboardingData } = useQuery({
    queryKey: ['client-onboarding-documents', client?.id],
    queryFn: async () => {
      if (!client) return [];
      
      const { data, error } = await supabase
        .from('client_onboarding_approvals')
        .select('*')
        .eq('client_name', client.name)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!client && open,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'APPROVED':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'REJECTED':
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const latestKyc = kycData?.[0];
  const latestOnboarding = onboardingData?.[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            KYC Documents - {client?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* KYC Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">KYC Status Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Current Status</label>
                {getStatusBadge(client?.kyc_status || 'PENDING')}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Total Submissions</label>
                <p className="text-xl font-bold">{kycData?.length || 0}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                <p className="text-sm">{latestKyc ? new Date(latestKyc.created_at).toLocaleDateString() : 'N/A'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Latest KYC Submission */}
          {latestKyc && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Latest KYC Submission</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Submission Date</label>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{new Date(latestKyc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div>{getStatusBadge(latestKyc.status)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Order Amount</label>
                    <p className="font-semibold">₹{latestKyc.order_amount?.toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Purpose</label>
                    <p className="text-sm">{latestKyc.purpose_of_buying || 'Not specified'}</p>
                  </div>
                </div>

                {latestKyc.additional_info && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Additional Information</label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">{latestKyc.additional_info}</p>
                  </div>
                )}

                {/* Document Links */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Documents</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {latestKyc.aadhar_front_url && (
                      <div className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">Aadhar Front</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestKyc.aadhar_front_url, '_blank')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestKyc.aadhar_front_url, '_blank')}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {latestKyc.aadhar_back_url && (
                      <div className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">Aadhar Back</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestKyc.aadhar_back_url, '_blank')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestKyc.aadhar_back_url, '_blank')}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {latestKyc.binance_id_screenshot_url && (
                      <div className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">Binance ID Screenshot</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestKyc.binance_id_screenshot_url, '_blank')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestKyc.binance_id_screenshot_url, '_blank')}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {latestKyc.additional_documents_url && (
                      <div className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">Additional Documents</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestKyc.additional_documents_url, '_blank')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestKyc.additional_documents_url, '_blank')}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Onboarding Documents */}
          {latestOnboarding && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Onboarding Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Approval Status</label>
                    <div>{getStatusBadge(latestOnboarding.approval_status)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Onboarding Date</label>
                    <p className="text-sm">{new Date(latestOnboarding.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Onboarding Document Links */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Onboarding Documents</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {latestOnboarding.aadhar_front_url && (
                      <div className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">Onboarding Aadhar Front</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestOnboarding.aadhar_front_url, '_blank')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {latestOnboarding.aadhar_back_url && (
                      <div className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">Onboarding Aadhar Back</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestOnboarding.aadhar_back_url, '_blank')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {latestOnboarding.vkyc_recording_url && (
                      <div className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">Video KYC Recording</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(latestOnboarding.vkyc_recording_url, '_blank')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KYC History */}
          {kycData && kycData.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">KYC History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {kycData.slice(1).map((kyc: any, index: number) => (
                    <div key={kyc.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <p className="text-sm font-medium">KYC Submission #{kycData.length - index - 1}</p>
                        <p className="text-xs text-muted-foreground">{new Date(kyc.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(kyc.status)}
                        <Button size="sm" variant="ghost">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Upload New Documents
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}