import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, CheckCircle, Circle, Clock, ChevronDown, X,
  Rocket, User, ClipboardList
} from "lucide-react";

interface OnboardingStage {
  id: string;
  stage_title: string;
  sequence: number;
  is_final_stage: boolean | null;
  recruitment_id: string | null;
}

interface OnboardingTask {
  id: string;
  title: string;
  description: string | null;
  stage_id: string;
}

interface CandidateStage {
  id: string;
  candidate_id: string;
  onboarding_stage_id: string;
  stage_id: string | null;
}

interface CandidateTask {
  id: string;
  candidate_stage_id: string;
  candidate_task_id: string;
  status: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  start_onboard: boolean | null;
  hired: boolean | null;
  profile_image_url: string | null;
  recruitment_id: string | null;
}

export default function OnboardingPage() {
  const queryClient = useQueryClient();
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ stage_title: "", is_final_stage: false });
  const [addTaskOpen, setAddTaskOpen] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", description: "" });

  const { data: stages } = useQuery({
    queryKey: ["hr_onboarding_stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_onboarding_stages")
        .select("*")
        .order("sequence");
      if (error) throw error;
      return (data || []) as OnboardingStage[];
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["hr_onboarding_tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_onboarding_tasks").select("*");
      if (error) throw error;
      return (data || []) as OnboardingTask[];
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["hr_candidates_onboarding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_candidates")
        .select("id, name, email, start_onboard, hired, profile_image_url, recruitment_id")
        .eq("start_onboard", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Candidate[];
    },
  });

  const { data: candidateStages } = useQuery({
    queryKey: ["hr_candidate_stages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_candidate_stages").select("*");
      if (error) throw error;
      return (data || []) as CandidateStage[];
    },
  });

  const { data: candidateTasks } = useQuery({
    queryKey: ["hr_candidate_tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_candidate_tasks").select("*");
      if (error) throw error;
      return (data || []) as CandidateTask[];
    },
  });

  const addStageMutation = useMutation({
    mutationFn: async () => {
      const maxSeq = (stages || []).reduce((m, s) => Math.max(m, s.sequence), 0);
      const { error } = await supabase.from("hr_onboarding_stages").insert({
        stage_title: stageForm.stage_title,
        is_final_stage: stageForm.is_final_stage,
        sequence: maxSeq + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_onboarding_stages"] });
      setAddStageOpen(false);
      setStageForm({ stage_title: "", is_final_stage: false });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      if (!addTaskOpen) return;
      const { error } = await supabase.from("hr_onboarding_tasks").insert({
        title: taskForm.title,
        description: taskForm.description || null,
        stage_id: addTaskOpen,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_onboarding_tasks"] });
      setAddTaskOpen(null);
      setTaskForm({ title: "", description: "" });
    },
  });

  const getTasksForStage = (stageId: string) =>
    (tasks || []).filter(t => t.stage_id === stageId);

  const getCandidateProgress = (candidateId: string) => {
    const cs = (candidateStages || []).filter(s => s.candidate_id === candidateId);
    const ct = (candidateTasks || []).filter(t => cs.some(s => s.id === t.candidate_stage_id));
    const completed = ct.filter(t => t.status === "completed").length;
    return { total: ct.length, completed };
  };

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const avatarColors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Onboarding</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage onboarding stages, tasks, and candidate progress</p>
        </div>
        <button
          onClick={() => setAddStageOpen(true)}
          className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Stage
        </button>
      </div>

      {/* Candidates currently onboarding */}
      {candidates && candidates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Rocket className="h-4 w-4 text-[#E8604C]" />
            Candidates in Onboarding ({candidates.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {candidates.map(c => {
              const progress = getCandidateProgress(c.id);
              const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                  <div className={`w-9 h-9 rounded-full ${getColor(c.id)} flex items-center justify-center text-white font-medium text-xs shrink-0`}>
                    {initials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    {progress.total > 0 ? (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#E8604C] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400">{pct}%</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-400 mt-0.5">No tasks assigned</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stages & Tasks */}
      <div className="space-y-4">
        {!stages?.length ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No onboarding stages defined</p>
            <button onClick={() => setAddStageOpen(true)} className="mt-2 text-[#E8604C] text-sm font-medium hover:underline">
              + Create first stage
            </button>
          </div>
        ) : (
          stages.map((stage, idx) => {
            const stageTasks = getTasksForStage(stage.id);
            return (
              <div key={stage.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#E8604C]/10 flex items-center justify-center text-[#E8604C] text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{stage.stage_title}</h3>
                      {stage.is_final_stage && (
                        <span className="text-[10px] text-emerald-600 font-medium">Final Stage</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{stageTasks.length} task{stageTasks.length !== 1 ? "s" : ""}</span>
                    <button
                      onClick={() => setAddTaskOpen(stage.id)}
                      className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-[#E8604C]"
                      title="Add task"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {stageTasks.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {stageTasks.map(task => (
                      <div key={task.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                        <Circle className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm text-gray-800">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs text-gray-400">No tasks in this stage</p>
                    <button
                      onClick={() => setAddTaskOpen(stage.id)}
                      className="text-xs text-[#E8604C] mt-1 hover:underline"
                    >
                      + Add task
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Stage Dialog */}
      {addStageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Onboarding Stage</h2>
              <button onClick={() => setAddStageOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Stage Title *</label>
                <input
                  value={stageForm.stage_title}
                  onChange={e => setStageForm({ ...stageForm, stage_title: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  placeholder="e.g. Document Collection"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stageForm.is_final_stage}
                  onChange={e => setStageForm({ ...stageForm, is_final_stage: e.target.checked })}
                  className="rounded border-gray-300 text-[#E8604C] focus:ring-[#E8604C]"
                />
                This is the final stage
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setAddStageOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={() => addStageMutation.mutate()}
                disabled={!stageForm.stage_title || addStageMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                {addStageMutation.isPending ? "Adding..." : "Add Stage"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Dialog */}
      {addTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Task</h2>
              <button onClick={() => setAddTaskOpen(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Task Title *</label>
                <input
                  value={taskForm.title}
                  onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]"
                  placeholder="e.g. Submit ID proof"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setAddTaskOpen(null)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={() => addTaskMutation.mutate()}
                disabled={!taskForm.title || addTaskMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50"
              >
                {addTaskMutation.isPending ? "Adding..." : "Add Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
