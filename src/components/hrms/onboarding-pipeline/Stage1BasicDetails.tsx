import { useState, useEffect, useRef } from "react";
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
  onSave: (data: any, options?: { silent?: boolean }) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  readOnly?: boolean;
}

export function Stage1BasicDetails({ data, onSave, onComplete, readOnly }: Stage1Props) {
  const [isCompleting, setIsCompleting] = useState(false);
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
    probation_end_date: "",
  });
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dirtyRef.current) return;
    if (data) {
      // Legacy drafts stored `full_time` / `part_time`; the Select only offers
      // permanent/contract/intern now. Map legacy → permanent so the field
      // hydrates visibly (and downstream inserts get a valid value) instead
      // of silently blanking the trigger while the DB keeps the old value.
      const rawType = data.employee_type || "";
      const normalizedType = rawType === "full_time" || rawType === "part_time" ? "permanent" : rawType;
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
        employee_type: normalizedType,
        probation_end_date: data.probation_end_date || "",
      });
      // If we rewrote the legacy value, mark dirty so the autosave persists
      // the normalized value back to the draft on the next tick.
      if (rawType && rawType !== normalizedType) {
        dirtyRef.current = true;
      }
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


  useEffect(() => {
    if (!dirtyRef.current || readOnly) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      dirtyRef.current = false;
      onSave(form, { silent: true }).catch((err: any) => console.warn("Stage 1 autosave failed:", err));
    }, 900);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, onSave, readOnly]);

  const update = (field: string, value: string) => {
    dirtyRef.current = true;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    if (!form.first_name.trim()) { toast.error("First name is required"); return false; }
    if (!form.email.trim()) { toast.error("Email is required"); return false; }
    if (!form.department_id) { toast.error("Department is required"); return false; }
    if (!form.employee_type) { toast.error("Employee type is required"); return false; }
    return true;
  };

  const handleSave = () => onSave(form);
  const handleComplete = async () => {
    if (!validate()) return;
    setIsCompleting(true);
    try {
      await onComplete(form);
    } catch (err: any) {
      toast.error(err?.message || "Unable to complete Basic Details");
    } finally {
      setIsCompleting(false);
    }
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
            <Label>Employee Type *</Label>
            <Select value={form.employee_type} onValueChange={v => update("employee_type", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {/* RazorpayX-aligned employee types only. */}
                <SelectItem value="permanent">Permanent</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Probation End Date</Label>
            <Input
              type="date"
              value={form.probation_end_date}
              onChange={e => update("probation_end_date", e.target.value)}
              disabled={readOnly}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Mirrored to RazorpayX <code>probation-end-date</code>.</p>
          </div>

        </div>
        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleSave}>Save Draft</Button>
            <Button onClick={handleComplete} disabled={isCompleting}>
              {isCompleting ? "Completing..." : "Complete & Next →"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
