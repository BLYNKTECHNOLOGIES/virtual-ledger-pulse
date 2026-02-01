import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  user_count: number;
}

interface SystemFunction {
  id: string;
  function_key: string;
  function_name: string;
  description: string;
  module: string;
}

interface EditRoleDialogProps {
  role: Role;
  onSave: (roleId: string, roleData: { name: string; description: string; permissions: string[] }) => Promise<any>;
  onClose: () => void;
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
  { id: "ems_view", name: "EMS View", description: "View Employee Management System" },
  { id: "ems_manage", name: "EMS Manage", description: "Manage Employee Management System" },
];

export function EditRoleDialog({ role, onSave, onClose }: EditRoleDialogProps) {
  const [formData, setFormData] = useState({
    name: role.name,
    description: role.description,
    permissions: role.permissions
  });
  const [systemFunctions, setSystemFunctions] = useState<SystemFunction[]>([]);
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFunctions, setIsLoadingFunctions] = useState(true);
  const { toast } = useToast();

  // Check if role has purchase permission
  const hasPurchasePermission = formData.permissions.some(p => 
    p === 'purchase_view' || p === 'purchase_manage'
  );

  // Get selected purchase functions
  const purchaseFunctions = systemFunctions.filter(f => f.module === 'purchase');
  const selectedPurchaseFunctions = selectedFunctions.filter(fKey => 
    purchaseFunctions.some(pf => pf.function_key === fKey)
  );

  // Validation: if has purchase permission, must have at least one purchase function
  const isPurchaseValid = !hasPurchasePermission || selectedPurchaseFunctions.length > 0;

  useEffect(() => {
    setFormData({
      name: role.name,
      description: role.description,
      permissions: role.permissions
    });
    fetchFunctions();
  }, [role]);

  const fetchFunctions = async () => {
    setIsLoadingFunctions(true);
    try {
      // Fetch all system functions
      const { data: funcsData, error: funcsError } = await supabase
        .from('system_functions')
        .select('*')
        .order('module');

      if (funcsError) throw funcsError;
      setSystemFunctions(funcsData || []);

      // Fetch current role's functions
      const { data: roleFuncsData, error: roleFuncsError } = await supabase
        .from('role_functions')
        .select('function_id, system_functions(function_key)')
        .eq('role_id', role.id);

      if (roleFuncsError) throw roleFuncsError;

      const currentFunctionKeys = (roleFuncsData || [])
        .map((rf: any) => rf.system_functions?.function_key)
        .filter(Boolean);
      
      setSelectedFunctions(currentFunctionKeys);
    } catch (error) {
      console.error('Error fetching functions:', error);
    } finally {
      setIsLoadingFunctions(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate purchase functions
    if (!isPurchaseValid) {
      toast({
        title: "Validation Error",
        description: "If a role has Purchase Tab permission, it must have at least one purchase function (Purchase Creator or Payer).",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log('Saving role:', role.id, 'with data:', formData);
      console.log('Selected functions:', selectedFunctions);
      
      // First save permissions
      const result = await onSave(role.id, formData);
      console.log('onSave result:', result);
      
      if (result?.success === false) {
        console.error('onSave failed:', result?.error);
        toast({
          title: "Error",
          description: result?.error?.message || "Failed to update role permissions",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Then update functions
      // Delete existing role_functions
      console.log('Deleting existing role_functions for role:', role.id);
      const { error: deleteError, count: deleteCount } = await supabase
        .from('role_functions')
        .delete()
        .eq('role_id', role.id)
        .select();

      if (deleteError) {
        console.error('Delete role_functions error:', deleteError);
        throw deleteError;
      }
      console.log('Deleted role_functions count:', deleteCount);

      // Insert new role_functions
      if (selectedFunctions.length > 0) {
        const functionIds = systemFunctions
          .filter(f => selectedFunctions.includes(f.function_key))
          .map(f => ({ role_id: role.id, function_id: f.id }));

        console.log('Inserting role_functions:', functionIds);

        if (functionIds.length > 0) {
          const { data: insertData, error: insertError } = await supabase
            .from('role_functions')
            .insert(functionIds)
            .select();

          if (insertError) {
            console.error('Insert role_functions error:', insertError);
            throw insertError;
          }
          console.log('Inserted role_functions:', insertData);
        }
      }

      toast({
        title: "Success",
        description: "Role updated successfully",
      });
      onClose();
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to update role",
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

  const handleFunctionChange = (functionKey: string, checked: boolean) => {
    setSelectedFunctions(prev => 
      checked 
        ? [...prev, functionKey]
        : prev.filter(f => f !== functionKey)
    );
  };

  // Group functions by module
  const functionsByModule = systemFunctions.reduce((acc, func) => {
    if (!acc[func.module]) {
      acc[func.module] = [];
    }
    acc[func.module].push(func);
    return acc;
  }, {} as Record<string, SystemFunction[]>);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Role: {role.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Role Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter role name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter role description"
              rows={2}
            />
          </div>

          <Separator />

          {/* System Permissions */}
          <div>
            <Label className="text-base font-medium">System Permissions</Label>
            <p className="text-sm text-muted-foreground mb-4">Select which permissions users with this role should have</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto border rounded-lg p-4">
              {availablePermissions.map((permission) => (
                <div key={permission.id} className="flex items-start space-x-3">
                  <Checkbox
                    id={permission.id}
                    checked={formData.permissions.includes(permission.id)}
                    onCheckedChange={(checked) => handlePermissionChange(permission.id, checked as boolean)}
                  />
                  <div className="grid gap-1 leading-none">
                    <Label
                      htmlFor={permission.id}
                      className="text-sm font-medium leading-none cursor-pointer"
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
                    <Badge key={perm} variant="secondary" className="text-xs">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Module Functions */}
          <div>
            <Label className="text-base font-medium">Module Functions</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Assign specific functions within modules to this role
            </p>

            {isLoadingFunctions ? (
              <div className="flex items-center justify-center h-20">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(functionsByModule).map(([module, funcs]) => (
                  <div key={module} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="font-medium capitalize">{module} Functions</h4>
                      {module === 'purchase' && hasPurchasePermission && !isPurchaseValid && (
                        <Badge variant="destructive" className="text-xs flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Required
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {funcs.map((func) => (
                        <div key={func.id} className="flex items-start space-x-3">
                          <Checkbox
                            id={`func-${func.id}`}
                            checked={selectedFunctions.includes(func.function_key)}
                            onCheckedChange={(checked) => handleFunctionChange(func.function_key, checked as boolean)}
                          />
                          <div className="grid gap-1 leading-none">
                            <Label
                              htmlFor={`func-${func.id}`}
                              className="text-sm font-medium leading-none cursor-pointer"
                            >
                              {func.function_name}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              {func.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Purchase function validation warning */}
            {hasPurchasePermission && !isPurchaseValid && (
              <div className="mt-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">Purchase Function Required</p>
                  <p className="text-muted-foreground">
                    This role has Purchase Tab permission. You must assign at least one purchase function 
                    (Purchase Creator or Payer) before saving.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !isPurchaseValid}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
