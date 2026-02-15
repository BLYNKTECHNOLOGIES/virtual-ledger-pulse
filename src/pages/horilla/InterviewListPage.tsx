import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, User, Star, Search, Filter, Video, MapPin, CheckCircle, XCircle, AlertCircle, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700",
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  in_person: MapPin,
  video: Video,
  phone: MessageSquare,
};

export default function InterviewListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedbackForm, setFeedbackForm] = useState<{ id: string; rating: number; feedback: string } | null>(null);

  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["hr_interviews_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_interviews")
        .select("*, hr_candidates(name, email), hr_recruitments(title)")
        .order("interview_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("hr_interviews").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_interviews_all"] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      if (!feedbackForm) return;
      const { error } = await supabase.from("hr_interviews").update({
        rating: feedbackForm.rating,
        feedback: feedbackForm.feedback,
        status: "completed",
      }).eq("id", feedbackForm.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_interviews_all"] });
      toast.success("Feedback saved");
      setFeedbackForm(null);
    },
    onError: () => toast.error("Failed to save feedback"),
  });

  const filtered = interviews.filter((i: any) => {
    const matchSearch = !search || 
      i.interviewer_name?.toLowerCase().includes(search.toLowerCase()) ||
      i.hr_candidates?.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.hr_recruitments?.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || i.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: interviews.length,
    scheduled: interviews.filter((i: any) => i.status === "scheduled").length,
    completed: interviews.filter((i: any) => i.status === "completed").length,
    cancelled: interviews.filter((i: any) => i.status === "cancelled").length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Interviews</h1>
        <p className="text-xs text-gray-500 mt-0.5">Manage all scheduled interviews across recruitments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Interviews", value: stats.total, icon: Calendar, color: "bg-violet-100 text-violet-600" },
          { label: "Scheduled", value: stats.scheduled, icon: Clock, color: "bg-blue-100 text-blue-600" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: "bg-emerald-100 text-emerald-600" },
          { label: "Cancelled", value: stats.cancelled, icon: XCircle, color: "bg-red-100 text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search interviews..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
        >
          <option value="all">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Interview List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No interviews found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Candidate</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Recruitment</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Interviewer</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Date & Time</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Rating</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((iv: any) => {
                const TypeIcon = TYPE_ICONS[iv.interview_type] || Calendar;
                return (
                  <tr key={iv.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => navigate(`/hrms/recruitment/candidates/${iv.candidate_id}`)}
                        className="font-medium text-gray-900 hover:text-[#E8604C] transition-colors"
                      >
                        {iv.hr_candidates?.name || "Unknown"}
                      </button>
                      <p className="text-[10px] text-gray-400">{iv.hr_candidates?.email}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{iv.hr_recruitments?.title || "—"}</td>
                    <td className="py-3 px-4 text-gray-600">{iv.interviewer_name}</td>
                    <td className="py-3 px-4">
                      <p className="text-gray-900 text-xs font-medium">{iv.interview_date}</p>
                      {iv.interview_time && <p className="text-[10px] text-gray-400">{iv.interview_time} ({iv.duration_minutes || 30}min)</p>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <TypeIcon className="h-3.5 w-3.5" />
                        {iv.interview_type?.replace("_", " ") || "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {iv.rating ? (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-3.5 w-3.5 ${i < iv.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[iv.status] || "bg-gray-100 text-gray-600"}`}>
                        {iv.status || "pending"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        {iv.status === "scheduled" && (
                          <>
                            <button
                              onClick={() => setFeedbackForm({ id: iv.id, rating: 3, feedback: "" })}
                              className="text-[10px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            >
                              Feedback
                            </button>
                            <button
                              onClick={() => statusMutation.mutate({ id: iv.id, status: "cancelled" })}
                              className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {iv.status === "completed" && iv.feedback && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[100px]" title={iv.feedback}>
                            "{iv.feedback}"
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Feedback Modal */}
      {feedbackForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Interview Feedback</h2>
              <button onClick={() => setFeedbackForm(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(r => (
                    <button key={r} onClick={() => setFeedbackForm({ ...feedbackForm, rating: r })}>
                      <Star className={`h-6 w-6 ${r <= feedbackForm.rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Feedback</label>
                <textarea
                  value={feedbackForm.feedback}
                  onChange={e => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20"
                  placeholder="Share your feedback..."
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setFeedbackForm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={() => feedbackMutation.mutate()} className="px-4 py-2 text-sm bg-[#E8604C] text-white rounded-lg hover:bg-[#d04e3c]">Save Feedback</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
