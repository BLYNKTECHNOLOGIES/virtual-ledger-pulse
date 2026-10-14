import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PERMISSION_MODULES, normalizePermissions } from "@/lib/permissions/catalog";
import { PermissionMatrix } from "./PermissionMatrix";
import { Chip, FormSection, StickyFooter, permissionLabel } from "./umUi";


interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  user_count: number;
}

interface EditRoleDialogProps {
  role: Role;
  onSave: (roleId: string, roleData: { name: string; description: string; permissions: string[] }) => Promise<any>;
  onClose: () => void;
  /** Permissions the signed-in person holds (effective); others are locked (UM-2A R2). */
  heldPermissions: string[];
  isSuperAdmin?: boolean;
}

/** Catalog permissions the person doesn't hold — shown locked in the matrix. */
export function lockedPermissions(held: string[]): Set<string> {
  const h = new Set(held);
  const all = Object.values(PERMISSION_MODULES).flatMap((m) => m.permissions.map((p) => p.id));
  return new Set(all.filter((id) => !h.has(id)));
}

// Permission matrix is rendered from the single-source catalog (see PermissionMatrix).


// System roles that cannot have their name changed
const SYSTEM_ROLE_NAMES = ['Super Admin', 'Admin'];

export function EditRoleDialog({ role, onSave, onClose, heldPermissions, isSuperAdmin = false }: EditRoleDialogProps) {
  const locked = useMemo(() => (isSuperAdmin ? new Set<string>() : lockedPermissions(heldPermissions)), [heldPermissions, isSuperAdmin]);
  const [formData, setFormData] = useState(() => ({
    name: role.name,
    description: role.description,
    permissions: normalizePermissions(role.permissions)
  }));
  const [isLoading, setIsLoading] = useState(false);
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
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await onSave(role.id, { ...formData, name: formData.name.trim() });

      if (result?.success === false) {
        toast({ title: "Error", description: result?.error?.message || "Failed to update role permissions", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      toast({ title: "Success", description: "Role updated successfully" });
      onClose();
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to update role", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const onTemplateApplied = (templateName: string) => {
    toast({ title: "Template Applied", description: `Applied "${templateName}" template` });
  };

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
            locked={locked}
          />

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
