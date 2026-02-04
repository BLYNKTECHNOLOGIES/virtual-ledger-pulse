import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Eye, AlertCircle, CreditCard, TrendingUp, Users, DollarSign, FileText, Calendar, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";

const CASE_TYPES = [
  { value: 'ACCOUNT_NOT_WORKING', label: 'Account Not Working', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  { value: 'WRONG_PAYMENT_INITIATED', label: 'Wrong Payment Initiated', color: 'bg-warning/10 text-warning border-warning/20' },
  { value: 'PAYMENT_NOT_CREDITED', label: 'Payment not Credited to Beneficiary', color: 'bg-info/10 text-info border-info/20' },
  { value: 'SETTLEMENT_NOT_RECEIVED', label: 'Settlement Not Received', color: 'bg-primary/10 text-primary border-primary/20' },
  { value: 'LIEN_RECEIVED', label: 'Lien Received', color: 'bg-accent/10 text-accent border-accent/20' },
  { value: 'BALANCE_DISCREPANCY', label: 'Balance Discrepancy', color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low', color: 'bg-muted text-muted-foreground' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-info/10 text-info' },
  { value: 'HIGH', label: 'High', color: 'bg-warning/10 text-warning' },
  { value: 'CRITICAL', label: 'Critical', color: 'bg-destructive/10 text-destructive' },
];

const STATUSES = [
  { value: 'OPEN', label: 'Open', color: 'bg-primary/10 text-primary' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-warning/10 text-warning' },
  { value: 'RESOLVED', label: 'Resolved', color: 'bg-success/10 text-success' },
  { value: 'CLOSED', label: 'Closed', color: 'bg-muted text-muted-foreground' },
];

interface CaseFormData {
  case_type: string;
  bank_account_id: string;
  title: string;
  description: string;
  contact_person: string;
  contact_details: string;
  // Specific fields for different case types
  error_message: string;
  screenshots: File[];
  wrong_beneficiary_account: string;
  wrong_beneficiary_name: string;
  transaction_datetime: string;
  amount_transferred: number;
  beneficiary_name: string;
  beneficiary_account_number: string;
  bank_ifsc_code: string;
  proof_of_debit: File[];
  settlement_reference_id: string;
  expected_settlement_amount: number;
  settlement_date: string;
  pending_since: string;
  supporting_proof: File[];
  amount_lien_marked: number;
  date_lien_marked: string;
  bank_reason: string;
  supporting_document: File[];
  remarks: string;
  date_of_discrepancy: string;
  reported_balance: number;
  expected_balance: number;
  difference_amount: number;
  statement_proof: File[];
}

export function CaseGenerator() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const hasManagePermission = hasPermission('bams_manage');

  const [formData, setFormData] = useState<CaseFormData>({
    case_type: '',
    bank_account_id: '',
    title: '',
    description: '',
    contact_person: '',
    contact_details: '',
    // Initialize specific fields
    error_message: '',
    screenshots: [],
    wrong_beneficiary_account: '',
    wrong_beneficiary_name: '',
    transaction_datetime: '',
    amount_transferred: 0,
    beneficiary_name: '',
    beneficiary_account_number: '',
    bank_ifsc_code: '',
    proof_of_debit: [],
    settlement_reference_id: '',
    expected_settlement_amount: 0,
    settlement_date: '',
    pending_since: '',
    supporting_proof: [],
    amount_lien_marked: 0,
    date_lien_marked: '',
    bank_reason: '',
    supporting_document: [],
    remarks: '',
    date_of_discrepancy: '',
    reported_balance: 0,
    expected_balance: 0,
    difference_amount: 0,
    statement_proof: [],
  });

  // Fetch bank accounts for dropdown (excluding dormant)
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_name, account_number')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null) // Exclude dormant accounts
        .order('bank_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch all cases
  const { data: cases } = useQuery({
    queryKey: ['bank_cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_cases')
        .select(`
          *,
          bank_accounts (
            bank_name,
            account_name,
            account_number
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Generate case number - Legacy function (now replaced by edge function)
  const generateCaseNumber = () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `CASE${year}${month}${random}`;
  };

  // File upload handler
  const handleFileUpload = async (files: File[], fieldName: string) => {
    const uploadedUrls: string[] = [];
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `case-documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('investigation-documents')
        .upload(filePath, file);

      if (uploadError) {
        toast.error(`Failed to upload ${file.name}`);
        continue;
      }

      const { data } = supabase.storage
        .from('investigation-documents')
        .getPublicUrl(filePath);

      uploadedUrls.push(data.publicUrl);
    }
    
    return uploadedUrls;
  };

  // Create case mutation
  const createCaseMutation = useMutation({
    mutationFn: async (data: CaseFormData) => {
      // Generate case number using the new format
      const { data: caseIdData, error: caseIdError } = await supabase.functions.invoke('generate-case-id', {
        body: { caseType: data.case_type }
      });

      if (caseIdError) {
        console.error('Error generating case ID:', caseIdError);
        throw new Error('Failed to generate case ID');
      }

      const caseNumber = caseIdData.caseId;
      console.log('Generated case ID:', caseNumber);
      
      // Upload files for different case types
      let uploadedScreenshots: string[] = [];
      let uploadedProofOfDebit: string[] = [];
      let uploadedSupportingProof: string[] = [];
      let uploadedSupportingDocument: string[] = [];
      let uploadedStatementProof: string[] = [];

      if (data.screenshots?.length > 0) {
        uploadedScreenshots = await handleFileUpload(data.screenshots, 'screenshots');
      }
      if (data.proof_of_debit?.length > 0) {
        uploadedProofOfDebit = await handleFileUpload(data.proof_of_debit, 'proof_of_debit');
      }
      if (data.supporting_proof?.length > 0) {
        uploadedSupportingProof = await handleFileUpload(data.supporting_proof, 'supporting_proof');
      }
      if (data.supporting_document?.length > 0) {
        uploadedSupportingDocument = await handleFileUpload(data.supporting_document, 'supporting_document');
      }
      if (data.statement_proof?.length > 0) {
        uploadedStatementProof = await handleFileUpload(data.statement_proof, 'statement_proof');
      }

      const caseData = {
        case_number: caseNumber,
        case_type: data.case_type,
        bank_account_id: data.bank_account_id,
        title: data.title,
        description: data.description,
        contact_person: data.contact_person,
        contact_details: data.contact_details,
        // Case-specific fields
        error_message: data.error_message,
        screenshots: uploadedScreenshots,
        wrong_beneficiary_account: data.wrong_beneficiary_account,
        wrong_beneficiary_name: data.wrong_beneficiary_name,
        transaction_datetime: data.transaction_datetime || null,
        amount_transferred: data.amount_transferred || null,
        beneficiary_name: data.beneficiary_name,
        beneficiary_account_number: data.beneficiary_account_number,
        bank_ifsc_code: data.bank_ifsc_code,
        proof_of_debit: uploadedProofOfDebit[0] || null,
        settlement_reference_id: data.settlement_reference_id,
        expected_settlement_amount: data.expected_settlement_amount || null,
        settlement_date: data.settlement_date || null,
        pending_since: data.pending_since,
        supporting_proof: uploadedSupportingProof[0] || null,
        amount_lien_marked: data.amount_lien_marked || null,
        date_lien_marked: data.date_lien_marked || null,
        bank_reason: data.bank_reason,
        supporting_document: uploadedSupportingDocument[0] || null,
        remarks: data.remarks,
        date_of_discrepancy: data.date_of_discrepancy || null,
        reported_balance: data.reported_balance || null,
        expected_balance: data.expected_balance || null,
        difference_amount: data.difference_amount || null,
        statement_proof: uploadedStatementProof[0] || null,
      };
      
      const { data: result, error } = await supabase
        .from('bank_cases')
        .insert(caseData)
        .select()
        .single();

      if (error) throw error;

      // If case type is "Account Not Working", update bank account status to "Inactive"
      if (data.case_type === 'ACCOUNT_NOT_WORKING') {
        const { error: updateError } = await supabase
          .from('bank_accounts')
          .update({ status: 'INACTIVE' })
          .eq('id', data.bank_account_id);

        if (updateError) {
          console.error('Error updating bank account status:', updateError);
          // Don't throw error here as the case was already created successfully
          toast.error("Case created but failed to update bank account status");
        } else {
          console.log('Bank account status updated to INACTIVE');
        }
      }

      return result;
    },
    onSuccess: () => {
      toast.success("Case created successfully!");
      queryClient.invalidateQueries({ queryKey: ['bank_cases'] });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      console.error('Error creating case:', error);
      toast.error("Failed to create case");
    },
  });

  const resetForm = () => {
    setFormData({
      case_type: '',
      bank_account_id: '',
      title: '',
      description: '',
      contact_person: '',
      contact_details: '',
      // Reset specific fields
      error_message: '',
      screenshots: [],
      wrong_beneficiary_account: '',
      wrong_beneficiary_name: '',
      transaction_datetime: '',
      amount_transferred: 0,
      beneficiary_name: '',
      beneficiary_account_number: '',
      bank_ifsc_code: '',
      proof_of_debit: [],
      settlement_reference_id: '',
      expected_settlement_amount: 0,
      settlement_date: '',
      pending_since: '',
      supporting_proof: [],
      amount_lien_marked: 0,
      date_lien_marked: '',
      bank_reason: '',
      supporting_document: [],
      remarks: '',
      date_of_discrepancy: '',
      reported_balance: 0,
      expected_balance: 0,
      difference_amount: 0,
      statement_proof: [],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.case_type || !formData.title || !formData.bank_account_id) {
      toast.error("Please fill in all required fields");
      return;
    }
    createCaseMutation.mutate(formData);
  };

  const getCaseTypeInfo = (type: string) => {
    return CASE_TYPES.find(t => t.value === type) || CASE_TYPES[0];
  };

  const getPriorityInfo = (priority: string) => {
    return PRIORITIES.find(p => p.value === priority) || PRIORITIES[1];
  };

  const getStatusInfo = (status: string) => {
    return STATUSES.find(s => s.value === status) || STATUSES[0];
  };

  const handleViewCase = (caseItem: any) => {
    setSelectedCase(caseItem);
    setIsViewDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof CaseFormData) => {
    const files = Array.from(e.target.files || []);
    setFormData(prev => ({ ...prev, [fieldName]: files }));
  };

  const removeFile = (fieldName: keyof CaseFormData, index: number) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: (prev[fieldName] as File[]).filter((_, i) => i !== index)
    }));
  };

  // Render case-specific fields based on selected case type
  const renderCaseSpecificFields = () => {
    switch (formData.case_type) {
      case 'ACCOUNT_NOT_WORKING':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="error_message">Error Message / Issue Description *</Label>
              <Textarea
                id="error_message"
                value={formData.error_message}
                onChange={(e) => setFormData(prev => ({ ...prev, error_message: e.target.value }))}
                placeholder="Describe the error or issue in detail"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="screenshots">Screenshots (Optional)</Label>
              <Input
                id="screenshots"
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'screenshots')}
              />
              {formData.screenshots.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.screenshots.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted p-2 rounded text-sm">
                      <span>{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile('screenshots', index)}
                        className="h-4 w-4 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );

      case 'WRONG_PAYMENT_INITIATED':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wrong_beneficiary_account">Wrong Beneficiary Account Number *</Label>
                <Input
                  id="wrong_beneficiary_account"
                  value={formData.wrong_beneficiary_account}
                  onChange={(e) => setFormData(prev => ({ ...prev, wrong_beneficiary_account: e.target.value }))}
                  placeholder="Enter wrong account number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wrong_beneficiary_name">Wrong Beneficiary Name *</Label>
                <Input
                  id="wrong_beneficiary_name"
                  value={formData.wrong_beneficiary_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, wrong_beneficiary_name: e.target.value }))}
                  placeholder="Enter wrong beneficiary name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="transaction_datetime">Date & Time of Transaction *</Label>
                <Input
                  id="transaction_datetime"
                  type="datetime-local"
                  value={formData.transaction_datetime}
                  onChange={(e) => setFormData(prev => ({ ...prev, transaction_datetime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount_transferred">Amount Transferred *</Label>
                <Input
                  id="amount_transferred"
                  type="number"
                  value={formData.amount_transferred}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount_transferred: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                value={formData.remarks}
                onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="Additional remarks"
                rows={2}
              />
            </div>
          </>
        );

      case 'PAYMENT_NOT_CREDITED':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="beneficiary_name">Beneficiary Name *</Label>
                <Input
                  id="beneficiary_name"
                  value={formData.beneficiary_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, beneficiary_name: e.target.value }))}
                  placeholder="Enter beneficiary name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beneficiary_account_number">Beneficiary Account Number *</Label>
                <Input
                  id="beneficiary_account_number"
                  value={formData.beneficiary_account_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, beneficiary_account_number: e.target.value }))}
                  placeholder="Enter account number"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bank_ifsc_code">Bank IFSC Code *</Label>
                <Input
                  id="bank_ifsc_code"
                  value={formData.bank_ifsc_code}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_ifsc_code: e.target.value }))}
                  placeholder="Enter IFSC code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transaction_datetime">Transaction Date & Time *</Label>
                <Input
                  id="transaction_datetime"
                  type="datetime-local"
                  value={formData.transaction_datetime}
                  onChange={(e) => setFormData(prev => ({ ...prev, transaction_datetime: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proof_of_debit">Proof of Debit (Screenshot / Bank Entry)</Label>
              <Input
                id="proof_of_debit"
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange(e, 'proof_of_debit')}
              />
              {formData.proof_of_debit.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.proof_of_debit.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted p-2 rounded text-sm">
                      <span>{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile('proof_of_debit', index)}
                        className="h-4 w-4 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );

      case 'SETTLEMENT_NOT_RECEIVED':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="settlement_reference_id">Settlement Reference ID</Label>
                <Input
                  id="settlement_reference_id"
                  value={formData.settlement_reference_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, settlement_reference_id: e.target.value }))}
                  placeholder="Enter settlement reference ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_settlement_amount">Expected Settlement Amount *</Label>
                <Input
                  id="expected_settlement_amount"
                  type="number"
                  value={formData.expected_settlement_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, expected_settlement_amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="settlement_date">Settlement Date (Expected) *</Label>
                <Input
                  id="settlement_date"
                  type="date"
                  value={formData.settlement_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, settlement_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pending_since">Pending Since (Duration) *</Label>
                <Input
                  id="pending_since"
                  value={formData.pending_since}
                  onChange={(e) => setFormData(prev => ({ ...prev, pending_since: e.target.value }))}
                  placeholder="e.g., 15 days, 2 weeks"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supporting_proof">Supporting Proof / Settlement Advice</Label>
              <Input
                id="supporting_proof"
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange(e, 'supporting_proof')}
              />
              {formData.supporting_proof.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.supporting_proof.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted p-2 rounded text-sm">
                      <span>{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile('supporting_proof', index)}
                        className="h-4 w-4 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );

      case 'LIEN_RECEIVED':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount_lien_marked">Amount Lien Marked *</Label>
                <Input
                  id="amount_lien_marked"
                  type="number"
                  value={formData.amount_lien_marked}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount_lien_marked: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_lien_marked">Date Lien Marked *</Label>
                <Input
                  id="date_lien_marked"
                  type="date"
                  value={formData.date_lien_marked}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_lien_marked: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank_reason">Reason Provided by Bank</Label>
              <Textarea
                id="bank_reason"
                value={formData.bank_reason}
                onChange={(e) => setFormData(prev => ({ ...prev, bank_reason: e.target.value }))}
                placeholder="Enter reason provided by bank"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supporting_document">Supporting Document (Bank Notice if available)</Label>
              <Input
                id="supporting_document"
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange(e, 'supporting_document')}
              />
              {formData.supporting_document.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.supporting_document.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted p-2 rounded text-sm">
                      <span>{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile('supporting_document', index)}
                        className="h-4 w-4 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                value={formData.remarks}
                onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="Additional remarks"
                rows={2}
              />
            </div>
          </>
        );

      case 'BALANCE_DISCREPANCY':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="date_of_discrepancy">Date of Discrepancy *</Label>
              <Input
                id="date_of_discrepancy"
                type="date"
                value={formData.date_of_discrepancy}
                onChange={(e) => setFormData(prev => ({ ...prev, date_of_discrepancy: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reported_balance">Reported Balance (from bank statement) *</Label>
                <Input
                  id="reported_balance"
                  type="number"
                  value={formData.reported_balance}
                  onChange={(e) => setFormData(prev => ({ ...prev, reported_balance: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_balance">Expected Balance (system calculation) *</Label>
                <Input
                  id="expected_balance"
                  type="number"
                  value={formData.expected_balance}
                  onChange={(e) => setFormData(prev => ({ ...prev, expected_balance: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="difference_amount">Difference Amount *</Label>
              <Input
                id="difference_amount"
                type="number"
                value={formData.difference_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, difference_amount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="statement_proof">Screenshot / Statement Proof</Label>
              <Input
                id="statement_proof"
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange(e, 'statement_proof')}
              />
              {formData.statement_proof.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.statement_proof.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted p-2 rounded text-sm">
                      <span>{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile('statement_proof', index)}
                        className="h-4 w-4 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                value={formData.remarks}
                onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="Additional remarks"
                rows={2}
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-3">
                <AlertCircle className="h-7 w-7 text-primary" />
                Case Generator
              </CardTitle>
              <p className="text-muted-foreground mt-2">
                Generate and manage cases for bank account issues and disputes
              </p>
            </div>
            <ViewOnlyWrapper isViewOnly={!hasManagePermission}>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Generate New Case
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Generate New Case</DialogTitle>
                  </DialogHeader>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="case_type">Case Type *</Label>
                        <Select
                          value={formData.case_type}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, case_type: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select case type" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border shadow-lg z-50">
                            {CASE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="bank_account_id">Bank Account *</Label>
                        <Select
                          value={formData.bank_account_id}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, bank_account_id: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select bank account" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border shadow-lg z-50">
                            {bankAccounts?.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.bank_name} - {account.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="title">Case Title *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Enter case title"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe the issue in detail"
                        rows={3}
                      />
                    </div>

                    {/* Case-specific fields */}
                    {renderCaseSpecificFields()}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact_person">Contact Person</Label>
                        <Input
                          id="contact_person"
                          value={formData.contact_person}
                          onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                          placeholder="Enter contact person"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="contact_details">Contact Details</Label>
                        <Input
                          id="contact_details"
                          value={formData.contact_details}
                          onChange={(e) => setFormData(prev => ({ ...prev, contact_details: e.target.value }))}
                          placeholder="Phone number, email, etc."
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createCaseMutation.isPending}>
                        {createCaseMutation.isPending ? "Creating..." : "Generate Case"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </ViewOnlyWrapper>
          </div>
        </CardHeader>
      </Card>

      {/* Cases List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generated Cases
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!cases || cases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No cases generated yet</p>
              <p className="text-sm">Click "Generate New Case" to create your first case</p>
            </div>
          ) : (
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="active">Active Cases</TabsTrigger>
                <TabsTrigger value="resolved">Resolved Cases</TabsTrigger>
              </TabsList>
              
              <TabsContent value="active" className="mt-4">
                {cases.filter(caseItem => caseItem.status !== 'RESOLVED' && caseItem.status !== 'CLOSED').length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No active cases</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cases
                      .filter(caseItem => caseItem.status !== 'RESOLVED' && caseItem.status !== 'CLOSED')
                      .map((caseItem) => {
                        const caseTypeInfo = getCaseTypeInfo(caseItem.case_type);
                        const priorityInfo = getPriorityInfo(caseItem.priority);
                        const statusInfo = getStatusInfo(caseItem.status);

                        return (
                          <div key={caseItem.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                                    {caseItem.case_number}
                                  </span>
                                  <Badge className={caseTypeInfo.color}>
                                    {caseTypeInfo.label}
                                  </Badge>
                                  <Badge className={priorityInfo.color}>
                                    {priorityInfo.label}
                                  </Badge>
                                  <Badge className={statusInfo.color}>
                                    {statusInfo.label}
                                  </Badge>
                                </div>
                                
                                <h3 className="font-semibold text-lg mb-1">{caseItem.title}</h3>
                                
                                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                                  <span className="flex items-center gap-1">
                                    <CreditCard className="h-4 w-4" />
                                    {caseItem.bank_accounts?.bank_name} - {caseItem.bank_accounts?.account_name}
                                  </span>
                                  {caseItem.amount_involved > 0 && (
                                    <span className="flex items-center gap-1">
                                      <DollarSign className="h-4 w-4" />
                                      ₹{caseItem.amount_involved?.toLocaleString()}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    {format(new Date(caseItem.created_at), 'dd MMM yyyy')}
                                  </span>
                                </div>
                                
                                {caseItem.assigned_to && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <Users className="h-4 w-4" />
                                    Assigned to: {caseItem.assigned_to}
                                  </div>
                                )}
                              </div>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewCase(caseItem)}
                                className="ml-4"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="resolved" className="mt-4">
                {cases.filter(caseItem => caseItem.status === 'RESOLVED' || caseItem.status === 'CLOSED').length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No resolved cases</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cases
                      .filter(caseItem => caseItem.status === 'RESOLVED' || caseItem.status === 'CLOSED')
                      .map((caseItem) => {
                        const caseTypeInfo = getCaseTypeInfo(caseItem.case_type);
                        const priorityInfo = getPriorityInfo(caseItem.priority);
                        const statusInfo = getStatusInfo(caseItem.status);

                        return (
                          <div key={caseItem.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                                    {caseItem.case_number}
                                  </span>
                                  <Badge className={caseTypeInfo.color}>
                                    {caseTypeInfo.label}
                                  </Badge>
                                  <Badge className={priorityInfo.color}>
                                    {priorityInfo.label}
                                  </Badge>
                                  <Badge className={statusInfo.color}>
                                    {statusInfo.label}
                                  </Badge>
                                </div>
                                
                                <h3 className="font-semibold text-lg mb-1">{caseItem.title}</h3>
                                
                                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                                  <span className="flex items-center gap-1">
                                    <CreditCard className="h-4 w-4" />
                                    {caseItem.bank_accounts?.bank_name} - {caseItem.bank_accounts?.account_name}
                                  </span>
                                  {caseItem.amount_involved > 0 && (
                                    <span className="flex items-center gap-1">
                                      <DollarSign className="h-4 w-4" />
                                      ₹{caseItem.amount_involved?.toLocaleString()}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    {format(new Date(caseItem.created_at), 'dd MMM yyyy')}
                                  </span>
                                </div>
                                
                                {caseItem.assigned_to && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <Users className="h-4 w-4" />
                                    Assigned to: {caseItem.assigned_to}
                                  </div>
                                )}
                              </div>
                              
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewCase(caseItem)}
                                className="ml-4"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* View Case Dialog */}
      {selectedCase && (
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                Case Details - {selectedCase.case_number}
                <Badge className={getStatusInfo(selectedCase.status).color}>
                  {getStatusInfo(selectedCase.status).label}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Case Type</Label>
                  <Badge className={getCaseTypeInfo(selectedCase.case_type).color + " mt-1"}>
                    {getCaseTypeInfo(selectedCase.case_type).label}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Priority</Label>
                  <Badge className={getPriorityInfo(selectedCase.priority).color + " mt-1"}>
                    {getPriorityInfo(selectedCase.priority).label}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Title</Label>
                <p className="text-lg font-semibold mt-1">{selectedCase.title}</p>
              </div>

              {selectedCase.description && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Description</Label>
                  <p className="mt-1">{selectedCase.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Bank Account</Label>
                  <p className="mt-1">{selectedCase.bank_accounts?.bank_name} - {selectedCase.bank_accounts?.account_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedCase.bank_accounts?.account_number}</p>
                </div>
                {selectedCase.amount_involved > 0 && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Amount Involved</Label>
                    <p className="mt-1 font-semibold">₹{selectedCase.amount_involved?.toLocaleString()}</p>
                  </div>
                )}
              </div>

              {selectedCase.transaction_reference && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Transaction Reference</Label>
                  <p className="mt-1 font-mono">{selectedCase.transaction_reference}</p>
                </div>
              )}

              {selectedCase.beneficiary_details && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Beneficiary Details</Label>
                  <p className="mt-1">{selectedCase.beneficiary_details}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedCase.assigned_to && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Assigned To</Label>
                    <p className="mt-1">{selectedCase.assigned_to}</p>
                  </div>
                )}
                {selectedCase.contact_person && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Contact Person</Label>
                    <p className="mt-1">{selectedCase.contact_person}</p>
                  </div>
                )}
              </div>

              {selectedCase.contact_details && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Contact Details</Label>
                  <p className="mt-1">{selectedCase.contact_details}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Created At</Label>
                  <p className="mt-1">{format(new Date(selectedCase.created_at), 'PPpp')}</p>
                </div>
                {selectedCase.due_date && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Due Date</Label>
                    <p className="mt-1">{format(new Date(selectedCase.due_date), 'PP')}</p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}