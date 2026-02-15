import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layers, Plus, Edit, Trash2, X, GripVertical } from "lucide-react";
import { toast } from "sonner";

export default function StagesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editStage, setEditStage] = useState<any>(null);
  const [filterRec, setFilterRec] = useState("all");
  const [form, setForm] = useState({ stage_name: "", stage_type: "initial", recruitment_id: "" });

  const { data: recruitments = [] } = useQuery({
    queryKey: ["hr_recruitments_list"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_recruitments").select("id, title, closed").order("title");
      return data || [];
    },
  });

  const { data: stages = [], isLoading } = useQuery({
    queryKey: ["hr_stages_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_stages")
        .select("*, hr_recruitments(title)")
        .order("recruitment_id")
        .order("sequence");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: candidateCounts = [] } = useQuery({
    queryKey: ["hr_candidates_stage_counts"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_candidates").select("stage_id");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.stage_name || !form.recruitment_id) throw new Error("Missing fields");
      const maxSeq = stages.filter((s: any) => s.recruitment_id === form.recruitment_id)
        .reduce((m: number, s: any) => Math.max(m, s.sequence), 0);
      
      if (editStage) {
        const { error } = await supabase.from("hr_stages").update({
          stage_name: form.stage_name,
          stage_type: form.stage_type,
        }).eq("id", editStage.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_stages").insert({
          stage_name: form.stage_name,
          stage_type: form.stage_type,
          recruitment_id: form.recruitment_id,
          sequence: maxSeq + 1,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editStage ? "Stage updated" : "Stage created");
      queryClient.invalidateQueries({ queryKey: ["hr_stages_all"] });
      closeDialog();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stage deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_stages_all"] });
    },
    onError: () => toast.error("Failed to delete - stage may have candidates"),
  });

  const closeDialog = () => {
    setCreateOpen(false);
    setEditStage(null);
    setForm({ stage_name: "", stage_type: "initial", recruitment_id: "" });
  };

  const openEdit = (stage: any) => {
    setForm({ stage_name: stage.stage_name, stage_type: stage.stage_type, recruitment_id: stage.recruitment_id });
    setEditStage(stage);
    setCreateOpen(true);
  };

  const getCountForStage = (stageId: string) =>
    candidateCounts.filter((c: any) => c.stage_id === stageId).length;

  const filtered = filterRec === "all" ? stages : stages.filter((s: any) => s.recruitment_id === filterRec);

  // Group by recruitment
  const grouped: Record<string, any[]> = {};
  filtered.forEach((s: any) => {
    const key = s.recruitment_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  const STAGE_TYPES: Record<string, { label: string; color: string }> = {
    initial: { label: "Initial", color: "bg-blue-100 text-blue-700" },
    test: { label: "Test", color: "bg-amber-100 text-amber-700" },
    interview: { label: "Interview", color: "bg-violet-100 text-violet-700" },
    offer: { label: "Offer", color: "bg-emerald-100 text-emerald-700" },
    hired: { label: "Hired", color: "bg-green-100 text-green-700" },
    cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
  };

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stages</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage recruitment pipeline stages across all positions</p>
        </div>
        <button
          onClick={() => { closeDialog(); setCreateOpen(true); }}
          className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> Add Stage
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select value={filterRec} onChange={e => setFilterRec(e.target.value)} className={inputCls + " max-w-xs"}>
          <option value="all">All Recruitments</option>
          {recruitments.map((r: any) => (
            <option key={r.id} value={r.id}>{r.title} {r.closed ? "(Closed)" : ""}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{filtered.length} stages</span>
      </div>

      {/* Stages grouped by recruitment */}
      {isLoading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          No stages found. Create one to get started.
        </div>
      ) : (
        Object.entries(grouped).map(([recId, recStages]) => {
          const recTitle = (recStages[0] as any).hr_recruitments?.title || "Unknown";
          return (
            <div key={recId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#E8604C]" />
                  {recTitle}
                  <span className="text-xs text-gray-400 font-normal">({recStages.length} stages)</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-50">
                {recStages.map((stage: any, i: number) => {
                  const typeInfo = STAGE_TYPES[stage.stage_type] || STAGE_TYPES.initial;
                  const count = getCountForStage(stage.id);
                  return (
                    <div key={stage.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{stage.stage_name}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <span className="text-xs text-gray-500 min-w-[60px] text-right">
                        {count} candidate{count !== 1 ? "s" : ""}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(stage)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete "${stage.stage_name}"?`)) deleteMutation.mutate(stage.id); }}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Create/Edit Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editStage ? "Edit" : "Add"} Stage</h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {!editStage && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Recruitment *</label>
                  <select value={form.recruitment_id} onChange={e => setForm({ ...form, recruitment_id: e.target.value })} className={inputCls}>
                    <option value="">Select Recruitment</option>
                    {recruitments.filter((r: any) => !r.closed).map((r: any) => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Stage Name *</label>
                <input value={form.stage_name} onChange={e => setForm({ ...form, stage_name: e.target.value })} className={inputCls} placeholder="e.g. Technical Interview" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Stage Type</label>
                <select value={form.stage_type} onChange={e => setForm({ ...form, stage_type: e.target.value })} className={inputCls}>
                  {Object.entries(STAGE_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={closeDialog} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!form.stage_name || (!editStage && !form.recruitment_id)}
                className="px-4 py-2 text-sm bg-[#E8604C] text-white rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                {editStage ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
