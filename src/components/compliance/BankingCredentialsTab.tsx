
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Plus, Edit, Trash2, Key, Copy, Minus, Filter, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
}

interface SecurityQuestion {
  question: string;
  answer: string;
}

interface BankingCredential {
  id: string;
  bank_account_id: string;
  credential_type: string;
  credential_name?: string;
  customer_id?: string;
  login_id?: string;
  password?: string;
  transaction_password?: string;
  profile_password?: string;
  upi_pin?: string;
  credential_value?: string;
  security_questions?: SecurityQuestion[];
  notes?: string;
  created_at: string;
  updated_at: string;
  bank_accounts?: BankAccount;
}

const CREDENTIAL_TYPES = [
  'Customer ID',
  'Net Banking',
  'Transaction Password',
  'Profile Password',
  'Security Question',
  'UPI PIN',
  'Other'
];

export function BankingCredentialsTab() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCredential, setEditingCredential] = useState<BankingCredential | null>(null);
  const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>("placeholder");
  const [formData, setFormData] = useState({
    bank_account_id: '',
    credential_type: '',
    credential_name: '',
    customer_id: '',
    login_id: '',
    password: '',
    transaction_password: '',
    profile_password: '',
    upi_pin: '',
    credential_value: '',
    security_questions: [{ question: '', answer: '' }] as SecurityQuestion[],
    notes: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch bank accounts for dropdown with error handling
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts_dropdown'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('bank_accounts')
          .select('id, account_name, bank_name, account_number')
          .eq('status', 'ACTIVE')
          .order('account_name');
        if (error) {
          console.error('Error fetching bank accounts:', error);
          throw error;
        }
        return (data || []) as BankAccount[];
      } catch (error) {
        console.error('Bank accounts query error:', error);
        return [];
      }
    },
  });

  // Get unique bank names for filter with safe fallback
  const uniqueBankNames = Array.from(new Set((bankAccounts || []).map(account => account.bank_name).filter(Boolean)));

  // Fetch banking credentials with bank account details and error handling
  const { data: credentials, isLoading } = useQuery({
    queryKey: ['banking_credentials', selectedBankFilter],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('banking_credentials')
          .select('*, bank_accounts(*)')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching banking credentials:', error);
          throw error;
        }
        
        const credentialsData = (data ?? []).map((item) => ({
          ...item,
          security_questions: Array.isArray(item.security_questions)
            ? (item.security_questions as any[]).map((q) => ({
                question: q.question,
                answer: q.answer,
              }))
            : [],
        })) as BankingCredential[];
        
        // Filter by bank if selected and it's not the placeholder
        if (selectedBankFilter && selectedBankFilter !== "placeholder" && credentialsData.length > 0) {
          return credentialsData.filter(credential => 
            credential.bank_accounts?.bank_name === selectedBankFilter
          );
        }
        
        return credentialsData;
      } catch (error) {
        console.error('Banking credentials query error:', error);
        return [];
      }
    },
  });

  // Add credential mutation
  const addCredentialMutation = useMutation({
    mutationFn: async (credentialData: any) => {
      const { data, error } = await supabase
        .from('banking_credentials')
        .insert([credentialData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Banking credential added successfully" });
      queryClient.invalidateQueries({ queryKey: ['banking_credentials'] });
      setShowAddDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to add banking credential" });
      console.error('Error adding credential:', error);
    }
  });

  // Update credential mutation
  const updateCredentialMutation = useMutation({
    mutationFn: async ({ id, ...credentialData }: any) => {
      const { data, error } = await supabase
        .from('banking_credentials')
        .update(credentialData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Banking credential updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['banking_credentials'] });
      setEditingCredential(null);
      resetForm();
    }
  });

  // Delete credential mutation
  const deleteCredentialMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('banking_credentials')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Banking credential deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['banking_credentials'] });
    }
  });

  const resetForm = () => {
    setFormData({
      bank_account_id: '',
      credential_type: '',
      credential_name: '',
      customer_id: '',
      login_id: '',
      password: '',
      transaction_password: '',
      profile_password: '',
      upi_pin: '',
      credential_value: '',
      security_questions: [{ question: '', answer: '' }],
      notes: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      bank_account_id: formData.bank_account_id,
      credential_type: formData.credential_type,
      credential_name: formData.credential_name || null,
      customer_id: formData.customer_id || null,
      login_id: formData.login_id || null,
      password: formData.password || null,
      transaction_password: formData.transaction_password || null,
      profile_password: formData.profile_password || null,
      upi_pin: formData.upi_pin || null,
      credential_value: formData.credential_value || null,
      security_questions: formData.security_questions.filter(q => q.question && q.answer),
      notes: formData.notes || null
    };

    if (editingCredential) {
      updateCredentialMutation.mutate({ id: editingCredential.id, ...submitData });
    } else {
      addCredentialMutation.mutate(submitData);
    }
  };

  const handleEdit = (credential: BankingCredential) => {
    setEditingCredential(credential);
    setFormData({
      bank_account_id: credential.bank_account_id,
      credential_type: credential.credential_type,
      credential_name: credential.credential_name || '',
      customer_id: credential.customer_id || '',
      login_id: credential.login_id || '',
      password: credential.password || '',
      transaction_password: credential.transaction_password || '',
      profile_password: credential.profile_password || '',
      upi_pin: credential.upi_pin || '',
      credential_value: credential.credential_value || '',
      security_questions: credential.security_questions && credential.security_questions.length > 0 
        ? credential.security_questions 
        : [{ question: '', answer: '' }],
      notes: credential.notes || ''
    });
    setShowAddDialog(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this credential?')) {
      deleteCredentialMutation.mutate(id);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard` });
  };

  const addSecurityQuestion = () => {
    setFormData(prev => ({
      ...prev,
      security_questions: [...prev.security_questions, { question: '', answer: '' }]
    }));
  };

  const removeSecurityQuestion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      security_questions: prev.security_questions.filter((_, i) => i !== index)
    }));
  };

  const updateSecurityQuestion = (index: number, field: 'question' | 'answer', value: string) => {
    setFormData(prev => ({
      ...prev,
      security_questions: prev.security_questions.map((q, i) => 
        i === index ? { ...q, [field]: value } : q
      )
    }));
  };

  const renderFormFields = () => {
    switch (formData.credential_type) {
      case 'Customer ID':
        return (
          <div>
            <Label>Customer ID</Label>
            <Input
              value={formData.customer_id}
              onChange={(e) => setFormData(prev => ({ ...prev, customer_id: e.target.value }))}
              placeholder="Enter customer ID"
              required
            />
          </div>
        );

      case 'Net Banking':
        return (
          <>
            <div>
              <Label>Net Banking Login ID</Label>
              <Input
                value={formData.login_id}
                onChange={(e) => setFormData(prev => ({ ...prev, login_id: e.target.value }))}
                placeholder="Enter login ID"
                required
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Enter password"
                required
              />
            </div>
          </>
        );

      case 'Transaction Password':
        return (
          <div>
            <Label>Transaction Password</Label>
            <Input
              type="password"
              value={formData.transaction_password}
              onChange={(e) => setFormData(prev => ({ ...prev, transaction_password: e.target.value }))}
              placeholder="Enter transaction password"
              required
            />
          </div>
        );

      case 'Profile Password':
        return (
          <div>
            <Label>Profile Password</Label>
            <Input
              type="password"
              value={formData.profile_password}
              onChange={(e) => setFormData(prev => ({ ...prev, profile_password: e.target.value }))}
              placeholder="Enter profile password"
              required
            />
          </div>
        );

      case 'Security Question':
        return (
          <div className="space-y-4">
            {formData.security_questions.map((sq, index) => (
              <div key={index} className="border p-3 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Security Question {index + 1}</Label>
                  {formData.security_questions.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeSecurityQuestion(index)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Input
                  value={sq.question}
                  onChange={(e) => updateSecurityQuestion(index, 'question', e.target.value)}
                  placeholder="Enter security question"
                  required
                />
                <Input
                  value={sq.answer}
                  onChange={(e) => updateSecurityQuestion(index, 'answer', e.target.value)}
                  placeholder="Enter answer"
                  required
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={addSecurityQuestion}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Question
            </Button>
          </div>
        );

      case 'UPI PIN':
        return (
          <div>
            <Label>UPI PIN</Label>
            <Input
              type="password"
              value={formData.upi_pin}
              onChange={(e) => setFormData(prev => ({ ...prev, upi_pin: e.target.value }))}
              placeholder="Enter UPI PIN"
              required
            />
          </div>
        );

      case 'Other':
        return (
          <>
            <div>
              <Label>Name of Credential</Label>
              <Input
                value={formData.credential_name}
                onChange={(e) => setFormData(prev => ({ ...prev, credential_name: e.target.value }))}
                placeholder="e.g., Token, Google Authenticator"
                required
              />
            </div>
            <div>
              <Label>Credential Value</Label>
              <Input
                type="password"
                value={formData.credential_value}
                onChange={(e) => setFormData(prev => ({ ...prev, credential_value: e.target.value }))}
                placeholder="Enter credential value"
                required
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const getCredentialDisplayValue = (credential: BankingCredential) => {
    switch (credential.credential_type) {
      case 'Customer ID':
        return credential.customer_id;
      case 'Net Banking':
        return credential.login_id;
      case 'Transaction Password':
        return credential.transaction_password;
      case 'Profile Password':
        return credential.profile_password;
      case 'UPI PIN':
        return credential.upi_pin;
      case 'Other':
        return credential.credential_value;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Banking Credentials</h3>
          <p className="text-sm text-gray-600">Securely store banking login credentials and passwords</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <Select value={selectedBankFilter} onValueChange={setSelectedBankFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by bank" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="placeholder" disabled>
                  Select a bank
                </SelectItem>
                {uniqueBankNames
                  .filter(bankName => bankName && bankName.trim() !== "")
                  .map((bankName) => (
                    <SelectItem key={bankName} value={bankName}>
                      {bankName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedBankFilter && selectedBankFilter !== "placeholder" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedBankFilter("placeholder")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setEditingCredential(null); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Credential
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingCredential ? 'Edit Banking Credential' : 'Add Banking Credential'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Select Bank Account</Label>
                  <Select value={formData.bank_account_id} onValueChange={(value) => setFormData(prev => ({ ...prev, bank_account_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts?.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.account_name} ({account.bank_name} – {account.account_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Credential Type</Label>
                  <Select value={formData.credential_type} onValueChange={(value) => setFormData(prev => ({ ...prev, credential_type: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select credential type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CREDENTIAL_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.credential_type && renderFormFields()}
                
                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes"
                    rows={3}
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingCredential ? 'Update' : 'Add'} Credential
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading banking credentials...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(credentials || []).map((credential) => (
            <Card key={credential.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Key className="h-5 w-5 text-blue-600" />
                    {credential.bank_accounts?.account_name}
                  </CardTitle>
                  <Badge variant="secondary">{credential.credential_type}</Badge>
                </div>
                <p className="text-sm text-gray-600">
                  {credential.bank_accounts?.bank_name} – {credential.bank_accounts?.account_number}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {credential.credential_type === 'Security Question' ? (
                  <div>
                    <Label className="text-xs text-gray-500">Security Questions</Label>
                    {credential.security_questions?.map((sq, index) => (
                      <div key={index} className="text-sm space-y-1 border-b pb-2 mb-2 last:border-b-0">
                        <div className="font-medium">{sq.question}</div>
                        <div className="text-gray-600">{sq.answer}</div>
                      </div>
                    ))}
                  </div>
                ) : credential.credential_type === 'Net Banking' ? (
                  // Show all Net Banking credentials
                  <div className="space-y-3">
                    {credential.customer_id && (
                      <div>
                        <Label className="text-xs text-gray-500">Customer ID</Label>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono">
                            {showPasswords[`${credential.id}_customer_id`] ? credential.customer_id : '••••••••'}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowPasswords(prev => ({
                                ...prev,
                                [`${credential.id}_customer_id`]: !prev[`${credential.id}_customer_id`]
                              }))}
                            >
                              {showPasswords[`${credential.id}_customer_id`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(credential.customer_id || '', 'Customer ID')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {credential.login_id && (
                      <div>
                        <Label className="text-xs text-gray-500">Net Banking ID</Label>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono">
                            {showPasswords[`${credential.id}_login_id`] ? credential.login_id : '••••••••'}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowPasswords(prev => ({
                                ...prev,
                                [`${credential.id}_login_id`]: !prev[`${credential.id}_login_id`]
                              }))}
                            >
                              {showPasswords[`${credential.id}_login_id`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(credential.login_id || '', 'Net Banking ID')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {credential.password && (
                      <div>
                        <Label className="text-xs text-gray-500">Password</Label>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono">
                            {showPasswords[`${credential.id}_password`] ? credential.password : '••••••••'}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowPasswords(prev => ({
                                ...prev,
                                [`${credential.id}_password`]: !prev[`${credential.id}_password`]
                              }))}
                            >
                              {showPasswords[`${credential.id}_password`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(credential.password || '', 'Password')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {credential.transaction_password && (
                      <div>
                        <Label className="text-xs text-gray-500">Transaction Password</Label>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono">
                            {showPasswords[`${credential.id}_transaction_password`] ? credential.transaction_password : '••••••••'}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowPasswords(prev => ({
                                ...prev,
                                [`${credential.id}_transaction_password`]: !prev[`${credential.id}_transaction_password`]
                              }))}
                            >
                              {showPasswords[`${credential.id}_transaction_password`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(credential.transaction_password || '', 'Transaction Password')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Show single credential for other types
                  <div>
                    <Label className="text-xs text-gray-500">
                      {credential.credential_type === 'Other' ? credential.credential_name : credential.credential_type}
                    </Label>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono">
                        {showPasswords[credential.id] ? getCredentialDisplayValue(credential) : '••••••••'}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => togglePasswordVisibility(credential.id)}
                        >
                          {showPasswords[credential.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(getCredentialDisplayValue(credential) || '', credential.credential_type)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                
                {credential.notes && (
                  <div>
                    <Label className="text-xs text-gray-500">Notes</Label>
                    <p className="text-sm text-gray-600">{credential.notes}</p>
                  </div>
                )}
                
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(credential)}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(credential.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {(!credentials || credentials.length === 0) && (
            <div className="col-span-full text-center py-8 text-gray-500">
              No banking credentials found. {selectedBankFilter && selectedBankFilter !== "placeholder" && "Try removing the bank filter or"} Add your first credential to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
