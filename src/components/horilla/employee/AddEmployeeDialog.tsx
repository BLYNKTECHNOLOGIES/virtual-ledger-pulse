
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const steps = ["Basic Info", "Work Info", "Bank Details"];

export function AddEmployeeDialog({ open, onOpenChange, onSuccess }: AddEmployeeDialogProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", gender: "male",
    dob: "", address: "", city: "", state: "", zip: "", country: "India",
    qualification: "", experience: "", marital_status: "single",
    emergency_contact_name: "", emergency_contact: "", emergency_contact_relation: "",
    // work info
    job_role: "", work_type: "office", employee_type: "full_time",
    location: "", work_email: "", joining_date: "", basic_salary: "",
    // bank details
    bank_name: "", account_number: "", branch: "", bank_code_1: "",
  });

  const update = (field: string, value: string) => setForm({ ...form, [field]: value });

  const generateBadgeId = () => {
    const prefix = "EMP";
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${num}`;
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) {
      toast({ title: "Error", description: "First name and last name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const badge_id = generateBadgeId();
      const { data: emp, error: empError } = await supabase.from("hr_employees").insert({
        badge_id,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        phone: form.phone || null,
        gender: form.gender || null,
        dob: form.dob || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        country: form.country,
        qualification: form.qualification || null,
        experience: form.experience || null,
        marital_status: form.marital_status || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact: form.emergency_contact || null,
        emergency_contact_relation: form.emergency_contact_relation || null,
      }).select().single();

      if (empError) throw empError;

      // Work info
      if (form.job_role || form.joining_date || form.basic_salary) {
        await supabase.from("hr_employee_work_info").insert({
          employee_id: emp.id,
          job_role: form.job_role || null,
          work_type: form.work_type,
          employee_type: form.employee_type,
          location: form.location || null,
          work_email: form.work_email || null,
          joining_date: form.joining_date || null,
          basic_salary: form.basic_salary ? parseFloat(form.basic_salary) : 0,
        });
      }

      // Bank details
      if (form.bank_name || form.account_number) {
        await supabase.from("hr_employee_bank_details").insert({
          employee_id: emp.id,
          bank_name: form.bank_name || null,
          account_number: form.account_number || null,
          branch: form.branch || null,
          bank_code_1: form.bank_code_1 || null,
        });
      }

      toast({ title: "Success", description: `Employee ${form.first_name} ${form.last_name} added with badge ${badge_id}` });
      onSuccess();
      onOpenChange(false);
      setStep(0);
      setForm({
        first_name: "", last_name: "", email: "", phone: "", gender: "male",
        dob: "", address: "", city: "", state: "", zip: "", country: "India",
        qualification: "", experience: "", marital_status: "single",
        emergency_contact_name: "", emergency_contact: "", emergency_contact_relation: "",
        job_role: "", work_type: "office", employee_type: "full_time",
        location: "", work_email: "", joining_date: "", basic_salary: "",
        bank_name: "", account_number: "", branch: "", bank_code_1: "",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add New Employee</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {steps.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                i === step ? "bg-[#E8604C] text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
              )}
            >
              <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold border-current">
                {i + 1}
              </span>
              {s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">First Name *</Label><Input value={form.first_name} onChange={e => update("first_name", e.target.value)} /></div>
            <div><Label className="text-xs">Last Name *</Label><Input value={form.last_name} onChange={e => update("last_name", e.target.value)} /></div>
            <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => update("email", e.target.value)} /></div>
            <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => update("phone", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Gender</Label>
              <Select value={form.gender} onValueChange={v => update("gender", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Date of Birth</Label><Input type="date" value={form.dob} onChange={e => update("dob", e.target.value)} /></div>
            <div className="col-span-2"><Label className="text-xs">Address</Label><Input value={form.address} onChange={e => update("address", e.target.value)} /></div>
            <div><Label className="text-xs">City</Label><Input value={form.city} onChange={e => update("city", e.target.value)} /></div>
            <div><Label className="text-xs">State</Label><Input value={form.state} onChange={e => update("state", e.target.value)} /></div>
            <div><Label className="text-xs">ZIP</Label><Input value={form.zip} onChange={e => update("zip", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Marital Status</Label>
              <Select value={form.marital_status} onValueChange={v => update("marital_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Qualification</Label><Input value={form.qualification} onChange={e => update("qualification", e.target.value)} /></div>
            <div><Label className="text-xs">Experience</Label><Input value={form.experience} onChange={e => update("experience", e.target.value)} /></div>
            <div><Label className="text-xs">Emergency Contact Name</Label><Input value={form.emergency_contact_name} onChange={e => update("emergency_contact_name", e.target.value)} /></div>
            <div><Label className="text-xs">Emergency Contact</Label><Input value={form.emergency_contact} onChange={e => update("emergency_contact", e.target.value)} /></div>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Job Role / Designation</Label><Input value={form.job_role} onChange={e => update("job_role", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Work Type</Label>
              <Select value={form.work_type} onValueChange={v => update("work_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Employment Type</Label>
              <Select value={form.employee_type} onValueChange={v => update("employee_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full Time</SelectItem>
                  <SelectItem value="part_time">Part Time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Work Location</Label><Input value={form.location} onChange={e => update("location", e.target.value)} /></div>
            <div><Label className="text-xs">Work Email</Label><Input type="email" value={form.work_email} onChange={e => update("work_email", e.target.value)} /></div>
            <div><Label className="text-xs">Joining Date</Label><Input type="date" value={form.joining_date} onChange={e => update("joining_date", e.target.value)} /></div>
            <div><Label className="text-xs">Basic Salary (₹)</Label><Input type="number" value={form.basic_salary} onChange={e => update("basic_salary", e.target.value)} /></div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Bank Name</Label><Input value={form.bank_name} onChange={e => update("bank_name", e.target.value)} /></div>
            <div><Label className="text-xs">Account Number</Label><Input value={form.account_number} onChange={e => update("account_number", e.target.value)} /></div>
            <div><Label className="text-xs">Branch</Label><Input value={form.branch} onChange={e => update("branch", e.target.value)} /></div>
            <div><Label className="text-xs">IFSC Code</Label><Input value={form.bank_code_1} onChange={e => update("bank_code_1", e.target.value)} /></div>
          </div>
        )}

        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : onOpenChange(false)} disabled={saving}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <div className="flex gap-2">
            {step < 2 && (
              <Button onClick={() => setStep(step + 1)} className="bg-[#E8604C] hover:bg-[#d04a38]">
                Next
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleSave} disabled={saving} className="bg-[#E8604C] hover:bg-[#d04a38]">
                {saving ? "Saving..." : "Save Employee"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
