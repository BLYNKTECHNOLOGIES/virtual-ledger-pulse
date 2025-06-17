
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FeedbackSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackSubmissionDialog({ open, onOpenChange }: FeedbackSubmissionDialogProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    employee_id: "",
    feedback_type: "",
    subject: "",
    feedback_content: "",
    rating: ""
  });

  // Fetch active employees
  const { data: employees } = useQuery({
    queryKey: ['feedback_employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, employee_id, department')
        .eq('status', 'ACTIVE')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // For now, just show a success message
    toast({
      title: "Feedback Submitted",
      description: "Your feedback has been submitted successfully.",
    });
    
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setFormData({
      employee_id: "",
      feedback_type: "",
      subject: "",
      feedback_content: "",
      rating: ""
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submit Feedback</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="employee_id">Employee *</Label>
              <Select onValueChange={(value) => setFormData(prev => ({ ...prev, employee_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} ({employee.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="feedback_type">Feedback Type *</Label>
              <Select onValueChange={(value) => setFormData(prev => ({ ...prev, feedback_type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive Feedback</SelectItem>
                  <SelectItem value="constructive">Constructive Feedback</SelectItem>
                  <SelectItem value="general">General Feedback</SelectItem>
                  <SelectItem value="360_review">360 Degree Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Brief subject of the feedback"
              required
            />
          </div>

          <div>
            <Label htmlFor="rating">Overall Rating</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, rating: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Rate the employee (1-5)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 - Excellent</SelectItem>
                <SelectItem value="4">4 - Very Good</SelectItem>
                <SelectItem value="3">3 - Good</SelectItem>
                <SelectItem value="2">2 - Fair</SelectItem>
                <SelectItem value="1">1 - Needs Improvement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="feedback_content">Feedback Details *</Label>
            <Textarea
              id="feedback_content"
              value={formData.feedback_content}
              onChange={(e) => setFormData(prev => ({ ...prev, feedback_content: e.target.value }))}
              placeholder="Provide detailed feedback..."
              rows={4}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Submit Feedback
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
