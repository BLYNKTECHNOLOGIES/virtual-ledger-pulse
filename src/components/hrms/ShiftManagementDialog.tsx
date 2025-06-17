
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  employeeCount: number;
}

interface ShiftManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift?: Shift | null;
  isEditMode: boolean;
}

export function ShiftManagementDialog({ open, onOpenChange, shift, isEditMode }: ShiftManagementDialogProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: shift?.name || "",
    startTime: shift?.startTime || "",
    endTime: shift?.endTime || "",
    employeeCount: shift?.employeeCount?.toString() || ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const action = isEditMode ? "updated" : "created";
    toast({
      title: `Shift ${action}`,
      description: `Shift "${formData.name}" has been ${action} successfully.`,
    });
    
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      startTime: "",
      endTime: "",
      employeeCount: ""
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Shift" : "Create New Shift"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Shift Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Morning Shift"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startTime">Start Time *</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="endTime">End Time *</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="employeeCount">Number of Employees</Label>
            <Input
              id="employeeCount"
              type="number"
              min="1"
              value={formData.employeeCount}
              onChange={(e) => setFormData(prev => ({ ...prev, employeeCount: e.target.value }))}
              placeholder="0"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {isEditMode ? "Update Shift" : "Create Shift"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
