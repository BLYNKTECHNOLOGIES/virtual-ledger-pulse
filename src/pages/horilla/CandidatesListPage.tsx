import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
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
  const avatarColors = ["bg-primary", "bg-info", "bg-success", "bg-warning", "bg-destructive", "bg-info"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];

  const hiredCount = (candidates || []).filter(c => c.hired).length;
  const canceledCount = (candidates || []).filter(c => c.canceled).length;
  const activeCount = (candidates || []).filter(c => !c.hired && !c.canceled).length;

  const inputCls = "w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Candidates</h1>
          <p className="text-xs text-muted-foreground mt-0.5">All candidates across recruitments</p>
        </div>
        <button
          onClick={() => { navigate("/hrms/recruitment/pipeline"); }}
          className="flex items-center gap-2 bg-[#E8604C] text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Candidate
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-card rounded-xl border border-border px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-muted/50 rounded-lg border border-border px-3 py-1.5 w-64">
          <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
          <input type="text" placeholder="Search candidates..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full" />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${statusFilter === "active" ? "bg-info/10 text-info ring-1 ring-info" : "bg-muted text-muted-foreground hover:bg-muted"}`}>
            In Progress ({activeCount})
          </button>
          <button onClick={() => setStatusFilter(statusFilter === "hired" ? "all" : "hired")} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${statusFilter === "hired" ? "bg-success/10 text-success ring-1 ring-success" : "bg-muted text-muted-foreground hover:bg-muted"}`}>
            <UserCheck className="h-3 w-3" /> Hired ({hiredCount})
          </button>
          <button onClick={() => setStatusFilter(statusFilter === "canceled" ? "all" : "canceled")} className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${statusFilter === "canceled" ? "bg-destructive/10 text-destructive ring-1 ring-destructive" : "bg-muted text-muted-foreground hover:bg-muted"}`}>
            <UserX className="h-3 w-3" /> Canceled ({canceledCount})
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
            <Building2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No candidates found</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Candidate</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Recruitment</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Stage</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Source</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Rating</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-muted/20 hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${getColor(c.id)} flex items-center justify-center text-primary-foreground font-medium text-xs`}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">{c.email || c.mobile || ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-xs">{getRecTitle(c.recruitment_id)}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-info/10 text-info">{getStageName(c.stage_id)}</span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-xs">{c.source || "—"}</td>
                  <td className="py-3 px-4">
                    {c.rating ? (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < c.rating! ? "text-warning fill-warning" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="py-3 px-4">
                    {c.hired ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">Hired</span>
                    ) : c.canceled ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Canceled</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning/10 text-warning">In Progress</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/hrms/recruitment/candidates/${c.id}`)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-info" title="View Profile">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setEditCandidate(c); setEditForm({ name: c.name, email: c.email || "", mobile: c.mobile || "", source: c.source || "" }); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      {!c.hired && !c.canceled && (
                        <button onClick={() => hireMutation.mutate(c.id)} className="p-1 rounded hover:bg-success/10 text-muted-foreground hover:text-success" title="Mark as Hired">
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!c.canceled && !c.hired && (
                        <button onClick={() => cancelMutation.mutate(c.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Cancel">
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => setDeleteTarget({ id: c.id, name: c.name })} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete">
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
          <div className="bg-card rounded-xl w-full max-w-md shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Candidate Details</h2>
              <button onClick={() => setViewCandidate(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full ${getColor(viewCandidate.id)} flex items-center justify-center text-primary-foreground font-bold text-lg`}>
                  {initials(viewCandidate.name)}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{viewCandidate.name}</p>
                  <p className="text-xs text-muted-foreground">{viewCandidate.email || "No email"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-foreground">{viewCandidate.mobile || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Source</p><p className="text-foreground">{viewCandidate.source || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Recruitment</p><p className="text-foreground">{getRecTitle(viewCandidate.recruitment_id)}</p></div>
                <div><p className="text-xs text-muted-foreground">Stage</p><p className="text-foreground">{getStageName(viewCandidate.stage_id)}</p></div>
                <div><p className="text-xs text-muted-foreground">Gender</p><p className="text-foreground">{viewCandidate.gender || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">DOB</p><p className="text-foreground">{viewCandidate.dob || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p>
                  {viewCandidate.hired ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">Hired</span>
                    : viewCandidate.canceled ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Canceled</span>
                    : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning/10 text-warning">In Progress</span>}
                </div>
                <div><p className="text-xs text-muted-foreground">Rating</p>
                  {viewCandidate.rating ? (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-3 w-3 ${i < viewCandidate.rating! ? "text-warning fill-warning" : "text-muted-foreground"}`} />
                      ))}
                    </div>
                  ) : <p className="text-foreground">—</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end px-5 py-4 border-t border-border">
              <button onClick={() => setViewCandidate(null)} className="px-4 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-muted">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Candidate Dialog */}
      {editCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl w-full max-w-md shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Edit Candidate</h2>
              <button onClick={() => setEditCandidate(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Name *</label>
                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Mobile</label>
                  <input value={editForm.mobile} onChange={e => setEditForm({ ...editForm, mobile: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Source</label>
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
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => setEditCandidate(null)} className="px-4 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-muted">Cancel</button>
              <button onClick={() => updateMutation.mutate()} disabled={!editForm.name || updateMutation.isPending} className="px-4 py-2 text-sm font-medium text-primary-foreground bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Candidate</AlertDialogTitle>
            <AlertDialogDescription>Delete candidate "{deleteTarget?.name}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); } }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}