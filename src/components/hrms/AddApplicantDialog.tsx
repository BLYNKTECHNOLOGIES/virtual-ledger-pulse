
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

interface AddApplicantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddApplicantDialog({ open, onOpenChange }: AddApplicantDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    job_posting_id: "",
    stage: "APPLIED",
    notes: "",
  });

  // Fetch open job postings
  const { data: jobPostings } = useQuery({
    queryKey: ['open_job_postings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_postings')
        .select('*')
        .eq('status', 'OPEN')
        .order('title');
      
      if (error) throw error;
      return data;
    },
  });

  const createApplicantMutation = useMutation({
    mutationFn: async (applicantData: any) => {
      const { data, error } = await supabase
        .from('job_applicants')
        .insert(applicantData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Applicant Added",
        description: "Job applicant has been successfully added.",
      });
      queryClient.invalidateQueries({ queryKey: ['job_applicants'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add applicant: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      job_posting_id: "",
      stage: "APPLIED",
      notes: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createApplicantMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Job Applicant</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Applicant Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="job_posting_id">Applied for Position *</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, job_posting_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select job posting" />
              </SelectTrigger>
              <SelectContent>
                {jobPostings?.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title} - {job.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="stage">Stage</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, stage: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPLIED">Applied</SelectItem>
                <SelectItem value="SCREENING">Screening</SelectItem>
                <SelectItem value="INTERVIEW">Interview</SelectItem>
                <SelectItem value="FINAL_ROUND">Final Round</SelectItem>
                <SelectItem value="SELECTED">Selected</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={createApplicantMutation.isPending}>
              {createApplicantMutation.isPending ? "Adding..." : "Add Applicant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
