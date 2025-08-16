import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Eye, AlertCircle, CreditCard, TrendingUp, Users, DollarSign, FileText, Calendar } from "lucide-react";
import { format } from "date-fns";

const CASE_TYPES = [
  { value: 'ACCOUNT_NOT_WORKING', label: 'Account Not Working', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  { value: 'WRONG_PAYMENT_INITIATED', label: 'Wrong Payment Initiated', color: 'bg-warning/10 text-warning border-warning/20' },
  { value: 'PAYMENT_NOT_CREDITED', label: 'Payment not Credited to Beneficiary', color: 'bg-info/10 text-info border-info/20' },
  { value: 'SETTLEMENT_NOT_RECEIVED', label: 'Settlement Not Received', color: 'bg-primary/10 text-primary border-primary/20' },
  { value: 'LIEN_RECEIVED', label: 'Lien Received', color: 'bg-accent/10 text-accent border-accent/20' },
  { value: 'BALANCE_DISCREPANCY', label: 'Balance Discrepancy', color: 'bg-secondary/10 text-secondary border-secondary/20' },
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
  priority: string;
  amount_involved: number;
  transaction_reference: string;
  beneficiary_details: string;
  assigned_to: string;
  contact_person: string;
  contact_details: string;
  due_date: string;
}

export function CaseGenerator() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<CaseFormData>({
    case_type: '',
    bank_account_id: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    amount_involved: 0,
    transaction_reference: '',
    beneficiary_details: '',
    assigned_to: '',
    contact_person: '',
    contact_details: '',
    due_date: '',
  });

  // Fetch bank accounts for dropdown
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_name, account_number')
        .eq('status', 'ACTIVE')
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

  // Generate case number
  const generateCaseNumber = () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `CASE${year}${month}${random}`;
  };

  // Create case mutation
  const createCaseMutation = useMutation({
    mutationFn: async (data: CaseFormData) => {
      const caseNumber = generateCaseNumber();
      
      const { data: result, error } = await supabase
        .from('bank_cases')
        .insert({
          case_number: caseNumber,
          ...data,
          due_date: data.due_date || null,
        })
        .select()
        .single();

      if (error) throw error;
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
      priority: 'MEDIUM',
      amount_involved: 0,
      transaction_reference: '',
      beneficiary_details: '',
      assigned_to: '',
      contact_person: '',
      contact_details: '',
      due_date: '',
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
                        <SelectContent>
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
                        <SelectContent>
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((priority) => (
                            <SelectItem key={priority.value} value={priority.value}>
                              {priority.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="amount_involved">Amount Involved</Label>
                      <Input
                        id="amount_involved"
                        type="number"
                        value={formData.amount_involved}
                        onChange={(e) => setFormData(prev => ({ ...prev, amount_involved: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="transaction_reference">Transaction Reference</Label>
                      <Input
                        id="transaction_reference"
                        value={formData.transaction_reference}
                        onChange={(e) => setFormData(prev => ({ ...prev, transaction_reference: e.target.value }))}
                        placeholder="Enter transaction reference"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="due_date">Due Date</Label>
                      <Input
                        id="due_date"
                        type="date"
                        value={formData.due_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="beneficiary_details">Beneficiary Details</Label>
                    <Textarea
                      id="beneficiary_details"
                      value={formData.beneficiary_details}
                      onChange={(e) => setFormData(prev => ({ ...prev, beneficiary_details: e.target.value }))}
                      placeholder="Enter beneficiary information"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="assigned_to">Assigned To</Label>
                      <Input
                        id="assigned_to"
                        value={formData.assigned_to}
                        onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                        placeholder="Assign to team member"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contact_person">Contact Person</Label>
                      <Input
                        id="contact_person"
                        value={formData.contact_person}
                        onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                        placeholder="Enter contact person"
                      />
                    </div>
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
            <div className="space-y-4">
              {cases.map((caseItem) => {
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