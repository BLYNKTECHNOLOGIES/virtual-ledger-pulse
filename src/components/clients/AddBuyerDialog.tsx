import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Step1BasicInfo } from "./steps/Step1BasicInfo";
import { Step2KYCDocuments } from "./steps/Step2KYCDocuments";
import { Step3BankAccounts } from "./steps/Step3BankAccounts";
import { Step4OperatorNotes } from "./steps/Step4OperatorNotes";

interface AddBuyerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddBuyerDialog({ open, onOpenChange }: AddBuyerDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generate client ID
  const generateClientId = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CL${timestamp}${random}`;
  };

  const [formData, setFormData] = useState({
    name: '',
    client_id: generateClientId(),
    email: '',
    phone: '',
    client_type: '',
    risk_appetite: 'MEDIUM',
    assigned_rm: '',
    buying_purpose: '',
    first_order_value: '',
    monthly_limit: '',
    current_month_used: '0',
    date_of_onboarding: new Date(),
    // KYC Documents
    pan_card_file: null as File | null,
    aadhar_front_file: null as File | null,
    aadhar_back_file: null as File | null,
    other_docs_files: [] as File[],
    // Bank Accounts
    linked_bank_accounts: [] as any[],
    // Operator Notes
    operator_notes: '',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      client_id: generateClientId(),
      email: '',
      phone: '',
      client_type: '',
      risk_appetite: 'MEDIUM',
      assigned_rm: '',
      buying_purpose: '',
      first_order_value: '',
      monthly_limit: '',
      current_month_used: '0',
      date_of_onboarding: new Date(),
      // KYC Documents
      pan_card_file: null,
      aadhar_front_file: null,
      aadhar_back_file: null,
      other_docs_files: [],
      // Bank Accounts
      linked_bank_accounts: [],
      // Operator Notes
      operator_notes: '',
    });
    setCurrentStep(1);
  };

  const uploadFile = async (file: File, bucket: string, path: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file);
    
    if (error) throw error;
    return data.path;
  };

  const validateStep = (step: number) => {
    switch (step) {
      case 1:
        if (!formData.name.trim()) {
          toast({
            title: "Validation Error",
            description: "Client name is required",
            variant: "destructive",
          });
          return false;
        }
        if (!formData.client_type) {
          toast({
            title: "Validation Error",
            description: "Client type is required",
            variant: "destructive",
          });
          return false;
        }
        return true;

      case 2:
        if (!formData.pan_card_file) {
          toast({
            title: "Validation Error",
            description: "PAN Card is required",
            variant: "destructive",
          });
          return false;
        }
        if (!formData.aadhar_front_file) {
          toast({
            title: "Validation Error",
            description: "Aadhar Card (Front) is required",
            variant: "destructive",
          });
          return false;
        }
        if (!formData.aadhar_back_file) {
          toast({
            title: "Validation Error",
            description: "Aadhar Card (Back) is required",
            variant: "destructive",
          });
          return false;
        }
        return true;

      case 3:
        // Bank accounts are optional, so always valid
        return true;

      case 4:
        // Operator notes are optional, so always valid
        return true;

      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    setIsSubmitting(true);

    try {
      // Upload KYC documents
      let panCardUrl = null;
      let aadharFrontUrl = null;
      let aadharBackUrl = null;
      let otherDocsUrls: string[] = [];

      if (formData.pan_card_file) {
        const panPath = `clients/${formData.client_id}/pan_card_${Date.now()}.${formData.pan_card_file.name.split('.').pop()}`;
        panCardUrl = await uploadFile(formData.pan_card_file, 'kyc-documents', panPath);
      }

      if (formData.aadhar_front_file) {
        const aadharFrontPath = `clients/${formData.client_id}/aadhar_front_${Date.now()}.${formData.aadhar_front_file.name.split('.').pop()}`;
        aadharFrontUrl = await uploadFile(formData.aadhar_front_file, 'kyc-documents', aadharFrontPath);
      }

      if (formData.aadhar_back_file) {
        const aadharBackPath = `clients/${formData.client_id}/aadhar_back_${Date.now()}.${formData.aadhar_back_file.name.split('.').pop()}`;
        aadharBackUrl = await uploadFile(formData.aadhar_back_file, 'kyc-documents', aadharBackPath);
      }

      // Upload other documents
      for (let i = 0; i < formData.other_docs_files.length; i++) {
        const file = formData.other_docs_files[i];
        const otherDocPath = `clients/${formData.client_id}/other_doc_${i}_${Date.now()}.${file.name.split('.').pop()}`;
        const url = await uploadFile(file, 'kyc-documents', otherDocPath);
        otherDocsUrls.push(url);
      }

      const { error } = await supabase
        .from('clients')
        .insert([{
          name: formData.name.trim(),
          client_id: formData.client_id.trim(),
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          client_type: formData.client_type,
          risk_appetite: formData.risk_appetite,
          kyc_status: 'VERIFIED', // Auto-set to VERIFIED since KYC is already done
          assigned_operator: formData.assigned_rm.trim() || null,
          buying_purpose: formData.buying_purpose.trim() || null,
          first_order_value: formData.first_order_value ? Number(formData.first_order_value) : null,
          monthly_limit: formData.monthly_limit ? Number(formData.monthly_limit) : null,
          current_month_used: Number(formData.current_month_used) || 0,
          date_of_onboarding: format(formData.date_of_onboarding, 'yyyy-MM-dd'),
          pan_card_url: panCardUrl,
          aadhar_front_url: aadharFrontUrl,
          aadhar_back_url: aadharBackUrl,
          other_documents_urls: otherDocsUrls.length > 0 ? otherDocsUrls : null,
          linked_bank_accounts: formData.linked_bank_accounts,
          operator_notes: formData.operator_notes.trim() || null,
        }]);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      toast({
        title: "Success",
        description: "Buyer created successfully!",
      });

      // Refresh the clients list
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error creating buyer:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create buyer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <Step1BasicInfo formData={formData} setFormData={setFormData} />;
      case 2:
        return <Step2KYCDocuments formData={formData} setFormData={setFormData} />;
      case 3:
        return <Step3BankAccounts formData={formData} setFormData={setFormData} />;
      case 4:
        return <Step4OperatorNotes formData={formData} setFormData={setFormData} />;
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return "Basic Information";
      case 2:
        return "KYC Documents";
      case 3:
        return "Bank Accounts";
      case 4:
        return "Review & Notes";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Add New Buyer</span>
            <span className="text-sm font-normal text-gray-500">
              Step {currentStep} of 4 - {getStepTitle()}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">
          {renderStepContent()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-6 border-t">
          <Button 
            type="button" 
            variant="outline" 
            onClick={currentStep === 1 ? handleClose : prevStep}
            disabled={isSubmitting}
          >
            {currentStep === 1 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </>
            )}
          </Button>

          {currentStep < 4 ? (
            <Button onClick={nextStep} disabled={isSubmitting}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Creating Buyer..." : "Create Buyer"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}