import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, CheckCircle, Circle, X, Rocket, ClipboardList,
  Edit, Trash2, ChevronDown, UserPlus
} from "lucide-react";
import { toast } from "sonner";

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
}

export default function OnboardingPage() {
  const queryClient = useQueryClient();
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ stage_title: "", is_final_stage: false });
  const [addTaskOpen, setAddTaskOpen] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", description: "" });
  const [editStageId, setEditStageId] = useState<string | null>(null);
  const [editStageForm, setEditStageForm] = useState({ stage_title: "", is_final_stage: false });
  const [startOnboardOpen, setStartOnboardOpen] = useState(false);

  const { data: stages } = useQuery({
    queryKey: ["hr_onboarding_stages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_onboarding_stages").select("*").order("sequence");
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

  const { data: onboardingCandidates } = useQuery({
    queryKey: ["hr_candidates_onboarding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_candidates")
        .select("id, name, email, start_onboard, hired, profile_image_url")
        .eq("start_onboard", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Candidate[];
    },
  });

  // Hired candidates not yet onboarding
  const { data: hiredCandidates } = useQuery({
    queryKey: ["hr_candidates_hired_not_onboarding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_candidates")
        .select("id, name, email, start_onboard, hired, profile_image_url")
        .eq("hired", true)
        .or("start_onboard.is.null,start_onboard.eq.false");
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

  // Mutations
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
      toast.success("Stage added");
    },
    onError: () => toast.error("Failed to add stage"),
  });

  const updateStageMutation = useMutation({
    mutationFn: async () => {
      if (!editStageId) return;
      const { error } = await supabase.from("hr_onboarding_stages").update({
        stage_title: editStageForm.stage_title,
        is_final_stage: editStageForm.is_final_stage,
      }).eq("id", editStageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_onboarding_stages"] });
      setEditStageId(null);
      toast.success("Stage updated");
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      await supabase.from("hr_onboarding_tasks").delete().eq("stage_id", stageId);
      const { error } = await supabase.from("hr_onboarding_stages").delete().eq("id", stageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_onboarding_stages"] });
      queryClient.invalidateQueries({ queryKey: ["hr_onboarding_tasks"] });
      toast.success("Stage deleted");
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
      toast.success("Task added");
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("hr_onboarding_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_onboarding_tasks"] });
      toast.success("Task deleted");
    },
  });

  const startOnboardMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      // Mark candidate as onboarding
      const { error } = await supabase.from("hr_candidates").update({ start_onboard: true }).eq("id", candidateId);
      if (error) throw error;

      // Create candidate stages & tasks
      for (const stage of (stages || [])) {
        const { data: cs, error: csErr } = await supabase.from("hr_candidate_stages").insert({
          candidate_id: candidateId,
          onboarding_stage_id: stage.id,
        }).select().single();
        if (csErr) continue;

        const stageTasks = (tasks || []).filter(t => t.stage_id === stage.id);
        for (const task of stageTasks) {
          await supabase.from("hr_candidate_tasks").insert({
            candidate_stage_id: cs.id,
            candidate_task_id: task.id,
            status: "pending",
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidates_hired_not_onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidate_stages"] });
      queryClient.invalidateQueries({ queryKey: ["hr_candidate_tasks"] });
      setStartOnboardOpen(false);
      toast.success("Onboarding started");
    },
    onError: () => toast.error("Failed to start onboarding"),
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, currentStatus }: { taskId: string; currentStatus: string }) => {
      const newStatus = currentStatus === "completed" ? "pending" : "completed";
      const { error } = await supabase.from("hr_candidate_tasks").update({ status: newStatus }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr_candidate_tasks"] }),
  });

  const getTasksForStage = (stageId: string) => (tasks || []).filter(t => t.stage_id === stageId);

  const getCandidateProgress = (candidateId: string) => {
    const cs = (candidateStages || []).filter(s => s.candidate_id === candidateId);
    const ct = (candidateTasks || []).filter(t => cs.some(s => s.id === t.candidate_stage_id));
    const completed = ct.filter(t => t.status === "completed").length;
    return { total: ct.length, completed, tasks: ct };
  };

  const getCandidateTasksForStage = (candidateId: string, stageId: string) => {
    const cs = (candidateStages || []).find(s => s.candidate_id === candidateId && s.onboarding_stage_id === stageId);
    if (!cs) return [];
    return (candidateTasks || []).filter(t => t.candidate_stage_id === cs.id);
  };

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const avatarColors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const getColor = (id: string) => avatarColors[id.charCodeAt(0) % avatarColors.length];

  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Onboarding</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage onboarding stages, tasks, and candidate progress</p>
        </div>
        <div className="flex items-center gap-2">
          {(hiredCandidates || []).length > 0 && (
            <button
              onClick={() => setStartOnboardOpen(true)}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Start Onboarding ({hiredCandidates!.length})
            </button>
          )}
          <button
            onClick={() => setAddStageOpen(true)}
            className="flex items-center gap-2 bg-[#E8604C] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d04e3c] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Stage
          </button>
        </div>
      </div>

      {/* Candidates currently onboarding */}
      {onboardingCandidates && onboardingCandidates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Rocket className="h-4 w-4 text-[#E8604C]" />
            Candidates in Onboarding ({onboardingCandidates.length})
          </h3>
          <div className="space-y-3">
            {onboardingCandidates.map(c => {
              const progress = getCandidateProgress(c.id);
              const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
              const expanded = expandedCandidate === c.id;
              return (
                <div key={c.id} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedCandidate(expanded ? null : c.id)}
                  >
                    <div className={`w-9 h-9 rounded-full ${getColor(c.id)} flex items-center justify-center text-white font-medium text-xs shrink-0`}>
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[200px]">
                          <div className="h-full bg-[#E8604C] rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400">{progress.completed}/{progress.total} tasks ({pct}%)</span>
                      </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </div>

                  {/* Expanded: show tasks per stage */}
                  {expanded && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-3">
                      {(stages || []).map(stage => {
                        const cTasks = getCandidateTasksForStage(c.id, stage.id);
                        if (cTasks.length === 0) return null;
                        const taskDefs = (tasks || []);
                        return (
                          <div key={stage.id}>
                            <p className="text-xs font-semibold text-gray-600 mb-1.5">{stage.stage_title}</p>
                            <div className="space-y-1">
                              {cTasks.map(ct => {
                                const taskDef = taskDefs.find(t => t.id === ct.candidate_task_id);
                                const done = ct.status === "completed";
                                return (
                                  <button
                                    key={ct.id}
                                    onClick={() => toggleTaskMutation.mutate({ taskId: ct.id, currentStatus: ct.status })}
                                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-white transition-colors"
                                  >
                                    {done ? (
                                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                                    ) : (
                                      <Circle className="h-4 w-4 text-gray-300 shrink-0" />
                                    )}
                                    <span className={`text-sm ${done ? "line-through text-gray-400" : "text-gray-700"}`}>
                                      {taskDef?.title || "Unknown task"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                      {stage.is_final_stage && <span className="text-[10px] text-emerald-600 font-medium">Final Stage</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400 mr-2">{stageTasks.length} task{stageTasks.length !== 1 ? "s" : ""}</span>
                    <button
                      onClick={() => setAddTaskOpen(stage.id)}
                      className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-[#E8604C]"
                      title="Add task"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setEditStageId(stage.id); setEditStageForm({ stage_title: stage.stage_title, is_final_stage: stage.is_final_stage || false }); }}
                      className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                      title="Edit stage"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete stage "${stage.stage_title}" and all its tasks?`)) deleteStageMutation.mutate(stage.id); }}
                      className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-red-500"
                      title="Delete stage"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {stageTasks.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {stageTasks.map(task => (
                      <div key={task.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors group">
                        <Circle className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-800">{task.title}</p>
                          {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                        </div>
                        <button
                          onClick={() => { if (confirm(`Delete task "${task.title}"?`)) deleteTaskMutation.mutate(task.id); }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-center">
                    <p className="text-xs text-gray-400">No tasks in this stage</p>
                    <button onClick={() => setAddTaskOpen(stage.id)} className="text-xs text-[#E8604C] mt-1 hover:underline">+ Add task</button>
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
              <button onClick={() => setAddStageOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Stage Title *</label>
                <input value={stageForm.stage_title} onChange={e => setStageForm({ ...stageForm, stage_title: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]" placeholder="e.g. Document Collection" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={stageForm.is_final_stage} onChange={e => setStageForm({ ...stageForm, is_final_stage: e.target.checked })} className="rounded border-gray-300 text-[#E8604C] focus:ring-[#E8604C]" />
                This is the final stage
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setAddStageOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => addStageMutation.mutate()} disabled={!stageForm.stage_title || addStageMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {addStageMutation.isPending ? "Adding..." : "Add Stage"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Stage Dialog */}
      {editStageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Edit Stage</h2>
              <button onClick={() => setEditStageId(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Stage Title *</label>
                <input value={editStageForm.stage_title} onChange={e => setEditStageForm({ ...editStageForm, stage_title: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={editStageForm.is_final_stage} onChange={e => setEditStageForm({ ...editStageForm, is_final_stage: e.target.checked })} className="rounded border-gray-300 text-[#E8604C] focus:ring-[#E8604C]" />
                This is the final stage
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setEditStageId(null)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => updateStageMutation.mutate()} disabled={!editStageForm.stage_title || updateStageMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {updateStageMutation.isPending ? "Saving..." : "Save"}
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
              <button onClick={() => setAddTaskOpen(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Task Title *</label>
                <input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C]" placeholder="e.g. Submit ID proof" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#E8604C] resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setAddTaskOpen(null)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={() => addTaskMutation.mutate()} disabled={!taskForm.title || addTaskMutation.isPending} className="px-4 py-2 text-sm font-medium text-white bg-[#E8604C] rounded-lg hover:bg-[#d04e3c] disabled:opacity-50">
                {addTaskMutation.isPending ? "Adding..." : "Add Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start Onboarding Dialog */}
      {startOnboardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Start Onboarding</h2>
              <button onClick={() => setStartOnboardOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-500 mb-3">Select a hired candidate to begin their onboarding process:</p>
              {(hiredCandidates || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No hired candidates available</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {(hiredCandidates || []).map(c => (
                    <button
                      key={c.id}
                      onClick={() => startOnboardMutation.mutate(c.id)}
                      disabled={startOnboardMutation.isPending}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-[#E8604C] hover:bg-[#E8604C]/5 transition-colors text-left disabled:opacity-50"
                    >
                      <div className={`w-9 h-9 rounded-full ${getColor(c.id)} flex items-center justify-center text-white font-medium text-xs shrink-0`}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end px-5 py-4 border-t border-gray-100">
              <button onClick={() => setStartOnboardOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
