import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Eye, Upload, Calendar, CreditCard, Briefcase, Video, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface KYCDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: any;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar Card',
  usdt_usage_proof: 'USDT Usage Proof',
  trade_history_screenshot: 'Trade History Screenshot',
  vkyc_video: 'vKYC Video',
};

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

  // Fetch client onboarding approvals
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

  // Fetch new KYC documents from client_kyc_documents table
  const { data: kycDocuments } = useQuery({
    queryKey: ['client_kyc_documents_dialog', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('client_kyc_documents')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!client?.id && open,
  });

  // Fetch bank details
  const { data: bankDetails } = useQuery({
    queryKey: ['client_bank_details_dialog', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('client_bank_details')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!client?.id && open,
  });

  // Fetch income details
  const { data: incomeDetails } = useQuery({
    queryKey: ['client_income_details_dialog', client?.id],
    queryFn: async () => {
      if (!client?.id) return null;
      const { data, error } = await supabase
        .from('client_income_details')
        .select('*')
        .eq('client_id', client.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!client?.id && open,
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

  // Group KYC documents by type
  const docsByType: Record<string, any[]> = {};
  if (kycDocuments && kycDocuments.length > 0) {
    for (const doc of kycDocuments) {
      if (!docsByType[doc.document_type]) docsByType[doc.document_type] = [];
      docsByType[doc.document_type].push(doc);
    }
  }

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

          {/* KYC Documents from new table */}
          {kycDocuments && kycDocuments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Uploaded KYC Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {['aadhaar', 'usdt_usage_proof', 'trade_history_screenshot', 'vkyc_video'].map(type => {
                  const docs = docsByType[type];
                  if (!docs || docs.length === 0) return (
                    <div key={type} className="flex items-center gap-2 text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm">{DOC_TYPE_LABELS[type]}</span>
                      <span className="text-xs">— Not uploaded</span>
                    </div>
                  );
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center gap-2">
                        {type === 'vkyc_video' ? <Video className="h-4 w-4 text-blue-600" /> : <FileText className="h-4 w-4 text-green-600" />}
                        <span className="text-sm font-medium">{DOC_TYPE_LABELS[type]}</span>
                        <Badge variant="outline" className="text-xs">{docs.length} file{docs.length > 1 ? 's' : ''}</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 ml-6">
                        {docs.map((doc: any) => (
                          <div key={doc.id} className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="text-sm truncate">{doc.file_name}</span>
                              {doc.file_size && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  ({(doc.file_size / 1024).toFixed(0)}KB)
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="ghost" onClick={() => window.open(doc.file_url, '_blank')}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" asChild>
                                <a href={doc.file_url} download={doc.file_name} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Bank Details */}
          {bankDetails && bankDetails.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Bank Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bankDetails.map((bank: any) => (
                    <div key={bank.id} className="p-3 border rounded-md space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {bank.bank_name} <span className="text-muted-foreground">••••{bank.last_four_digits}</span>
                        </span>
                        {bank.statement_url && (
                          <Button variant="outline" size="sm" onClick={() => window.open(bank.statement_url, '_blank')}>
                            <Download className="h-3 w-3 mr-1" />
                            Statement
                          </Button>
                        )}
                      </div>
                      {bank.statement_period_from && bank.statement_period_to && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Statement Period: {new Date(bank.statement_period_from).toLocaleDateString('en-IN')} — {new Date(bank.statement_period_to).toLocaleDateString('en-IN')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Source of Income Details */}
          {incomeDetails && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Source of Income
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {incomeDetails.primary_source_of_income && (
                    <div>
                      <p className="text-xs text-muted-foreground">Primary Source</p>
                      <p className="text-sm font-medium">{incomeDetails.primary_source_of_income}</p>
                    </div>
                  )}
                  {incomeDetails.occupation_business_type && (
                    <div>
                      <p className="text-xs text-muted-foreground">Occupation / Business</p>
                      <p className="text-sm font-medium">{incomeDetails.occupation_business_type}</p>
                    </div>
                  )}
                  {incomeDetails.monthly_income_range && (
                    <div>
                      <p className="text-xs text-muted-foreground">Monthly Income</p>
                      <p className="text-sm font-medium">₹{Number(incomeDetails.monthly_income_range).toLocaleString('en-IN')}</p>
                    </div>
                  )}
                  {incomeDetails.source_of_fund_url && (
                    <div>
                      <p className="text-xs text-muted-foreground">Source of Fund Document</p>
                      <a href={incomeDetails.source_of_fund_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline flex items-center gap-1">
                        View Document <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {!incomeDetails.primary_source_of_income && !incomeDetails.occupation_business_type && !incomeDetails.monthly_income_range && !incomeDetails.source_of_fund_url && (
                    <p className="text-sm text-muted-foreground col-span-2">No income details provided</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Latest KYC Submission (from kyc_approval_requests) */}
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
                    <p className="font-semibold">₹{latestKyc.order_amount?.toLocaleString('en-IN')}</p>
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
                <CardTitle className="text-lg">Onboarding Approval Record</CardTitle>
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
                  {latestOnboarding.proposed_monthly_limit && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Proposed Monthly Limit</label>
                      <p className="text-sm font-medium">₹{Number(latestOnboarding.proposed_monthly_limit).toLocaleString('en-IN')}</p>
                    </div>
                  )}
                  {latestOnboarding.risk_assessment && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Risk Assessment</label>
                      <Badge variant="outline">{latestOnboarding.risk_assessment}</Badge>
                    </div>
                  )}
                  {latestOnboarding.purpose_of_buying && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Purpose of Buying</label>
                      <p className="text-sm">{latestOnboarding.purpose_of_buying}</p>
                    </div>
                  )}
                  {latestOnboarding.address && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Address</label>
                      <p className="text-sm">{latestOnboarding.address}</p>
                    </div>
                  )}
                </div>
                {latestOnboarding.compliance_notes && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Compliance Notes</label>
                    <p className="text-sm bg-muted/50 p-3 rounded-md">{latestOnboarding.compliance_notes}</p>
                  </div>
                )}
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
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
