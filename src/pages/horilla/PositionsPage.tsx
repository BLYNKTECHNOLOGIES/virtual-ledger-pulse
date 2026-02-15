import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, X, Briefcase } from "lucide-react";
import { toast } from "sonner";

export default function PositionsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", department_id: "", description: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const { data: positions, isLoading } = useQuery({
    queryKey: ["hr_positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("title");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["hr_departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        department_id: form.department_id || null,
        description: form.description || null,
      };
      if (editId) {
        const { error } = await supabase.from("positions").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("positions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Position updated" : "Position created");
      queryClient.invalidateQueries({ queryKey: ["hr_positions"] });
      closeDialog();
    },
    onError: () => toast.error("Failed to save position"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Position deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_positions"] });
    },
    onError: () => toast.error("Failed to delete position"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("positions").update({ is_active: !isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_positions"] });
      toast.success("Status updated");
    },
  });

  const closeDialog = () => { setAddOpen(false); setEditId(null); setForm({ title: "", department_id: "", description: "" }); };

  const getDeptName = (id: string | null) => departments?.find((d) => d.id === id)?.name || "—";

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  const filteredPositions = (positions || []).filter(p => {
    const term = searchTerm.toLowerCase();
    return p.title.toLowerCase().includes(term) || (p.description || "").toLowerCase().includes(term);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Positions</h1>
          <p className="text-xs text-gray-500 mt-0.5">{filteredPositions.length} position{filteredPositions.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => { setForm({ title: "", department_id: "", description: "" }); setEditId(null); setAddOpen(true); }}
          className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Position
        </button>
      </div>

      {/* Search bar */}
      <div className="flex items-center bg-white rounded-lg border border-gray-200 px-3 py-2 w-full max-w-sm">
        <Briefcase className="h-4 w-4 text-gray-400 mr-2 shrink-0" />
        <input
          type="text"
          placeholder="Search positions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Position</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Department</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Description</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPositions.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-[#E8604C]" />
                      <span className="font-medium text-gray-900">{p.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{getDeptName(p.department_id)}</td>
                  <td className="py-3 px-4 text-gray-500 truncate max-w-xs">{p.description || "—"}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: p.id, isActive: p.is_active })}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                    >
                      {p.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setForm({ title: p.title, department_id: p.department_id || "", description: p.description || "" }); setEditId(p.id); setAddOpen(true); }}
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400"><Edit className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (confirm(`Delete "${p.title}"?`)) deleteMutation.mutate(p.id); }}
                        className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPositions.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-gray-400 text-sm">
                  {searchTerm ? "No positions matching your search" : "No positions yet"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editId ? "Edit" : "Add"} Position</h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Department</label>
                <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputCls}>
                  <option value="">Select</option>
                  {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={`${inputCls} resize-none`} rows={2} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={closeDialog} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}