
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

interface OffboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OffboardingDialog({ open, onOpenChange }: OffboardingDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    employee_id: "",
    initiated_by: "",
    reason_for_leaving: "",
    last_working_day: "",
    notice_period_days: 30,
    final_settlement_amount: "",
  });

  // Fetch active employees
  const { data: employees } = useQuery({
    queryKey: ['active_employees'],
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

  const startOffboardingMutation = useMutation({
    mutationFn: async (offboardingData: any) => {
      const { data, error } = await supabase
        .from('employee_offboarding')
        .insert({
          ...offboardingData,
          final_settlement_amount: offboardingData.final_settlement_amount ? parseFloat(offboardingData.final_settlement_amount) : null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Offboarding Initiated",
        description: "Employee offboarding process has been started successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['employee_offboarding'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to initiate offboarding: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      employee_id: "",
      initiated_by: "",
      reason_for_leaving: "",
      last_working_day: "",
      notice_period_days: 30,
      final_settlement_amount: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startOffboardingMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start Employee Offboarding</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="employee_id">Employee *</Label>
            <Select onValueChange={(value) => setFormData(prev => ({ ...prev, employee_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees?.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name} ({employee.employee_id}) - {employee.designation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="initiated_by">Initiated By</Label>
            <Input
              id="initiated_by"
              value={formData.initiated_by}
              onChange={(e) => setFormData(prev => ({ ...prev, initiated_by: e.target.value }))}
              placeholder="HR Manager name"
            />
          </div>

          <div>
            <Label htmlFor="reason_for_leaving">Reason for Leaving *</Label>
            <Textarea
              id="reason_for_leaving"
              value={formData.reason_for_leaving}
              onChange={(e) => setFormData(prev => ({ ...prev, reason_for_leaving: e.target.value }))}
              rows={3}
              required
            />
          </div>

          <div>
            <Label htmlFor="last_working_day">Last Working Day</Label>
            <Input
              id="last_working_day"
              type="date"
              value={formData.last_working_day}
              onChange={(e) => setFormData(prev => ({ ...prev, last_working_day: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="notice_period_days">Notice Period (Days)</Label>
            <Input
              id="notice_period_days"
              type="number"
              value={formData.notice_period_days}
              onChange={(e) => setFormData(prev => ({ ...prev, notice_period_days: parseInt(e.target.value) || 30 }))}
            />
          </div>

          <div>
            <Label htmlFor="final_settlement_amount">Final Settlement Amount</Label>
            <Input
              id="final_settlement_amount"
              type="number"
              value={formData.final_settlement_amount}
              onChange={(e) => setFormData(prev => ({ ...prev, final_settlement_amount: e.target.value }))}
              placeholder="Enter amount"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={startOffboardingMutation.isPending}>
              {startOffboardingMutation.isPending ? "Starting..." : "Start Offboarding"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
