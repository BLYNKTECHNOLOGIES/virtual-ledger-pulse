
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Plus, Edit, Trash2, Key } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BankingCredential {
  id: string;
  bank_name: string;
  account_name: string;
  credential_type: string;
  username: string;
  password: string;
  security_question?: string;
  security_answer?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export function BankingCredentialsTab() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCredential, setEditingCredential] = useState<BankingCredential | null>(null);
  const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
  const [formData, setFormData] = useState({
    bank_name: '',
    account_name: '',
    credential_type: '',
    username: '',
    password: '',
    security_question: '',
    security_answer: '',
    notes: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch banking credentials
  const { data: credentials, isLoading } = useQuery({
    queryKey: ['banking_credentials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banking_credentials')
        .select('*')
        .order('bank_name');
      if (error) throw error;
      return data as BankingCredential[];
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
      bank_name: '',
      account_name: '',
      credential_type: '',
      username: '',
      password: '',
      security_question: '',
      security_answer: '',
      notes: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCredential) {
      updateCredentialMutation.mutate({ id: editingCredential.id, ...formData });
    } else {
      addCredentialMutation.mutate(formData);
    }
  };

  const handleEdit = (credential: BankingCredential) => {
    setEditingCredential(credential);
    setFormData({
      bank_name: credential.bank_name,
      account_name: credential.account_name,
      credential_type: credential.credential_type,
      username: credential.username,
      password: credential.password,
      security_question: credential.security_question || '',
      security_answer: credential.security_answer || '',
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Banking Credentials</h3>
          <p className="text-sm text-gray-600">Securely store banking login credentials and passwords</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingCredential(null); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Credential
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCredential ? 'Edit Banking Credential' : 'Add Banking Credential'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Bank Name</Label>
                <Input
                  value={formData.bank_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                  placeholder="Enter bank name"
                  required
                />
              </div>
              
              <div>
                <Label>Account Name</Label>
                <Input
                  value={formData.account_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
                  placeholder="Enter account name"
                  required
                />
              </div>
              
              <div>
                <Label>Credential Type</Label>
                <Select value={formData.credential_type} onValueChange={(value) => setFormData(prev => ({ ...prev, credential_type: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select credential type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Internet Banking">Internet Banking</SelectItem>
                    <SelectItem value="Mobile Banking">Mobile Banking</SelectItem>
                    <SelectItem value="UPI PIN">UPI PIN</SelectItem>
                    <SelectItem value="Debit Card PIN">Debit Card PIN</SelectItem>
                    <SelectItem value="ATM PIN">ATM PIN</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Username/ID</Label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Enter username or ID"
                  required
                />
              </div>
              
              <div>
                <Label>Password/PIN</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter password or PIN"
                  required
                />
              </div>
              
              <div>
                <Label>Security Question (Optional)</Label>
                <Input
                  value={formData.security_question}
                  onChange={(e) => setFormData(prev => ({ ...prev, security_question: e.target.value }))}
                  placeholder="Enter security question"
                />
              </div>
              
              <div>
                <Label>Security Answer (Optional)</Label>
                <Input
                  value={formData.security_answer}
                  onChange={(e) => setFormData(prev => ({ ...prev, security_answer: e.target.value }))}
                  placeholder="Enter security answer"
                />
              </div>
              
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

      {isLoading ? (
        <div className="text-center py-8">Loading banking credentials...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {credentials?.map((credential) => (
            <Card key={credential.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Key className="h-5 w-5 text-blue-600" />
                    {credential.bank_name}
                  </CardTitle>
                  <Badge variant="secondary">{credential.credential_type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500">Account Name</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{credential.account_name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(credential.account_name, 'Account name')}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs text-gray-500">Username/ID</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{credential.username}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(credential.username, 'Username')}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs text-gray-500">Password/PIN</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono">
                      {showPasswords[credential.id] ? credential.password : '••••••••'}
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
                        onClick={() => copyToClipboard(credential.password, 'Password')}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>
                
                {credential.security_question && (
                  <div>
                    <Label className="text-xs text-gray-500">Security Q&A</Label>
                    <div className="text-sm">
                      <div className="font-medium">{credential.security_question}</div>
                      <div className="text-gray-600">{credential.security_answer}</div>
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
          
          {credentials?.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-500">
              No banking credentials found. Add your first credential to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
