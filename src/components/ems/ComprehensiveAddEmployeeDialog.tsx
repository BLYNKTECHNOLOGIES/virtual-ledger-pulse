import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Upload, User, Building, CreditCard, FileText, Shield } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ComprehensiveAddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EmployeeFormData {
  // Personal Information
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: Date | undefined;
  bloodGroup: string;
  maritalStatus: string;
  phone: string;
  alternatePhone: string;
  email: string;
  currentAddress: string;
  permanentAddress: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactNumber: string;

  // Employment Details
  department: string;
  designation: string;
  dateOfJoining: Date | undefined;
  reportingManager: string;
  workLocation: string;
  employeeType: string;
  probationPeriod: boolean;
  probationDurationMonths: number;

  // Salary & Banking Details
  panNumber: string;
  aadhaarNumber: string;
  bankAccountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  upiId: string;
  ctc: string;
  basicSalary: string;
  allowances: string;
  incentives: string;
  deductions: string;

  // Documents (URLs will be stored)
  aadhaarCardUrl: string;
  panCardUrl: string;
  photoUrl: string;
  resumeUrl: string;
  offerLetterUrl: string;
  otherCertificatesUrls: string[];

  // Compliance & Policy Acknowledgement
  ndaAcknowledged: boolean;
  handbookAcknowledged: boolean;
  jobContractSigned: boolean;
}

const initialFormData: EmployeeFormData = {
  firstName: "", middleName: "", lastName: "", gender: "", dateOfBirth: undefined,
  bloodGroup: "", maritalStatus: "", phone: "", alternatePhone: "", email: "",
  currentAddress: "", permanentAddress: "", emergencyContactName: "",
  emergencyContactRelation: "", emergencyContactNumber: "", department: "",
  designation: "", dateOfJoining: undefined, reportingManager: "", workLocation: "",
  employeeType: "", probationPeriod: false, probationDurationMonths: 0,
  panNumber: "", aadhaarNumber: "", bankAccountHolderName: "", bankName: "",
  accountNumber: "", ifscCode: "", upiId: "", ctc: "", basicSalary: "",
  allowances: "", incentives: "", deductions: "", aadhaarCardUrl: "",
  panCardUrl: "", photoUrl: "", resumeUrl: "", offerLetterUrl: "",
  otherCertificatesUrls: [], ndaAcknowledged: false, handbookAcknowledged: false, jobContractSigned: false
};

