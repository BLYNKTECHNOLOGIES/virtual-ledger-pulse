import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Eye, EyeOff, X, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CloseAccountDialog } from "./CloseAccountDialog";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  IFSC: string;
  branch?: string;
  balance: number;
  lien_amount: number;
  status: "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL";
  account_status: "ACTIVE" | "CLOSED";
  bank_account_holder_name?: string;
  account_type: "SAVINGS" | "CURRENT";
  subsidiary_id?: string;
  created_at: string;
  updated_at: string;
}

interface ClosedBankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  IFSC?: string;
  branch?: string;
  bank_account_holder_name?: string;
  final_balance: number;
  closure_reason: string;
  closure_date: string;
  closure_documents: string[];
  closed_by?: string;
  created_at: string;
}

export function BankAccountManagement() {
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [closeAccountDialogOpen, setCloseAccountDialogOpen] = useState(false);
  const [accountToClose, setAccountToClose] = useState<BankAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [formData, setFormData] = useState({
    account_name: "",
    bank_name: "",
    account_number: "",
    ifsc_code: "",
    branch: "",
    balance: "",
    lien_amount: "",
    status: "PENDING_APPROVAL" as "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL",
    bank_account_holder_name: "",
    account_type: "SAVINGS" as "SAVINGS" | "CURRENT",
    subsidiary_id: ""
  });

  // Fetch active bank accounts (only show accounts with account_status = 'ACTIVE')
  const { data: bankAccounts, isLoading } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('bank_accounts_with_balance')
        .select('*')
        .eq('account_status', 'ACTIVE')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as (BankAccount & { computed_balance?: number })[];
    }
  });

  // Fetch closed bank accounts
  const { data: closedAccounts, isLoading: isLoadingClosed } = useQuery({
    queryKey: ['closed_bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closed_bank_accounts')
        .select('*')
        .order('closure_date', { ascending: false });
      if (error) throw error;
      return data as ClosedBankAccount[];
    }
  });

  // Fetch pending approval accounts
  const { data: pendingAccounts, isLoading: isLoadingPending } = useQuery({
    queryKey: ['pending_approval_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'PENDING_APPROVAL')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as BankAccount[];
    }
  });

  // Fetch subsidiaries/companies
  const { data: subsidiaries } = useQuery({
    queryKey: ['subsidiaries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subsidiaries')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('firm_name', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // Approve account mutation
  const approveAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      // Update account status to ACTIVE
      const { error: accountError } = await supabase
        .from('bank_accounts')
        .update({
          status: 'ACTIVE',
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);
      if (accountError) throw accountError;

      // Also resolve any related investigations
      const { error: investigationError } = await supabase
        .from('account_investigations')
        .update({
          status: 'RESOLVED',
          resolved_at: new Date().toISOString()
        })
        .eq('bank_account_id', accountId)
        .eq('status', 'ACTIVE');
      if (investigationError) throw investigationError;
    },
    onSuccess: () => {
      toast({
        title: "Account Approved",
        description: "Bank account has been approved and is now active. Related investigations have been resolved."
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['pending_approval_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['active_investigations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve account",
        variant: "destructive"
      });
    }
  });

  // Create bank account mutation
  const createAccountMutation = useMutation({
    mutationFn: async (accountData: typeof formData) => {
      const { error } = await supabase.from('bank_accounts').insert({
        account_name: accountData.account_name,
        bank_name: accountData.bank_name,
        account_number: accountData.account_number,
        IFSC: accountData.ifsc_code,
        branch: accountData.branch || null,
        balance: parseFloat(accountData.balance),
        lien_amount: accountData.lien_amount ? parseFloat(accountData.lien_amount) : 0,
        status: accountData.status,
        bank_account_holder_name: accountData.bank_account_holder_name || null,
        account_type: accountData.account_type,
        subsidiary_id: accountData.subsidiary_id || null
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Bank Account Created",
        description: "New bank account has been submitted for approval."
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['pending_approval_accounts'] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create bank account",
        variant: "destructive"
      });
    }
  });

  // Update bank account mutation
  const updateAccountMutation = useMutation({
    mutationFn: async (accountData: typeof formData & { id: string }) => {
      const { error } = await supabase.from('bank_accounts').update({
        account_name: accountData.account_name,
        bank_name: accountData.bank_name,
        account_number: accountData.account_number,
        IFSC: accountData.ifsc_code,
        branch: accountData.branch || null,
        balance: parseFloat(accountData.balance),
        lien_amount: accountData.lien_amount ? parseFloat(accountData.lien_amount) : 0,
        status: accountData.status,
        bank_account_holder_name: accountData.bank_account_holder_name || null,
        account_type: accountData.account_type,
        subsidiary_id: accountData.subsidiary_id || null,
        updated_at: new Date().toISOString()
      }).eq('id', accountData.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Bank Account Updated",
        description: "Bank account has been successfully updated."
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['pending_approval_accounts'] });
      resetForm();
      setIsAddDialogOpen(false);
      setEditingAccount(null);
    },
    onError: (error: any) => {
      if (error.message.includes('cannot be negative')) {
        toast({
          title: "Invalid Balance",
          description: "Bank account balance cannot be negative.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to update bank account",
          variant: "destructive"
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that a company is selected
    if (!formData.subsidiary_id) {
      toast({
        title: "Validation Error",
        description: "Please select a company for this bank account",
        variant: "destructive"
      });
      return;
    }
    
    if (editingAccount) {
      updateAccountMutation.mutate({ ...formData, id: editingAccount.id });
    } else {
      createAccountMutation.mutate(formData);
    }
  };

  const handleEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setFormData({
      account_name: account.account_name,
      bank_name: account.bank_name,
      account_number: account.account_number,
      ifsc_code: account.IFSC || "",
      branch: account.branch || "",
      balance: account.balance.toString(),
      lien_amount: (account.lien_amount || 0).toString(),
      status: account.status as "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL",
      bank_account_holder_name: account.bank_account_holder_name || "",
      account_type: account.account_type || "SAVINGS",
      subsidiary_id: account.subsidiary_id || ""
    });
    setIsAddDialogOpen(true);
  };

  const handleCloseAccount = (account: BankAccount) => {
    setAccountToClose(account);
    setCloseAccountDialogOpen(true);
  };

  const handleAccountClosed = () => {
    queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
    queryClient.invalidateQueries({ queryKey: ['closed_bank_accounts'] });
  };

  const resetForm = () => {
    setFormData({
      account_name: "",
      bank_name: "",
      account_number: "",
      ifsc_code: "",
      branch: "",
      balance: "",
      lien_amount: "",
      status: "PENDING_APPROVAL",
      bank_account_holder_name: "",
      account_type: "SAVINGS",
      subsidiary_id: ""
    });
    setEditingAccount(null);
  };

  // Filter and sort bank accounts
  const filteredAndSortedAccounts = useMemo(() => {
    if (!bankAccounts) return [];
    
    let filtered = bankAccounts.filter(account => {
      // Search filter
      const searchMatch = searchTerm === "" || 
        account.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        account.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        account.account_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (account.bank_account_holder_name && account.bank_account_holder_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (account.IFSC && account.IFSC.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (account.branch && account.branch.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Active only filter
      const statusMatch = !showActiveOnly || account.status === "ACTIVE";
      
      return searchMatch && statusMatch;
    });

    // Sort: Active accounts first, then inactive accounts
    filtered.sort((a, b) => {
      if (a.status === "ACTIVE" && b.status === "INACTIVE") return -1;
      if (a.status === "INACTIVE" && b.status === "ACTIVE") return 1;
      // If same status, sort by creation date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  }, [bankAccounts, searchTerm, showActiveOnly]);

  // Check permissions
  const hasManagePermission = hasPermission('bams_manage');
  const isViewOnly = !hasManagePermission;

  return (
    <div className="space-y-6 px-[15px]">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bank Account Management</h2>
          <p className="text-gray-600">Manage centralized bank accounts for receiving sales and purchase payments</p>
        </div>
        <ViewOnlyWrapper isViewOnly={isViewOnly}>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Bank Account
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingAccount ? "Edit Bank Account" : "Add New Bank Account"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="account_name">Account Name *</Label>
                  <Input 
                    id="account_name" 
                    value={formData.account_name} 
                    onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="bank_account_holder_name">Account Holder Name</Label>
                  <Input 
                    id="bank_account_holder_name" 
                    value={formData.bank_account_holder_name} 
                    onChange={(e) => setFormData(prev => ({ ...prev, bank_account_holder_name: e.target.value }))} 
                  />
                </div>
                <div>
                  <Label htmlFor="bank_name">Bank Name *</Label>
                  <Input 
                    id="bank_name" 
                    value={formData.bank_name} 
                    onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="account_number">Account Number *</Label>
                  <Input 
                    id="account_number" 
                    value={formData.account_number} 
                    onChange={(e) => setFormData(prev => ({ ...prev, account_number: e.target.value }))} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="ifsc_code">IFSC Code *</Label>
                  <Input 
                    id="ifsc_code" 
                    value={formData.ifsc_code} 
                    onChange={(e) => setFormData(prev => ({ ...prev, ifsc_code: e.target.value }))} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="branch">Branch</Label>
                  <Input 
                    id="branch" 
                    value={formData.branch} 
                    onChange={(e) => setFormData(prev => ({ ...prev, branch: e.target.value }))} 
                  />
                </div>
                <div>
                  <Label htmlFor="balance">Total Balance (₹) *</Label>
                  <Input 
                    id="balance" 
                    type="number" 
                    min="0" 
                    step="0.01" 
                    value={formData.balance} 
                    onChange={(e) => setFormData(prev => ({ ...prev, balance: e.target.value }))} 
                    required 
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Total Balance = Lien Amount + Available Balance
                  </p>
                </div>
                <div>
                  <Label htmlFor="lien_amount">Lien Amount (₹)</Label>
                  <Input 
                    id="lien_amount" 
                    type="number" 
                    min="0" 
                    step="0.01" 
                    value={formData.lien_amount} 
                    onChange={(e) => setFormData(prev => ({ ...prev, lien_amount: e.target.value }))}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Amount under lien/hold. Available Balance = Total Balance - Lien Amount
                  </p>
                </div>
                <div>
                  <Label htmlFor="status">Account Status *</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value: "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL") => setFormData(prev => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="account_type">Account Type *</Label>
                  <Select 
                    value={formData.account_type} 
                    onValueChange={(value: "SAVINGS" | "CURRENT") => setFormData(prev => ({ ...prev, account_type: value }))}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="SAVINGS">Savings</SelectItem>
                      <SelectItem value="CURRENT">Current</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="subsidiary_id">Company *</Label>
                  <Select 
                    value={formData.subsidiary_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, subsidiary_id: value }))}
                    required
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select Company" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      {subsidiaries?.map((subsidiary) => (
                        <SelectItem key={subsidiary.id} value={subsidiary.id}>
                          {subsidiary.firm_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select which company this bank account belongs to
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAccountMutation.isPending || updateAccountMutation.isPending}>
                  {createAccountMutation.isPending || updateAccountMutation.isPending ? "Processing..." : 
                   editingAccount ? "Update Account" : "Add Account"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </ViewOnlyWrapper>
      </div>

      <Tabs defaultValue="working" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="working">Working Bank Accounts ({bankAccounts?.length || 0})</TabsTrigger>
          <TabsTrigger value="pending">Pending Approval ({pendingAccounts?.length || 0})</TabsTrigger>
          <TabsTrigger value="closed">Closed Accounts ({closedAccounts?.length || 0})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="working">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <CardTitle>Active Bank Accounts</CardTitle>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-80">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search by account name, bank name, account number, holder name, IFSC..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-white border border-gray-300 shadow-sm"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="show-active-only"
                      checked={showActiveOnly}
                      onCheckedChange={(checked) => setShowActiveOnly(checked as boolean)}
                    />
                    <Label htmlFor="show-active-only" className="text-sm font-medium">
                      Show active only
                    </Label>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading bank accounts...</div>
              ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Account Holder</TableHead>
                        <TableHead>Bank Name</TableHead>
                        <TableHead>Account Type</TableHead>
                        <TableHead>Account Number</TableHead>
                        <TableHead>IFSC Code</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Total Balance</TableHead>
                        <TableHead>Lien Amount</TableHead>
                        <TableHead>Available Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedAccounts?.map((account) => (
                        <TableRow key={account.id} className={account.status === "INACTIVE" ? "bg-gray-50" : ""}>
                          <TableCell className="font-medium">{account.account_name}</TableCell>
                          <TableCell>{account.bank_account_holder_name || "-"}</TableCell>
                          <TableCell>{account.bank_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={account.account_type === "SAVINGS" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}>
                              {account.account_type === "SAVINGS" ? "Savings" : "Current"}
                            </Badge>
                          </TableCell>
                          <TableCell>{account.account_number}</TableCell>
                          <TableCell>{account.IFSC}</TableCell>
                          <TableCell>{account.branch || "-"}</TableCell>
                          <TableCell className={(((account as any).computed_balance ?? account.balance) as number) < 0 ? "text-red-600 font-bold" : ""}>
                            ₹{((((account as any).computed_balance ?? account.balance) as number) || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-orange-600 font-medium">
                            ₹{((account.lien_amount || 0) as number).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-green-600 font-bold">
                            ₹{((((account as any).computed_balance ?? account.balance) as number) - ((account.lien_amount || 0) as number)).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={account.status === "ACTIVE" ? "default" : "destructive"}>
                              {account.status === "ACTIVE" ? (
                                <><Eye className="h-3 w-3 mr-1" /> Active</>
                              ) : (
                                <><EyeOff className="h-3 w-3 mr-1" /> Inactive</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <PermissionGate permissions={["bams_manage"]} showFallback={false}>
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleEdit(account)} 
                                  className="flex items-center gap-1"
                                >
                                  <Edit className="h-3 w-3" />
                                  Edit
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm" 
                                  onClick={() => handleCloseAccount(account)}
                                  className="flex items-center gap-1"
                                >
                                  <X className="h-3 w-3" />
                                  Close
                                </Button>
                              </div>
                            </PermissionGate>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredAndSortedAccounts?.length === 0 && bankAccounts?.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                            No bank accounts match your search criteria. Try adjusting your search terms or filters.
                          </TableCell>
                        </TableRow>
                      )}
                      {bankAccounts?.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                            No active bank accounts found. Add your first bank account to get started.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closed">
          <Card>
            <CardHeader>
              <CardTitle>Closed Bank Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingClosed ? (
                <div className="text-center py-8">Loading closed accounts...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Bank Name</TableHead>
                      <TableHead>Account Number</TableHead>
                      <TableHead>Final Balance</TableHead>
                      <TableHead>Closure Date</TableHead>
                      <TableHead>Closure Reason</TableHead>
                      <TableHead>Closed By</TableHead>
                      <TableHead>Documents</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closedAccounts?.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.account_name}</TableCell>
                        <TableCell>{account.bank_name}</TableCell>
                        <TableCell>{account.account_number}</TableCell>
                        <TableCell>₹{account.final_balance.toLocaleString()}</TableCell>
                        <TableCell>{new Date(account.closure_date).toLocaleDateString()}</TableCell>
                        <TableCell className="max-w-xs truncate" title={account.closure_reason}>
                          {account.closure_reason}
                        </TableCell>
                        <TableCell>{account.closed_by || "-"}</TableCell>
                        <TableCell>
                          {account.closure_documents?.length > 0 ? (
                            <Badge variant="outline">{account.closure_documents.length} files</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {closedAccounts?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          No closed accounts found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Accounts Pending Officer Approval</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingPending ? (
                <div className="text-center py-8">Loading pending accounts...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Account Holder</TableHead>
                      <TableHead>Bank Name</TableHead>
                      <TableHead>Account Number</TableHead>
                      <TableHead>IFSC Code</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingAccounts?.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.account_name}</TableCell>
                        <TableCell>{account.bank_account_holder_name || "-"}</TableCell>
                        <TableCell>{account.bank_name}</TableCell>
                        <TableCell>{account.account_number}</TableCell>
                        <TableCell>{account.IFSC}</TableCell>
                        <TableCell>{account.branch || "-"}</TableCell>
                        <TableCell className={account.balance < 0 ? "text-red-600 font-bold" : ""}>
                          ₹{account.balance.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            Pending Approval
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <PermissionGate permissions={["bams_manage"]} showFallback={false}>
                            <Button 
                              variant="default" 
                              size="sm" 
                              onClick={() => approveAccountMutation.mutate(account.id)}
                              disabled={approveAccountMutation.isPending}
                              className="flex items-center gap-1"
                            >
                              <Eye className="h-3 w-3" />
                              {approveAccountMutation.isPending ? "Approving..." : "Approve Account"}
                            </Button>
                          </PermissionGate>
                        </TableCell>
                      </TableRow>
                    ))}
                     {pendingAccounts?.length === 0 && (
                       <TableRow>
                         <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                           No accounts pending approval.
                         </TableCell>
                       </TableRow>
                     )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CloseAccountDialog
        isOpen={closeAccountDialogOpen}
        onClose={() => {
          setCloseAccountDialogOpen(false);
          setAccountToClose(null);
        }}
        account={accountToClose}
        onAccountClosed={handleAccountClosed}
      />
    </div>
  );
}