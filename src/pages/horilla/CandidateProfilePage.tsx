import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Star, UserCheck, UserX, Edit, Save, X, Plus,
  Calendar, FileText, MessageSquare, Clock, Video, MapPin,
  Briefcase, Mail, Phone, Globe, User
} from "lucide-react";
import { toast } from "sonner";
import { InterviewDialog } from "@/components/horilla/recruitment/InterviewDialog";
import { OfferDialog } from "@/components/horilla/recruitment/OfferDialog";

type Tab = "about" | "notes" | "interviews" | "offers" | "history";

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("about");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [newNote, setNewNote] = useState("");
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  const { data: candidate, isLoading } = useQuery({
    queryKey: ["hr_candidate", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_candidates").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: recruitment } = useQuery({
    queryKey: ["hr_recruitment_for_candidate", candidate?.recruitment_id],
    queryFn: async () => {
      if (!candidate?.recruitment_id) return null;
      const { data } = await supabase.from("hr_recruitments").select("id, title").eq("id", candidate.recruitment_id).single();
      return data;
    },
    enabled: !!candidate?.recruitment_id,
  });

  const { data: stage } = useQuery({
    queryKey: ["hr_stage_for_candidate", candidate?.stage_id],
    queryFn: async () => {
      if (!candidate?.stage_id) return null;
      const { data } = await supabase.from("hr_stages").select("id, stage_name, stage_type").eq("id", candidate.stage_id).single();
      return data;
    },
    enabled: !!candidate?.stage_id,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["hr_candidate_notes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_candidate_notes").select("*").eq("candidate_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: interviews = [] } = useQuery({
    queryKey: ["hr_interviews", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_interviews").select("*").eq("candidate_id", id!).order("interview_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: offers = [] } = useQuery({
    queryKey: ["hr_offer_letters", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_offer_letters").select("*").eq("candidate_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_candidates").update(editForm).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate updated");
      queryClient.invalidateQueries({ queryKey: ["hr_candidate", id] });
      setEditing(false);
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_candidate_notes").insert({
        candidate_id: id!,
        note: newNote,
        note_by: "Admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note added");
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["hr_candidate_notes", id] });
    },
  });

  const hireMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_candidates").update({ hired: true, canceled: false, hired_date: new Date().toISOString().split("T")[0] }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate hired");
      queryClient.invalidateQueries({ queryKey: ["hr_candidate", id] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_candidates").update({ canceled: true, hired: false }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate rejected");
      queryClient.invalidateQueries({ queryKey: ["hr_candidate", id] });
    },
  });

  if (isLoading || !candidate) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading...</div>;
  }

  const initials = candidate.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "about", label: "About" },
    { key: "notes", label: "Notes", count: notes.length },
    { key: "interviews", label: "Interviews", count: interviews.length },
    { key: "offers", label: "Offers", count: offers.length },
    { key: "history", label: "History" },
  ];

  const STATUS_COLORS: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
    no_show: "bg-amber-100 text-amber-700",
  };

  const OFFER_STYLES: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    accepted: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    negotiating: "bg-violet-100 text-violet-700",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 mt-1">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-500 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {candidate.profile_image_url ? (
                <img src={candidate.profile_image_url} className="w-16 h-16 rounded-2xl object-cover" alt="" />
              ) : initials}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">{candidate.name}</h1>
                {candidate.hired ? (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Hired</span>
                ) : candidate.canceled ? (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">Rejected</span>
                ) : (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">In Progress</span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                {candidate.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{candidate.email}</span>}
                {candidate.mobile && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{candidate.mobile}</span>}
                {recruitment && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{recruitment.title}</span>}
                {stage && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{stage.stage_name}</span>}
              </div>
              {/* Rating */}
              <div className="flex items-center gap-1 mt-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < (candidate.rating || 0) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                ))}
                {candidate.rating ? <span className="text-xs text-gray-500 ml-1">({candidate.rating}/5)</span> : null}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {!candidate.hired && !candidate.canceled && (
                <>
                  <button onClick={() => hireMutation.mutate()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
                    <UserCheck className="h-3.5 w-3.5" /> Hire
                  </button>
                  <button onClick={() => cancelMutation.mutate()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                    <UserX className="h-3.5 w-3.5" /> Reject
                  </button>
                </>
              )}
              <button onClick={() => { setEditing(true); setEditForm({ name: candidate.name, email: candidate.email, mobile: candidate.mobile, source: candidate.source, address: candidate.address, city: candidate.city, state: candidate.state, gender: candidate.gender, dob: candidate.dob, portfolio_url: candidate.portfolio_url }); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                <Edit className="h-3.5 w-3.5" /> Edit
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-[#E8604C] text-[#E8604C]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {activeTab === "about" && (
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Personal Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Full Name</p><p className="text-gray-700 font-medium">{candidate.name}</p></div>
                <div><p className="text-xs text-gray-400">Email</p><p className="text-gray-700">{candidate.email || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Phone</p><p className="text-gray-700">{candidate.mobile || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Gender</p><p className="text-gray-700">{candidate.gender || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Date of Birth</p><p className="text-gray-700">{candidate.dob || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Source</p><p className="text-gray-700">{candidate.source || "—"}</p></div>
                <div className="col-span-2"><p className="text-xs text-gray-400">Address</p><p className="text-gray-700">{[candidate.address, candidate.city, candidate.state, candidate.country].filter(Boolean).join(", ") || "—"}</p></div>
                {candidate.portfolio_url && (
                  <div className="col-span-2"><p className="text-xs text-gray-400">Portfolio</p><a href={candidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm hover:underline flex items-center gap-1"><Globe className="h-3 w-3" />{candidate.portfolio_url}</a></div>
                )}
                {candidate.resume_url && (
                  <div className="col-span-2"><p className="text-xs text-gray-400">Resume</p><a href={candidate.resume_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm hover:underline flex items-center gap-1"><FileText className="h-3 w-3" />View Resume</a></div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Recruitment Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Recruitment</p><p className="text-gray-700 font-medium">{recruitment?.title || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Current Stage</p><span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{stage?.stage_name || "—"}</span></div>
                <div><p className="text-xs text-gray-400">Schedule Date</p><p className="text-gray-700">{candidate.schedule_date || "—"}</p></div>
                <div><p className="text-xs text-gray-400">Offer Status</p><p className="text-gray-700">{candidate.offer_letter_status || "None"}</p></div>
                <div><p className="text-xs text-gray-400">Applied On</p><p className="text-gray-700">{new Date(candidate.created_at).toLocaleDateString()}</p></div>
                {candidate.hired_date && <div><p className="text-xs text-gray-400">Hired Date</p><p className="text-gray-700">{candidate.hired_date}</p></div>}
                {candidate.joining_date && <div><p className="text-xs text-gray-400">Joining Date</p><p className="text-gray-700">{candidate.joining_date}</p></div>}
                {candidate.reject_reason && <div className="col-span-2"><p className="text-xs text-gray-400">Reject Reason</p><p className="text-red-600">{candidate.reject_reason}</p></div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
                className={`${inputCls} resize-none flex-1`} rows={2} placeholder="Add a remark or note about this candidate..." />
              <button onClick={() => addNoteMutation.mutate()}
                disabled={!newNote.trim() || addNoteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50 self-end">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {notes.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No notes yet. Add remarks from interviews or evaluations.</p>
              </div>
            ) : notes.map((n: any) => (
              <div key={n.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">{n.note_by || "System"}</span>
                  <span className="text-[10px] text-gray-400">{new Date(n.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-600">{n.note}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "interviews" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-900">Interview History</h3>
              <button onClick={() => setInterviewOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c]">
                <Calendar className="h-3 w-3" /> Schedule Interview
              </button>
            </div>
            {interviews.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No interviews scheduled</p>
              </div>
            ) : interviews.map((iv: any) => (
              <div key={iv.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{iv.interviewer_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[iv.status] || "bg-gray-100 text-gray-600"}`}>
                        {iv.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(iv.interview_date).toLocaleDateString()}</span>
                      {iv.interview_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{iv.interview_time}</span>}
                      <span>{iv.duration_minutes}min</span>
                      <span className="flex items-center gap-1">
                        {iv.interview_type === "video" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                        {iv.interview_type}
                      </span>
                    </div>
                  </div>
                </div>
                {iv.status === "completed" && iv.feedback && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      {iv.rating && (
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((i: number) => (
                            <Star key={i} className={`h-3 w-3 ${i <= iv.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                          ))}
                        </div>
                      )}
                      {iv.recommendation && iv.recommendation !== "pending" && (
                        <span className={`text-[10px] font-semibold ${iv.recommendation.includes("yes") ? "text-emerald-600" : "text-red-600"}`}>
                          {iv.recommendation.replace("_", " ").toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">{iv.feedback}</p>
                    {iv.strengths && <p className="text-[10px] text-emerald-600 mt-1">✓ {iv.strengths}</p>}
                    {iv.weaknesses && <p className="text-[10px] text-red-500 mt-0.5">✗ {iv.weaknesses}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "offers" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-900">Offer Letters</h3>
              <button onClick={() => setOfferOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c]">
                <FileText className="h-3 w-3" /> Create Offer
              </button>
            </div>
            {offers.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No offers created</p>
              </div>
            ) : offers.map((offer: any) => (
              <div key={offer.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">₹{Number(offer.offered_salary).toLocaleString()}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${OFFER_STYLES[offer.status] || "bg-gray-100 text-gray-600"}`}>
                    {offer.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  {offer.offered_position && <span>{offer.offered_position}</span>}
                  <span>Offered: {new Date(offer.offer_date).toLocaleDateString()}</span>
                  {offer.joining_date && <span>Join: {new Date(offer.joining_date).toLocaleDateString()}</span>}
                </div>
                {offer.negotiation_notes && <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">{offer.negotiation_notes}</p>}
              </div>
            ))}
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Candidate Timeline</h3>
            <div className="relative pl-6 space-y-4">
              <div className="absolute left-2 top-1 bottom-1 w-px bg-gray-200" />
              {candidate.hired_date && (
                <div className="relative">
                  <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                  <p className="text-sm text-gray-700 font-medium">Hired</p>
                  <p className="text-xs text-gray-400">{candidate.hired_date}</p>
                </div>
              )}
              {offers.filter((o: any) => o.status === "accepted").map((o: any) => (
                <div key={o.id} className="relative">
                  <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
                  <p className="text-sm text-gray-700">Offer accepted — ₹{Number(o.offered_salary).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{o.accepted_at ? new Date(o.accepted_at).toLocaleDateString() : ""}</p>
                </div>
              ))}
              {interviews.filter((iv: any) => iv.status === "completed").map((iv: any) => (
                <div key={iv.id} className="relative">
                  <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-violet-500 ring-2 ring-white" />
                  <p className="text-sm text-gray-700">Interview with {iv.interviewer_name} — {iv.recommendation || "pending"}</p>
                  <p className="text-xs text-gray-400">{new Date(iv.interview_date).toLocaleDateString()}</p>
                </div>
              ))}
              <div className="relative">
                <div className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-gray-400 ring-2 ring-white" />
                <p className="text-sm text-gray-700">Applied</p>
                <p className="text-xs text-gray-400">{new Date(candidate.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Edit Candidate</h2>
              <button onClick={() => setEditing(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Name</label>
                <input value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Email</label>
                  <input value={editForm.email || ""} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Phone</label>
                  <input value={editForm.mobile || ""} onChange={e => setEditForm({ ...editForm, mobile: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Gender</label>
                  <select value={editForm.gender || ""} onChange={e => setEditForm({ ...editForm, gender: e.target.value })} className={inputCls}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">DOB</label>
                  <input type="date" value={editForm.dob || ""} onChange={e => setEditForm({ ...editForm, dob: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Source</label>
                <select value={editForm.source || ""} onChange={e => setEditForm({ ...editForm, source: e.target.value })} className={inputCls}>
                  <option value="">Select</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Indeed">Indeed</option>
                  <option value="Referral">Referral</option>
                  <option value="Website">Website</option>
                  <option value="Agency">Agency</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Address</label>
                <input value={editForm.address || ""} onChange={e => setEditForm({ ...editForm, address: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">City</label>
                  <input value={editForm.city || ""} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">State</label>
                  <input value={editForm.state || ""} onChange={e => setEditForm({ ...editForm, state: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Portfolio URL</label>
                <input value={editForm.portfolio_url || ""} onChange={e => setEditForm({ ...editForm, portfolio_url: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50 flex items-center gap-1.5">
                <Save className="h-3.5 w-3.5" /> {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {interviewOpen && recruitment && (
        <InterviewDialog
          open={interviewOpen}
          onClose={() => setInterviewOpen(false)}
          candidateId={id!}
          candidateName={candidate.name}
          recruitmentId={recruitment.id}
          stageId={candidate.stage_id}
        />
      )}
      {offerOpen && recruitment && (
        <OfferDialog
          open={offerOpen}
          onClose={() => setOfferOpen(false)}
          candidateId={id!}
          candidateName={candidate.name}
          recruitmentId={recruitment.id}
        />
      )}
    </div>
  );
}
