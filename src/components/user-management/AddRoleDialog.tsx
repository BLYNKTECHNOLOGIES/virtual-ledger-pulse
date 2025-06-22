
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AddRoleDialogProps {
  onAddRole: (roleData: { name: string; description: string; permissions: string[] }) => Promise<{ success: boolean; error?: any }>;
}

// Available pages/permissions that can be assigned to roles
const availablePages = [
  { id: "dashboard", name: "Dashboard", description: "View main dashboard" },
  { id: "sales", name: "Sales", description: "Access sales module" },
  { id: "purchase", name: "Purchase", description: "Access purchase module" },
  { id: "bams", name: "BAMS", description: "Bank Account Management System" },
  { id: "clients", name: "Clients", description: "Client management" },
  { id: "leads", name: "Leads", description: "Lead management" },
  { id: "user-management", name: "User Management", description: "Manage users and roles" },
  { id: "hrms", name: "HRMS", description: "Human Resource Management" },
  { id: "payroll", name: "Payroll", description: "Payroll management" },
  { id: "compliance", name: "Compliance", description: "Compliance tracking" },
  { id: "stock", name: "Stock Management", description: "Inventory management" },
  { id: "accounting", name: "Accounting", description: "Financial accounting" },
  { id: "video-kyc", name: "Video KYC", description: "Video KYC system" },
  { id: "kyc-approvals", name: "KYC Approvals", description: "KYC approval process" },
  { id: "statistics", name: "Statistics", description: "View statistics and reports" },
];

export function AddRoleDialog({ onAddRole }: AddRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as string[]
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const result = await onAddRole(formData);
      
      if (result.success) {
        toast({
          title: "Success",
          description: "Role created successfully",
        });
        setOpen(false);
        setFormData({ name: "", description: "", permissions: [] });
      } else {
        toast({
          title: "Error",
          description: "Failed to create role",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error creating role:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionChange = (pageId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked 
        ? [...prev.permissions, pageId]
        : prev.permissions.filter(p => p !== pageId)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Role
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Role</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Role Name *</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter role name"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the role and its responsibilities"
                rows={3}
              />
            </div>

            <div>
              <Label className="text-base font-medium">Page Access Permissions</Label>
              <p className="text-sm text-gray-600 mb-4">Select which pages users with this role can access</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto border rounded-lg p-4">
                {availablePages.map((page) => (
                  <div key={page.id} className="flex items-start space-x-3">
                    <Checkbox
                      id={page.id}
                      checked={formData.permissions.includes(page.id)}
                      onCheckedChange={(checked) => handlePermissionChange(page.id, checked as boolean)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor={page.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {page.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {page.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Role"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
