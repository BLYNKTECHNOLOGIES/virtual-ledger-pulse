import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Clock, Play, Plus, FileText, Upload, Download } from "lucide-react";
import { StepCompletionDialog } from "./StepCompletionDialog";

interface InvestigationDetailsDialogProps {
  investigation: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (resolutionNotes: string) => void;
}

export function InvestigationDetailsDialog({
  investigation,
  open,
  onOpenChange,
  onResolve
}: InvestigationDetailsDialogProps) {
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [newUpdate, setNewUpdate] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [selectedStep, setSelectedStep] = useState<any>(null);
  const [showStepCompletionDialog, setShowStepCompletionDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Default investigation steps
  const defaultSteps = [
    { step_number: 1, step_title: "Initial Assessment", step_description: "Analyze account status and determine root cause of inactiveness" },
    { step_number: 2, step_title: "Bank Communication", step_description: "Contact bank to understand the specific issues and requirements" },
    { step_number: 3, step_title: "Documentation Review", step_description: "Review all account documents and compliance requirements" },
    { step_number: 4, step_title: "Corrective Actions", step_description: "Implement necessary changes based on findings" },
    { step_number: 5, step_title: "Verification", step_description: "Verify that all issues have been resolved and account is functional" }
  ];

  // Fetch investigation steps
  const { data: steps, refetch: refetchSteps } = useQuery({
    queryKey: ['investigation_steps', investigation?.id],
    queryFn: async () => {
      if (!investigation?.id) return [];
      
      const { data, error } = await supabase
        .from('investigation_steps')
        .select('*')
        .eq('investigation_id', investigation.id)
        .order('step_number');
      
      if (error) throw error;
      
      // If no steps exist, create default steps
      if (data.length === 0) {
        const stepsToInsert = defaultSteps.map(step => ({
          ...step,
          investigation_id: investigation.id
        }));
        
        const { data: newSteps, error: insertError } = await supabase
          .from('investigation_steps')
          .insert(stepsToInsert)
          .select();
        
        if (insertError) throw insertError;
        return newSteps;
      }
      
      return data;
    },
    enabled: !!investigation?.id && open,
  });

  // Fetch investigation updates
  const { data: updates } = useQuery({
    queryKey: ['investigation_updates', investigation?.id],
    queryFn: async () => {
      if (!investigation?.id) return [];
      
      const { data, error } = await supabase
        .from('investigation_updates')
        .select('*')
        .eq('investigation_id', investigation.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!investigation?.id && open,
  });

  // Complete step mutation
  const completeStepMutation = useMutation({
    mutationFn: async ({ stepId, notes, reportUrl }: { stepId: string; notes?: string; reportUrl?: string }) => {
      const { error } = await supabase
        .from('investigation_steps')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          completed_by: 'Current User', // In real app, get from auth
          notes,
          completion_report_url: reportUrl
        })
        .eq('id', stepId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      refetchSteps();
      toast({
        title: "Step Completed",
        description: "Investigation step has been marked as completed.",
      });
    },
  });

  // Add update mutation
  const addUpdateMutation = useMutation({
    mutationFn: async ({ updateText, files }: { updateText: string; files: File[] }) => {
      let attachmentUrls: string[] = [];
      
      // Upload files if any
      if (files.length > 0) {
        for (const file of files) {
          const fileName = `investigation-${investigation.id}-${Date.now()}-${file.name}`;
          const { data, error } = await supabase.storage
            .from('investigation-documents')
            .upload(fileName, file);
          
          if (error) throw error;
          
          // Get public URL
          const { data: urlData } = supabase.storage
            .from('investigation-documents')
            .getPublicUrl(fileName);
          
          attachmentUrls.push(urlData.publicUrl);
        }
      }
      
      const { error } = await supabase
        .from('investigation_updates')
        .insert({
          investigation_id: investigation.id,
          update_text: updateText,
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
          created_by: 'Current User' // In real app, get from auth
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investigation_updates', investigation.id] });
      setNewUpdate("");
      setSelectedFiles([]);
      toast({
        title: "Update Added",
        description: "Investigation update has been added successfully.",
      });
    },
  });

  // Check if a step can be completed (all previous steps must be completed)
  const canCompleteStep = (currentStep: any, allSteps: any[]) => {
    if (!allSteps) return false;
    
    // Find all steps with step_number less than current step
    const previousSteps = allSteps.filter(step => step.step_number < currentStep.step_number);
    
    // Check if all previous steps are completed
    return previousSteps.every(step => step.status === 'COMPLETED');
  };

  const handleCompleteStep = (step: any) => {
    if (!canCompleteStep(step, steps)) {
      toast({
        title: "Sequential Completion Required",
        description: "Please complete all previous steps before completing this step.",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedStep(step);
    setShowStepCompletionDialog(true);
  };

  const handleStepCompletion = (stepId: string, notes: string, reportUrl?: string) => {
    completeStepMutation.mutate({ stepId, notes, reportUrl });
  };

  const handleAddUpdate = () => {
    if (newUpdate.trim() || selectedFiles.length > 0) {
      addUpdateMutation.mutate({ updateText: newUpdate, files: selectedFiles });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(files => files.filter((_, i) => i !== index));
  };

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'default';
      case 'IN_PROGRESS': return 'secondary';
      default: return 'outline';
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle className="h-4 w-4" />;
      case 'IN_PROGRESS': return <Play className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Investigation Details - {investigation?.bank_accounts?.bank_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Reason Section */}
          <Card className="bg-slate-50/50 border-slate-200">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Type</h3>
                  <p className="text-slate-700">{investigation?.case_type?.replace('_', ' ') || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Reason</h3>
                  <p className="text-slate-700 bg-white p-3 rounded-lg border border-slate-200">
                    {investigation?.reason || investigation?.description || investigation?.bank_reason || 'Investigation reason not specified'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Investigation Steps */}
          <Card className="bg-slate-50/50 border-slate-200">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-800">Investigation Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {steps?.map((step) => (
                  <div key={step.id} className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-shrink-0">
                        <Badge 
                          variant={step.status === 'COMPLETED' ? 'default' : 'outline'}
                          className={`flex items-center gap-1 min-w-[80px] justify-center ${
                            step.status === 'COMPLETED' 
                              ? 'bg-green-100 text-green-800 border-green-200' 
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                          }`}
                        >
                          {getStepStatusIcon(step.status)}
                          {step.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING'}
                        </Badge>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-800 text-lg mb-1">
                          {step.step_number}. {step.step_title}
                        </h4>
                        <p className="text-slate-600">{step.step_description}</p>
                        {step.notes && (
                          <p className="text-sm text-blue-600 italic mt-2">Notes: {step.notes}</p>
                        )}
                        {step.completion_report_url && (
                          <div className="flex items-center gap-2 mt-2">
                            <FileText className="h-4 w-4 text-green-600" />
                            <a 
                              href={step.completion_report_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-green-600 hover:underline"
                            >
                              View Completion Report
                            </a>
                          </div>
                        )}
                        {step.completed_at && (
                          <p className="text-xs text-slate-500 mt-1">
                            Completed on {new Date(step.completed_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    {step.status !== 'COMPLETED' && (
                      <Button
                        variant="outline"
                        className="ml-4 border-slate-300 text-slate-700 hover:bg-slate-50"
                        onClick={() => handleCompleteStep(step)}
                        disabled={!canCompleteStep(step, steps)}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Complete
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Add Update */}
          <Card className="bg-blue-50/50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-blue-800">Add Investigation Update</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Textarea
                  id="update-text"
                  value={newUpdate}
                  onChange={(e) => setNewUpdate(e.target.value)}
                  placeholder="Enter investigation update..."
                  rows={4}
                  className="bg-white border-blue-200 focus:border-blue-400"
                />
              </div>
              
              <div>
                <Label htmlFor="update-files">Attach Documents</Label>
                <Input
                  id="update-files"
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="mt-1"
                />
                {selectedFiles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <Label className="text-sm text-muted-foreground">Selected Files:</Label>
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFile(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <Button 
                onClick={handleAddUpdate} 
                disabled={!newUpdate.trim() && selectedFiles.length === 0}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Add Update {selectedFiles.length > 0 && `with ${selectedFiles.length} file(s)`}
              </Button>
            </CardContent>
          </Card>

          {/* Updates History */}
          {updates && updates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Investigation Updates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {updates.map((update) => (
                    <div key={update.id} className="border-l-4 border-primary pl-4 py-3">
                      <p className="text-sm text-foreground">{update.update_text}</p>
                      
                      {/* Attachments */}
                      {update.attachment_urls && update.attachment_urls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <Label className="text-xs text-muted-foreground">Attachments:</Label>
                          <div className="flex flex-wrap gap-2">
                            {update.attachment_urls.map((url: string, index: number) => (
                              <a
                                key={index}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2 py-1 bg-accent text-accent-foreground rounded text-xs hover:bg-accent/80 transition-colors"
                              >
                                <Download className="h-3 w-3" />
                                Document {index + 1}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(update.created_at).toLocaleString()} by {update.created_by}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resolution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Investigation Resolution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!showResolutionForm ? (
                <Button onClick={() => setShowResolutionForm(true)}>
                  Resolve Investigation
                </Button>
              ) : (
                <div className="space-y-3">
                  <Label>Resolution Notes</Label>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Enter resolution details..."
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => onResolve(resolutionNotes)}
                      disabled={!resolutionNotes.trim()}
                    >
                      Confirm Resolution
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => setShowResolutionForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Step Completion Dialog */}
        {selectedStep && (
          <StepCompletionDialog
            open={showStepCompletionDialog}
            onOpenChange={setShowStepCompletionDialog}
            step={selectedStep}
            onComplete={handleStepCompletion}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}