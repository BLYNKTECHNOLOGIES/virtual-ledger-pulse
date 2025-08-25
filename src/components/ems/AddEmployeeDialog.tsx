import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, User } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddEmployeeDialog({ open, onOpenChange }: AddEmployeeDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  // Essential fields only
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState<Date>();
  const [salary, setSalary] = useState("");

  const departments = [
    "Operations", "Finance", "Compliance", "Technology", "HR", "Sales", "Marketing", "Legal"
  ];

  const handleSubmit = async () => {
    if (!name || !email || !department || !designation) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const employeeData = {
        name,
        email,
        phone: phone || "",
        department,
        designation,
        employee_id: `EMP${Date.now()}`,
        date_of_joining: dateOfJoining ? dateOfJoining.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        salary: salary ? parseFloat(salary) : 50000,
        status: 'ACTIVE' as const,
        user_id: crypto.randomUUID()
      };

      const { error } = await supabase
        .from('employees')
        .insert(employeeData);

      if (error) throw error;

      toast.success("Employee added successfully!");
      queryClient.invalidateQueries({ queryKey: ['employees_data'] });
      onOpenChange(false);
      
      // Reset form
      setName("");
      setEmail("");
      setPhone("");
      setDepartment("");
      setDesignation("");
      setDateOfJoining(undefined);
      setSalary("");
      
    } catch (error) {
      console.error('Error adding employee:', error);
      toast.error("Failed to add employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6 text-primary" />
            Add New Employee
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Contact Number</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Mobile number"
              />
            </div>
            <div>
              <Label>Department *</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="designation">Designation *</Label>
              <Input
                id="designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Enter designation"
                required
              />
            </div>
            <div>
              <Label>Date of Joining</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateOfJoining && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateOfJoining ? format(dateOfJoining, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateOfJoining}
                    onSelect={setDateOfJoining}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <Label htmlFor="salary">Salary (Annual)</Label>
            <Input
              id="salary"
              type="number"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="Enter annual salary"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? "Adding..." : "Add Employee"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}