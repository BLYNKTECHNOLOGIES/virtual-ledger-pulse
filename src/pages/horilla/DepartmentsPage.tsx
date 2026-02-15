import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, X, Building2 } from "lucide-react";

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", icon: "📁" });

  const { data: departments, isLoading } = useQuery({
    queryKey: ["hr_departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: empCounts } = useQuery({
    queryKey: ["dept_emp_counts"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employee_work_info").select("department_id");
      const counts: Record<string, number> = {};
      (data || []).forEach((w) => {
        if (w.department_id) counts[w.department_id] = (counts[w.department_id] || 0) + 1;
      });
      return counts;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("departments").update({
          name: form.name, code: form.code, description: form.description, icon: form.icon,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert({
          name: form.name, code: form.code, description: form.description, icon: form.icon,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_departments"] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr_departments"] }),
  });

  const closeDialog = () => {
    setAddOpen(false);
    setEditId(null);
    setForm({ name: "", code: "", description: "", icon: "📁" });
  };

  const openEdit = (d: any) => {
    setForm({ name: d.name, code: d.code, description: d.description || "", icon: d.icon || "📁" });
    setEditId(d.id);
    setAddOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500 mt-0.5">{departments?.length || 0} departments</p>
        </div>
        <button
          onClick={() => { setForm({ name: "", code: "", description: "", icon: "📁" }); setEditId(null); setAddOpen(true); }}
          className="flex items-center gap-2 bg-[#6C63FF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#5a52e0] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Department
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(departments || []).map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#6C63FF]/10 flex items-center justify-center text-lg">
                    {d.icon || "📁"}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{d.name}</p>
                    <p className="text-xs text-gray-400">{d.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(d)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(d.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {d.description && <p className="text-sm text-gray-500 mt-3">{d.description}</p>}
              <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                <Building2 className="h-3.5 w-3.5" />
                {empCounts?.[d.id] || 0} employees
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editId ? "Edit" : "Add"} Department</h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#6C63FF]" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Code *</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#6C63FF]" placeholder="e.g. ENG" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#6C63FF] resize-none" rows={2} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={closeDialog} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.code || saveMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#6C63FF] rounded-lg hover:bg-[#5a52e0] disabled:opacity-50">
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
