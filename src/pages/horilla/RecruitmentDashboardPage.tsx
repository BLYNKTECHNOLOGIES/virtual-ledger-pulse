import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Plus, Users, Briefcase, CheckCircle, Clock, XCircle,
  ChevronRight, MoreVertical, Eye, Edit, Trash2, X, Calendar
} from "lucide-react";

export default function RecruitmentDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", vacancy: 1, description: "", start_date: "", end_date: "" });

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

  const { data: candidates } = useQuery({
    queryKey: ["hr_candidates_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_candidates").select("id, recruitment_id, hired, canceled, stage_id");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: stages } = useQuery({
    queryKey: ["hr_stages_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_stages").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_recruitments").insert({
        title: form.title,
        vacancy: form.vacancy,
        description: form.description || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_published: false,
        closed: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_recruitments"] });
      setCreateOpen(false);
      setForm({ title: "", vacancy: 1, description: "", start_date: "", end_date: "" });
    },
  });

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Recruitment</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage job openings and candidate pipeline</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
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
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Vacancy</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Candidates</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Hired</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Dates</th>
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
                      {rec.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{rec.description}</p>
                      )}
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
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Closed</span>
                      ) : rec.is_published ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Published</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Draft</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {rec.start_date && <span>{new Date(rec.start_date).toLocaleDateString()}</span>}
                      {rec.start_date && rec.end_date && <span> - </span>}
                      {rec.end_date && <span>{new Date(rec.end_date).toLocaleDateString()}</span>}
                      {!rec.start_date && !rec.end_date && "—"}
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
                        <button className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Edit">
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Create Recruitment</h2>
              <button onClick={() => setCreateOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20"
                  placeholder="e.g. Senior Developer Hiring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Vacancies</label>
                  <input
                    type="number"
                    min={1}
                    value={form.vacancy}
                    onChange={e => setForm({ ...form, vacancy: parseInt(e.target.value) || 1 })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] focus:ring-1 focus:ring-[#E8604C]/20 resize-none"
                  placeholder="Job description..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.title || createMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
