import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, CheckCircle, Clock, FileText, ExternalLink } from "lucide-react";
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
      
      // First, check if this is a bank_case that needs to be converted to an account_investigation
      const { data: existingInvestigation, error: checkError } = await supabase
        .from('account_investigations')
        .select('id')
        .eq('bank_account_id', investigation.bank_account_id)
        .eq('reason', investigation.reason || investigation.description || investigation.error_message || 'Investigation')
        .maybeSingle();
      
      let investigationId = investigation.id;
      
      // If no account_investigation exists, create one
      if (!existingInvestigation) {
        const { data: newInvestigation, error: createError } = await supabase
          .from('account_investigations')
          .insert({
            bank_account_id: investigation.bank_account_id,
            investigation_type: investigation.case_type?.toLowerCase().replace('_', '_') || 'general',
            reason: investigation.reason || investigation.description || investigation.error_message || 'Investigation',
            priority: investigation.priority || 'MEDIUM',
            status: 'ACTIVE'
          })
          .select()
          .single();
        
        if (createError) {
          console.error('Failed to create account investigation:', createError);
          return [];
        }
        
        investigationId = newInvestigation.id;
      } else {
        investigationId = existingInvestigation.id;
      }
      
      // Now fetch the steps for the account_investigation
      const { data, error } = await supabase
        .from('investigation_steps')
        .select('*')
        .eq('investigation_id', investigationId)
        .order('step_number');
      
      if (error) throw error;
      
      // If no steps exist, create default steps
      if (data.length === 0) {
        const stepsToInsert = defaultSteps.map(step => ({
          ...step,
          investigation_id: investigationId
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

  // Fetch investigation updates using the correct investigation ID
  const { data: updates } = useQuery({
    queryKey: ['investigation_updates', investigation?.id],
    queryFn: async () => {
      if (!investigation?.id) return [];
      
      // Use the same investigation ID that was used for steps
      const investigationIdToUse = steps && steps.length > 0 ? steps[0].investigation_id : investigation.id;
      
      const { data, error } = await supabase
        .from('investigation_updates')
        .select('*')
        .eq('investigation_id', investigationIdToUse)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!investigation?.id && open && !!steps?.length,
  });

  // Complete step mutation
  const completeStepMutation = useMutation({
    mutationFn: async ({ stepId, notes, reportUrl }: { stepId: string; notes?: string; reportUrl?: string }) => {
      const { error } = await supabase
        .from('investigation_steps')
        .update({
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          completed_by: 'Current User',
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

  // Add update mutation - Fixed to use correct investigation ID
  const addUpdateMutation = useMutation({
    mutationFn: async ({ updateText, files }: { updateText: string; files: File[] }) => {
      let attachmentUrls: string[] = [];
      
      // Get the correct investigation ID from steps if available
      const investigationIdToUse = steps && steps.length > 0 ? steps[0].investigation_id : investigation.id;
      
      // Upload files if any
      if (files.length > 0) {
        for (const file of files) {
          const fileName = `investigation-${investigationIdToUse}-${Date.now()}-${file.name}`;
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
          investigation_id: investigationIdToUse,
          update_text: updateText,
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
          created_by: 'Current User'
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add update. Please try again.",
        variant: "destructive",
      });
    },
  });

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

  const handleResolveInvestigation = () => {
    onResolve("Investigation resolved successfully");
    onOpenChange(false);
  };

  // Helper function to check if a step can be completed (sequential constraint)
  const canCompleteStep = (step: any) => {
    if (!steps) return false;
    if (step.status === 'COMPLETED') return false;
    
    // Check if all previous steps are completed
    const previousSteps = steps.filter(s => s.step_number < step.step_number);
    return previousSteps.every(s => s.status === 'COMPLETED');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-medium text-gray-900">
            Investigation Details - {investigation?.bank_accounts?.bank_name || 'UNION BANK OF INDIA'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Reason Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reason</h3>
            <p className="text-gray-700 text-sm leading-relaxed bg-white p-3 rounded border">
              {investigation?.reason || investigation?.error_message || investigation?.description || investigation?.title || 'Investigation reason not specified'}
            </p>
          </div>

          {/* Investigation Steps */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Investigation Steps</h3>
            
            {steps && steps.length > 0 ? (
              <div className="space-y-3">
                {steps.map((step) => {
                  const stepCanBeCompleted = canCompleteStep(step);
                  const isStepCompleted = step.status === 'COMPLETED';
                  
                  return (
                    <div key={step.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center justify-center">
                          {isStepCompleted ? (
                            <CheckCircle className="w-6 h-6 text-green-600" />
                          ) : (
                            <Clock className="w-6 h-6 text-orange-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={isStepCompleted ? 'default' : 'secondary'} className="text-xs font-medium">
                              {step.status}
                            </Badge>
                            <span className="font-medium text-gray-900">{step.step_number}. {step.step_title}</span>
                          </div>
                          <p className="text-sm text-gray-600">{step.step_description}</p>
                          {isStepCompleted && step.completed_at && (
                            <p className="text-xs text-green-600 mt-1">
                              Completed on {new Date(step.completed_at).toLocaleDateString()} by {step.completed_by}
                            </p>
                          )}
                          {!isStepCompleted && !stepCanBeCompleted && (
                            <p className="text-xs text-orange-600 mt-1">
                              Complete previous steps first
                            </p>
                          )}
                        </div>
                      </div>
                      {!isStepCompleted && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!stepCanBeCompleted}
                          onClick={() => {
                            if (stepCanBeCompleted) {
                              setSelectedStep(step);
                              setShowStepCompletionDialog(true);
                            } else {
                              toast({
                                title: "Cannot Complete Step",
                                description: "Please complete previous steps in order.",
                                variant: "destructive",
                              });
                            }
                          }}
                          className={`ml-4 ${!stepCanBeCompleted ? 'opacity-50 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}`}
                        >
                          Complete
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                Loading investigation steps...
              </div>
            )}
          </div>

          {/* Add Investigation Update - Compact Version */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-base font-medium text-gray-900 mb-3">Add Investigation Update</h3>
            
            <div className="space-y-3">
              <Textarea
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                placeholder="Enter investigation update..."
                rows={3}
                className="w-full resize-none text-sm"
              />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('investigation-file-input')?.click()}
                      className="text-xs"
                    >
                      Choose Files
                    </Button>
                    <Input
                      id="investigation-file-input"
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    />
                  </div>
                  <span className="text-xs text-gray-600">
                    {selectedFiles.length > 0 ? (
                      <span className="text-blue-600">{selectedFiles.length} file(s) selected</span>
                    ) : (
                      'No files selected'
                    )}
                  </span>
                </div>
                
                <Button 
                  onClick={handleAddUpdate} 
                  disabled={!newUpdate.trim() && selectedFiles.length === 0}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Update
                </Button>
              </div>
              
              {/* Show selected files in compact format */}
              {selectedFiles.length > 0 && (
                <div className="space-y-1">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-blue-50 px-2 py-1 rounded text-xs">
                      <span className="text-blue-800 truncate">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newFiles = selectedFiles.filter((_, i) => i !== index);
                          setSelectedFiles(newFiles);
                        }}
                        className="h-5 w-5 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Updates History */}
          {updates && updates.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Recent Updates</h3>
              <div className="space-y-3 max-h-40 overflow-y-auto">
                {updates.slice(0, 3).map((update) => (
                  <div key={update.id} className="p-3 bg-gray-50 rounded-lg">
                    {update.update_text && (
                      <p className="text-sm text-gray-800 mb-2">{update.update_text}</p>
                    )}
                    
                    {/* Display file attachments */}
                    {update.attachment_urls && update.attachment_urls.length > 0 && (
                      <div className="space-y-1">
                        {update.attachment_urls.map((url: string, index: number) => {
                          const fileName = url.split('/').pop()?.split('-').slice(3).join('-') || 'Document';
                          return (
                            <div key={index} className="flex items-center gap-2 p-2 bg-blue-50 rounded border">
                              <FileText className="h-4 w-4 text-blue-600" />
                              <span className="text-sm text-blue-800 flex-1">File uploaded: {fileName}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(url, '_blank')}
                                className="h-6 px-2 text-blue-600 hover:text-blue-800"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                View File
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Show message if no text and no files */}
                    {!update.update_text && (!update.attachment_urls || update.attachment_urls.length === 0) && (
                      <p className="text-sm text-gray-500 italic">No update text provided</p>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(update.created_at).toLocaleDateString()} by {update.created_by}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolve Investigation Button */}
          <div className="pt-4">
            <Button 
              onClick={handleResolveInvestigation}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-2 rounded-lg font-medium"
            >
              Resolve Investigation
            </Button>
          </div>
        </div>

        {/* Step Completion Dialog */}
        {selectedStep && (
          <StepCompletionDialog
            open={showStepCompletionDialog}
            onOpenChange={setShowStepCompletionDialog}
            step={selectedStep}
            onComplete={(stepId, notes, reportUrl) => {
              completeStepMutation.mutate({ stepId, notes, reportUrl });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
