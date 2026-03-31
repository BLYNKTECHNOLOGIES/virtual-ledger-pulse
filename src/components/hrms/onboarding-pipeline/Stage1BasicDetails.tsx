import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { User } from "lucide-react";

interface Stage1Props {
  data: any;
  onSave: (data: any) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  readOnly?: boolean;
}

export function Stage1BasicDetails({ data, onSave, onComplete, readOnly }: Stage1Props) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    gender: "",
    date_of_birth: "",
    department_id: "",
    position_id: "",
    job_role: "",
    shift_id: "",
    employee_type: "",
    reporting_manager_id: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        email: data.email || "",
        phone: data.phone || "",
        gender: data.gender || "",
        date_of_birth: data.date_of_birth || "",
        department_id: data.department_id || "",
        position_id: data.position_id || "",
        job_role: data.job_role || "",
        shift_id: data.shift_id || "",
        employee_type: data.employee_type || "",
        reporting_manager_id: data.reporting_manager_id || "",
      });
    }
  }, [data]);

  const { data: departments } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: positions } = useQuery({
    queryKey: ["positions-list", form.department_id],
    queryFn: async () => {
      let q = supabase.from("positions").select("id, title").eq("is_active", true).order("title");
      if (form.department_id) q = q.eq("department_id", form.department_id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: shifts } = useQuery({
    queryKey: ["shifts-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_shifts").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: managers } = useQuery({
    queryKey: ["managers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_employees").select("id, first_name, last_name").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const validate = () => {
    if (!form.first_name.trim()) { toast.error("First name is required"); return false; }
    if (!form.email.trim()) { toast.error("Email is required"); return false; }
    if (!form.department_id) { toast.error("Department is required"); return false; }
    if (!form.employee_type) { toast.error("Employee type is required"); return false; }
    return true;
  };

  const handleSave = () => onSave(form);
  const handleComplete = () => {
    if (!validate()) return;
    onComplete(form);
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" /> Stage 1: Basic Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>First Name *</Label>
            <Input value={form.first_name} onChange={e => update("first_name", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input value={form.last_name} onChange={e => update("last_name", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={e => update("email", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => update("phone", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={v => update("gender", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date of Birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={e => update("date_of_birth", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Department *</Label>
            <Select value={form.department_id} onValueChange={v => update("department_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Position</Label>
            <Select value={form.position_id} onValueChange={v => update("position_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
              <SelectContent>
                {positions?.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Job Role</Label>
            <Input value={form.job_role} onChange={e => update("job_role", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Shift</Label>
            <Select value={form.shift_id} onValueChange={v => update("shift_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
              <SelectContent>
                {shifts?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reporting Manager</Label>
            <Select value={form.reporting_manager_id} onValueChange={v => update("reporting_manager_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select Manager" /></SelectTrigger>
              <SelectContent>
                {managers?.map(m => <SelectItem key={m.id} value={m.id}>{`${m.first_name} ${m.last_name || ''}`.trim()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Employee Type *</Label>
            <Select value={form.employee_type} onValueChange={v => update("employee_type", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleSave}>Save Draft</Button>
            <Button onClick={handleComplete}>Complete & Next →</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
