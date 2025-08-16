import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Clock, Play, Plus, FileText } from "lucide-react";
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
    mutationFn: async (updateText: string) => {
      const { error } = await supabase
        .from('investigation_updates')
        .insert({
          investigation_id: investigation.id,
          update_text: updateText,
          created_by: 'Current User' // In real app, get from auth
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investigation_updates', investigation.id] });
      setNewUpdate("");
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
    if (newUpdate.trim()) {
      addUpdateMutation.mutate(newUpdate);
    }
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
          {/* Investigation Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Investigation Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-500">Account</Label>
                <p className="text-sm">{investigation?.bank_accounts?.account_name}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">Type</Label>
                <p className="text-sm">{investigation?.investigation_type}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">Priority</Label>
                <Badge variant="secondary">{investigation?.priority}</Badge>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-500">Started</Label>
                <p className="text-sm">{new Date(investigation?.created_at).toLocaleDateString()}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-sm font-medium text-gray-500">Reason</Label>
                <p className="text-sm">{investigation?.reason}</p>
              </div>
            </CardContent>
          </Card>

          {/* Investigation Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Investigation Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {steps?.map((step) => (
                  <div key={step.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className="flex-shrink-0 mt-1">
                      <Badge 
                        variant={getStepStatusColor(step.status)}
                        className="flex items-center gap-1"
                      >
                        {getStepStatusIcon(step.status)}
                        {step.status || 'PENDING'}
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900">
                        {step.step_number}. {step.step_title}
                      </h4>
                      <p className="text-sm text-gray-600 mb-2">{step.step_description}</p>
                      {step.notes && (
                        <p className="text-sm text-blue-600 italic">Notes: {step.notes}</p>
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
                        <p className="text-xs text-gray-500">
                          Completed on {new Date(step.completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {step.status !== 'COMPLETED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCompleteStep(step)}
                        disabled={!canCompleteStep(step, steps)}
                        className={!canCompleteStep(step, steps) ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Complete
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Add Update */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Investigation Update</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                placeholder="Enter investigation update..."
                rows={3}
              />
              <Button onClick={handleAddUpdate} disabled={!newUpdate.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Update
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
                    <div key={update.id} className="border-l-4 border-blue-500 pl-4 py-2">
                      <p className="text-sm text-gray-900">{update.update_text}</p>
                      <p className="text-xs text-gray-500 mt-1">
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