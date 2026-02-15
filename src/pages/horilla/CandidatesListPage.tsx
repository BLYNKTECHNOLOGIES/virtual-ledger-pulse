import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Star, Eye, Edit, Trash2, UserCheck, UserX, Building2, X, Save, Plus
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  hired: boolean | null;
  canceled: boolean | null;
  rating: number | null;
  source: string | null;
  profile_image_url: string | null;
  stage_id: string | null;
  recruitment_id: string | null;
  created_at: string;
  schedule_date: string | null;
  offer_letter_status: string | null;
  gender: string | null;
  dob: string | null;
  address: string | null;
  city: string | null;
}

export default function CandidatesListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "hired" | "canceled" | "active">("all");
  const [viewCandidate, setViewCandidate] = useState<Candidate | null>(null);
  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", mobile: "", source: "" });

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["hr_candidates_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_candidates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Candidate[];
    },
  });

  const { data: recruitments } = useQuery({
    queryKey: ["hr_recruitments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_recruitments").select("id, title");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: stages } = useQuery({
    queryKey: ["hr_stages_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_stages").select("id, stage_name");
      if (error) throw error;
      return data || [];
    },
  });

  const hireMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_candidates").update({ hired: true, canceled: false, hired_date: new Date().toISOString().split("T")[0] }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate marked as hired");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_all"] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_hired_not_onboarding"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to hire candidate"),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_candidates").update({ canceled: true, hired: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate canceled");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_all"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to cancel candidate"),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editCandidate) return;
      const { error } = await supabase.from("hr_candidates").update({
        name: editForm.name,
        email: editForm.email || null,
        mobile: editForm.mobile || null,
        source: editForm.source || null,
      }).eq("id", editCandidate.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate updated");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_all"] });
      setEditCandidate(null);
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_all"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const getRecTitle = (recId: string | null) => recruitments?.find(r => r.id === recId)?.title || "—";
  const getStageName = (stageId: string | null) => stages?.find(s => s.id === stageId)?.stage_name || "—";

  const filtered = (candidates || []).filter(c => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = c.name.toLowerCase().includes(term) || (c.email || "").toLowerCase().includes(term) || (c.mobile || "").includes(term);
    const matchesStatus = statusFilter === "all" || (statusFilter === "hired" && c.hired) || (statusFilter === "canceled" && c.canceled) || (statusFilter === "active" && !c.hired && !c.canceled);
    return matchesSearch && matchesStatus;
  });

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const avatarColors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];

  const hiredCount = (candidates || []).filter(c => c.hired).length;
  const canceledCount = (candidates || []).filter(c => c.canceled).length;
  const activeCount = (candidates || []).filter(c => !c.hired && !c.canceled).length;

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Candidates</h1>
          <p className="text-xs text-gray-500 mt-0.5">All candidates across recruitments</p>
        </div>
        <button
          onClick={() => { navigate("/hrms/recruitment/pipeline"); }}
          className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Candidate
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 px-3 py-1.5 w-64">
          <Search className="h-4 w-4 text-gray-400 mr-2 shrink-0" />
          <input type="text" placeholder="Search candidates..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full" />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${statusFilter === "active" ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            In Progress ({activeCount})
          </button>
          <button onClick={() => setStatusFilter(statusFilter === "hired" ? "all" : "hired")} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${statusFilter === "hired" ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <UserCheck className="h-3 w-3" /> Hired ({hiredCount})
          </button>
          <button onClick={() => setStatusFilter(statusFilter === "canceled" ? "all" : "canceled")} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${statusFilter === "canceled" ? "bg-red-100 text-red-700 ring-1 ring-red-300" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <UserX className="h-3 w-3" /> Canceled ({canceledCount})
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Building2 className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-gray-500 text-sm">No candidates found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Candidate</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Recruitment</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Stage</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Source</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Rating</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${getColor(c.id)} flex items-center justify-center text-white font-medium text-xs`}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        <p className="text-[11px] text-gray-400">{c.email || c.mobile || ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 text-xs">{getRecTitle(c.recruitment_id)}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{getStageName(c.stage_id)}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{c.source || "—"}</td>
                  <td className="py-3 px-4">
                    {c.rating ? (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < c.rating! ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                        ))}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="py-3 px-4">
                    {c.hired ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Hired</span>
                    ) : c.canceled ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Canceled</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">In Progress</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/hrms/recruitment/candidates/${c.id}`)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="View Profile">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setEditCandidate(c); setEditForm({ name: c.name, email: c.email || "", mobile: c.mobile || "", source: c.source || "" }); }} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Edit">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      {!c.hired && !c.canceled && (
                        <button onClick={() => hireMutation.mutate(c.id)} className="p-1 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600" title="Mark as Hired">
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!c.canceled && !c.hired && (
                        <button onClick={() => cancelMutation.mutate(c.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Cancel">
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => { if (confirm(`Delete candidate "${c.name}"?`)) deleteMutation.mutate(c.id); }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Candidate Dialog */}
      {viewCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Candidate Details</h2>
              <button onClick={() => setViewCandidate(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full ${getColor(viewCandidate.id)} flex items-center justify-center text-white font-bold text-lg`}>
                  {initials(viewCandidate.name)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{viewCandidate.name}</p>
                  <p className="text-xs text-gray-500">{viewCandidate.email || "No email"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Phone</p><p className="text-gray-700">{viewCandidate.mobile || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Source</p><p className="text-gray-700">{viewCandidate.source || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Recruitment</p><p className="text-gray-700">{getRecTitle(viewCandidate.recruitment_id)}</p></div>
                <div><p className="text-xs text-gray-400">Stage</p><p className="text-gray-700">{getStageName(viewCandidate.stage_id)}</p></div>
                <div><p className="text-xs text-gray-400">Gender</p><p className="text-gray-700">{viewCandidate.gender || "—"}</p></div>
                <div><p className="text-xs text-gray-400">DOB</p><p className="text-gray-700">{viewCandidate.dob || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Status</p>
                  {viewCandidate.hired ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Hired</span>
                    : viewCandidate.canceled ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Canceled</span>
                    : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">In Progress</span>}
                </div>
                <div><p className="text-xs text-gray-400">Rating</p>
                  {viewCandidate.rating ? (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-3 w-3 ${i < viewCandidate.rating! ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                      ))}
                    </div>
                  ) : <p className="text-gray-700">—</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end px-5 py-4 border-t border-gray-100">
              <button onClick={() => setViewCandidate(null)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Candidate Dialog */}
      {editCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Edit Candidate</h2>
              <button onClick={() => setEditCandidate(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Name *</label>
                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Mobile</label>
                  <input value={editForm.mobile} onChange={e => setEditForm({ ...editForm, mobile: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Source</label>
                <select value={editForm.source} onChange={e => setEditForm({ ...editForm, source: e.target.value })} className={inputCls}>
                  <option value="">Select</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Indeed">Indeed</option>
                  <option value="Referral">Referral</option>
                  <option value="Website">Website</option>
                  <option value="Agency">Agency</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setEditCandidate(null)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => updateMutation.mutate()} disabled={!editForm.name || updateMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
