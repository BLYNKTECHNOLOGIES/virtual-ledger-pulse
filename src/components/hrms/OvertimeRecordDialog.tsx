
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

interface OvertimeRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OvertimeRecordDialog({ open, onOpenChange }: OvertimeRecordDialogProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    employee_id: "",
    overtime_date: new Date().toISOString().split('T')[0],
    start_time: "",
    end_time: "",
    duration_hours: "",
    reason: "",
    approved_by: ""
  });

  // Fetch active employees
  const { data: employees } = useQuery({
    queryKey: ['overtime_employees'],
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

  const calculateDuration = () => {
    if (formData.start_time && formData.end_time) {
      const start = new Date(`2000-01-01T${formData.start_time}`);
      const end = new Date(`2000-01-01T${formData.end_time}`);
      const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      
      if (diff > 0) {
        setFormData(prev => ({ ...prev, duration_hours: diff.toFixed(1) }));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    toast({
      title: "Overtime Recorded",
      description: "Overtime record has been saved successfully.",
    });
    
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setFormData({
      employee_id: "",
      overtime_date: new Date().toISOString().split('T')[0],
      start_time: "",
      end_time: "",
      duration_hours: "",
      reason: "",
      approved_by: ""
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Overtime</DialogTitle>
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
              <Label htmlFor="overtime_date">Overtime Date *</Label>
              <Input
                id="overtime_date"
                type="date"
                value={formData.overtime_date}
                onChange={(e) => setFormData(prev => ({ ...prev, overtime_date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="start_time">Start Time *</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, start_time: e.target.value }));
                  setTimeout(calculateDuration, 100);
                }}
                required
              />
            </div>
            <div>
              <Label htmlFor="end_time">End Time *</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, end_time: e.target.value }));
                  setTimeout(calculateDuration, 100);
                }}
                required
              />
            </div>
            <div>
              <Label htmlFor="duration_hours">Duration (Hours)</Label>
              <Input
                id="duration_hours"
                type="number"
                step="0.1"
                value={formData.duration_hours}
                onChange={(e) => setFormData(prev => ({ ...prev, duration_hours: e.target.value }))}
                placeholder="Auto-calculated"
                readOnly
              />
            </div>
          </div>

          <div>
            <Label htmlFor="reason">Reason for Overtime *</Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Describe the reason for overtime work..."
              rows={3}
              required
            />
          </div>

          <div>
            <Label htmlFor="approved_by">Approved By</Label>
            <Input
              id="approved_by"
              value={formData.approved_by}
              onChange={(e) => setFormData(prev => ({ ...prev, approved_by: e.target.value }))}
              placeholder="Manager/Supervisor name"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Record Overtime
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
