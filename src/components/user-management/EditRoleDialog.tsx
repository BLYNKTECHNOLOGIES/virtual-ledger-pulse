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
import { Shield, ShieldCheck, Eye, Settings, Trash2, Zap, ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PERMISSION_MODULES,
  PERMISSION_SECTION_ORDER,
  ROLE_TEMPLATES,
  normalizePermissions,
} from "@/lib/permissions/catalog";


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

// Permission matrix is rendered from the single-source catalog.


const TIER_STYLES: Record<string, { badge: string; icon: typeof Eye }> = {
  view: { badge: 'bg-success/10 text-success border-success/20', icon: Eye },
  manage: { badge: 'bg-info/10 text-info border-info/20', icon: Settings },
  approve: { badge: 'bg-primary/10 text-primary border-primary/20', icon: ShieldCheck },
  destructive: { badge: 'bg-destructive/10 text-destructive border-destructive/20', icon: Trash2 },
  special: { badge: 'bg-warning/10 text-warning border-warning/20', icon: Zap },
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
  const [permissionSearch, setPermissionSearch] = useState('');
  const { toast } = useToast();

  const isSystemRole = SYSTEM_ROLE_NAMES.includes(role.name);

  const filteredModules = useMemo(() => {
    const q = permissionSearch.trim().toLowerCase();
    const entries = Object.entries(PERMISSION_MODULES);
    if (!q) return entries;
    return entries
      .map(([key, mod]) => {
        if (mod.label.toLowerCase().includes(q)) return [key, mod] as typeof entries[number];
        const perms = mod.permissions.filter(
          (p) =>
            p.id.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
        );
        return perms.length > 0 ? ([key, { ...mod, permissions: perms }] as typeof entries[number]) : null;
      })
      .filter(Boolean) as typeof entries;
  }, [permissionSearch]);

  const toggleAllInModule = (ids: string[], checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      permissions: checked
        ? Array.from(new Set([...prev.permissions, ...ids]))
        : prev.permissions.filter((p) => !ids.includes(p)),
    }));
  };


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

          {/* Permissions by Section → Module */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <Label className="text-base font-medium">Permissions</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.permissions.length} selected
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={cn("text-xs", TIER_STYLES.view.badge)}>
                  <Eye className="h-3 w-3 mr-1" /> View
                </Badge>
                <Badge variant="outline" className={cn("text-xs", TIER_STYLES.manage.badge)}>
                  <Settings className="h-3 w-3 mr-1" /> Manage
                </Badge>
                <Badge variant="outline" className={cn("text-xs", TIER_STYLES.approve.badge)}>
                  <ShieldCheck className="h-3 w-3 mr-1" /> Approve
                </Badge>
                <Badge variant="outline" className={cn("text-xs", TIER_STYLES.destructive.badge)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Destructive
                </Badge>
              </div>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={permissionSearch}
                onChange={(e) => setPermissionSearch(e.target.value)}
                placeholder="Search permissions or modules…"
                className="pl-8 text-foreground"
              />
            </div>

            <div className="space-y-4">
              {PERMISSION_SECTION_ORDER.map((section) => {
                const modules = filteredModules.filter(([, m]) => (m.section || 'Core') === section);
                if (modules.length === 0) return null;
                return (
                  <div key={section}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                      {section}
                    </p>
                    <div className="space-y-1 border rounded-lg overflow-hidden">
                      {modules.map(([key, module]) => {
                        const isCollapsed = collapsedModules.has(key) && !permissionSearch.trim();
                        const modulePermCount = module.permissions.filter(p => formData.permissions.includes(p.id)).length;
                        const allChecked = modulePermCount === module.permissions.length;

                        return (
                          <div key={key} className={cn(
                            "border-b last:border-b-0",
                            key === 'destructive' && "bg-destructive/10"
                          )}>
                            <div className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors">
                              <button
                                type="button"
                                onClick={() => toggleModule(key)}
                                className="flex items-center gap-2 flex-1 text-left"
                              >
                                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                <span className="font-medium text-sm">{module.label}</span>
                              </button>
                              <div className="flex items-center gap-2">
                                {modulePermCount > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {modulePermCount}/{module.permissions.length}
                                  </Badge>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => toggleAllInModule(module.permissions.map(p => p.id), !allChecked)}
                                >
                                  {allChecked ? 'Clear' : 'All'}
                                </Button>
                              </div>
                            </div>
                            {!isCollapsed && (
                              <div className="px-4 pb-3 pt-1 flex flex-wrap gap-3">
                                {module.permissions.map((perm) => {
                                  const tierStyle = TIER_STYLES[perm.tier] || TIER_STYLES.special;
                                  const isChecked = formData.permissions.includes(perm.id);
                                  return (
                                    <label
                                      key={perm.id}
                                      title={perm.description}
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
                    <Badge key={`add-${p}`} className="text-xs bg-success/10 text-success border-success/20">
                      + {p.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                  {permissionDiff.removed.map(p => (
                    <Badge key={`rem-${p}`} className="text-xs bg-destructive/10 text-destructive border-destructive/20">
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
