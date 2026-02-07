
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, CheckCircle, Clock, AlertTriangle, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "../shared/StatusBadge";
import { Progress } from "@/components/ui/progress";

export function OnboardingDashboard() {
  const { toast } = useToast();
  const [showAddStage, setShowAddStage] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [newStageTitle, setNewStageTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");

  const { data: stages = [], refetch: refetchStages } = useQuery({
    queryKey: ["hr_onboarding_stages"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_onboarding_stages").select("*, hr_onboarding_tasks(*)").order("sequence", { ascending: true });
      return data || [];
    },
  });

  const { data: candidateStages = [] } = useQuery({
    queryKey: ["hr_candidate_stages"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_candidate_stages").select("*, hr_candidate_tasks(*)");
      return data || [];
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["hr_candidates_onboarding"],
    queryFn: async () => {
      const { data } = await supabase.from("hr_candidates").select("id, name, email, start_onboard, hired, recruitment_id").eq("start_onboard", true);
      return data || [];
    },
  });

  const addStage = async () => {
    if (!newStageTitle.trim()) return;
    await supabase.from("hr_onboarding_stages").insert({
      stage_title: newStageTitle,
      sequence: stages.length,
    });
    setNewStageTitle("");
    setShowAddStage(false);
    refetchStages();
    toast({ title: "Onboarding stage added" });
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !selectedStageId) return;
    await supabase.from("hr_onboarding_tasks").insert({
      title: newTaskTitle,
      description: newTaskDesc || null,
      stage_id: selectedStageId,
    });
    setNewTaskTitle("");
    setNewTaskDesc("");
    setShowAddTask(false);
    refetchStages();
    toast({ title: "Task added" });
  };

  const totalOnboarding = candidates.length;
  const completedCount = candidateStages.filter((cs: any) =>
    cs.hr_candidate_tasks?.every((t: any) => t.status === "done")
  ).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Active Onboarding", value: totalOnboarding, icon: ClipboardList, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
          { title: "Stages Defined", value: stages.length, icon: Clock, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
          { title: "Completed", value: completedCount, icon: CheckCircle, iconBg: "bg-green-100", iconColor: "text-green-600" },
          { title: "Pending Tasks", value: candidateStages.reduce((s: number, cs: any) => s + (cs.hr_candidate_tasks?.filter((t: any) => t.status !== "done")?.length || 0), 0), icon: AlertTriangle, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border border-gray-100 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">{card.title}</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{card.value}</p>
                  </div>
                  <div className={`${card.iconBg} w-10 h-10 rounded-lg flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stages & Tasks */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Onboarding Stages & Tasks</h3>
        <Button size="sm" className="h-9 bg-[#009C4A] hover:bg-[#008040] text-white text-xs" onClick={() => setShowAddStage(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Stage
        </Button>
      </div>

      {stages.length === 0 ? (
        <div className="py-16 text-center">
          <Search className="h-10 w-10 mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">No onboarding stages defined yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stages.map((stage: any, idx: number) => (
            <Card key={stage.id} className="border border-gray-100 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-[#009C4A]/10 text-[#009C4A] flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">{stage.stage_title}</h4>
                      <p className="text-[10px] text-gray-400">{stage.hr_onboarding_tasks?.length || 0} tasks · {stage.is_final_stage ? "Final Stage" : `Stage ${idx + 1}`}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px]"
                    onClick={() => { setSelectedStageId(stage.id); setShowAddTask(true); }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Task
                  </Button>
                </div>
                {stage.hr_onboarding_tasks?.length > 0 && (
                  <div className="space-y-1.5 ml-10">
                    {stage.hr_onboarding_tasks.map((task: any) => (
                      <div key={task.id} className="flex items-center gap-2 text-xs text-gray-600 py-1 px-2 bg-gray-50 rounded">
                        <CheckCircle className="h-3.5 w-3.5 text-gray-300" />
                        <span>{task.title}</span>
                        {task.description && <span className="text-gray-400 truncate">— {task.description}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Candidates in Onboarding */}
      {candidates.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-700">Candidates in Onboarding</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidates.map((c: any) => {
              const cStages = candidateStages.filter((cs: any) => cs.candidate_id === c.id);
              const totalTasks = cStages.reduce((s: number, cs: any) => s + (cs.hr_candidate_tasks?.length || 0), 0);
              const doneTasks = cStages.reduce((s: number, cs: any) => s + (cs.hr_candidate_tasks?.filter((t: any) => t.status === "done")?.length || 0), 0);
              const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
              return (
                <Card key={c.id} className="border border-gray-100 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold">
                        {c.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                        <p className="text-[10px] text-gray-400">{c.email || "No email"}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{doneTasks}/{totalTasks} tasks</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Add Stage Dialog */}
      <Dialog open={showAddStage} onOpenChange={setShowAddStage}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Add Onboarding Stage</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs">Stage Title</Label>
            <Input value={newStageTitle} onChange={(e) => setNewStageTitle(e.target.value)} className="text-sm h-9" placeholder="e.g. Document Collection" />
          </div>
          <DialogFooter>
            <Button size="sm" className="bg-[#009C4A] hover:bg-[#008040] text-xs" onClick={addStage}>Add Stage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Add Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Task Title</Label>
              <Input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="text-sm h-9" placeholder="e.g. Submit ID proof" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} className="text-sm h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="bg-[#009C4A] hover:bg-[#008040] text-xs" onClick={addTask}>Add Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