export function ComprehensiveAddEmployeeDialog({ open, onOpenChange }: ComprehensiveAddEmployeeDialogProps) {
  const [formData, setFormData] = useState<EmployeeFormData>(initialFormData);
  const [currentTab, setCurrentTab] = useState("personal");
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const departments = [
    "Operations", "Finance", "Compliance", "Administrative", "Support Staff"
  ];

  const genders = ["Male", "Female", "Other"];
  const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  const maritalStatuses = ["Single", "Married", "Divorced", "Widowed"];
  const employeeTypes = ["Full-time", "Part-time", "Contract", "Intern", "Consultant"];
  const workLocations = ["Office", "Remote", "Hybrid"];

  // Generate employee ID
  const generateEmployeeId = async (department: string, designation: string) => {
    try {
      const { data, error } = await supabase.rpc('generate_employee_id', {
        dept: department,
        designation: designation
      });

      if (error) {
        console.error('Error generating employee ID:', error);
        return `EMP${Date.now()}`;
      }

      return data as string;
    } catch (error) {
      console.error('Error calling generate_employee_id:', error);
      return `EMP${Date.now()}`;
    }
  };

  const addEmployeeMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      console.log('🔄 Starting employee registration...', data);
      
      // Generate employee ID
      const employeeId = await generateEmployeeId(data.department, data.designation);
      console.log('✅ Generated employee ID:', employeeId);
      
      // Generate a UUID for user_id since it's required
      const tempUserId = crypto.randomUUID();
      console.log('✅ Generated temp user ID:', tempUserId);
      
      const employeeData = {
        employee_id: employeeId,
        name: `${data.firstName} ${data.middleName} ${data.lastName}`.trim(),
        email: data.email,
        phone: data.phone,
        alternate_phone: data.alternatePhone,
        department: data.department,
        designation: data.designation,
        date_of_joining: data.dateOfJoining?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        date_of_birth: data.dateOfBirth?.toISOString().split('T')[0],
        gender: data.gender,
        blood_group: data.bloodGroup,
        marital_status: data.maritalStatus,
        current_address: data.currentAddress,
        permanent_address: data.permanentAddress,
        emergency_contact_name: data.emergencyContactName,
        emergency_contact_relation: data.emergencyContactRelation,
        emergency_contact_number: data.emergencyContactNumber,
        work_location: data.workLocation,
        employee_type: data.employeeType,
        probation_period: data.probationPeriod,
        probation_duration_months: data.probationDurationMonths,
        pan_number: data.panNumber,
        aadhaar_number: data.aadhaarNumber,
        bank_account_holder_name: data.bankAccountHolderName,
        bank_name: data.bankName,
        account_number: data.accountNumber,
        ifsc_code: data.ifscCode,
        upi_id: data.upiId,
        ctc: data.ctc ? parseFloat(data.ctc) : 0,
        basic_salary: data.basicSalary ? parseFloat(data.basicSalary) : 0,
        allowances: data.allowances ? parseFloat(data.allowances) : 0,
        incentives: data.incentives ? parseFloat(data.incentives) : 0,
        deductions: data.deductions ? parseFloat(data.deductions) : 0,
        salary: data.ctc ? parseFloat(data.ctc) : 50000, // Default salary
        aadhaar_card_url: data.aadhaarCardUrl,
        pan_card_url: data.panCardUrl,
        photo_url: data.photoUrl,
        resume_url: data.resumeUrl,
        offer_letter_url: data.offerLetterUrl,
        other_certificates_urls: Array.isArray(data.otherCertificatesUrls) ? data.otherCertificatesUrls : [],
        nda_acknowledged: data.ndaAcknowledged,
        nda_acknowledged_at: data.ndaAcknowledged ? new Date().toISOString() : null,
        handbook_acknowledged: data.handbookAcknowledged,
        handbook_acknowledged_at: data.handbookAcknowledged ? new Date().toISOString() : null,
        job_contract_signed: data.jobContractSigned,
        status: 'ACTIVE' as const,
        user_id: tempUserId
      };
      
      console.log('📝 Employee data to insert:', employeeData);
      
      const { data: insertResult, error } = await supabase
        .from('employees')
        .insert([employeeData])
        .select();
      
      if (error) {
        console.error('❌ Database error:', error);
        throw error;
      }
      
      console.log('✅ Employee inserted successfully:', insertResult);
      return insertResult;
    },
    onSuccess: (result) => {
      console.log('✅ Mutation successful:', result);
      queryClient.invalidateQueries({ queryKey: ['employees_data'] });
      toast.success("Employee added successfully!");
      onOpenChange(false);
      setFormData(initialFormData);
      setCurrentTab("personal");
    },
    onError: (error) => {
      console.error('❌ Mutation error:', error);
      toast.error(`Failed to add employee: ${error.message || 'Unknown error'}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addEmployeeMutation.mutate(formData);
  };

  const updateFormData = (field: keyof EmployeeFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // File upload handler
  const handleFileUpload = async (file: File, fieldName: keyof EmployeeFormData) => {
    try {
      setUploading(prev => ({ ...prev, [fieldName]: true }));
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `employee-documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('employee-documents')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('employee-documents')
        .getPublicUrl(filePath);

      updateFormData(fieldName, data.publicUrl);
      toast.success(`${fieldName} uploaded successfully!`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload ${fieldName}`);
    } finally {
      setUploading(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const createFileUploadArea = (fieldName: keyof EmployeeFormData, label: string, acceptedFiles: string, allowMultiple = false) => {
    const isUploading = uploading[fieldName];
    const hasFile = formData[fieldName];
    
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
          <input
            type="file"
            accept={acceptedFiles}
            multiple={allowMultiple}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file, fieldName);
              }
            }}
            className="hidden"
            id={`file-${fieldName}`}
          />
          <label htmlFor={`file-${fieldName}`} className="cursor-pointer">
            {isUploading ? (
              <>
                <div className="animate-spin h-8 w-8 mx-auto mb-2 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <p className="text-sm text-blue-600">Uploading...</p>
              </>
            ) : hasFile ? (
              <>
                <FileText className="h-8 w-8 mx-auto mb-2 text-green-600" />
                <p className="text-sm text-green-600">File uploaded</p>
                <p className="text-xs text-gray-400">Click to replace</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">Click to upload {label.toLowerCase()}</p>
                <p className="text-xs text-gray-400">{acceptedFiles}</p>
              </>
            )}
          </label>
        </div>
      </div>
    );
  };

  const nextTab = () => {
    const tabs = ["personal", "employment", "salary", "documents", "compliance"];
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex < tabs.length - 1) {
      setCurrentTab(tabs[currentIndex + 1]);
    }
  };

  const prevTab = () => {
    const tabs = ["personal", "employment", "salary", "documents", "compliance"];
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex > 0) {
      setCurrentTab(tabs[currentIndex - 1]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6 text-primary" />
            📋 Add New Employee
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="personal" className="flex items-center gap-1">
                <User className="h-4 w-4" />
                Personal
              </TabsTrigger>
              <TabsTrigger value="employment" className="flex items-center gap-1">
                <Building className="h-4 w-4" />
                Employment
              </TabsTrigger>
              <TabsTrigger value="salary" className="flex items-center gap-1">
                <CreditCard className="h-4 w-4" />
                Salary
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="compliance" className="flex items-center gap-1">
                <Shield className="h-4 w-4" />
                Compliance
              </TabsTrigger>
            </TabsList>

            {/* Personal Information Tab */}
            <TabsContent value="personal" className="space-y-4">
              <h3 className="text-lg font-semibold text-primary">👤 Personal Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => updateFormData('firstName', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="middleName">Middle Name</Label>
                  <Input
                    id="middleName"
                    value={formData.middleName}
                    onChange={(e) => updateFormData('middleName', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => updateFormData('lastName', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Gender *</Label>
                  <Select value={formData.gender} onValueChange={(value) => updateFormData('gender', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {genders.map(gender => (
                        <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date of Birth *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.dateOfBirth && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dateOfBirth ? format(formData.dateOfBirth, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.dateOfBirth}
                        onSelect={(date) => updateFormData('dateOfBirth', date)}
                        initialFocus
                        captionLayout="dropdown-buttons"
                        fromYear={1940}
                        toYear={new Date().getFullYear()}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Blood Group</Label>
                  <Select value={formData.bloodGroup} onValueChange={(value) => updateFormData('bloodGroup', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                    <SelectContent>
                      {bloodGroups.map(group => (
                        <SelectItem key={group} value={group}>{group}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Marital Status</Label>
                  <Select value={formData.maritalStatus} onValueChange={(value) => updateFormData('maritalStatus', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select marital status" />
                    </SelectTrigger>
                    <SelectContent>
                      {maritalStatuses.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateFormData('email', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Contact Number *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => updateFormData('phone', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="alternatePhone">Alternate Contact</Label>
                  <Input
                    id="alternatePhone"
                    value={formData.alternatePhone}
                    onChange={(e) => updateFormData('alternatePhone', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="currentAddress">Current Address</Label>
                  <Textarea
                    id="currentAddress"
                    value={formData.currentAddress}
                    onChange={(e) => updateFormData('currentAddress', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="permanentAddress">Permanent Address</Label>
                  <Textarea
                    id="permanentAddress"
                    value={formData.permanentAddress}
                    onChange={(e) => updateFormData('permanentAddress', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="emergencyContactName">Emergency Contact Name</Label>
                  <Input
                    id="emergencyContactName"
                    value={formData.emergencyContactName}
                    onChange={(e) => updateFormData('emergencyContactName', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="emergencyContactRelation">Relation</Label>
                  <Input
                    id="emergencyContactRelation"
                    value={formData.emergencyContactRelation}
                    onChange={(e) => updateFormData('emergencyContactRelation', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="emergencyContactNumber">Emergency Number</Label>
                  <Input
                    id="emergencyContactNumber"
                    value={formData.emergencyContactNumber}
                    onChange={(e) => updateFormData('emergencyContactNumber', e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Employment Details Tab */}
            <TabsContent value="employment" className="space-y-4">
              <h3 className="text-lg font-semibold text-primary">🏢 Employment Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Department *</Label>
                  <Select value={formData.department} onValueChange={(value) => updateFormData('department', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="designation">Designation / Job Title *</Label>
                  <Input
                    id="designation"
                    value={formData.designation}
                    onChange={(e) => updateFormData('designation', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Date of Joining *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.dateOfJoining && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dateOfJoining ? format(formData.dateOfJoining, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.dateOfJoining}
                        onSelect={(date) => updateFormData('dateOfJoining', date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="reportingManager">Reporting Manager</Label>
                  <Input
                    id="reportingManager"
                    value={formData.reportingManager}
                    onChange={(e) => updateFormData('reportingManager', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Work Location</Label>
                  <Select value={formData.workLocation} onValueChange={(value) => updateFormData('workLocation', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select work location" />
                    </SelectTrigger>
                    <SelectContent>
                      {workLocations.map(location => (
                        <SelectItem key={location} value={location}>{location}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Employee Type</Label>
                  <Select value={formData.employeeType} onValueChange={(value) => updateFormData('employeeType', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee type" />
                    </SelectTrigger>
                    <SelectContent>
                      {employeeTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="probationPeriod"
                    checked={formData.probationPeriod}
                    onCheckedChange={(checked) => updateFormData('probationPeriod', checked)}
                  />
                  <Label htmlFor="probationPeriod">Probation Period</Label>
                </div>
                {formData.probationPeriod && (
                  <div>
                    <Label htmlFor="probationDurationMonths">Duration (Months)</Label>
                    <Input
                      id="probationDurationMonths"
                      type="number"
                      value={formData.probationDurationMonths}
                      onChange={(e) => updateFormData('probationDurationMonths', parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Salary & Banking Tab */}
            <TabsContent value="salary" className="space-y-4">
              <h3 className="text-lg font-semibold text-primary">💳 Salary & Banking Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="panNumber">PAN Number</Label>
                  <Input
                    id="panNumber"
                    value={formData.panNumber}
                    onChange={(e) => updateFormData('panNumber', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="aadhaarNumber">Aadhaar Number</Label>
                  <Input
                    id="aadhaarNumber"
                    value={formData.aadhaarNumber}
                    onChange={(e) => updateFormData('aadhaarNumber', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bankAccountHolderName">Bank Account Holder Name</Label>
                  <Input
                    id="bankAccountHolderName"
                    value={formData.bankAccountHolderName}
                    onChange={(e) => updateFormData('bankAccountHolderName', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={formData.bankName}
                    onChange={(e) => updateFormData('bankName', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    value={formData.accountNumber}
                    onChange={(e) => updateFormData('accountNumber', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="ifscCode">IFSC Code</Label>
                  <Input
                    id="ifscCode"
                    value={formData.ifscCode}
                    onChange={(e) => updateFormData('ifscCode', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="upiId">UPI ID (Optional)</Label>
                  <Input
                    id="upiId"
                    value={formData.upiId}
                    onChange={(e) => updateFormData('upiId', e.target.value)}
                  />
                </div>
              </div>

              <h4 className="text-md font-medium text-primary">Salary Structure</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="ctc">CTC (Annual)</Label>
                  <Input
                    id="ctc"
                    type="number"
                    value={formData.ctc}
                    onChange={(e) => updateFormData('ctc', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="basicSalary">Basic Salary</Label>
                  <Input
                    id="basicSalary"
                    type="number"
                    value={formData.basicSalary}
                    onChange={(e) => updateFormData('basicSalary', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="allowances">Allowances</Label>
                  <Input
                    id="allowances"
                    type="number"
                    value={formData.allowances}
                    onChange={(e) => updateFormData('allowances', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="incentives">Incentives</Label>
                  <Input
                    id="incentives"
                    type="number"
                    value={formData.incentives}
                    onChange={(e) => updateFormData('incentives', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="deductions">Deductions</Label>
                  <Input
                    id="deductions"
                    type="number"
                    value={formData.deductions}
                    onChange={(e) => updateFormData('deductions', e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-4">
              <h3 className="text-lg font-semibold text-primary">📂 Official Documents Upload</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {createFileUploadArea('aadhaarCardUrl', 'Aadhaar Card (Upload)', 'image/*,.pdf')}
                {createFileUploadArea('panCardUrl', 'PAN Card (Upload)', 'image/*,.pdf')}
                {createFileUploadArea('photoUrl', 'Passport Size Photo (Upload)', 'image/*')}
                {createFileUploadArea('resumeUrl', 'Resume / CV (Upload)', '.pdf,.doc,.docx')}
                {createFileUploadArea('otherCertificatesUrls', 'Other Certificates (Optional)', 'image/*,.pdf', true)}
                
                <div className="space-y-2">
                  <Label>Offer Letter (Auto-generated)</Label>
                  <div className="border border-gray-300 rounded-lg p-6 text-center bg-gray-50">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-500">Will be auto-generated</p>
                    <p className="text-xs text-gray-400">After form submission</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Compliance Tab */}
            <TabsContent value="compliance" className="space-y-4">
              <h3 className="text-lg font-semibold text-primary">🛡️ Compliance & Policy Documentation</h3>
              
              <div className="space-y-6">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="ndaAcknowledged"
                    checked={formData.ndaAcknowledged}
                    onCheckedChange={(checked) => updateFormData('ndaAcknowledged', checked)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="ndaAcknowledged" className="text-base font-medium">
                      NDA / Confidentiality Agreement
                    </Label>
                    <p className="text-sm text-gray-600">
                      Document provided and explained to employee
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="handbookAcknowledged"
                    checked={formData.handbookAcknowledged}
                    onCheckedChange={(checked) => updateFormData('handbookAcknowledged', checked)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="handbookAcknowledged" className="text-base font-medium">
                      Company Handbook
                    </Label>
                    <p className="text-sm text-gray-600">
                      Company handbook provided to employee
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="jobContractSigned"
                    checked={formData.jobContractSigned}
                    onCheckedChange={(checked) => updateFormData('jobContractSigned', checked)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="jobContractSigned" className="text-base font-medium">
                      Job Contract
                    </Label>
                    <p className="text-sm text-gray-600">
                      Employment contract signed by employee
                    </p>
                  </div>
                </div>

              </div>
            </TabsContent>
          </Tabs>

          {/* Navigation and Submit Controls */}
          <div className="flex justify-between pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={prevTab}
              disabled={currentTab === "personal"}
            >
              Previous
            </Button>
            
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              
              {currentTab !== "compliance" ? (
                <Button type="button" onClick={nextTab}>
                  Next
                </Button>
              ) : (
                <Button 
                  type="submit"
                  disabled={addEmployeeMutation.isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  {addEmployeeMutation.isPending ? "Registering..." : "Register Staff"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}