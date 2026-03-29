import { useState, useEffect, useMemo } from "react";
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
import { Shield, Eye, Settings, Trash2, Zap, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

// Permission definitions grouped by module
const PERMISSION_MODULES: Record<string, { label: string; permissions: { id: string; name: string; description: string; tier: 'view' | 'manage' | 'destructive' | 'special' }[] }> = {
  dashboard: {
    label: 'Dashboard',
    permissions: [
      { id: 'dashboard_view', name: 'View', description: 'View main dashboard', tier: 'view' },
    ],
  },
  sales: {
    label: 'Sales',
    permissions: [
      { id: 'sales_view', name: 'View', description: 'View sales data', tier: 'view' },
      { id: 'sales_manage', name: 'Manage', description: 'Manage sales orders', tier: 'manage' },
    ],
  },
  purchase: {
    label: 'Purchase',
    permissions: [
      { id: 'purchase_view', name: 'View', description: 'View purchase data', tier: 'view' },
      { id: 'purchase_manage', name: 'Manage', description: 'Manage purchase orders', tier: 'manage' },
    ],
  },
  terminal: {
    label: 'Terminal',
    permissions: [
      { id: 'terminal_view', name: 'View', description: 'View terminal data', tier: 'view' },
      { id: 'terminal_manage', name: 'Manage', description: 'Manage terminal', tier: 'manage' },
    ],
  },
  bams: {
    label: 'BAMS',
    permissions: [
      { id: 'bams_view', name: 'View', description: 'View bank accounts', tier: 'view' },
      { id: 'bams_manage', name: 'Manage', description: 'Manage bank accounts', tier: 'manage' },
    ],
  },
  clients: {
    label: 'Clients',
    permissions: [
      { id: 'clients_view', name: 'View', description: 'View clients', tier: 'view' },
      { id: 'clients_manage', name: 'Manage', description: 'Manage clients', tier: 'manage' },
    ],
  },
  leads: {
    label: 'Leads',
    permissions: [
      { id: 'leads_view', name: 'View', description: 'View leads', tier: 'view' },
      { id: 'leads_manage', name: 'Manage', description: 'Manage leads', tier: 'manage' },
    ],
  },
  user_management: {
    label: 'User Management',
    permissions: [
      { id: 'user_management_view', name: 'View', description: 'View users and roles', tier: 'view' },
      { id: 'user_management_manage', name: 'Manage', description: 'Manage users and roles', tier: 'manage' },
    ],
  },
  hrms: {
    label: 'HRMS',
    permissions: [
      { id: 'hrms_view', name: 'View', description: 'View HR data', tier: 'view' },
      { id: 'hrms_manage', name: 'Manage', description: 'Manage HR', tier: 'manage' },
    ],
  },
  payroll: {
    label: 'Payroll',
    permissions: [
      { id: 'payroll_view', name: 'View', description: 'View payroll', tier: 'view' },
      { id: 'payroll_manage', name: 'Manage', description: 'Manage payroll', tier: 'manage' },
    ],
  },
  compliance: {
    label: 'Compliance',
    permissions: [
      { id: 'compliance_view', name: 'View', description: 'View compliance', tier: 'view' },
      { id: 'compliance_manage', name: 'Manage', description: 'Manage compliance', tier: 'manage' },
    ],
  },
  stock: {
    label: 'Stock',
    permissions: [
      { id: 'stock_view', name: 'View', description: 'View inventory', tier: 'view' },
      { id: 'stock_manage', name: 'Manage', description: 'Manage inventory', tier: 'manage' },
      { id: 'stock_conversion_create', name: 'Create Conversions', description: 'Create stock conversions', tier: 'special' },
      { id: 'stock_conversion_approve', name: 'Approve Conversions', description: 'Approve stock conversions', tier: 'special' },
    ],
  },
  accounting: {
    label: 'Accounting',
    permissions: [
      { id: 'accounting_view', name: 'View', description: 'View financial data', tier: 'view' },
      { id: 'accounting_manage', name: 'Manage', description: 'Manage accounting', tier: 'manage' },
    ],
  },
  kyc: {
    label: 'KYC',
    permissions: [
      { id: 'video_kyc_view', name: 'Video KYC View', description: 'View Video KYC', tier: 'view' },
      { id: 'video_kyc_manage', name: 'Video KYC Manage', description: 'Manage Video KYC', tier: 'manage' },
      { id: 'kyc_approvals_view', name: 'Approvals View', description: 'View KYC approvals', tier: 'view' },
      { id: 'kyc_approvals_manage', name: 'Approvals Manage', description: 'Manage KYC approvals', tier: 'manage' },
    ],
  },
  statistics: {
    label: 'Statistics',
    permissions: [
      { id: 'statistics_view', name: 'View', description: 'View reports', tier: 'view' },
      { id: 'statistics_manage', name: 'Manage', description: 'Manage statistics', tier: 'manage' },
    ],
  },
  ems: {
    label: 'EMS',
    permissions: [
      { id: 'ems_view', name: 'View', description: 'View EMS data', tier: 'view' },
      { id: 'ems_manage', name: 'Manage', description: 'Manage EMS', tier: 'manage' },
    ],
  },
  utility: {
    label: 'Utility',
    permissions: [
      { id: 'utility_view', name: 'View', description: 'View utility tools', tier: 'view' },
      { id: 'utility_manage', name: 'Manage', description: 'Manage utility tools', tier: 'manage' },
    ],
  },
  tasks: {
    label: 'Tasks',
    permissions: [
      { id: 'tasks_view', name: 'View', description: 'View tasks', tier: 'view' },
      { id: 'tasks_manage', name: 'Manage', description: 'Manage tasks', tier: 'manage' },
    ],
  },
  destructive: {
    label: 'Destructive Actions',
    permissions: [
      { id: 'erp_destructive', name: 'ERP', description: 'Delete/reject ERP records', tier: 'destructive' },
      { id: 'terminal_destructive', name: 'Terminal', description: 'Delete terminal data', tier: 'destructive' },
      { id: 'bams_destructive', name: 'BAMS', description: 'Delete/close bank accounts', tier: 'destructive' },
      { id: 'clients_destructive', name: 'Clients', description: 'Delete/reject clients', tier: 'destructive' },
      { id: 'stock_destructive', name: 'Stock', description: 'Delete stock data', tier: 'destructive' },
    ],
  },
  special: {
    label: 'Special',
    permissions: [
      { id: 'shift_reconciliation_create', name: 'Reconciliation Create', description: 'Submit shift reconciliation records', tier: 'special' },
      { id: 'shift_reconciliation_approve', name: 'Reconciliation Approve', description: 'Approve/reject shift reconciliation', tier: 'special' },
    ],
  },
};

// Role templates
const ROLE_TEMPLATES = [
  {
    name: 'Read-Only Auditor',
    description: 'All view permissions, no manage or destructive',
    getPermissions: () => {
      const viewPerms: string[] = [];
      Object.values(PERMISSION_MODULES).forEach(mod => {
        mod.permissions.forEach(p => {
          if (p.tier === 'view') viewPerms.push(p.id);
        });
      });
      return viewPerms;
    },
  },
  {
    name: 'Full Operations',
    description: 'All view + manage, no destructive',
    getPermissions: () => {
      const perms: string[] = [];
      Object.values(PERMISSION_MODULES).forEach(mod => {
        mod.permissions.forEach(p => {
          if (p.tier === 'view' || p.tier === 'manage' || p.tier === 'special') perms.push(p.id);
        });
      });
      return perms;
    },
  },
  {
    name: 'Finance View-Only',
    description: 'Accounting, BAMS, Payroll view only',
    getPermissions: () => ['dashboard_view', 'accounting_view', 'bams_view', 'payroll_view', 'statistics_view'],
  },
];

// Map old permission format to new format
const permissionMapping: Record<string, string> = {
  'view_dashboard': 'dashboard_view',
  'view_sales': 'sales_view',
  'view_purchase': 'purchase_view',
  'view_bams': 'bams_view',
  'view_clients': 'clients_view',
  'view_leads': 'leads_view',
  'view_user_management': 'user_management_view',
  'view_hrms': 'hrms_view',
  'view_payroll': 'payroll_view',
  'view_compliance': 'compliance_view',
  'view_stock': 'stock_view',
  'view_stock_management': 'stock_view',
  'view_accounting': 'accounting_view',
  'view_video_kyc': 'video_kyc_view',
  'view_kyc_approvals': 'kyc_approvals_view',
  'view_statistics': 'statistics_view',
  'view_ems': 'ems_view',
};

const normalizePermission = (perm: string): string => permissionMapping[perm] || perm;
const normalizePermissions = (perms: string[]): string[] => [...new Set(perms.map(normalizePermission))];

const TIER_STYLES: Record<string, { badge: string; icon: typeof Eye }> = {
  view: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Eye },
  manage: { badge: 'bg-blue-100 text-blue-700 border-blue-200', icon: Settings },
  destructive: { badge: 'bg-red-100 text-red-700 border-red-200', icon: Trash2 },
  special: { badge: 'bg-amber-100 text-amber-700 border-amber-200', icon: Zap },
};

