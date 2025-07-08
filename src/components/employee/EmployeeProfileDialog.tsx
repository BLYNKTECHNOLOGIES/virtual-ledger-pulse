import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  User, 
  CreditCard, 
  TrendingUp, 
  Receipt, 
  Calendar, 
  Clock, 
  Building2, 
  Mail, 
  Phone, 
  MapPin, 
  DollarSign,
  PiggyBank,
  FileText,
  Plus,
  Eye,
  Edit,
  CalendarDays,
  Target
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface EmployeeProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeProfileDialog({ open, onOpenChange }: EmployeeProfileDialogProps) {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState('profile');

  // Mock employee data - in real app, fetch from API
  const employeeData = {
    personalInfo: {
      name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username || '',
      email: user?.email || '',
      phone: '+91 9876543210',
      employeeId: 'EMP001',
      department: 'Technology',
      designation: 'Software Engineer',
      joiningDate: '2023-01-15',
      reportingManager: 'John Smith',
      workLocation: 'Bangalore, India'
    },
    salaryInfo: {
      currentSalary: 85000,
      basicSalary: 50000,
      hra: 20000,
      allowances: 15000,
      lastHikeDate: '2023-01-01',
      nextReviewDate: '2024-01-01'
    },
    pfDetails: {
      pfNumber: 'PF123456789',
      employeeContribution: 6000,
      employerContribution: 6000,
      totalBalance: 145000,
      nomineeDetails: 'Jane Doe (Spouse)'
    },
    leaveBalance: {
      casualLeave: 8,
      sickLeave: 6,
      privilegeLeave: 12,
      maternityLeave: 0,
      totalWorkedDays: 245,
      totalDaysInYear: 365
    },
    bankAccounts: [
      {
        id: 1,
        bankName: 'HDFC Bank',
        accountNumber: '****1234',
        ifsc: 'HDFC0001234',
        accountType: 'Savings',
        isPrimary: true
      }
    ]
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            Employee Profile
          </DialogTitle>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="profile" className="text-xs">
              <User className="h-4 w-4 mr-1" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="salary" className="text-xs">
              <DollarSign className="h-4 w-4 mr-1" />
              Salary
            </TabsTrigger>
            <TabsTrigger value="bank" className="text-xs">
              <CreditCard className="h-4 w-4 mr-1" />
              Banking
            </TabsTrigger>
            <TabsTrigger value="pf" className="text-xs">
              <PiggyBank className="h-4 w-4 mr-1" />
              PF Details
            </TabsTrigger>
            <TabsTrigger value="leave" className="text-xs">
              <Calendar className="h-4 w-4 mr-1" />
              Leave
            </TabsTrigger>
            <TabsTrigger value="requests" className="text-xs">
              <FileText className="h-4 w-4 mr-1" />
              Requests
            </TabsTrigger>
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
              <CardContent className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input value={employeeData.personalInfo.name} readOnly />
                  </div>
                  <div>
                    <Label>Employee ID</Label>
                    <Input value={employeeData.personalInfo.employeeId} readOnly />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={employeeData.personalInfo.email} readOnly />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={employeeData.personalInfo.phone} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Department</Label>
                    <Input value={employeeData.personalInfo.department} readOnly />
                  </div>
                  <div>
                    <Label>Designation</Label>
                    <Input value={employeeData.personalInfo.designation} readOnly />
                  </div>
                  <div>
                    <Label>Joining Date</Label>
                    <Input value={employeeData.personalInfo.joiningDate} readOnly />
                  </div>
                  <div>
                    <Label>Reporting Manager</Label>
                    <Input value={employeeData.personalInfo.reportingManager} readOnly />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Salary Tab */}
          <TabsContent value="salary" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Current Salary Structure
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Basic Salary</span>
                    <span className="font-semibold">₹{employeeData.salaryInfo.basicSalary.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">HRA</span>
                    <span className="font-semibold">₹{employeeData.salaryInfo.hra.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Allowances</span>
                    <span className="font-semibold">₹{employeeData.salaryInfo.allowances.toLocaleString()}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total Salary</span>
                    <span className="font-bold text-lg text-green-600">₹{employeeData.salaryInfo.currentSalary.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Salary Hike Request
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Requested Amount</Label>
                    <Input placeholder="Enter requested salary" />
                  </div>
                  <div>
                    <Label>Justification</Label>
                    <Textarea placeholder="Explain why you deserve a hike..." rows={4} />
                  </div>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Submit Hike Request
                  </Button>
                  <div className="text-sm text-gray-600">
                    <p>Last Hike: {employeeData.salaryInfo.lastHikeDate}</p>
                    <p>Next Review: {employeeData.salaryInfo.nextReviewDate}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Banking Tab */}
          <TabsContent value="bank" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Bank Accounts
                </CardTitle>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Account
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {employeeData.bankAccounts.map((account) => (
                    <div key={account.id} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{account.bankName}</h4>
                            {account.isPrimary && (
                              <Badge variant="default" className="text-xs">Primary</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">Account: {account.accountNumber}</p>
                          <p className="text-sm text-gray-600">IFSC: {account.ifsc}</p>
                          <p className="text-sm text-gray-600">Type: {account.accountType}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PF Details Tab */}
          <TabsContent value="pf" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5" />
                  Provident Fund Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label>PF Number</Label>
                    <Input value={employeeData.pfDetails.pfNumber} readOnly />
                  </div>
                  <div>
                    <Label>Nominee</Label>
                    <Input value={employeeData.pfDetails.nomineeDetails} readOnly />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">Employee Contribution</p>
                    <p className="text-xl font-bold text-blue-600">₹{employeeData.pfDetails.employeeContribution.toLocaleString()}</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">Employer Contribution</p>
                    <p className="text-xl font-bold text-green-600">₹{employeeData.pfDetails.employerContribution.toLocaleString()}</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-gray-600">Total Balance</p>
                    <p className="text-xl font-bold text-purple-600">₹{employeeData.pfDetails.totalBalance.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leave Tab */}
          <TabsContent value="leave" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Leave Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Casual Leave</span>
                      <Badge variant="outline">{employeeData.leaveBalance.casualLeave} days</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Sick Leave</span>
                      <Badge variant="outline">{employeeData.leaveBalance.sickLeave} days</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Privilege Leave</span>
                      <Badge variant="outline">{employeeData.leaveBalance.privilegeLeave} days</Badge>
                    </div>
                    <hr />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Total Worked Days</span>
                      <span className="font-semibold">{employeeData.leaveBalance.totalWorkedDays} days</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Apply for Leave
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Leave Type</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select leave type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="casual">Casual Leave</SelectItem>
                        <SelectItem value="sick">Sick Leave</SelectItem>
                        <SelectItem value="privilege">Privilege Leave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>From Date</Label>
                      <Input type="date" />
                    </div>
                    <div>
                      <Label>To Date</Label>
                      <Input type="date" />
                    </div>
                  </div>
                  <div>
                    <Label>Reason</Label>
                    <Textarea placeholder="Enter reason for leave..." rows={3} />
                  </div>
                  <Button className="w-full bg-green-600 hover:bg-green-700">
                    <Calendar className="h-4 w-4 mr-2" />
                    Submit Leave Application
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  My Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No requests found</p>
                  <p className="text-sm">Your salary hike and leave requests will appear here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}