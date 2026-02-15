import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Target, Plus, Edit, Trash2, X, Users, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function SkillZonePage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editZone, setEditZone] = useState<any>(null);
  const [form, setForm] = useState({ zone_name: "", description: "" });
  const [expanded, setExpanded] = useState<string[]>([]);
  const [addCandOpen, setAddCandOpen] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState("");

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["hr_skill_zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_skill_zones")
        .select("*")
        .order("zone_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: zoneCandidates = [] } = useQuery({
    queryKey: ["hr_skill_zone_candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_skill_zone_candidates")
        .select("*, hr_candidates(name, email)");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allCandidates = [] } = useQuery({
    queryKey: ["hr_candidates_for_zone"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_candidates").select("id, name, email").order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.zone_name) throw new Error("Zone name required");
      if (editZone) {
        const { error } = await supabase.from("hr_skill_zones").update({
          zone_name: form.zone_name,
          description: form.description || null,
        }).eq("id", editZone.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_skill_zones").insert({
          zone_name: form.zone_name,
          description: form.description || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editZone ? "Zone updated" : "Zone created");
      queryClient.invalidateQueries({ queryKey: ["hr_skill_zones"] });
      closeDialog();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_skill_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zone deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_skill_zones"] });
      queryClient.invalidateQueries({ queryKey: ["hr_skill_zone_candidates"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const addCandidateMutation = useMutation({
    mutationFn: async ({ zoneId, candidateId }: { zoneId: string; candidateId: string }) => {
      const { error } = await supabase.from("hr_skill_zone_candidates").insert({
        skill_zone_id: zoneId,
        candidate_id: candidateId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate added to zone");
      queryClient.invalidateQueries({ queryKey: ["hr_skill_zone_candidates"] });
      setAddCandOpen(null);
      setSelectedCandidate("");
    },
    onError: () => toast.error("Failed - candidate may already be in this zone"),
  });

  const removeCandidateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_skill_zone_candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from zone");
      queryClient.invalidateQueries({ queryKey: ["hr_skill_zone_candidates"] });
    },
    onError: () => toast.error("Failed to remove"),
  });

  const closeDialog = () => {
    setCreateOpen(false);
    setEditZone(null);
    setForm({ zone_name: "", description: "" });
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const getCandidatesForZone = (zoneId: string) =>
    zoneCandidates.filter((zc: any) => zc.skill_zone_id === zoneId);

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Skill Zone</h1>
          <p className="text-xs text-gray-500 mt-0.5">Group and track candidates by skill categories</p>
        </div>
        <button
          onClick={() => { closeDialog(); setCreateOpen(true); }}
          className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> Create Skill Zone
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {zones.slice(0, 6).map((zone: any) => {
          const count = getCandidatesForZone(zone.id).length;
          const initials = zone.zone_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
          return (
            <div key={zone.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E8604C]/10 flex items-center justify-center shrink-0">
                <span className="text-[#E8604C] font-bold text-xs">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{zone.zone_name}</p>
                <p className="text-xs text-gray-400">{count} Candidate{count !== 1 ? "s" : ""}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Zone list */}
      {isLoading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
      ) : zones.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          No skill zones yet. Create one to categorize candidates by skills.
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((zone: any) => {
            const candidates = getCandidatesForZone(zone.id);
            const isExpanded = expanded.includes(zone.id);
            return (
              <div key={zone.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(zone.id)}>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <Target className="h-4 w-4 text-[#E8604C]" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-gray-900">{zone.zone_name}</span>
                    {zone.description && <span className="text-xs text-gray-400 ml-2">— {zone.description}</span>}
                  </div>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {candidates.length}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); setForm({ zone_name: zone.zone_name, description: zone.description || "" }); setEditZone(zone); setCreateOpen(true); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${zone.zone_name}"?`)) deleteMutation.mutate(zone.id); }}
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {candidates.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-gray-400">No candidates in this zone yet.</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {candidates.map((zc: any) => (
                          <div key={zc.id} className="flex items-center gap-3 px-4 py-2 pl-12">
                            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600 shrink-0">
                              {zc.hr_candidates?.name?.[0]?.toUpperCase() || "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900">{zc.hr_candidates?.name}</p>
                              <p className="text-[10px] text-gray-400">{zc.hr_candidates?.email}</p>
                            </div>
                            <button onClick={() => removeCandidateMutation.mutate(zc.id)}
                              className="text-[10px] text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="px-4 py-2 border-t border-gray-100">
                      {addCandOpen === zone.id ? (
                        <div className="flex items-center gap-2">
                          <select value={selectedCandidate} onChange={e => setSelectedCandidate(e.target.value)} className={inputCls + " flex-1"}>
                            <option value="">Select candidate</option>
                            {allCandidates
                              .filter((c: any) => !candidates.some((zc: any) => zc.candidate_id === c.id))
                              .map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)
                            }
                          </select>
                          <button
                            onClick={() => { if (selectedCandidate) addCandidateMutation.mutate({ zoneId: zone.id, candidateId: selectedCandidate }); }}
                            disabled={!selectedCandidate}
                            className="px-3 py-2 text-xs bg-[#E8604C] text-white rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
                          >Add</button>
                          <button onClick={() => { setAddCandOpen(null); setSelectedCandidate(""); }} className="p-1 text-gray-400 hover:text-gray-600">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setAddCandOpen(zone.id)} className="text-xs text-[#E8604C] hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Add Candidate
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editZone ? "Edit" : "Create"} Skill Zone</h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Zone Name *</label>
                <input value={form.zone_name} onChange={e => setForm({ ...form, zone_name: e.target.value })} className={inputCls} placeholder="e.g. Frontend Developer" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className={inputCls} placeholder="Describe this skill zone..." />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={closeDialog} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={() => saveMutation.mutate()} disabled={!form.zone_name} className="px-4 py-2 text-sm bg-[#E8604C] text-white rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {editZone ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
