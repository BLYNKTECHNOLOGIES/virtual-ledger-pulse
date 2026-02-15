import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { toast } from "sonner";

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: { id: string; name: string }[];
  positions: { id: string; title: string; department_id: string | null }[];
}

export function AddEmployeeDialog({ open, onOpenChange, departments, positions }: AddEmployeeDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    badge_id: "", first_name: "", last_name: "", email: "", phone: "",
    gender: "", dob: "", department_id: "", job_position_id: "",
    job_role: "", joining_date: "", employee_type: "Full-time",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: emp, error: empErr } = await supabase
        .from("hr_employees")
        .insert({
          badge_id: form.badge_id,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email || null,
          phone: form.phone || null,
          gender: form.gender || null,
          dob: form.dob || null,
          is_active: true,
        })
        .select()
        .single();
      if (empErr) throw empErr;

      if (form.department_id || form.job_role || form.joining_date) {
        const { error: wiErr } = await supabase.from("hr_employee_work_info").insert({
          employee_id: emp.id,
          department_id: form.department_id || null,
          job_position_id: form.job_position_id || null,
          job_role: form.job_role || null,
          joining_date: form.joining_date || null,
          employee_type: form.employee_type,
        });
        if (wiErr) throw wiErr;
      }
      return emp;
    },
    onSuccess: () => {
      toast.success("Employee created successfully");
      queryClient.invalidateQueries({ queryKey: ["hr_employees_list"] });
      queryClient.invalidateQueries({ queryKey: ["hr_employee_work_infos"] });
      onOpenChange(false);
      setForm({
        badge_id: "", first_name: "", last_name: "", email: "", phone: "",
        gender: "", dob: "", department_id: "", job_position_id: "",
        job_role: "", joining_date: "", employee_type: "Full-time",
      });
    },
    onError: () => toast.error("Failed to create employee"),
  });

  if (!open) return null;

  const filteredPositions = form.department_id
    ? positions.filter((p) => p.department_id === form.department_id)
    : positions;

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Add Employee</h2>
          <button onClick={() => onOpenChange(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Badge ID *</label>
            <input value={form.badge_id} onChange={(e) => setForm({ ...form, badge_id: e.target.value })} className={inputCls} placeholder="e.g. EMP001" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">First Name *</label>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Last Name *</label>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Gender</label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={inputCls}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Date of Birth</label>
              <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className={inputCls} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <p className="text-sm font-medium text-gray-600">Work Information</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Department</label>
              <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value, job_position_id: "" })} className={inputCls}>
                <option value="">Select</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Position</label>
              <select value={form.job_position_id} onChange={(e) => setForm({ ...form, job_position_id: e.target.value })} className={inputCls}>
                <option value="">Select</option>
                {filteredPositions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Job Role</label>
              <input value={form.job_role} onChange={(e) => setForm({ ...form, job_role: e.target.value })} className={inputCls} placeholder="e.g. Frontend Developer" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Joining Date</label>
              <input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Employee Type</label>
            <select value={form.employee_type} onChange={(e) => setForm({ ...form, employee_type: e.target.value })} className={inputCls}>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Intern">Intern</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={() => onOpenChange(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!form.badge_id || !form.first_name || !form.last_name || createMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Create Employee"}
          </button>
        </div>
      </div>
    </div>
  );
}
