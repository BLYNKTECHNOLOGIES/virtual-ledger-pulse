
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

// Available permissions that correspond to the app_permission enum
const availablePermissions = [
  { id: "dashboard_view", name: "Dashboard View", description: "View main dashboard" },
  { id: "sales_view", name: "Sales View", description: "View sales data" },
  { id: "sales_manage", name: "Sales Manage", description: "Manage sales orders and data" },
  { id: "purchase_view", name: "Purchase View", description: "View purchase data" },
  { id: "purchase_manage", name: "Purchase Manage", description: "Manage purchase orders" },
  { id: "bams_view", name: "BAMS View", description: "View Bank Account Management System" },
  { id: "bams_manage", name: "BAMS Manage", description: "Manage Bank Account Management System" },
  { id: "clients_view", name: "Clients View", description: "View client information" },
  { id: "clients_manage", name: "Clients Manage", description: "Manage clients" },
  { id: "leads_view", name: "Leads View", description: "View leads" },
  { id: "leads_manage", name: "Leads Manage", description: "Manage leads" },
  { id: "user_management_view", name: "User Management View", description: "View users and roles" },
  { id: "user_management_manage", name: "User Management Manage", description: "Manage users and roles" },
  { id: "hrms_view", name: "HRMS View", description: "View Human Resource Management" },
  { id: "hrms_manage", name: "HRMS Manage", description: "Manage Human Resources" },
  { id: "payroll_view", name: "Payroll View", description: "View payroll data" },
  { id: "payroll_manage", name: "Payroll Manage", description: "Manage payroll" },
  { id: "compliance_view", name: "Compliance View", description: "View compliance data" },
  { id: "compliance_manage", name: "Compliance Manage", description: "Manage compliance" },
  { id: "stock_view", name: "Stock View", description: "View inventory" },
  { id: "stock_manage", name: "Stock Manage", description: "Manage inventory" },
  { id: "accounting_view", name: "Accounting View", description: "View financial data" },
  { id: "accounting_manage", name: "Accounting Manage", description: "Manage accounting" },
  { id: "video_kyc_view", name: "Video KYC View", description: "View Video KYC system" },
  { id: "video_kyc_manage", name: "Video KYC Manage", description: "Manage Video KYC" },
  { id: "kyc_approvals_view", name: "KYC Approvals View", description: "View KYC approvals" },
  { id: "kyc_approvals_manage", name: "KYC Approvals Manage", description: "Manage KYC approvals" },
  { id: "statistics_view", name: "Statistics View", description: "View statistics and reports" },
  { id: "statistics_manage", name: "Statistics Manage", description: "Manage statistics" },
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

    console.log('Submitting role with data:', formData);
    setIsLoading(true);
    
    try {
      const result = await onAddRole(formData);
      
      if (result.success) {
        toast({
          title: "Success",
          description: "Role created successfully with permissions",
        });
        setOpen(false);
        setFormData({ name: "", description: "", permissions: [] });
      } else {
        toast({
          title: "Error",
          description: result.error?.message || "Failed to create role",
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

  const handlePermissionChange = (permissionId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked 
        ? [...prev.permissions, permissionId]
        : prev.permissions.filter(p => p !== permissionId)
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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
              <Label className="text-base font-medium">System Permissions</Label>
              <p className="text-sm text-gray-600 mb-4">Select which permissions users with this role should have</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto border rounded-lg p-4">
                {availablePermissions.map((permission) => (
                  <div key={permission.id} className="flex items-start space-x-3">
                    <Checkbox
                      id={permission.id}
                      checked={formData.permissions.includes(permission.id)}
                      onCheckedChange={(checked) => handlePermissionChange(permission.id, checked as boolean)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor={permission.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {permission.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {permission.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              {formData.permissions.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium">Selected permissions ({formData.permissions.length}):</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {formData.permissions.map((perm) => (
                      <span key={perm} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
