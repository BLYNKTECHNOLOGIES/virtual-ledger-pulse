import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { 
  User, 
  Building2, 
  Calendar, 
  IndianRupee, 
  TrendingUp, 
  CreditCard, 
  Shield, 
  Clock,
  FileText,
  PlusCircle,
  Settings,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Users,
  DollarSign,
  PiggyBank,
  Receipt,
  Timer,
  Wallet,
  CalendarDays,
  Target
} from 'lucide-react';

interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  IFSC?: string;
  branch?: string;
}

interface LeaveRequest {
  id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  applied_at: string;
}

export default function UserProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [newBankAccount, setNewBankAccount] = useState({
    account_name: '',
    account_number: '',
    bank_name: '',
    ifsc_code: '',
    branch: ''
  });
  const [leaveRequest, setLeaveRequest] = useState({
    leave_type: '',
    from_date: '',
    to_date: '',
    reason: ''
  });
  const [hikeRequest, setHikeRequest] = useState({
    current_salary: '',
    requested_salary: '',
    reason: '',
    justification: ''
  });

  // Fetch employee data
  const { data: employeeData, isLoading: employeeLoading } = useQuery({
    queryKey: ['employee_profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('employees')
        .select(`
          *,
          departments(name, icon),
          positions(title)
        `)
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch bank accounts
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['user_bank_accounts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch leave requests
  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['user_leave_requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // This would need a proper leave_requests table
      return [] as LeaveRequest[];
    },
    enabled: !!user?.id,
  });

  // Add bank account mutation
  const addBankAccountMutation = useMutation({
    mutationFn: async (bankData: typeof newBankAccount) => {
      const { error } = await supabase
        .from('bank_accounts')
        .insert({
          ...bankData,
          created_by: user?.id,
          status: 'ACTIVE',
          balance: 0
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Bank account added successfully" });
      setNewBankAccount({ account_name: '', account_number: '', bank_name: '', ifsc_code: '', branch: '' });
      setIsEditingBank(false);
      queryClient.invalidateQueries({ queryKey: ['user_bank_accounts'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Apply for leave mutation
  const applyLeaveMutation = useMutation({
    mutationFn: async (leaveData: typeof leaveRequest) => {
      // This would need a proper leave_requests table
      console.log('Apply for leave:', leaveData);
      throw new Error('Leave requests table not implemented yet');
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Leave request submitted successfully" });
      setLeaveRequest({ leave_type: '', from_date: '', to_date: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['user_leave_requests'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Apply for hike mutation
  const applyHikeMutation = useMutation({
    mutationFn: async (hikeData: typeof hikeRequest) => {
      // This would need a proper salary_hike_requests table
      console.log('Apply for hike:', hikeData);
      throw new Error('Salary hike requests table not implemented yet');
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Salary hike request submitted successfully" });
      setHikeRequest({ current_salary: '', requested_salary: '', reason: '', justification: '' });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'INACTIVE': return 'bg-red-100 text-red-800';
      case 'ON_LEAVE': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (employeeLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!employeeData) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="text-center py-12">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Employee Profile Found</h3>
            <p className="text-gray-600">Please contact HR to set up your employee profile.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const joiningDate = new Date(employeeData.date_of_joining);
  const totalWorkingDays = Math.floor((Date.now() - joiningDate.getTime()) / (1000 * 60 * 60 * 24));
  const workingYears = Math.floor(totalWorkingDays / 365);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-6">
          <Avatar className="h-24 w-24 border-4 border-white/20">
            <AvatarFallback className="text-2xl font-bold bg-white/20 text-white">
              {getInitials(employeeData.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{employeeData.name}</h1>
            <p className="text-lg opacity-90 mb-2">{employeeData.designation}</p>
            <div className="flex items-center gap-4 text-sm opacity-80">
              <div className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                <span>{employeeData.departments?.name || employeeData.department}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Joined {joiningDate.toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-1">
                <Timer className="h-4 w-4" />
                <span>{workingYears} years experience</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <Badge className={`${getStatusColor(employeeData.status)} mb-2`}>
              {employeeData.status}
            </Badge>
            <p className="text-2xl font-bold">₹{employeeData.salary?.toLocaleString()}</p>
            <p className="text-sm opacity-80">Current Salary</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CalendarDays className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalWorkingDays}</p>
                <p className="text-sm text-gray-600">Total Working Days</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Target className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-gray-600">Leave Balance</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <PiggyBank className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{(employeeData.salary * 0.12).toLocaleString()}</p>
                <p className="text-sm text-gray-600">PF Contribution</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Wallet className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bankAccounts.length}</p>
                <p className="text-sm text-gray-600">Bank Accounts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="salary">Salary & PF</TabsTrigger>
          <TabsTrigger value="banking">Banking</TabsTrigger>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Employee ID</Label>
                  <Input value={employeeData.employee_id} disabled />
                </div>
                <div>
                  <Label>Full Name</Label>
                  <Input value={employeeData.name} disabled />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={employeeData.email} disabled />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={employeeData.phone || 'Not provided'} disabled />
                </div>
                <div>
                  <Label>Department</Label>
                  <Input value={employeeData.departments?.name || employeeData.department} disabled />
                </div>
                <div>
                  <Label>Position</Label>
                  <Input value={employeeData.positions?.title || employeeData.designation} disabled />
                </div>
                <div>
                  <Label>Date of Joining</Label>
                  <Input value={new Date(employeeData.date_of_joining).toLocaleDateString()} disabled />
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge className={getStatusColor(employeeData.status)}>
                    {employeeData.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Salary & PF Tab */}
        <TabsContent value="salary" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5" />
                  Salary Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Salary</Label>
                  <div className="text-2xl font-bold text-green-600">₹{employeeData.salary?.toLocaleString()}</div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Basic Salary (50%)</Label>
                  <div className="text-lg">₹{(employeeData.salary * 0.5).toLocaleString()}</div>
                </div>
                <div className="space-y-2">
                  <Label>HRA (30%)</Label>
                  <div className="text-lg">₹{(employeeData.salary * 0.3).toLocaleString()}</div>
                </div>
                <div className="space-y-2">
                  <Label>Other Allowances (20%)</Label>
                  <div className="text-lg">₹{(employeeData.salary * 0.2).toLocaleString()}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5" />
                  PF Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Employee PF Contribution (12%)</Label>
                  <div className="text-xl font-semibold">₹{(employeeData.salary * 0.12).toLocaleString()}</div>
                </div>
                <div className="space-y-2">
                  <Label>Employer PF Contribution (12%)</Label>
                  <div className="text-xl font-semibold">₹{(employeeData.salary * 0.12).toLocaleString()}</div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Monthly PF Total</Label>
                  <div className="text-xl font-bold text-blue-600">₹{(employeeData.salary * 0.24).toLocaleString()}</div>
                </div>
                <div className="space-y-2">
                  <Label>Estimated Annual PF</Label>
                  <div className="text-lg">₹{(employeeData.salary * 0.24 * 12).toLocaleString()}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Banking Tab */}
        <TabsContent value="banking" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Bank Accounts</h3>
            <Button 
              onClick={() => setIsEditingBank(true)}
              className="flex items-center gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              Add Bank Account
            </Button>
          </div>

          {isEditingBank && (
            <Card>
              <CardHeader>
                <CardTitle>Add New Bank Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Account Holder Name</Label>
                    <Input
                      value={newBankAccount.account_name}
                      onChange={(e) => setNewBankAccount(prev => ({ ...prev, account_name: e.target.value }))}
                      placeholder="Enter account holder name"
                    />
                  </div>
                  <div>
                    <Label>Account Number</Label>
                    <Input
                      value={newBankAccount.account_number}
                      onChange={(e) => setNewBankAccount(prev => ({ ...prev, account_number: e.target.value }))}
                      placeholder="Enter account number"
                    />
                  </div>
                  <div>
                    <Label>Bank Name</Label>
                    <Input
                      value={newBankAccount.bank_name}
                      onChange={(e) => setNewBankAccount(prev => ({ ...prev, bank_name: e.target.value }))}
                      placeholder="Enter bank name"
                    />
                  </div>
                  <div>
                    <Label>IFSC Code</Label>
                    <Input
                      value={newBankAccount.ifsc_code}
                      onChange={(e) => setNewBankAccount(prev => ({ ...prev, ifsc_code: e.target.value }))}
                      placeholder="Enter IFSC code"
                    />
                  </div>
                  <div>
                    <Label>Branch</Label>
                    <Input
                      value={newBankAccount.branch}
                      onChange={(e) => setNewBankAccount(prev => ({ ...prev, branch: e.target.value }))}
                      placeholder="Enter branch name"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => addBankAccountMutation.mutate(newBankAccount)}
                    disabled={addBankAccountMutation.isPending}
                  >
                    {addBankAccountMutation.isPending ? 'Adding...' : 'Add Account'}
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditingBank(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bankAccounts.map((account) => (
              <Card key={account.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CreditCard className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{account.bank_name}</h4>
                      <p className="text-sm text-gray-600">{account.account_name}</p>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">Account:</span> {account.account_number}</p>
                    <p><span className="font-medium">IFSC:</span> {account.IFSC}</p>
                    <p><span className="font-medium">Branch:</span> {account.branch}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {bankAccounts.length === 0 && !isEditingBank && (
            <Card>
              <CardContent className="text-center py-12">
                <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Bank Accounts</h3>
                <p className="text-gray-600 mb-4">Add your bank account details for salary payments</p>
                <Button onClick={() => setIsEditingBank(true)}>Add Bank Account</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Leaves Tab */}
        <TabsContent value="leaves" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Apply for Leave
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Leave Type</Label>
                  <Select value={leaveRequest.leave_type} onValueChange={(value) => setLeaveRequest(prev => ({ ...prev, leave_type: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select leave type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual Leave</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="annual">Annual Leave</SelectItem>
                      <SelectItem value="emergency">Emergency Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>From Date</Label>
                    <Input
                      type="date"
                      value={leaveRequest.from_date}
                      onChange={(e) => setLeaveRequest(prev => ({ ...prev, from_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>To Date</Label>
                    <Input
                      type="date"
                      value={leaveRequest.to_date}
                      onChange={(e) => setLeaveRequest(prev => ({ ...prev, to_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Textarea
                    value={leaveRequest.reason}
                    onChange={(e) => setLeaveRequest(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="Enter reason for leave"
                  />
                </div>
                <Button 
                  onClick={() => applyLeaveMutation.mutate(leaveRequest)}
                  disabled={applyLeaveMutation.isPending}
                  className="w-full"
                >
                  {applyLeaveMutation.isPending ? 'Submitting...' : 'Submit Leave Request'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Leave Balance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span>Casual Leave</span>
                    <Badge variant="outline">12 days</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Sick Leave</span>
                    <Badge variant="outline">10 days</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Annual Leave</span>
                    <Badge variant="outline">20 days</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Emergency Leave</span>
                    <Badge variant="outline">5 days</Badge>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between items-center font-semibold">
                  <span>Total Available</span>
                  <Badge>47 days</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Leave History</CardTitle>
            </CardHeader>
            <CardContent>
              {leaveRequests.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No leave requests found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leaveRequests.map((leave) => (
                    <div key={leave.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{leave.leave_type}</p>
                        <p className="text-sm text-gray-600">{leave.from_date} to {leave.to_date}</p>
                      </div>
                      <Badge className={leave.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                        {leave.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Apply for Salary Hike
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Current Salary</Label>
                  <Input
                    type="number"
                    value={hikeRequest.current_salary}
                    onChange={(e) => setHikeRequest(prev => ({ ...prev, current_salary: e.target.value }))}
                    placeholder={employeeData.salary?.toString()}
                  />
                </div>
                <div>
                  <Label>Requested Salary</Label>
                  <Input
                    type="number"
                    value={hikeRequest.requested_salary}
                    onChange={(e) => setHikeRequest(prev => ({ ...prev, requested_salary: e.target.value }))}
                    placeholder="Enter requested amount"
                  />
                </div>
              </div>
              <div>
                <Label>Reason for Hike</Label>
                <Select value={hikeRequest.reason} onValueChange={(value) => setHikeRequest(prev => ({ ...prev, reason: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="performance">Performance Based</SelectItem>
                    <SelectItem value="promotion">Promotion</SelectItem>
                    <SelectItem value="market_adjustment">Market Adjustment</SelectItem>
                    <SelectItem value="additional_responsibilities">Additional Responsibilities</SelectItem>
                    <SelectItem value="annual_review">Annual Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Justification</Label>
                <Textarea
                  value={hikeRequest.justification}
                  onChange={(e) => setHikeRequest(prev => ({ ...prev, justification: e.target.value }))}
                  placeholder="Provide detailed justification for the salary hike"
                  rows={4}
                />
              </div>
              <Button 
                onClick={() => applyHikeMutation.mutate(hikeRequest)}
                disabled={applyHikeMutation.isPending}
                className="w-full"
              >
                {applyHikeMutation.isPending ? 'Submitting...' : 'Submit Hike Request'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Employee Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { name: 'Employment Contract', status: 'Available', date: '2023-01-15' },
                  { name: 'Offer Letter', status: 'Available', date: '2022-12-20' },
                  { name: 'Salary Certificate', status: 'Generate', date: '' },
                  { name: 'Experience Letter', status: 'Request', date: '' },
                ].map((doc, index) => (
                  <div key={index} className="border rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        {doc.date && <p className="text-sm text-gray-600">Generated: {doc.date}</p>}
                      </div>
                    </div>
                    <Button variant={doc.status === 'Available' ? 'default' : 'outline'} size="sm">
                      {doc.status}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}