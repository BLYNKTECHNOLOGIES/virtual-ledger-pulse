
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CreateRecruitmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateRecruitmentDialog({ open, onOpenChange, onSuccess }: CreateRecruitmentDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: "", description: "", vacancy: "1", start_date: "", end_date: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      const { data: rec, error } = await supabase.from("hr_recruitments").insert({
        title: form.title,
        description: form.description || null,
        vacancy: parseInt(form.vacancy) || 1,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_published: true,
      }).select().single();

      if (error) throw error;

      // Auto-create default stages
      if (rec) {
        await supabase.from("hr_stages").insert([
          { recruitment_id: rec.id, stage_name: "Initial", stage_type: "initial", sequence: 0 },
          { recruitment_id: rec.id, stage_name: "Applied", stage_type: "applied", sequence: 1 },
          { recruitment_id: rec.id, stage_name: "Test", stage_type: "test", sequence: 2 },
          { recruitment_id: rec.id, stage_name: "Interview", stage_type: "interview", sequence: 3 },
        ]);
      }

      toast({ title: "Recruitment created with default stages" });
      setForm({ title: "", description: "", vacancy: "1", start_date: "", end_date: "" });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast({ title: "Error creating recruitment", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Create Recruitment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} className="text-sm h-9" placeholder="e.g. Senior Developer Hiring" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} className="text-sm min-h-[60px]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Vacancy</Label>
              <Input type="number" min="1" value={form.vacancy} onChange={(e) => setForm(p => ({ ...p, vacancy: e.target.value }))} className="text-sm h-9" />
            </div>
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm(p => ({ ...p, start_date: e.target.value }))} className="text-sm h-9" />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm(p => ({ ...p, end_date: e.target.value }))} className="text-sm h-9" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} className="text-xs">Cancel</Button>
          <Button size="sm" className="bg-[#009C4A] hover:bg-[#008040] text-xs" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
