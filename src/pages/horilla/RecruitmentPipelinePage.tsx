import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Plus, GripVertical, User, Mail, Phone, Star, MoreVertical,
  ChevronDown, X, ArrowLeft, Eye, UserCheck, UserX
} from "lucide-react";
import { toast } from "sonner";

interface Stage {
  id: string;
  stage_name: string;
  sequence: number;
  stage_type: string;
  recruitment_id: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  stage_id: string | null;
  recruitment_id: string | null;
  hired: boolean | null;
  canceled: boolean | null;
  rating: number | null;
  source: string | null;
  profile_image_url: string | null;
  schedule_date: string | null;
  created_at: string;
}

const STAGE_COLORS: Record<string, string> = {
  initial: "border-t-blue-400",
  test: "border-t-amber-400",
  interview: "border-t-violet-400",
  offer: "border-t-emerald-400",
  hired: "border-t-green-500",
  cancelled: "border-t-red-400",
  other: "border-t-gray-400",
};

export default function RecruitmentPipelinePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const selectedRecId = searchParams.get("id");
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [addCandidateStageId, setAddCandidateStageId] = useState<string | null>(null);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ name: "", email: "", mobile: "", source: "" });
  const [stageForm, setStageForm] = useState({ stage_name: "", stage_type: "other" });

  const { data: recruitments } = useQuery({
    queryKey: ["hr_recruitments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_recruitments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const activeRec = selectedRecId
    ? recruitments?.find(r => r.id === selectedRecId)
    : recruitments?.[0];

  const { data: stages } = useQuery({
    queryKey: ["hr_stages", activeRec?.id],
    queryFn: async () => {
      if (!activeRec) return [];
      const { data, error } = await supabase
        .from("hr_stages")
        .select("*")
        .eq("recruitment_id", activeRec.id)
        .order("sequence");
      if (error) throw error;
      return (data || []) as Stage[];
    },
    enabled: !!activeRec,
  });

  const { data: candidates } = useQuery({
    queryKey: ["hr_candidates", activeRec?.id],
    queryFn: async () => {
      if (!activeRec) return [];
      const { data, error } = await supabase
        .from("hr_candidates")
        .select("*")
        .eq("recruitment_id", activeRec.id)
        .order("sequence");
      if (error) throw error;
      return (data || []) as Candidate[];
    },
    enabled: !!activeRec,
  });

  const addCandidateMutation = useMutation({
    mutationFn: async () => {
      if (!activeRec || !addCandidateStageId) return;
      const { error } = await supabase.from("hr_candidates").insert({
        name: candidateForm.name,
        email: candidateForm.email || null,
        mobile: candidateForm.mobile || null,
        source: candidateForm.source || null,
        recruitment_id: activeRec.id,
        stage_id: addCandidateStageId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
      setAddCandidateOpen(false);
      setCandidateForm({ name: "", email: "", mobile: "", source: "" });
    },
  });

  const addStageMutation = useMutation({
    mutationFn: async () => {
      if (!activeRec) return;
      const maxSeq = (stages || []).reduce((m, s) => Math.max(m, s.sequence), 0);
      const { error } = await supabase.from("hr_stages").insert({
        stage_name: stageForm.stage_name,
        stage_type: stageForm.stage_type,
        recruitment_id: activeRec.id,
        sequence: maxSeq + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_stages"] });
      setAddStageOpen(false);
      setStageForm({ stage_name: "", stage_type: "other" });
    },
  });

  const moveCandidateMutation = useMutation({
    mutationFn: async ({ candidateId, newStageId }: { candidateId: string; newStageId: string }) => {
      const { error } = await supabase.from("hr_candidates").update({ stage_id: newStageId }).eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr_candidates"] }),
  });

  const hireCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase.from("hr_candidates").update({ hired: true, canceled: false, hired_date: new Date().toISOString().split("T")[0] }).eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate marked as hired");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_hired_not_onboarding"] });
    },
  });

  const cancelCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase.from("hr_candidates").update({ canceled: true, hired: false }).eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate canceled");
      queryClient.invalidateQueries({ queryKey: ["hr_candidates"] });
    },
  });

  const getCandidatesForStage = (stageId: string) =>
    (candidates || []).filter(c => c.stage_id === stageId);

  const stageColor = (type: string) => STAGE_COLORS[type] || STAGE_COLORS.other;

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const avatarColors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/hrms/recruitment")} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {activeRec?.title || "Pipeline"}
            </h1>
            <p className="text-xs text-gray-500">
              {activeRec ? `${activeRec.vacancy || 0} vacancies · ${(candidates || []).length} candidates` : "Select a recruitment"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Recruitment selector */}
          {recruitments && recruitments.length > 1 && (
            <select
              value={activeRec?.id || ""}
              onChange={e => navigate(`/hrms/recruitment/pipeline?id=${e.target.value}`)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white"
            >
              {recruitments.map(r => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setAddStageOpen(true)}
            className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Stage
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      {!activeRec ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          No active recruitment found. Create one first.
        </div>
      ) : !stages?.length ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 text-sm">No stages defined for this recruitment</p>
            <button onClick={() => setAddStageOpen(true)} className="mt-2 text-[#E8604C] text-sm font-medium hover:underline">
              + Add first stage
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 h-full min-h-[500px] pb-4">
            {stages.map(stage => {
              const stageCandidates = getCandidatesForStage(stage.id);
              return (
                <div
                  key={stage.id}
                  className={`w-72 shrink-0 bg-gray-50 rounded-xl border border-gray-200 border-t-4 ${stageColor(stage.stage_type)} flex flex-col`}
                >
                  {/* Stage header */}
                  <div className="px-3 py-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{stage.stage_name}</h3>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                        {stageCandidates.length}
                      </span>
                    </div>
                    <button
                      onClick={() => { setAddCandidateStageId(stage.id); setAddCandidateOpen(true); }}
                      className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-[#E8604C] transition-colors"
                      title="Add candidate"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Candidates */}
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                    {stageCandidates.map(c => (
                      <div
                        key={c.id}
                        className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer group"
                      >
                        <div className="flex items-start gap-2.5">
                          {c.profile_image_url ? (
                            <img src={c.profile_image_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                          ) : (
                            <div className={`w-8 h-8 rounded-full ${getColor(c.id)} flex items-center justify-center text-white font-medium text-xs shrink-0`}>
                              {initials(c.name)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                            {c.email && <p className="text-[11px] text-gray-400 truncate">{c.email}</p>}
                          </div>
                          {/* Actions */}
                          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {stages.findIndex(s => s.id === stage.id) < stages.length - 1 && (
                              <button
                                onClick={() => {
                                  const idx = stages.findIndex(s => s.id === stage.id);
                                  if (idx < stages.length - 1) {
                                    moveCandidateMutation.mutate({ candidateId: c.id, newStageId: stages[idx + 1].id });
                                  }
                                }}
                                className="text-[10px] text-[#E8604C] hover:underline"
                                title="Move to next stage"
                              >
                                Next →
                              </button>
                            )}
                            {!c.hired && !c.canceled && (
                              <button
                                onClick={() => hireCandidateMutation.mutate(c.id)}
                                className="text-[10px] text-emerald-600 hover:underline"
                                title="Mark as Hired"
                              >
                                Hire ✓
                              </button>
                            )}
                            {!c.canceled && !c.hired && (
                              <button
                                onClick={() => cancelCandidateMutation.mutate(c.id)}
                                className="text-[10px] text-red-500 hover:underline"
                                title="Cancel"
                              >
                                Cancel ✗
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Rating + source */}
                        <div className="flex items-center gap-2 mt-2">
                          {c.rating !== null && c.rating > 0 && (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3 w-3 ${i < (c.rating || 0) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}
                                />
                              ))}
                            </div>
                          )}
                          {c.source && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.source}</span>
                          )}
                        </div>

                        {c.schedule_date && (
                          <p className="text-[10px] text-gray-400 mt-1.5">
                            📅 {new Date(c.schedule_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ))}

                    {stageCandidates.length === 0 && (
                      <div className="text-center py-6">
                        <p className="text-xs text-gray-400">No candidates</p>
                        <button
                          onClick={() => { setAddCandidateStageId(stage.id); setAddCandidateOpen(true); }}
                          className="text-xs text-[#E8604C] mt-1 hover:underline"
                        >
                          + Add candidate
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Candidate Dialog */}
      {addCandidateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Candidate</h2>
              <button onClick={() => setAddCandidateOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Name *</label>
                <input
                  value={candidateForm.name}
                  onChange={e => setCandidateForm({ ...candidateForm, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  placeholder="Full name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={candidateForm.email}
                    onChange={e => setCandidateForm({ ...candidateForm, email: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Mobile</label>
                  <input
                    value={candidateForm.mobile}
                    onChange={e => setCandidateForm({ ...candidateForm, mobile: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Source</label>
                <select
                  value={candidateForm.source}
                  onChange={e => setCandidateForm({ ...candidateForm, source: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                >
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
              <button onClick={() => setAddCandidateOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={() => addCandidateMutation.mutate()}
                disabled={!candidateForm.name || addCandidateMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                {addCandidateMutation.isPending ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stage Dialog */}
      {addStageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Stage</h2>
              <button onClick={() => setAddStageOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Stage Name *</label>
                <input
                  value={stageForm.stage_name}
                  onChange={e => setStageForm({ ...stageForm, stage_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  placeholder="e.g. Technical Interview"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Type</label>
                <select
                  value={stageForm.stage_type}
                  onChange={e => setStageForm({ ...stageForm, stage_type: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                >
                  <option value="initial">Initial Screening</option>
                  <option value="test">Test / Assessment</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="hired">Hired</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setAddStageOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={() => addStageMutation.mutate()}
                disabled={!stageForm.stage_name || addStageMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                {addStageMutation.isPending ? "Adding..." : "Add Stage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
