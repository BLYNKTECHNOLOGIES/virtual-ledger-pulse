
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CreateJobPostingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateJobPostingDialog({ open, onOpenChange }: CreateJobPostingDialogProps) {
  const [formData, setFormData] = useState({
    title: "",
    department: "",
    description: "",
    qualifications: "",
    experience_required: "",
    location: "",
    salary_range_min: "",
    salary_range_max: "",
    job_type: "",
    status: "OPEN"
  });

  const queryClient = useQueryClient();

  const createJobMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('job_postings')
        .insert([{
          ...data,
          salary_range_min: data.salary_range_min ? parseFloat(data.salary_range_min) : null,
          salary_range_max: data.salary_range_max ? parseFloat(data.salary_range_max) : null,
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-postings'] });
      toast({
        title: "Success",
        description: "Job posting created successfully",
      });
      onOpenChange(false);
      setFormData({
        title: "",
        department: "",
        description: "",
        qualifications: "",
        experience_required: "",
        location: "",
        salary_range_min: "",
        salary_range_max: "",
        job_type: "",
        status: "OPEN"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create job posting",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createJobMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Job Posting</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Job Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="department">Department</Label>
              <Select value={formData.department} onValueChange={(value) => setFormData({...formData, department: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technology">Technology</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="HR">Human Resources</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Job Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              rows={4}
            />
          </div>

          <div>
            <Label htmlFor="qualifications">Qualifications</Label>
            <Textarea
              id="qualifications"
              value={formData.qualifications}
              onChange={(e) => setFormData({...formData, qualifications: e.target.value})}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="experience">Experience Required</Label>
              <Input
                id="experience"
                value={formData.experience_required}
                onChange={(e) => setFormData({...formData, experience_required: e.target.value})}
                placeholder="e.g., 2-3 years"
              />
            </div>
            
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="salary_min">Salary Range Min</Label>
              <Input
                id="salary_min"
                type="number"
                value={formData.salary_range_min}
                onChange={(e) => setFormData({...formData, salary_range_min: e.target.value})}
                placeholder="Minimum salary"
              />
            </div>
            
            <div>
              <Label htmlFor="salary_max">Salary Range Max</Label>
              <Input
                id="salary_max"
                type="number"
                value={formData.salary_range_max}
                onChange={(e) => setFormData({...formData, salary_range_max: e.target.value})}
                placeholder="Maximum salary"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="job_type">Job Type</Label>
            <Select value={formData.job_type} onValueChange={(value) => setFormData({...formData, job_type: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select job type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_TIME">Full Time</SelectItem>
                <SelectItem value="PART_TIME">Part Time</SelectItem>
                <SelectItem value="CONTRACT">Contract</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createJobMutation.isPending}>
              {createJobMutation.isPending ? "Creating..." : "Create Job Posting"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
