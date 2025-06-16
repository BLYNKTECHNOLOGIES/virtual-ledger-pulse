
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

interface PerformanceReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PerformanceReviewDialog({ open, onOpenChange }: PerformanceReviewDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    employee_id: "",
    review_period: "",
    review_date: new Date().toISOString().split('T')[0],
    supervisor_name: "",
    criteria: [
      { category: "Work Quality", criteria: "Quality of work delivered", score: 0 },
      { category: "Communication", criteria: "Communication skills and effectiveness", score: 0 },
      { category: "Teamwork", criteria: "Collaboration and team contribution", score: 0 },
      { category: "Initiative", criteria: "Proactive approach and problem-solving", score: 0 },
      { category: "Punctuality", criteria: "Attendance and meeting deadlines", score: 0 },
    ]
  });

  // Fetch active employees
  const { data: employees } = useQuery({
    queryKey: ['review_employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, employee_id, department, designation')
        .eq('status', 'ACTIVE')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const createReviewMutation = useMutation({
    mutationFn: async (reviewData: any) => {
      // Create performance review
      const { data: review, error: reviewError } = await supabase
        .from('performance_reviews')
        .insert({
          employee_id: reviewData.employee_id,
          review_period: reviewData.review_period,
          review_date: reviewData.review_date,
          supervisor_name: reviewData.supervisor_name,
          final_score: reviewData.final_score,
          status: 'IN_PROGRESS'
        })
        .select()
        .single();

      if (reviewError) throw reviewError;

      // Create review criteria
      const criteriaData = reviewData.criteria.map((c: any) => ({
        review_id: review.id,
        category: c.category,
        criteria: c.criteria,
        score: c.score
      }));

      const { error: criteriaError } = await supabase
        .from('performance_review_criteria')
        .insert(criteriaData);

      if (criteriaError) throw criteriaError;
      return review;
    },
    onSuccess: () => {
      toast({
        title: "Review Created",
        description: "Performance review has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['performance_reviews'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create review: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      employee_id: "",
      review_period: "",
      review_date: new Date().toISOString().split('T')[0],
      supervisor_name: "",
      criteria: [
        { category: "Work Quality", criteria: "Quality of work delivered", score: 0 },
        { category: "Communication", criteria: "Communication skills and effectiveness", score: 0 },
        { category: "Teamwork", criteria: "Collaboration and team contribution", score: 0 },
        { category: "Initiative", criteria: "Proactive approach and problem-solving", score: 0 },
        { category: "Punctuality", criteria: "Attendance and meeting deadlines", score: 0 },
      ]
    });
  };

  const updateCriteriaScore = (index: number, score: number) => {
    const newCriteria = [...formData.criteria];
    newCriteria[index].score = score;
    setFormData(prev => ({ ...prev, criteria: newCriteria }));
  };

  const calculateFinalScore = () => {
    const totalScore = formData.criteria.reduce((sum, c) => sum + c.score, 0);
    return (totalScore / (formData.criteria.length * 5)) * 100;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalScore = calculateFinalScore();
    createReviewMutation.mutate({ ...formData, final_score: finalScore });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Performance Review</DialogTitle>
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
              <Label htmlFor="review_period">Review Period *</Label>
              <Input
                id="review_period"
                value={formData.review_period}
                onChange={(e) => setFormData(prev => ({ ...prev, review_period: e.target.value }))}
                placeholder="e.g., Q1 2025"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="review_date">Review Date</Label>
              <Input
                id="review_date"
                type="date"
                value={formData.review_date}
                onChange={(e) => setFormData(prev => ({ ...prev, review_date: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="supervisor_name">Supervisor Name</Label>
              <Input
                id="supervisor_name"
                value={formData.supervisor_name}
                onChange={(e) => setFormData(prev => ({ ...prev, supervisor_name: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Performance Criteria (Rate 1-5)</Label>
            <div className="space-y-3 mt-2">
              {formData.criteria.map((criterion, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <p className="font-medium">{criterion.category}</p>
                    <p className="text-sm text-gray-600">{criterion.criteria}</p>
                  </div>
                  <Select onValueChange={(value) => updateCriteriaScore(index, parseInt(value))}>
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="Rate" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((score) => (
                        <SelectItem key={score} value={score.toString()}>
                          {score}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {formData.criteria.some(c => c.score > 0) && (
            <div className="p-3 bg-blue-50 rounded">
              <p className="font-medium">Final Score: {calculateFinalScore().toFixed(1)}%</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createReviewMutation.isPending}>
              {createReviewMutation.isPending ? "Creating..." : "Create Review"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
