import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Circle, ListTodo, Users } from "lucide-react";

interface Props {
  onboardingId: string;
  recruitmentId?: string | null;
}

export default function OnboardingTaskManager({ onboardingId, recruitmentId }: Props) {
  const qc = useQueryClient();
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [stageForm, setStageForm] = useState({ stage_title: "", sequence: 1 });
  const [taskForm, setTaskForm] = useState({ title: "", description: "" });

  // Fetch onboarding stages
  const { data: stages = [] } = useQuery({
    queryKey: ["hr_onboarding_stages", recruitmentId],
    queryFn: async () => {
      let q = (supabase as any).from("hr_onboarding_stages").select("*").order("sequence");
      if (recruitmentId) q = q.eq("recruitment_id", recruitmentId);
      const { data } = await q;
      return (data as any[]) || [];
    },
  });

  // Fetch tasks for all stages
  const stageIds = stages.map((s: any) => s.id);
  const { data: tasks = [] } = useQuery({
    queryKey: ["hr_onboarding_tasks", stageIds],
    queryFn: async () => {
      if (!stageIds.length) return [];
      const { data } = await (supabase as any).from("hr_onboarding_tasks").select("*").in("stage_id", stageIds);
      return (data as any[]) || [];
    },
    enabled: stageIds.length > 0,
  });

  // Fetch task assignments (completion status)
  const taskIds = tasks.map((t: any) => t.id);
  const { data: taskEmployees = [] } = useQuery({
    queryKey: ["hr_onboarding_task_employees", taskIds],
    queryFn: async () => {
      if (!taskIds.length) return [];
      const { data } = await (supabase as any).from("hr_onboarding_task_employees").select("*").in("task_id", taskIds);
      return (data as any[]) || [];
    },
    enabled: taskIds.length > 0,
  });

  // Fetch stage managers
  const { data: stageManagers = [] } = useQuery({
    queryKey: ["hr_onboarding_stage_managers", stageIds],
    queryFn: async () => {
      if (!stageIds.length) return [];
      const { data } = await (supabase as any)
        .from("hr_onboarding_stage_managers")
        .select("*, hr_employees!hr_onboarding_stage_managers_employee_id_fkey(first_name, last_name)")
        .in("stage_id", stageIds);
      return (data as any[]) || [];
    },
    enabled: stageIds.length > 0,
  });

  const addStage = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_onboarding_stages").insert({
        stage_title: stageForm.stage_title,
        sequence: stageForm.sequence,
        recruitment_id: recruitmentId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_onboarding_stages"] });
      setShowStageDialog(false);
      setStageForm({ stage_title: "", sequence: stages.length + 1 });
      toast.success("Stage added");
    },
    onError: () => toast.error("Failed to add stage"),
  });

  const addTask = useMutation({
    mutationFn: async () => {
      if (!selectedStageId) return;
      const { error } = await (supabase as any).from("hr_onboarding_tasks").insert({
        stage_id: selectedStageId,
        title: taskForm.title,
        description: taskForm.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_onboarding_tasks"] });
      setShowTaskDialog(false);
      setTaskForm({ title: "", description: "" });
      toast.success("Task added");
    },
    onError: () => toast.error("Failed to add task"),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ taskId, employeeId, completed }: { taskId: string; employeeId: string; completed: boolean }) => {
      const existing = taskEmployees.find((te: any) => te.task_id === taskId && te.employee_id === employeeId);
      if (existing) {
        await (supabase as any).from("hr_onboarding_task_employees").update({
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
        }).eq("id", existing.id);
      } else {
        await (supabase as any).from("hr_onboarding_task_employees").insert({
          task_id: taskId,
          employee_id: employeeId,
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr_onboarding_task_employees"] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("hr_onboarding_tasks").delete().eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_onboarding_tasks"] });
      toast.success("Task deleted");
    },
  });

  // Get employee_id from onboarding record
  const { data: onboarding } = useQuery({
    queryKey: ["hr_employee_onboarding_detail", onboardingId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employee_onboarding").select("*").eq("id", onboardingId).single();
      return data;
    },
  });

  const employeeId = onboarding?.employee_id || onboarding?.candidate_id; // prefer employee_id from Stage 5 finalization

  const loadDefaultTemplate = useMutation({
    mutationFn: async () => {
      const defaults = [
        { stage_title: "Document Collection", sequence: 1, tasks: ["Collect ID proof", "Collect address proof", "Collect PAN card", "Collect bank details"] },
        { stage_title: "IT Setup", sequence: 2, tasks: ["Create email account", "Setup workstation", "Assign software licenses", "Provide VPN access"] },
        { stage_title: "Orientation", sequence: 3, tasks: ["Company overview session", "Meet team members", "Office tour", "Review company policies"] },
        { stage_title: "Training", sequence: 4, tasks: ["Role-specific training", "Tools & systems training", "Compliance training"] },
        { stage_title: "Probation Review", sequence: 5, tasks: ["30-day check-in", "60-day performance review", "Probation confirmation"], is_final_stage: true },
      ];
      for (const s of defaults) {
        const { data: stage, error } = await (supabase as any).from("hr_onboarding_stages").insert({
          stage_title: s.stage_title, sequence: s.sequence, recruitment_id: recruitmentId || null, is_final_stage: s.is_final_stage || false,
        }).select("id").single();
        if (error) throw error;
        if (stage && s.tasks.length) {
          await (supabase as any).from("hr_onboarding_tasks").insert(s.tasks.map(t => ({ stage_id: stage.id, title: t })));
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_onboarding_stages"] });
      qc.invalidateQueries({ queryKey: ["hr_onboarding_tasks"] });
      toast.success("Default template loaded with 5 stages");
    },
    onError: () => toast.error("Failed to load template"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ListTodo className="h-5 w-5" /> Onboarding Stages & Tasks
        </h3>
        <div className="flex gap-2">
          {stages.length === 0 && (
            <Button size="sm" variant="outline" onClick={() => loadDefaultTemplate.mutate()} disabled={loadDefaultTemplate.isPending}>
              Load Default Template
            </Button>
          )}
          <Button size="sm" onClick={() => { setStageForm({ stage_title: "", sequence: stages.length + 1 }); setShowStageDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Stage
          </Button>
        </div>
      </div>

      {stages.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No onboarding stages defined. Click "Load Default Template" or add stages manually.</CardContent></Card>
      ) : (
        stages.map((stage: any) => {
          const stageTasks = tasks.filter((t: any) => t.stage_id === stage.id);
          const managers = stageManagers.filter((m: any) => m.stage_id === stage.id);
          const completedCount = stageTasks.filter((t: any) =>
            taskEmployees.some((te: any) => te.task_id === t.id && te.is_completed)
          ).length;

          return (
            <Card key={stage.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">{stage.sequence}</span>
                    {stage.stage_title}
                    {stage.is_final_stage && <Badge variant="outline" className="ml-2 text-xs">Final</Badge>}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{completedCount}/{stageTasks.length} done</span>
                    <Button size="sm" variant="outline" onClick={() => { setSelectedStageId(stage.id); setShowTaskDialog(true); }}>
                      <Plus className="h-3 w-3 mr-1" /> Task
                    </Button>
                  </div>
                </div>
                {managers.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Managers: {managers.map((m: any) => `${m.hr_employees?.first_name || ""} ${m.hr_employees?.last_name || ""}`).join(", ")}
                    </span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {stageTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No tasks in this stage</p>
                ) : (
                  <div className="space-y-2">
                    {stageTasks.map((task: any) => {
                      const assignment = taskEmployees.find((te: any) => te.task_id === task.id);
                      const isCompleted = assignment?.is_completed || false;
                      return (
                        <div key={task.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 group">
                          <button
                            onClick={() => employeeId && toggleTask.mutate({ taskId: task.id, employeeId, completed: !isCompleted })}
                            className="mt-0.5"
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground" />
                            )}
                          </button>
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                            {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                          </div>
                          <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 h-7 w-7" onClick={() => deleteTask.mutate(task.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Onboarding Stage</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Stage Title</Label><Input value={stageForm.stage_title} onChange={(e) => setStageForm((p) => ({ ...p, stage_title: e.target.value }))} /></div>
            <div><Label>Sequence</Label><Input type="number" value={stageForm.sequence} onChange={(e) => setStageForm((p) => ({ ...p, sequence: +e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => addStage.mutate()} disabled={!stageForm.stage_title}>Add Stage</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => addTask.mutate()} disabled={!taskForm.title}>Add Task</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
