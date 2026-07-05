import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Plus, Users, Briefcase, CheckCircle, XCircle,
  ChevronRight, Eye, Edit, Trash2, X, Globe, Lock,
  MapPin, DollarSign, UserPlus
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function RecruitmentDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRec, setEditRec] = useState<any>(null);
  const [form, setForm] = useState({
    title: "", vacancy: 1, description: "", start_date: "", end_date: "",
    department_id: "", position_id: "", job_type: "full_time",
    experience_level: "mid", salary_min: "", salary_max: "",
    location: "", requirements: ""
  });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: recruitments, isLoading } = useQuery({
    queryKey: ["hr_recruitments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_recruitments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments_list"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: positions } = useQuery({
    queryKey: ["positions_list"],
    queryFn: async () => {
      const { data } = await supabase.from("positions").select("id, title").eq("is_active", true).order("title");
      return data || [];
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["hr_candidates_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_candidates").select("id, recruitment_id, hired, canceled, stage_id");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recruitmentManagers = [] } = useQuery({
    queryKey: ["hr_recruitment_managers_all"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_recruitment_managers").select("*, hr_employees(first_name, last_name)");
      return data || [];
    },
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["hr_employees_for_rec_mgr"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_employees").select("id, first_name, last_name").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  const [managerDialogRecId, setManagerDialogRecId] = useState<string | null>(null);
  const [selectedMgrId, setSelectedMgrId] = useState("");

  const addRecMgrMutation = useMutation({
    mutationFn: async () => {
      if (!managerDialogRecId || !selectedMgrId) return;
      const { error } = await supabase.from("hr_recruitment_managers").insert({ recruitment_id: managerDialogRecId, employee_id: selectedMgrId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manager assigned");
      queryClient.invalidateQueries({ queryKey: ["hr_recruitment_managers_all"] });
      setManagerDialogRecId(null);
      setSelectedMgrId("");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to assign"),
  });

  const removeRecMgrMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_recruitment_managers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manager removed");
      queryClient.invalidateQueries({ queryKey: ["hr_recruitment_managers_all"] });
    },
  });

  const getRecManagers = (recId: string) => recruitmentManagers.filter((m: any) => m.recruitment_id === recId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: form.title,
        vacancy: form.vacancy,
        description: form.description || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        department_id: form.department_id || null,
        position_id: form.position_id || null,
        job_type: form.job_type,
        experience_level: form.experience_level,
        salary_min: form.salary_min ? parseFloat(form.salary_min) : null,
        salary_max: form.salary_max ? parseFloat(form.salary_max) : null,
        location: form.location || null,
        requirements: form.requirements || null,
      };
      if (editRec) {
        const { error } = await supabase.from("hr_recruitments").update(payload).eq("id", editRec.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_recruitments").insert({
          ...payload,
          is_published: false,
          closed: false,
        });
        if (error) throw error;
      }
    },
    onSuccess: async (_, __, context) => {
      // Auto-create default stages for new recruitments
      if (!editRec) {
        // Get the newly created recruitment
        const { data: newRecs } = await supabase
          .from("hr_recruitments")
          .select("id")
          .eq("title", form.title)
          .order("created_at", { ascending: false })
          .limit(1);
        
        if (newRecs && newRecs.length > 0) {
          const recId = newRecs[0].id;
          const defaultStages = [
            { stage_name: "Initial Screening", stage_type: "initial", sequence: 1 },
            { stage_name: "Written Test", stage_type: "test", sequence: 2 },
            { stage_name: "Technical Interview", stage_type: "interview", sequence: 3 },
            { stage_name: "HR Interview", stage_type: "interview", sequence: 4 },
            { stage_name: "Offer", stage_type: "offer", sequence: 5 },
            { stage_name: "Hired", stage_type: "hired", sequence: 6 },
          ];
          await supabase.from("hr_stages").insert(
            defaultStages.map(s => ({ ...s, recruitment_id: recId }))
          );
        }
      }
      toast.success(editRec ? "Recruitment updated" : "Recruitment created with default stages");
      queryClient.invalidateQueries({ queryKey: ["hr_recruitments"] });
      queryClient.invalidateQueries({ queryKey: ["hr_stages"] });
      closeDialog();
    },
    onError: () => toast.error("Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("hr_candidates").delete().eq("recruitment_id", id);
      await supabase.from("hr_stages").delete().eq("recruitment_id", id);
      const { error } = await supabase.from("hr_recruitments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recruitment deleted");
      queryClient.invalidateQueries({ queryKey: ["hr_recruitments"] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_all"] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      const { error } = await supabase.from("hr_recruitments").update({ is_published: !isPublished }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_recruitments"] });
      toast.success("Status updated");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update status"),
  });

  const toggleCloseMutation = useMutation({
    mutationFn: async ({ id, isClosed }: { id: string; isClosed: boolean }) => {
      const { error } = await supabase.from("hr_recruitments").update({ closed: !isClosed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_recruitments"] });
      toast.success("Status updated");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update status"),
  });

  const closeDialog = () => {
    setCreateOpen(false);
    setEditRec(null);
    setForm({
      title: "", vacancy: 1, description: "", start_date: "", end_date: "",
      department_id: "", position_id: "", job_type: "full_time",
      experience_level: "mid", salary_min: "", salary_max: "",
      location: "", requirements: ""
    });
  };

  const openEdit = (rec: any) => {
    setForm({
      title: rec.title,
      vacancy: rec.vacancy || 1,
      description: rec.description || "",
      start_date: rec.start_date || "",
      end_date: rec.end_date || "",
      department_id: rec.department_id || "",
      position_id: rec.position_id || "",
      job_type: rec.job_type || "full_time",
      experience_level: rec.experience_level || "mid",
      salary_min: rec.salary_min?.toString() || "",
      salary_max: rec.salary_max?.toString() || "",
      location: rec.location || "",
      requirements: rec.requirements || "",
    });
    setEditRec(rec);
    setCreateOpen(true);
  };

  const getCandidatesForRecruitment = (recId: string) =>
    (candidates || []).filter(c => c.recruitment_id === recId);

  const totalCandidates = (candidates || []).length;
  const totalHired = (candidates || []).filter(c => c.hired).length;
  const activeRecruitments = (recruitments || []).filter(r => !r.closed).length;
  const closedRecruitments = (recruitments || []).filter(r => r.closed).length;

  const stats = [
    { label: "Active Recruitments", value: activeRecruitments, icon: Briefcase, color: "bg-info/10 text-info" },
    { label: "Total Candidates", value: totalCandidates, icon: Users, color: "bg-primary/10 text-primary" },
    { label: "Hired", value: totalHired, icon: CheckCircle, color: "bg-success/10 text-success" },
    { label: "Closed", value: closedRecruitments, icon: XCircle, color: "bg-muted text-muted-foreground" },
  ];

  const JOB_TYPES: Record<string, string> = {
    full_time: "Full Time", part_time: "Part Time", contract: "Contract", internship: "Internship", freelance: "Freelance"
  };
  const EXP_LEVELS: Record<string, string> = {
    fresher: "Fresher", junior: "Junior", mid: "Mid Level", senior: "Senior", lead: "Lead", manager: "Manager"
  };

  const inputCls = "w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  const getDeptName = (id: string) => departments?.find(d => d.id === id)?.name || "";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Recruitment"
        description="Manage job openings and candidate pipeline"
        actions={
          <button
            onClick={() => { closeDialog(); setCreateOpen(true); }}
            className="flex items-center gap-2 bg-[#E8604C] text-primary-foreground px-4 h-9 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Create Recruitment
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recruitment list */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">All Recruitments</h3>
          <button
            onClick={() => navigate("/hrms/recruitment/pipeline")}
            className="text-xs text-[#E8604C] font-medium hover:underline flex items-center gap-1"
          >
            Pipeline View <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} columns={9} />
        ) : !recruitments?.length ? (
          <div className="p-8">
            <EmptyState
              icon={Briefcase}
              title="No recruitments yet"
              description="Create your first recruitment to start building your pipeline"
              action={
                <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 px-3 h-9 text-sm font-medium bg-[#E8604C] text-primary-foreground rounded-lg hover:bg-[#d04e3c]">
                  <Plus className="h-4 w-4" /> Create Recruitment
                </button>
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Title</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Department</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Type</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Vacancy</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Candidates</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Hired</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Status</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Managers</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recruitments.map(rec => {
                const recCandidates = getCandidatesForRecruitment(rec.id);
                const hired = recCandidates.filter(c => c.hired).length;
                return (
                  <tr key={rec.id} className="border-b border-muted/20 hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => navigate(`/hrms/recruitment/pipeline?id=${rec.id}`)}
                        className="font-medium text-foreground hover:text-[#E8604C] transition-colors"
                      >
                        {rec.title}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        {rec.location && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{rec.location}</span>
                        )}
                        {rec.salary_min && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <DollarSign className="h-2.5 w-2.5" />
                            {rec.salary_min?.toLocaleString('en-IN')}{rec.salary_max ? ` - ${rec.salary_max.toLocaleString('en-IN')}` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{getDeptName(rec.department_id) || "—"}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/20 font-medium">
                        {JOB_TYPES[rec.job_type] || rec.job_type || "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{rec.vacancy || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{recCandidates.length}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">
                        {hired}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {rec.closed ? (
                        <button onClick={() => toggleCloseMutation.mutate({ id: rec.id, isClosed: true })}
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-muted cursor-pointer">
                          Closed
                        </button>
                      ) : rec.is_published ? (
                        <button onClick={() => togglePublishMutation.mutate({ id: rec.id, isPublished: true })}
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success hover:bg-success/20 cursor-pointer flex items-center gap-1">
                          <Globe className="h-3 w-3" /> Published
                        </button>
                      ) : (
                        <button onClick={() => togglePublishMutation.mutate({ id: rec.id, isPublished: false })}
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning/10 text-warning hover:bg-warning/20 cursor-pointer flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Draft
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        {getRecManagers(rec.id).length > 0 ? (
                          <div className="flex -space-x-1">
                            {getRecManagers(rec.id).slice(0, 3).map((m: any) => (
                              <div key={m.id} className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px] font-bold ring-1 ring-white" title={`${m.hr_employees?.first_name} ${m.hr_employees?.last_name}`}>
                                {m.hr_employees?.first_name?.[0]}{m.hr_employees?.last_name?.[0]}
                              </div>
                            ))}
                            {getRecManagers(rec.id).length > 3 && <span className="text-[10px] text-muted-foreground ml-1">+{getRecManagers(rec.id).length - 3}</span>}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">No managers</span>
                        )}
                        <button onClick={() => setManagerDialogRecId(rec.id)} className="p-0.5 rounded hover:bg-info/10 text-muted-foreground hover:text-info" title="Assign managers">
                          <UserPlus className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/hrms/recruitment/pipeline?id=${rec.id}`)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-info"
                          title="Pipeline"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openEdit(rec)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit">
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        {!rec.closed ? (
                          <button onClick={() => toggleCloseMutation.mutate({ id: rec.id, isClosed: false })}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive" title="Close">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => setDeleteTarget({ id: rec.id, name: rec.title })}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {/* Create/Edit Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl w-full max-w-2xl shadow-sm max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold text-foreground">{editRec ? "Edit" : "Create"} Recruitment</h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Title */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Job Title *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="e.g. Senior Developer" />
              </div>

              {/* Department + Position */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Department</label>
                  <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} className={inputCls}>
                    <option value="">Select Department</option>
                    {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Position</label>
                  <select value={form.position_id} onChange={e => setForm({ ...form, position_id: e.target.value })} className={inputCls}>
                    <option value="">Select Position</option>
                    {positions?.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              </div>

              {/* Job Type + Experience + Vacancies */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Job Type</label>
                  <select value={form.job_type} onChange={e => setForm({ ...form, job_type: e.target.value })} className={inputCls}>
                    {Object.entries(JOB_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Experience Level</label>
                  <select value={form.experience_level} onChange={e => setForm({ ...form, experience_level: e.target.value })} className={inputCls}>
                    {Object.entries(EXP_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Vacancies</label>
                  <input type="number" min={1} value={form.vacancy} onChange={e => setForm({ ...form, vacancy: parseInt(e.target.value) || 1 })} className={inputCls} />
                </div>
              </div>

              {/* Salary Range + Location */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Min Salary</label>
                  <input type="number" value={form.salary_min} onChange={e => setForm({ ...form, salary_min: e.target.value })} className={inputCls} placeholder="e.g. 50000" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Max Salary</label>
                  <input type="number" value={form.salary_max} onChange={e => setForm({ ...form, salary_max: e.target.value })} className={inputCls} placeholder="e.g. 80000" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Location</label>
                  <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className={inputCls} placeholder="e.g. Remote, Mumbai" />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  className={`${inputCls} resize-none`} placeholder="Job description..." />
              </div>

              {/* Requirements */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Requirements</label>
                <textarea value={form.requirements} onChange={e => setForm({ ...form, requirements: e.target.value })} rows={3}
                  className={`${inputCls} resize-none`} placeholder="Required skills, qualifications..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
              <button onClick={closeDialog} className="px-4 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-muted">Cancel</button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!form.title || saveMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving..." : editRec ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager Assignment Dialog */}
      {managerDialogRecId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl w-full max-w-md shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Assign Recruitment Managers</h2>
              <button onClick={() => setManagerDialogRecId(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Select Employee</label>
                <select value={selectedMgrId} onChange={e => setSelectedMgrId(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]">
                  <option value="">Choose employee...</option>
                  {allEmployees
                    .filter((emp: any) => !getRecManagers(managerDialogRecId).some((m: any) => m.employee_id === emp.id))
                    .map((emp: any) => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                    ))}
                </select>
              </div>
              {getRecManagers(managerDialogRecId).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Current Managers</label>
                  <div className="space-y-1">
                    {getRecManagers(managerDialogRecId).map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                        <span className="text-sm text-foreground">{m.hr_employees?.first_name} {m.hr_employees?.last_name}</span>
                        <button onClick={() => removeRecMgrMutation.mutate(m.id)} className="text-xs text-destructive hover:underline">Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button onClick={() => setManagerDialogRecId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Close</button>
              <button
                onClick={() => addRecMgrMutation.mutate()}
                disabled={!selectedMgrId}
                className="px-4 py-2 text-sm bg-[#E8604C] text-primary-foreground rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recruitment</AlertDialogTitle>
            <AlertDialogDescription>Delete "{deleteTarget?.name}" and all its data? This cannot be undone.</AlertDialogDescription>
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