// System roles that cannot have their name changed
const SYSTEM_ROLE_NAMES = ['Super Admin', 'Admin'];

export function EditRoleDialog({ role, onSave, onClose }: EditRoleDialogProps) {
  const [formData, setFormData] = useState(() => ({
    name: role.name,
    description: role.description,
    permissions: normalizePermissions(role.permissions)
  }));
  const [systemFunctions, setSystemFunctions] = useState<SystemFunction[]>([]);
  const [selectedFunctions, setSelectedFunctions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFunctions, setIsLoadingFunctions] = useState(true);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const isSystemRole = SYSTEM_ROLE_NAMES.includes(role.name);

  // Compute diff for preview
  const permissionDiff = useMemo(() => {
    const original = new Set(normalizePermissions(role.permissions));
    const current = new Set(formData.permissions);
    const added = formData.permissions.filter(p => !original.has(p));
    const removed = [...original].filter(p => !current.has(p));
    return { added, removed };
  }, [role.permissions, formData.permissions]);

  useEffect(() => {
    setFormData({
      name: role.name,
      description: role.description,
      permissions: normalizePermissions(role.permissions)
    });
    fetchFunctions();
  }, [role]);

  const fetchFunctions = async () => {
    setIsLoadingFunctions(true);
    try {
      const { data: funcsData, error: funcsError } = await supabase
        .from('system_functions')
        .select('*')
        .order('module');

      if (funcsError) throw funcsError;
      setSystemFunctions(funcsData || []);

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
    setIsLoading(true);

    try {
      const result = await onSave(role.id, formData);
      
      if (result?.success === false) {
        toast({ title: "Error", description: result?.error?.message || "Failed to update role permissions", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      // Update functions
      await supabase.from('role_functions').delete().eq('role_id', role.id).select();

      if (selectedFunctions.length > 0) {
        const functionIds = systemFunctions
          .filter(f => selectedFunctions.includes(f.function_key))
          .map(f => ({ role_id: role.id, function_id: f.id }));

        if (functionIds.length > 0) {
          const { error: insertError } = await supabase.from('role_functions').insert(functionIds).select();
          if (insertError) throw insertError;
        }
      }

      toast({ title: "Success", description: "Role updated successfully" });
      onClose();
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to update role", variant: "destructive" });
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
    setSelectedFunctions(prev => checked ? [...prev, functionKey] : prev.filter(f => f !== functionKey));
  };

  const applyTemplate = (template: typeof ROLE_TEMPLATES[0]) => {
    setFormData(prev => ({ ...prev, permissions: template.getPermissions() }));
    toast({ title: "Template Applied", description: `Applied "${template.name}" template` });
  };

  const toggleModule = (key: string) => {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Group functions by module
  const functionsByModule = systemFunctions.reduce((acc, func) => {
    if (!acc[func.module]) acc[func.module] = [];
    acc[func.module].push(func);
    return acc;
  }, {} as Record<string, SystemFunction[]>);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Edit Role: {role.name}
            {isSystemRole && (
              <Badge variant="outline" className="text-xs">System Role</Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Role Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Role Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter role name"
                required
                disabled={isSystemRole}
              />
              {isSystemRole && (
                <p className="text-xs text-muted-foreground">System role names cannot be changed</p>
              )}
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
          </div>

          <Separator />

          {/* Role Templates */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-2 block">Quick Templates</Label>
            <div className="flex flex-wrap gap-2">
              {ROLE_TEMPLATES.map((template) => (
                <Button
                  key={template.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyTemplate(template)}
                  className="text-xs"
                >
                  {template.name}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Permissions by Module */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <Label className="text-base font-medium">Permissions</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.permissions.length} selected
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className={cn("text-xs", TIER_STYLES.view.badge)}>
                  <Eye className="h-3 w-3 mr-1" /> View
                </Badge>
                <Badge variant="outline" className={cn("text-xs", TIER_STYLES.manage.badge)}>
                  <Settings className="h-3 w-3 mr-1" /> Manage
                </Badge>
                <Badge variant="outline" className={cn("text-xs", TIER_STYLES.destructive.badge)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Destructive
                </Badge>
              </div>
            </div>

            <div className="space-y-1 border rounded-lg overflow-hidden">
              {Object.entries(PERMISSION_MODULES).map(([key, module]) => {
                const isCollapsed = collapsedModules.has(key);
                const modulePermCount = module.permissions.filter(p => formData.permissions.includes(p.id)).length;
                
                return (
                  <div key={key} className={cn(
                    "border-b last:border-b-0",
                    key === 'destructive' && "bg-red-50/30"
                  )}>
                    <button
                      type="button"
                      onClick={() => toggleModule(key)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="font-medium text-sm">{module.label}</span>
                      </div>
                      {modulePermCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {modulePermCount}/{module.permissions.length}
                        </Badge>
                      )}
                    </button>
                    {!isCollapsed && (
                      <div className="px-4 pb-3 pt-1 flex flex-wrap gap-3">
                        {module.permissions.map((perm) => {
                          const tierStyle = TIER_STYLES[perm.tier] || TIER_STYLES.special;
                          const isChecked = formData.permissions.includes(perm.id);
                          return (
                            <label
                              key={perm.id}
                              className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-all text-sm",
                                isChecked ? tierStyle.badge : "bg-background border-border opacity-60 hover:opacity-100"
                              )}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => handlePermissionChange(perm.id, checked as boolean)}
                                className="h-3.5 w-3.5"
                              />
                              {perm.name}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Module Functions */}
          {Object.keys(functionsByModule).length > 0 && (
            <div>
              <Label className="text-base font-medium">Module Functions</Label>
              <p className="text-sm text-muted-foreground mb-3">Specific capabilities within modules</p>

              {isLoadingFunctions ? (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(functionsByModule).map(([module, funcs]) => (
                    <div key={module} className="border rounded-lg p-3">
                      <h4 className="font-medium capitalize text-sm mb-2">{module} Functions</h4>
                      <div className="flex flex-wrap gap-3">
                        {funcs.map((func) => (
                          <label key={func.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={selectedFunctions.includes(func.function_key)}
                              onCheckedChange={(checked) => handleFunctionChange(func.function_key, checked as boolean)}
                              className="h-3.5 w-3.5"
                            />
                            {func.function_name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Change Diff Preview */}
          {(permissionDiff.added.length > 0 || permissionDiff.removed.length > 0) && (
            <>
              <Separator />
              <div className="p-3 border rounded-lg bg-muted/30">
                <Label className="text-sm font-medium mb-2 block">Changes Preview</Label>
                <div className="flex flex-wrap gap-1">
                  {permissionDiff.added.map(p => (
                    <Badge key={`add-${p}`} className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">
                      + {p.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                  {permissionDiff.removed.map(p => (
                    <Badge key={`rem-${p}`} className="text-xs bg-red-100 text-red-700 border-red-200">
                      − {p.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
