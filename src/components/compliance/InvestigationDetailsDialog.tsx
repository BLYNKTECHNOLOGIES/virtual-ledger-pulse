import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";
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
        .single();
      
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-medium text-gray-900">
            Investigation Details - {investigation?.bank_accounts?.bank_name || 'UNION BANK OF INDIA'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-8">
          {/* Reason */}
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-gray-900">Reason</h3>
            <p className="text-gray-600 text-base">
              {investigation?.reason || investigation?.error_message || investigation?.description || investigation?.title || 'Investigation reason not specified'}
            </p>
          </div>

          {/* Investigation Steps */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Investigation Steps</h3>
            
            {steps && steps.length > 0 ? (
              <div className="space-y-4">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg">
                    <div className="flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        step.status === 'COMPLETED' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {step.status === 'COMPLETED' ? '✓' : step.step_number}
                      </div>
                    </div>
                    
                    <div className="flex-grow">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                          step.status === 'COMPLETED' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {step.status === 'COMPLETED' ? '✓ COMPLETED' : 'PENDING'}
                        </div>
                      </div>
                      
                      <h4 className="font-medium text-gray-900 mb-1">
                        {step.step_number}. {step.step_title}
                      </h4>
                      <p className="text-sm text-gray-600 mb-3">
                        {step.step_description}
                      </p>
                      
                      {step.status === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedStep(step);
                            setShowStepCompletionDialog(true);
                          }}
                          className="text-sm"
                        >
                          Complete
                        </Button>
                      )}
                      
                      {step.status === 'COMPLETED' && step.completed_at && (
                        <p className="text-xs text-gray-500">
                          Completed on {new Date(step.completed_at).toLocaleDateString()} by {step.completed_by}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                Loading investigation steps...
              </div>
            )}
          </div>

          {/* Add Investigation Update */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Add Investigation Update</h3>
            
            <div className="space-y-4">
              <Textarea
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                placeholder="Enter investigation update..."
                rows={6}
                className="w-full resize-none border-2 border-blue-200 rounded-lg p-4 focus:border-blue-400 focus:ring-0 text-base"
              />
              
              <div className="flex items-center gap-4">
                <label className="cursor-pointer">
                  <span className="text-sm text-gray-600">Choose Files</span>
                  <Input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <span className="text-sm text-gray-500">
                  {selectedFiles.length > 0 ? `${selectedFiles.length} files selected` : 'no files selected'}
                </span>
              </div>
              
              <Button 
                onClick={handleAddUpdate} 
                disabled={!newUpdate.trim() && selectedFiles.length === 0}
                className="w-full h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-base font-medium flex items-center justify-center gap-2"
              >
                <Plus className="h-5 w-5" />
                Add Update
              </Button>
            </div>
          </div>

          {/* Updates History */}
          {updates && updates.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Recent Updates</h3>
              <div className="space-y-3 max-h-40 overflow-y-auto">
                {updates.slice(0, 3).map((update) => (
                  <div key={update.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-800">{update.update_text}</p>
                    <p className="text-xs text-gray-500 mt-1">
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
