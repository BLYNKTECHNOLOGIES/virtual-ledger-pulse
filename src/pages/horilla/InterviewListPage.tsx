import { useState } from "react";
import type { ElementType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Star, Search, Video, MapPin, CheckCircle, XCircle, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { ResponsiveList } from "@/components/horilla/primitives/ResponsiveList";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
  pending: "bg-warning/10 text-warning",
};

const TYPE_ICONS: Record<string, ElementType> = {
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
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    candidate_id: "",
    recruitment_id: "",
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

  const { data: candidates = [] } = useQuery({
    queryKey: ["hr_candidates_for_interview"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_candidates").select("id, name, email, recruitment_id, stage_id").eq("hired", false).eq("canceled", false).order("name");
      return data || [];
    },
  });

  const { data: recruitments = [] } = useQuery({
    queryKey: ["hr_recruitments_for_interview"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_recruitments").select("id, title").eq("closed", false).order("title");
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

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const candidate = candidates.find(c => c.id === scheduleForm.candidate_id);
      const { error } = await supabase.from("hr_interviews").insert({
        candidate_id: scheduleForm.candidate_id,
        recruitment_id: candidate?.recruitment_id || scheduleForm.recruitment_id || null,
        stage_id: candidate?.stage_id || null,
        interviewer_name: scheduleForm.interviewer_name,
        interview_date: scheduleForm.interview_date,
        interview_time: scheduleForm.interview_time || null,
        duration_minutes: scheduleForm.duration_minutes,
        interview_type: scheduleForm.interview_type,
        location: scheduleForm.location || null,
        meeting_link: scheduleForm.meeting_link || null,
        notes: scheduleForm.notes || null,
        status: "scheduled",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_interviews_all"] });
      toast.success("Interview scheduled");
      setScheduleOpen(false);
      setScheduleForm({ candidate_id: "", recruitment_id: "", interviewer_name: "", interview_date: "", interview_time: "", duration_minutes: 30, interview_type: "in_person", location: "", meeting_link: "", notes: "" });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to schedule"),
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

  const inputCls = "w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-background text-foreground";

  const filteredCandidates = scheduleForm.recruitment_id
    ? candidates.filter(c => c.recruitment_id === scheduleForm.recruitment_id)
    : candidates;

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Interviews"
        description="Manage all scheduled interviews across recruitments"
        actions={
          <button
            onClick={() => setScheduleOpen(true)}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 h-9 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" /> Schedule Interview
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Total Interviews", value: stats.total, icon: Calendar, color: "bg-primary/10 text-primary" },
          { label: "Scheduled", value: stats.scheduled, icon: Clock, color: "bg-info/10 text-info" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: "bg-success/10 text-success" },
          { label: "Cancelled", value: stats.cancelled, icon: XCircle, color: "bg-destructive/10 text-destructive" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="hrms-toolbar">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search interviews..."
            className="w-full pl-9 pr-3 h-9 border border-border rounded-lg text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-background text-foreground"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-border rounded-lg px-3 h-9 text-sm outline-none focus:border-primary bg-background text-foreground w-full sm:w-auto"
        >
          <option value="all">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Interview List */}
      <div>
        {isLoading ? (
          <TableSkeleton rows={5} columns={8} />
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8">
            <EmptyState
              icon={Calendar}
              title="No interviews found"
              description="Schedule your first interview to get started"
              action={
                <button onClick={() => setScheduleOpen(true)} className="flex items-center gap-1.5 px-3 h-9 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> Schedule Interview
                </button>
              }
            />
          </div>
        ) : (
          <ResponsiveList
            items={filtered}
            keyFor={(iv: any) => iv.id}
            tableMinWidth="min-w-[980px]"
            columns={[
              { key: "candidate", label: "Candidate" },
              { key: "recruitment", label: "Recruitment" },
              { key: "interviewer", label: "Interviewer" },
              { key: "date", label: "Date & Time" },
              { key: "type", label: "Type" },
              { key: "rating", label: "Rating" },
              { key: "status", label: "Status" },
              { key: "actions", label: "Actions" },
            ]}
            renderRow={(iv: any) => {
                const TypeIcon = TYPE_ICONS[iv.interview_type] || Calendar;
                return (
                  <>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => navigate(`/hrms/recruitment/candidates/${iv.candidate_id}`)}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {iv.hr_candidates?.name || "Unknown"}
                      </button>
                      <p className="text-[10px] text-muted-foreground">{iv.hr_candidates?.email}</p>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{iv.hr_recruitments?.title || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{iv.interviewer_name}</td>
                    <td className="py-3 px-4">
                      <p className="text-foreground text-xs font-medium">{iv.interview_date}</p>
                      {iv.interview_time && <p className="text-[10px] text-muted-foreground">{iv.interview_time} ({iv.duration_minutes || 30}min)</p>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TypeIcon className="h-3.5 w-3.5" />
                        {iv.interview_type?.replace("_", " ") || "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {iv.rating ? (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-3.5 w-3.5 ${i < iv.rating ? "text-warning fill-warning" : "text-muted-foreground"}`} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[iv.status] || "bg-muted text-muted-foreground"}`}>
                        {iv.status || "pending"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        {iv.status === "scheduled" && (
                          <>
                            <button
                              onClick={() => setFeedbackForm({ id: iv.id, rating: 3, feedback: "" })}
                              className="text-[10px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/10"
                            >
                              Feedback
                            </button>
                            <button
                              onClick={() => statusMutation.mutate({ id: iv.id, status: "cancelled" })}
                              className="text-[10px] px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/10"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {iv.status === "completed" && iv.feedback && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={iv.feedback}>
                            "{iv.feedback}"
                          </span>
                        )}
                      </div>
                    </td>
                  </>
                );
            }}
            renderCard={(iv: any) => {
              const TypeIcon = TYPE_ICONS[iv.interview_type] || Calendar;
              return (
                <div className="hrms-mobile-card space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        onClick={() => navigate(`/hrms/recruitment/candidates/${iv.candidate_id}`)}
                        className="text-sm font-semibold text-foreground hover:text-primary text-left break-words"
                      >
                        {iv.hr_candidates?.name || "Unknown"}
                      </button>
                      <p className="text-xs text-muted-foreground break-words">{iv.hr_recruitments?.title || "No recruitment"}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[iv.status] || "bg-muted text-muted-foreground"}`}>
                      {iv.status || "pending"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <div className="hrms-mobile-kv"><span>Interviewer</span><strong>{iv.interviewer_name || "—"}</strong></div>
                    <div className="hrms-mobile-kv"><span>Date</span><strong>{iv.interview_date || "—"}{iv.interview_time ? ` · ${iv.interview_time}` : ""}</strong></div>
                    <div className="hrms-mobile-kv"><span>Type</span><strong className="inline-flex items-center gap-1"><TypeIcon className="h-3.5 w-3.5" /> {iv.interview_type?.replace("_", " ") || "—"}</strong></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {iv.rating ? (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3.5 w-3.5 ${i < iv.rating ? "text-warning fill-warning" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">No rating</span>}
                    {iv.status === "scheduled" && (
                      <div className="flex gap-2">
                        <button onClick={() => setFeedbackForm({ id: iv.id, rating: 3, feedback: "" })} className="text-xs px-2.5 py-1 rounded bg-success/10 text-success hover:bg-success/20">Feedback</button>
                        <button onClick={() => statusMutation.mutate({ id: iv.id, status: "cancelled" })} className="text-xs px-2.5 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      <ResponsiveDialog
        open={!!feedbackForm}
        onOpenChange={(open) => !open && setFeedbackForm(null)}
        title="Interview Feedback"
        contentClassName="max-w-md"
        footer={
          <>
            <button onClick={() => setFeedbackForm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Cancel</button>
            <button onClick={() => feedbackMutation.mutate()} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">Save Feedback</button>
          </>
        }
      >
        {feedbackForm && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(r => (
                    <button key={r} onClick={() => setFeedbackForm({ ...feedbackForm, rating: r })}>
                      <Star className={`h-6 w-6 ${r <= feedbackForm.rating ? "text-warning fill-warning" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Feedback</label>
                <textarea
                  value={feedbackForm.feedback}
                  onChange={e => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                  rows={3}
                  className={inputCls}
                  placeholder="Share your feedback..."
                />
              </div>
            </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        title="Schedule Interview"
        contentClassName="max-w-lg"
        footer={
          <>
            <button onClick={() => setScheduleOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Cancel</button>
            <button
              onClick={() => scheduleMutation.mutate()}
              disabled={!scheduleForm.candidate_id || !scheduleForm.interviewer_name || !scheduleForm.interview_date || scheduleMutation.isPending}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {scheduleMutation.isPending ? "Scheduling..." : "Schedule Interview"}
            </button>
          </>
        }
      >
            <div className="space-y-4">
              {/* Recruitment filter */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Recruitment</label>
                <select value={scheduleForm.recruitment_id} onChange={e => setScheduleForm({ ...scheduleForm, recruitment_id: e.target.value, candidate_id: "" })} className={inputCls}>
                  <option value="">All Recruitments</option>
                  {recruitments.map((r: any) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </div>
              {/* Candidate */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Candidate *</label>
                <select value={scheduleForm.candidate_id} onChange={e => setScheduleForm({ ...scheduleForm, candidate_id: e.target.value })} className={inputCls}>
                  <option value="">Select Candidate</option>
                  {filteredCandidates.map((c: any) => <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ""}</option>)}
                </select>
              </div>
              {/* Interviewer */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Interviewer Name *</label>
                <input value={scheduleForm.interviewer_name} onChange={e => setScheduleForm({ ...scheduleForm, interviewer_name: e.target.value })} className={inputCls} placeholder="Interviewer name" />
              </div>
              {/* Date, Time, Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Date *</label>
                  <input type="date" value={scheduleForm.interview_date} onChange={e => setScheduleForm({ ...scheduleForm, interview_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Time</label>
                  <input type="time" value={scheduleForm.interview_time} onChange={e => setScheduleForm({ ...scheduleForm, interview_time: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Duration</label>
                  <input type="number" min={15} step={15} value={scheduleForm.duration_minutes} onChange={e => setScheduleForm({ ...scheduleForm, duration_minutes: parseInt(e.target.value) || 30 })} className={inputCls} />
                </div>
              </div>
              {/* Type + Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Type</label>
                  <select value={scheduleForm.interview_type} onChange={e => setScheduleForm({ ...scheduleForm, interview_type: e.target.value })} className={inputCls}>
                    <option value="in_person">In Person</option>
                    <option value="video">Video Call</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    {scheduleForm.interview_type === "video" ? "Meeting Link" : "Location"}
                  </label>
                  {scheduleForm.interview_type === "video" ? (
                    <input value={scheduleForm.meeting_link} onChange={e => setScheduleForm({ ...scheduleForm, meeting_link: e.target.value })} className={inputCls} placeholder="https://meet..." />
                  ) : (
                    <input value={scheduleForm.location} onChange={e => setScheduleForm({ ...scheduleForm, location: e.target.value })} className={inputCls} placeholder="Office, Room 3" />
                  )}
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Notes</label>
                <textarea value={scheduleForm.notes} onChange={e => setScheduleForm({ ...scheduleForm, notes: e.target.value })} className={`${inputCls} resize-none`} rows={2} placeholder="Any special instructions..." />
              </div>
            </div>
      </ResponsiveDialog>
    </div>
  );
}