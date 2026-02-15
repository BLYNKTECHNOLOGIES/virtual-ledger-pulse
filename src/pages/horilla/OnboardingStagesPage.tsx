import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical, ClipboardList } from "lucide-react";

export default function OnboardingStagesPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ stage_title: "", is_final_stage: false });

  const { data: stages = [], isLoading } = useQuery({
    queryKey: ["hr_onboarding_stages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_onboarding_stages").select("*").order("sequence");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["hr_onboarding_tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_onboarding_tasks").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("hr_onboarding_stages").update({
          stage_title: form.stage_title,
          is_final_stage: form.is_final_stage,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const maxSeq = stages.reduce((m: number, s: any) => Math.max(m, s.sequence || 0), 0);
        const { error } = await supabase.from("hr_onboarding_stages").insert({
          stage_title: form.stage_title,
          is_final_stage: form.is_final_stage,
          sequence: maxSeq + 1,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_onboarding_stages"] });
      setShowDialog(false);
      setEditId(null);
      setForm({ stage_title: "", is_final_stage: false });
      toast.success(editId ? "Stage updated" : "Stage created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("hr_onboarding_tasks").delete().eq("stage_id", id);
      const { error } = await supabase.from("hr_onboarding_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_onboarding_stages"] });
      qc.invalidateQueries({ queryKey: ["hr_onboarding_tasks"] });
      toast.success("Stage deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({ stage_title: s.stage_title, is_final_stage: s.is_final_stage || false });
    setShowDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Stages</h1>
          <p className="text-sm text-gray-500">Configure stages for the onboarding pipeline</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ stage_title: "", is_final_stage: false }); setShowDialog(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> Add Stage
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-gray-400 text-center py-12">Loading...</p>
        ) : stages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">No onboarding stages configured yet</p>
            </CardContent>
          </Card>
        ) : (
          stages.map((s: any, i: number) => {
            const stageTasks = tasks.filter((t: any) => t.stage_id === s.id);
            return (
              <Card key={s.id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-400">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-sm font-bold w-6 text-center">{i + 1}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{s.stage_title}</h3>
                      {s.is_final_stage && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Final Stage</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{stageTasks.length} task{stageTasks.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteMutation.mutate(s.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Stage" : "Add Stage"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Stage Title</Label><Input value={form.stage_title} onChange={(e) => setForm({ ...form, stage_title: e.target.value })} placeholder="e.g. Document Collection" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_final_stage} onCheckedChange={(v) => setForm({ ...form, is_final_stage: v })} />
              <Label>Final Stage</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.stage_title} className="bg-[#E8604C] hover:bg-[#d4553f]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
