import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Plus, Users, Briefcase, CheckCircle, XCircle,
  ChevronRight, Eye, Edit, Trash2, X, Globe, Lock,
  MapPin, DollarSign
} from "lucide-react";
import { toast } from "sonner";

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
    onSuccess: () => {
      toast.success(editRec ? "Recruitment updated" : "Recruitment created");
      queryClient.invalidateQueries({ queryKey: ["hr_recruitments"] });
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
    { label: "Active Recruitments", value: activeRecruitments, icon: Briefcase, color: "bg-blue-100 text-blue-600" },
    { label: "Total Candidates", value: totalCandidates, icon: Users, color: "bg-violet-100 text-violet-600" },
    { label: "Hired", value: totalHired, icon: CheckCircle, color: "bg-emerald-100 text-emerald-600" },
    { label: "Closed", value: closedRecruitments, icon: XCircle, color: "bg-gray-100 text-gray-600" },
  ];

  const JOB_TYPES: Record<string, string> = {
    full_time: "Full Time", part_time: "Part Time", contract: "Contract", internship: "Internship", freelance: "Freelance"
  };
  const EXP_LEVELS: Record<string, string> = {
    fresher: "Fresher", junior: "Junior", mid: "Mid Level", senior: "Senior", lead: "Lead", manager: "Manager"
  };

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20";

  const getDeptName = (id: string) => departments?.find(d => d.id === id)?.name || "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Recruitment</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage job openings and candidate pipeline</p>
        </div>
        <button
          onClick={() => { closeDialog(); setCreateOpen(true); }}
          className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create Recruitment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
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

      {/* Recruitment list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">All Recruitments</h3>
          <button
            onClick={() => navigate("/hrms/recruitment/pipeline")}
            className="text-xs text-[#E8604C] font-medium hover:underline flex items-center gap-1"
          >
            Pipeline View <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : !recruitments?.length ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No recruitments yet</p>
            <button onClick={() => setCreateOpen(true)} className="mt-2 text-[#E8604C] text-sm font-medium hover:underline">
              + Create your first recruitment
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Title</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Department</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Vacancy</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Candidates</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Hired</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recruitments.map(rec => {
                const recCandidates = getCandidatesForRecruitment(rec.id);
                const hired = recCandidates.filter(c => c.hired).length;
                return (
                  <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => navigate(`/hrms/recruitment/pipeline?id=${rec.id}`)}
                        className="font-medium text-gray-900 hover:text-[#E8604C] transition-colors"
                      >
                        {rec.title}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        {rec.location && (
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{rec.location}</span>
                        )}
                        {rec.salary_min && (
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                            <DollarSign className="h-2.5 w-2.5" />
                            {rec.salary_min?.toLocaleString()}{rec.salary_max ? ` - ${rec.salary_max.toLocaleString()}` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{getDeptName(rec.department_id) || "—"}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {JOB_TYPES[rec.job_type] || rec.job_type || "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{rec.vacancy || "—"}</td>
                    <td className="py-3 px-4 text-gray-600">{recCandidates.length}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {hired}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {rec.closed ? (
                        <button onClick={() => toggleCloseMutation.mutate({ id: rec.id, isClosed: true })}
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer">
                          Closed
                        </button>
                      ) : rec.is_published ? (
                        <button onClick={() => togglePublishMutation.mutate({ id: rec.id, isPublished: true })}
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer flex items-center gap-1">
                          <Globe className="h-3 w-3" /> Published
                        </button>
                      ) : (
                        <button onClick={() => togglePublishMutation.mutate({ id: rec.id, isPublished: false })}
                          className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 cursor-pointer flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Draft
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/hrms/recruitment/pipeline?id=${rec.id}`)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                          title="Pipeline"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openEdit(rec)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Edit">
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        {!rec.closed ? (
                          <button onClick={() => toggleCloseMutation.mutate({ id: rec.id, isClosed: false })}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500" title="Close">
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => { if (confirm(`Delete "${rec.title}" and all its data?`)) deleteMutation.mutate(rec.id); }}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
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
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">{editRec ? "Edit" : "Create"} Recruitment</h2>
              <button onClick={closeDialog} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Title */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Job Title *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="e.g. Senior Developer" />
              </div>

              {/* Department + Position */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Department</label>
                  <select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} className={inputCls}>
                    <option value="">Select Department</option>
                    {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Position</label>
                  <select value={form.position_id} onChange={e => setForm({ ...form, position_id: e.target.value })} className={inputCls}>
                    <option value="">Select Position</option>
                    {positions?.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              </div>

              {/* Job Type + Experience + Vacancies */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Job Type</label>
                  <select value={form.job_type} onChange={e => setForm({ ...form, job_type: e.target.value })} className={inputCls}>
                    {Object.entries(JOB_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Experience Level</label>
                  <select value={form.experience_level} onChange={e => setForm({ ...form, experience_level: e.target.value })} className={inputCls}>
                    {Object.entries(EXP_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Vacancies</label>
                  <input type="number" min={1} value={form.vacancy} onChange={e => setForm({ ...form, vacancy: parseInt(e.target.value) || 1 })} className={inputCls} />
                </div>
              </div>

              {/* Salary Range + Location */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Min Salary</label>
                  <input type="number" value={form.salary_min} onChange={e => setForm({ ...form, salary_min: e.target.value })} className={inputCls} placeholder="e.g. 50000" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Max Salary</label>
                  <input type="number" value={form.salary_max} onChange={e => setForm({ ...form, salary_max: e.target.value })} className={inputCls} placeholder="e.g. 80000" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Location</label>
                  <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className={inputCls} placeholder="e.g. Remote, Mumbai" />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  className={`${inputCls} resize-none`} placeholder="Job description..." />
              </div>

              {/* Requirements */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Requirements</label>
                <textarea value={form.requirements} onChange={e => setForm({ ...form, requirements: e.target.value })} rows={3}
                  className={`${inputCls} resize-none`} placeholder="Required skills, qualifications..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={closeDialog} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!form.title || saveMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving..." : editRec ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
