import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Star, Calendar, Clock, Video, MapPin, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface InterviewDialogProps {
  open: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
  recruitmentId: string;
  stageId?: string | null;
}

export function InterviewDialog({ open, onClose, candidateId, candidateName, recruitmentId, stageId }: InterviewDialogProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"schedule" | "list">("list");
  const [form, setForm] = useState({
    interviewer_name: "",
    interview_date: "",
    interview_time: "",
    duration_minutes: 30,
    interview_type: "in_person",
    location: "",
    meeting_link: "",
    notes: "",
  });

  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["hr_interviews", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_interviews")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("interview_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_interviews").insert({
        candidate_id: candidateId,
        recruitment_id: recruitmentId,
        stage_id: stageId || null,
        interviewer_name: form.interviewer_name,
        interview_date: form.interview_date,
        interview_time: form.interview_time || null,
        duration_minutes: form.duration_minutes,
        interview_type: form.interview_type,
        location: form.location || null,
        meeting_link: form.meeting_link || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Interview scheduled");
      queryClient.invalidateQueries({ queryKey: ["hr_interviews", candidateId] });
      setTab("list");
      setForm({ interviewer_name: "", interview_date: "", interview_time: "", duration_minutes: 30, interview_type: "in_person", location: "", meeting_link: "", notes: "" });
    },
    onError: () => toast.error("Failed to schedule"),
  });

  const [feedbackForm, setFeedbackForm] = useState<{ id: string; rating: number; feedback: string; strengths: string; weaknesses: string; recommendation: string } | null>(null);

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      if (!feedbackForm) return;
      const { error } = await supabase.from("hr_interviews").update({
        rating: feedbackForm.rating,
        feedback: feedbackForm.feedback || null,
        strengths: feedbackForm.strengths || null,
        weaknesses: feedbackForm.weaknesses || null,
        recommendation: feedbackForm.recommendation,
        status: "completed",
      }).eq("id", feedbackForm.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feedback saved");
      queryClient.invalidateQueries({ queryKey: ["hr_interviews", candidateId] });
      setFeedbackForm(null);
    },
    onError: (err: any) => toast.error(err?.message || "Failed to save feedback"),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("hr_interviews").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_interviews", candidateId] });
      toast.success("Interview status updated");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update status"),
  });

  if (!open) return null;

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  const STATUS_COLORS: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
    no_show: "bg-amber-100 text-amber-700",
  };

  const REC_COLORS: Record<string, string> = {
    pending: "text-gray-500",
    strong_yes: "text-emerald-600",
    yes: "text-green-600",
    no: "text-red-600",
    strong_no: "text-red-700",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Interviews — {candidateName}</h2>
            <p className="text-xs text-gray-500">{interviews.length} interview(s) scheduled</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5 shrink-0">
          {(["list", "schedule"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-[#E8604C] text-[#E8604C]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t === "list" ? "All Interviews" : "+ Schedule New"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "list" ? (
            feedbackForm ? (
              /* Feedback Form */
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Submit Feedback</h3>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Rating</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <button key={i} onClick={() => setFeedbackForm({ ...feedbackForm, rating: i })}>
                        <Star className={`h-5 w-5 ${i <= feedbackForm.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Feedback</label>
                  <textarea value={feedbackForm.feedback} onChange={e => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                    className={`${inputCls} resize-none`} rows={3} placeholder="Overall assessment..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Strengths</label>
                    <textarea value={feedbackForm.strengths} onChange={e => setFeedbackForm({ ...feedbackForm, strengths: e.target.value })}
                      className={`${inputCls} resize-none`} rows={2} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Weaknesses</label>
                    <textarea value={feedbackForm.weaknesses} onChange={e => setFeedbackForm({ ...feedbackForm, weaknesses: e.target.value })}
                      className={`${inputCls} resize-none`} rows={2} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Recommendation</label>
                  <select value={feedbackForm.recommendation} onChange={e => setFeedbackForm({ ...feedbackForm, recommendation: e.target.value })} className={inputCls}>
                    <option value="pending">Pending</option>
                    <option value="strong_yes">Strong Yes</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="strong_no">Strong No</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setFeedbackForm(null)} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
                  <button onClick={() => feedbackMutation.mutate()}
                    disabled={feedbackMutation.isPending}
                    className="px-4 py-2 text-sm text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                    {feedbackMutation.isPending ? "Saving..." : "Save Feedback"}
                  </button>
                </div>
              </div>
            ) : (
              /* Interview List */
              <div className="space-y-3">
                {isLoading ? (
                  <p className="text-sm text-gray-400 text-center py-6">Loading...</p>
                ) : interviews.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">No interviews scheduled</p>
                    <button onClick={() => setTab("schedule")} className="mt-2 text-sm text-[#E8604C] hover:underline">
                      + Schedule first interview
                    </button>
                  </div>
                ) : interviews.map(iv => (
                  <div key={iv.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
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
                      <div className="flex items-center gap-1">
                        {iv.status === "scheduled" && (
                          <>
                            <button onClick={() => setFeedbackForm({ id: iv.id, rating: 0, feedback: "", strengths: "", weaknesses: "", recommendation: "pending" })}
                              className="text-[10px] text-[#E8604C] hover:underline px-1.5 py-0.5">
                              <MessageSquare className="h-3 w-3 inline mr-0.5" />Feedback
                            </button>
                            <button onClick={() => statusMutation.mutate({ id: iv.id, status: "cancelled" })}
                              className="text-[10px] text-red-500 hover:underline px-1.5 py-0.5">Cancel</button>
                            <button onClick={() => statusMutation.mutate({ id: iv.id, status: "no_show" })}
                              className="text-[10px] text-amber-600 hover:underline px-1.5 py-0.5">No Show</button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Feedback display */}
                    {iv.status === "completed" && iv.feedback && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-2 mb-1">
                          {iv.rating && (
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(i => (
                                <Star key={i} className={`h-3 w-3 ${i <= iv.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                              ))}
                            </div>
                          )}
                          {iv.recommendation && iv.recommendation !== "pending" && (
                            <span className={`text-[10px] font-semibold ${REC_COLORS[iv.recommendation] || ""}`}>
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
            )
          ) : (
            /* Schedule Form */
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Interviewer Name *</label>
                <input value={form.interviewer_name} onChange={e => setForm({ ...form, interviewer_name: e.target.value })} className={inputCls} placeholder="Interviewer name" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Date *</label>
                  <input type="date" value={form.interview_date} onChange={e => setForm({ ...form, interview_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Time</label>
                  <input type="time" value={form.interview_time} onChange={e => setForm({ ...form, interview_time: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Duration (min)</label>
                  <input type="number" min={15} step={15} value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 30 })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Type</label>
                  <select value={form.interview_type} onChange={e => setForm({ ...form, interview_type: e.target.value })} className={inputCls}>
                    <option value="in_person">In Person</option>
                    <option value="video">Video Call</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    {form.interview_type === "video" ? "Meeting Link" : "Location"}
                  </label>
                  {form.interview_type === "video" ? (
                    <input value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} className={inputCls} placeholder="https://meet..." />
                  ) : (
                    <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className={inputCls} placeholder="Office, Room 3" />
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-none`} rows={2} placeholder="Any special instructions..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setTab("list")} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
                <button
                  onClick={() => scheduleMutation.mutate()}
                  disabled={!form.interviewer_name || !form.interview_date || scheduleMutation.isPending}
                  className="px-4 py-2 text-sm text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
                >
                  {scheduleMutation.isPending ? "Scheduling..." : "Schedule Interview"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
