import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { normalizePermissions } from "@/lib/permissions/catalog";
import { PermissionMatrix } from "./PermissionMatrix";
import { Chip, FormSection, PanelSkeleton, StickyFooter, moduleLabel, permissionLabel } from "./umUi";


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

// Permission matrix is rendered from the single-source catalog (see PermissionMatrix).


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

  const handleFunctionChange = (functionKey: string, checked: boolean) => {
    setSelectedFunctions(prev => checked ? [...prev, functionKey] : prev.filter(f => f !== functionKey));
  };

  const onTemplateApplied = (templateName: string) => {
    toast({ title: "Template Applied", description: `Applied "${templateName}" template` });
  };

  // Group functions by module
  const functionsByModule = systemFunctions.reduce((acc, func) => {
    if (!acc[func.module]) acc[func.module] = [];
    acc[func.module].push(func);
    return acc;
  }, {} as Record<string, SystemFunction[]>);

  const changeCount = permissionDiff.added.length + permissionDiff.removed.length;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto pb-0 md:pb-0 md:max-w-4xl">
        <DialogHeader className="pr-6">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Edit role: {role.name.trim()}
            {isSystemRole && <Chip tone="info">System role</Chip>}
          </DialogTitle>
          <DialogDescription>
            {role.user_count === 0
              ? "Nobody has this role yet."
              : `${role.user_count === 1 ? "1 person has" : `${role.user_count} people have`} this role. Changes apply to all of them.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Role Info */}
          <FormSection title="Role details">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Role name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter role name"
                  required
                  disabled={isSystemRole}
                />
                {isSystemRole && (
                  <p className="text-xs text-muted-foreground">System role names can't be changed.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What is this role for?"
                  rows={2}
                />
              </div>
            </div>
          </FormSection>

          {/* Permissions by Section → Module */}
          <PermissionMatrix
            value={formData.permissions}
            onChange={(update) => setFormData((prev) => ({ ...prev, permissions: update(prev.permissions) }))}
            templates
            onTemplateApplied={onTemplateApplied}
          />

          {/* Module Functions */}
          {(isLoadingFunctions || Object.keys(functionsByModule).length > 0) && (
            <FormSection title="Module functions" hint="Extra abilities on top of the permissions above.">
              {isLoadingFunctions ? (
                <PanelSkeleton rows={2} />
              ) : (
                <div className="space-y-3">
                  {Object.entries(functionsByModule).map(([module, funcs]) => (
                    <div key={module}>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{moduleLabel(module)}</p>
                      <div className="flex flex-wrap gap-2">
                        {funcs.map((func) => {
                          const on = selectedFunctions.includes(func.function_key);
                          return (
                            <label
                              key={func.id}
                              title={func.description}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors",
                                on ? "border-primary/25 bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <Checkbox
                                checked={on}
                                onCheckedChange={(checked) => handleFunctionChange(func.function_key, checked as boolean)}
                                className="h-3.5 w-3.5"
                              />
                              {func.function_name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>
          )}

          {/* Change Diff Preview */}
          {changeCount > 0 && (
            <FormSection title={`Permission changes (${changeCount})`}>
              <div className="flex flex-wrap gap-1.5">
                {permissionDiff.added.map(p => (
                  <span key={`add-${p}`} className="inline-flex items-center rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                    + {permissionLabel(p)}
                  </span>
                ))}
                {permissionDiff.removed.map(p => (
                  <span key={`rem-${p}`} className="inline-flex items-center rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                    − {permissionLabel(p)}
                  </span>
                ))}
              </div>
            </FormSection>
          )}

          <StickyFooter>
            <span className="w-full text-xs text-muted-foreground sm:mr-auto sm:w-auto">
              {changeCount === 0
                ? "No permission changes"
                : [
                    permissionDiff.added.length ? `${permissionDiff.added.length} added` : null,
                    permissionDiff.removed.length ? `${permissionDiff.removed.length} removed` : null,
                  ].filter(Boolean).join(" · ")}
            </span>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save changes"}
            </Button>
          </StickyFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
