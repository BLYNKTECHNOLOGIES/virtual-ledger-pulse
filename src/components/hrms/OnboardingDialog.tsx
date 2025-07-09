
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnboardingDialog({ open, onOpenChange }: OnboardingDialogProps) {
  const [formData, setFormData] = useState({
    applicant_id: "",
    name: "",
    email: "",
    phone: "",
    department: "",
    designation: "",
    salary: "",
    shift: "",
    date_of_joining: ""
  });

  const queryClient = useQueryClient();

  // Fetch job applicants who have been selected but not onboarded
  const { data: applicants } = useQuery({
    queryKey: ['selected_applicants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_applicants')
        .select(`
          id,
          name,
          email,
          phone,
          job_postings:job_posting_id(title, department)
        `)
        .eq('status', 'SELECTED')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Generate employee ID based on department and designation
  const generateEmployeeId = async (department: string, designation: string) => {
    const { data, error } = await supabase.rpc('generate_employee_id', {
      dept: department,
      designation: designation
    });

    if (error) {
      console.error('Error generating employee ID:', error);
      return `EMP${Date.now()}`;
    }

    return data;
  };

  const onboardEmployeeMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Generate employee ID
      const employeeId = await generateEmployeeId(data.department, data.designation);
      
      const { error } = await supabase
        .from('employees')
         .insert([{
           employee_id: employeeId,
           name: data.name,
           email: data.email,
           phone: data.phone,
           department: data.department,
           designation: data.designation,
           salary: parseFloat(data.salary),
           shift: data.shift,
           date_of_joining: data.date_of_joining,
           onboarding_completed: true,
           status: 'ACTIVE',
           user_id: null
         }]);
      
      if (error) throw error;

      // Update applicant status to indicate they've been onboarded
      if (data.applicant_id) {
        await supabase
          .from('job_applicants')
          .update({ status: 'ONBOARDED' })
          .eq('id', data.applicant_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['selected_applicants'] });
      toast({
        title: "Success",
        description: "Employee onboarded successfully with auto-generated ID",
      });
      onOpenChange(false);
      setFormData({
        applicant_id: "",
        name: "",
        email: "",
        phone: "",
        department: "",
        designation: "",
        salary: "",
        shift: "",
        date_of_joining: ""
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to onboard employee",
        variant: "destructive",
      });
    },
  });

  const handleApplicantSelect = (applicantId: string) => {
    const applicant = applicants?.find(a => a.id === applicantId);
    if (applicant) {
      setFormData({
        applicant_id: applicantId,
        name: applicant.name,
        email: applicant.email,
        phone: applicant.phone || "",
        department: applicant.job_postings?.department || "",
        designation: applicant.job_postings?.title || "",
        salary: "",
        shift: "",
        date_of_joining: ""
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onboardEmployeeMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Employee Onboarding Form</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="applicant_id">Select Applicant (Optional)</Label>
            <Select onValueChange={handleApplicantSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select from applicants or enter manually" />
              </SelectTrigger>
              <SelectContent>
                {applicants?.map((applicant) => (
                  <SelectItem key={applicant.id} value={applicant.id}>
                    {applicant.name} - {applicant.job_postings?.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="department">Department *</Label>
              <Select value={formData.department} onValueChange={(value) => setFormData({...formData, department: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technology">Technology</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="HR">Human Resources</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="designation">Designation *</Label>
              <Input
                id="designation"
                value={formData.designation}
                onChange={(e) => setFormData({...formData, designation: e.target.value})}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="salary">Salary Discussed *</Label>
              <Input
                id="salary"
                type="number"
                value={formData.salary}
                onChange={(e) => setFormData({...formData, salary: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="shift">Shift</Label>
              <Select value={formData.shift} onValueChange={(value) => setFormData({...formData, shift: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Morning">Morning (9 AM - 6 PM)</SelectItem>
                  <SelectItem value="Evening">Evening (2 PM - 11 PM)</SelectItem>
                  <SelectItem value="Night">Night (10 PM - 7 AM)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="date_of_joining">Date of Joining *</Label>
              <Input
                id="date_of_joining"
                type="date"
                value={formData.date_of_joining}
                onChange={(e) => setFormData({...formData, date_of_joining: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded">
            <p className="text-sm text-blue-700">
              Employee ID will be auto-generated based on department and designation
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={onboardEmployeeMutation.isPending}>
              {onboardEmployeeMutation.isPending ? "Onboarding..." : "Complete Onboarding"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
