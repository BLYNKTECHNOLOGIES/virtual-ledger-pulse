import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { UserCheck, ClipboardList, Plus } from "lucide-react";

type OnboardingStage = {
  id: string;
  stage_title: string;
  sequence: number;
  is_final_stage: boolean;
};

type OnboardingTask = {
  id: string;
  title: string;
  description: string | null;
  stage_id: string;
};

type TaskAssignment = {
  id: string;
  task_id: string;
  employee_id: string;
  is_completed: boolean;
  completed_at: string | null;
  notes: string | null;
};

type EmployeeBasic = {
  id: string;
  badge_id: string;
  first_name: string;
  last_name: string;
};

export function OnboardingChecklistTab() {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const queryClient = useQueryClient();

  // Fetch stages
  const { data: stages } = useQuery({
    queryKey: ["onboarding-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_onboarding_stages")
        .select("*")
        .order("sequence");
      if (error) throw error;
      return data as OnboardingStage[];
    },
  });

  // Fetch tasks
  const { data: tasks } = useQuery({
    queryKey: ["onboarding-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_onboarding_tasks")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data as OnboardingTask[];
    },
  });

  // Fetch employees who have onboarding tasks assigned
  const { data: onboardingEmployees } = useQuery({
    queryKey: ["onboarding-employees"],
    queryFn: async () => {
      // Get distinct employee IDs from task assignments
      const { data: assignments, error } = await supabase
        .from("hr_onboarding_task_employees")
        .select("employee_id");
      if (error) throw error;

      const empIds = [...new Set(assignments?.map(a => a.employee_id) || [])];
      if (empIds.length === 0) return [];

      const { data: employees, error: empError } = await supabase
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .in("id", empIds)
        .order("first_name");
      if (empError) throw empError;
      return employees as EmployeeBasic[];
    },
  });

  // Fetch all active employees for assignment
  const { data: allActiveEmployees } = useQuery({
    queryKey: ["all-active-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch task assignments for selected employee
  const { data: assignments, refetch: refetchAssignments } = useQuery({
    queryKey: ["onboarding-assignments", selectedEmployeeId],
    queryFn: async () => {
      if (!selectedEmployeeId) return [];
      const { data, error } = await supabase
        .from("hr_onboarding_task_employees")
        .select("*")
        .eq("employee_id", selectedEmployeeId);
      if (error) throw error;
      return data as TaskAssignment[];
    },
    enabled: !!selectedEmployeeId,
  });

  // Initialize onboarding for an employee
  const initializeOnboarding = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.rpc("fn_initialize_onboarding", { p_employee_id: employeeId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Onboarding checklist initialized");
      queryClient.invalidateQueries({ queryKey: ["onboarding-employees"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-assignments"] });
      setShowAssignDialog(false);
      setAssignEmployeeId("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Toggle task completion
  const toggleTask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase
        .from("hr_onboarding_task_employees")
        .update({ is_completed, completed_at: is_completed ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetchAssignments(),
  });

  const getTasksByStage = (stageId: string) => tasks?.filter(t => t.stage_id === stageId) || [];

  const getAssignmentForTask = (taskId: string) => assignments?.find(a => a.task_id === taskId);

  const totalTasks = assignments?.length || 0;
  const completedTasks = assignments?.filter(a => a.is_completed).length || 0;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const selectedEmployee = onboardingEmployees?.find(e => e.id === selectedEmployeeId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <UserCheck className="h-5 w-5" /> Employee Onboarding
          </h3>
          <p className="text-sm text-muted-foreground">Track onboarding progress for new hires</p>
        </div>
        <Button size="sm" onClick={() => setShowAssignDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Start Onboarding
        </Button>
      </div>

      {/* Employee selector */}
      {onboardingEmployees && onboardingEmployees.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Label className="text-sm font-medium whitespace-nowrap">Select Employee:</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Choose an employee" />
                </SelectTrigger>
                <SelectContent>
                  {onboardingEmployees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} (#{e.badge_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checklist */}
      {selectedEmployeeId && selectedEmployee ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                <div>
                  <p className="font-semibold">{selectedEmployee.first_name} {selectedEmployee.last_name}</p>
                </div>
                <Badge variant={progress === 100 ? "default" : "outline"}>
                  {completedTasks}/{totalTasks} completed
                </Badge>
              </div>
              <Progress value={progress} className="h-2" />
            </CardContent>
          </Card>

          {stages?.map(stage => {
            const stageTasks = getTasksByStage(stage.id);
            if (stageTasks.length === 0) return null;
            const stageCompleted = stageTasks.every(t => getAssignmentForTask(t.id)?.is_completed);

            return (
              <Card key={stage.id}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    {stage.stage_title}
                    {stageCompleted && <Badge className="bg-green-100 text-green-800 text-xs">✓ Done</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className="space-y-2">
                    {stageTasks.map(task => {
                      const assignment = getAssignmentForTask(task.id);
                      if (!assignment) return null;
                      return (
                        <div key={task.id} className="flex items-start gap-3 p-2 rounded hover:bg-muted/50">
                          <Checkbox
                            checked={assignment.is_completed}
                            onCheckedChange={(checked) => toggleTask.mutate({ id: assignment.id, is_completed: !!checked })}
                            className="mt-0.5"
                          />
                          <div>
                            <span className={`text-sm ${assignment.is_completed ? "line-through text-muted-foreground" : ""}`}>
                              {task.title}
                            </span>
                            {task.description && (
                              <p className="text-xs text-muted-foreground">{task.description}</p>
                            )}
                            {assignment.completed_at && (
                              <p className="text-xs text-green-600">Done: {new Date(assignment.completed_at).toLocaleDateString()}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        !onboardingEmployees?.length && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <UserCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No onboarding processes active</p>
              <p className="text-sm">Click "Start Onboarding" to initialize a checklist for a new hire</p>
            </CardContent>
          </Card>
        )
      )}

      {/* Assign onboarding dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Start Employee Onboarding</DialogTitle></DialogHeader>
          <div>
            <Label>Employee</Label>
            <Select value={assignEmployeeId} onValueChange={setAssignEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {allActiveEmployees?.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} (#{e.badge_id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button onClick={() => initializeOnboarding.mutate(assignEmployeeId)} disabled={!assignEmployeeId}>
              Initialize Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
}

