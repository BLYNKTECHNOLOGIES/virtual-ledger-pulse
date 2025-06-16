
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ScheduleInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduleInterviewDialog({ open, onOpenChange }: ScheduleInterviewDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    applicant_id: "",
    interview_date: "",
    interview_type: "TECHNICAL",
    interviewer_name: "",
    notes: "",
  });

  // Fetch applicants
  const { data: applicants } = useQuery({
    queryKey: ['interview_applicants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_applicants')
        .select(`
          id,
          name,
          email,
          job_postings:job_posting_id(title, department)
        `)
        .eq('is_interested', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const scheduleInterviewMutation = useMutation({
    mutationFn: async (interviewData: any) => {
      const { data, error } = await supabase
        .from('interview_schedules')
        .insert(interviewData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Interview Scheduled",
        description: "Interview has been successfully scheduled.",
      });
      queryClient.invalidateQueries({ queryKey: ['interview_schedules'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to schedule interview: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      applicant_id: "",
      interview_date: "",
      interview_type: "TECHNICAL",
      interviewer_name: "",
      notes: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    scheduleInterviewMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="applicant_id">Candidate *</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, applicant_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select candidate" />
              </SelectTrigger>
              <SelectContent>
                {applicants?.map((applicant) => (
                  <SelectItem key={applicant.id} value={applicant.id}>
                    {applicant.name} - {applicant.job_postings?.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="interview_date">Interview Date & Time *</Label>
            <Input
              id="interview_date"
              type="datetime-local"
              value={formData.interview_date}
              onChange={(e) => setFormData(prev => ({ ...prev, interview_date: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="interview_type">Interview Type</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, interview_type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select interview type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TECHNICAL">Technical</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
                <SelectItem value="MANAGERIAL">Managerial</SelectItem>
                <SelectItem value="FINAL">Final Round</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="interviewer_name">Interviewer Name</Label>
            <Input
              id="interviewer_name"
              value={formData.interviewer_name}
              onChange={(e) => setFormData(prev => ({ ...prev, interviewer_name: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={scheduleInterviewMutation.isPending}>
              {scheduleInterviewMutation.isPending ? "Scheduling..." : "Schedule Interview"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
