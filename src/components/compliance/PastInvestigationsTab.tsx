import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, CheckCircle, Archive, Clock, FileText, Download, Calendar, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { generateCompleteInvestigationPDF } from "@/utils/investigationPdfGenerator";
import { toast } from "sonner";
import { format } from "date-fns";

export function PastInvestigationsTab() {
  const [selectedInvestigation, setSelectedInvestigation] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  // Fetch resolved investigations
  const { data: investigations } = useQuery({
    queryKey: ['past_investigations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_investigations')
        .select(`
          *,
          bank_accounts (
            bank_name,
            account_name,
            account_number
          )
        `)
        .eq('status', 'RESOLVED')
        .order('resolved_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch investigation steps for selected investigation
  const { data: investigationSteps } = useQuery({
    queryKey: ['investigation_steps', selectedInvestigation?.id],
    queryFn: async () => {
      if (!selectedInvestigation?.id) return [];
      
      const { data, error } = await supabase
        .from('investigation_steps')
        .select('*')
        .eq('investigation_id', selectedInvestigation.id)
        .order('step_number');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedInvestigation?.id,
  });

  // Fetch investigation updates for selected investigation
  const { data: investigationUpdates } = useQuery({
    queryKey: ['investigation_updates', selectedInvestigation?.id],
    queryFn: async () => {
      if (!selectedInvestigation?.id) return [];
      
      const { data, error } = await supabase
        .from('investigation_updates')
        .select('*')
        .eq('investigation_id', selectedInvestigation.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedInvestigation?.id,
  });

  const handleViewDocument = async (fileUrl: string) => {
    try {
      if (fileUrl.startsWith('http')) {
        window.open(fileUrl, '_blank');
        return;
      }

      const { data, error } = await supabase.storage
        .from('investigation-documents')
        .createSignedUrl(fileUrl, 3600);

      if (error) throw error;
      
      if (data.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing document:', error);
    }
  };

  const handleDownloadDocument = async (fileUrl: string) => {
    try {
      if (fileUrl.startsWith('http')) {
        const fileName = fileUrl.split('/').pop() || 'document';
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      const { data, error } = await supabase.storage
        .from('investigation-documents')
        .download(fileUrl);

      if (error) throw error;

      const fileName = fileUrl.split('/').pop() || 'document';
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'IN_PROGRESS': return <Clock className="h-4 w-4 text-warning" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-success/10 text-success border-success/20';
      case 'IN_PROGRESS': return 'bg-warning/10 text-warning border-warning/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const handleViewDetails = (investigation: any) => {
    setSelectedInvestigation(investigation);
    setShowDetailsDialog(true);
  };

  const handleGeneratePDF = async () => {
    if (!selectedInvestigation) return;
    
    try {
      toast.loading("Generating PDF report...");
      const pdf = await generateCompleteInvestigationPDF(selectedInvestigation);
      
      // Download the PDF
      const fileName = `Investigation_Report_${selectedInvestigation.id.slice(0, 8)}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      pdf.save(fileName);
      
      toast.success("PDF report generated successfully!");
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error("Failed to generate PDF report");
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'secondary';
      case 'LOW': return 'outline';
      default: return 'secondary';
    }
  };

  const getDurationInDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-green-500" />
            Past Account Investigations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {investigations?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Archive className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">No Past Investigations</h3>
              <p>No investigations have been completed yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {investigations?.map((investigation) => (
                <Card key={investigation.id} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium text-gray-900">
                            {investigation.bank_accounts?.bank_name}
                          </h4>
                          <Badge variant="default" className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            RESOLVED
                          </Badge>
                          <Badge variant={getPriorityColor(investigation.priority)}>
                            {investigation.priority}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-2">
                          {investigation.bank_accounts?.account_name}
                        </p>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-500">Type:</span>
                            <p className="text-gray-900">{investigation.investigation_type}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Duration:</span>
                            <p className="text-gray-900">
                              {getDurationInDays(investigation.created_at, investigation.resolved_at)} days
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Started:</span>
                            <p className="text-gray-900">
                              {new Date(investigation.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Resolved:</span>
                            <p className="text-gray-900">
                              {new Date(investigation.resolved_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-3">
                          <span className="font-medium text-gray-500 text-sm">Reason:</span>
                          <p className="text-sm text-gray-900 line-clamp-2">{investigation.reason}</p>
                        </div>
                        
                        {investigation.resolution_notes && (
                          <div className="mt-2">
                            <span className="font-medium text-gray-500 text-sm">Resolution:</span>
                            <p className="text-sm text-green-700 line-clamp-2">{investigation.resolution_notes}</p>
                          </div>
                        )}
                      </div>
                      
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleViewDetails(investigation)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Investigation Details Dialog */}
      {selectedInvestigation && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>
                  Resolved Investigation - {selectedInvestigation.bank_accounts?.bank_name}
                </DialogTitle>
                <Button
                  onClick={handleGeneratePDF}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Generate PDF Report
                </Button>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              {/* Investigation Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-success" />
                    Investigation Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Account:</span>
                    <p className="text-sm">{selectedInvestigation.bank_accounts?.account_name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Type:</span>
                    <p className="text-sm">{selectedInvestigation.investigation_type}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Priority:</span>
                    <Badge variant={getPriorityColor(selectedInvestigation.priority)}>
                      {selectedInvestigation.priority}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Duration:</span>
                    <p className="text-sm">
                      {getDurationInDays(selectedInvestigation.created_at, selectedInvestigation.resolved_at)} days
                    </p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Started:</span>
                    <p className="text-sm">{new Date(selectedInvestigation.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Resolved:</span>
                    <p className="text-sm">{new Date(selectedInvestigation.resolved_at).toLocaleDateString()}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm font-medium text-muted-foreground">Initial Reason:</span>
                    <p className="text-sm mt-1">{selectedInvestigation.reason}</p>
                  </div>
                  {selectedInvestigation.resolution_notes && (
                    <div className="col-span-2">
                      <span className="text-sm font-medium text-muted-foreground">Resolution Notes:</span>
                      <div className="mt-1 p-3 bg-success/10 border border-success/20 rounded-md">
                        <p className="text-sm text-success/90">{selectedInvestigation.resolution_notes}</p>
                      </div>
                    </div>
                  )}
                  {selectedInvestigation.notes && (
                    <div className="col-span-2">
                      <span className="text-sm font-medium text-muted-foreground">Additional Notes:</span>
                      <p className="text-sm mt-1">{selectedInvestigation.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Investigation Process Steps */}
              {investigationSteps && investigationSteps.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      Investigation Process Steps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {investigationSteps.map((step) => (
                        <div key={step.id} className="flex items-start gap-4 p-4 border rounded-lg">
                          <div className="flex-shrink-0 mt-1">
                            <Badge 
                              variant="secondary"
                              className={getStepStatusColor(step.status)}
                            >
                              {getStepStatusIcon(step.status)}
                              {step.status || 'PENDING'}
                            </Badge>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-foreground">
                              {step.step_number}. {step.step_title}
                            </h4>
                            <p className="text-sm text-muted-foreground mb-2">{step.step_description}</p>
                            {step.notes && (
                              <p className="text-sm text-primary/80 italic">Notes: {step.notes}</p>
                            )}
                            {step.completion_report_url && (
                              <div className="flex items-center gap-2 mt-2">
                                <FileText className="h-4 w-4 text-success" />
                                <Button
                                  variant="link"
                                  className="h-auto p-0 text-sm text-success hover:text-success/80"
                                  onClick={() => handleViewDocument(step.completion_report_url)}
                                >
                                  View Completion Report
                                </Button>
                                <Button
                                  variant="link"
                                  className="h-auto p-0 text-sm ml-2"
                                  onClick={() => handleDownloadDocument(step.completion_report_url)}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                              </div>
                            )}
                            {step.completed_at && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Completed on {format(new Date(step.completed_at), 'PPpp')}
                                {step.completed_by && ` by ${step.completed_by}`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Investigation Timeline & Updates */}
              {investigationUpdates && investigationUpdates.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-info" />
                      Investigation Timeline & Documentation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {investigationUpdates.map((update, index) => (
                        <div key={update.id} className="border-l-2 border-primary/20 pl-4 pb-4 relative">
                          <div className="absolute -left-2 top-0 w-4 h-4 bg-primary rounded-full"></div>
                          <div className="bg-muted/30 p-4 rounded-md">
                            <div className="flex justify-between items-start mb-2">
                              <div className="text-sm text-muted-foreground">
                                {format(new Date(update.created_at), 'PPpp')}
                                {update.created_by && ` - ${update.created_by}`}
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {update.update_type || 'UPDATE'}
                              </Badge>
                            </div>
                            <div className="text-foreground mb-3">{update.update_text}</div>
                            
                            {/* Display attachments if any */}
                            {update.attachment_urls && update.attachment_urls.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <div className="text-sm font-medium text-muted-foreground">Documentation:</div>
                                <div className="space-y-1">
                                  {update.attachment_urls.map((url: string, urlIndex: number) => {
                                    const fileName = url.split('/').pop() || `Document ${urlIndex + 1}`;
                                    const isPdf = fileName.toLowerCase().endsWith('.pdf');
                                    
                                    return (
                                      <div key={urlIndex} className="flex items-center gap-2 p-2 bg-card rounded border">
                                        <FileText className="h-4 w-4 text-primary" />
                                        <span className="text-sm flex-1 truncate">{fileName}</span>
                                        <div className="flex gap-1">
                                          {isPdf && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 px-2"
                                              onClick={() => handleViewDocument(url)}
                                            >
                                              <Eye className="h-3 w-3 mr-1" />
                                              View
                                            </Button>
                                          )}
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2"
                                            onClick={() => handleDownloadDocument(url)}
                                          >
                                            <Download className="h-3 w-3 mr-1" />
                                            Download
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Account Inactiveness Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Account Inactiveness Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Account Number:</span>
                      <p className="text-sm">{selectedInvestigation.bank_accounts?.account_number}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Bank:</span>
                      <p className="text-sm">{selectedInvestigation.bank_accounts?.bank_name}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Investigation Type:</span>
                      <p className="text-sm">{selectedInvestigation.investigation_type?.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Assigned To:</span>
                      <p className="text-sm">{selectedInvestigation.assigned_to || 'Not specified'}</p>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <span className="text-sm font-medium text-muted-foreground">Investigation Summary:</span>
                    <div className="mt-2 p-3 bg-warning/10 border border-warning/20 rounded-md">
                      <p className="text-sm">
                        This investigation was initiated on {format(new Date(selectedInvestigation.created_at), 'PP')} 
                        due to: {selectedInvestigation.reason}
                      </p>
                      {selectedInvestigation.resolution_notes && (
                        <p className="text-sm mt-2 font-medium">
                          Resolution: {selectedInvestigation.resolution_notes}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}