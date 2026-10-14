import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { DatabaseUser } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUserId } from "@/lib/session-cache";
import { useAuth } from "@/hooks/useAuth";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { AlertTriangle, Loader2, Lock, UserCheck } from "lucide-react";
import { FormSection, Initials, RoleChip, StickyFooter, UserStatusChip, personName } from "./umUi";

interface TerminalRole {
  id: string;
  name: string;
  description: string | null;
}

interface Role {
  id: string;
  name: string;
  description: string;
}

interface LinkedEmployee {
  id: string;
  first_name: string;
  last_name: string;
  badge_id: string;
}

interface EditUserDialogProps {
  user: DatabaseUser;
  onSave: (userId: string, userData: any) => Promise<any>;
  onClose: () => void;
  /** HR-restricted editors cannot change role or terminal access */
  restrictSensitive?: boolean;
}

export function EditUserDialog({ user, onSave, onClose, restrictSensitive = false }: EditUserDialogProps) {
  const initialRoleId = user.role?.id || user.role_id || "no_role";

  const [formData, setFormData] = useState({
    username: user.username,
    email: user.email,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    phone: user.phone || "",
    status: user.status,
    role_id: initialRoleId,
    badge_id: user.badge_id || "",
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [terminalAccess, setTerminalAccess] = useState(false);
  const [currentTerminalRoleId, setCurrentTerminalRoleId] = useState<string | null>(null);
  const [terminalRoleId, setTerminalRoleId] = useState<string>("");
  const [terminalRoles, setTerminalRoles] = useState<TerminalRole[]>([]);
  const [linkedEmployee, setLinkedEmployee] = useState<LinkedEmployee | null>(null);
  const [isCheckingBadge, setIsCheckingBadge] = useState(false);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchRoles = async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, description')
        .order('name');
      if (!error) setRoles(data || []);
    };

    const fetchTerminalAccess = async () => {
      const { data, error } = await supabase.rpc('get_terminal_user_roles', { p_user_id: user.id });
      if (!error && data && Array.isArray(data) && data.length > 0) {
        setTerminalAccess(true);
        setCurrentTerminalRoleId(data[0].role_id);
        setTerminalRoleId(data[0].role_id);
      }
    };

    const fetchTerminalRoles = async () => {
      const { data, error } = await supabase.rpc('list_terminal_roles');
      if (!error && data) {
        setTerminalRoles(data.map((r: any) => ({ id: r.id, name: r.name, description: r.description })));
      }
    };

    // Resolve badge from users table, fallback to linked HR employee badge
    const fetchBadgeId = async () => {
      const [{ data: userRow, error: userErr }, { data: employeeRow, error: employeeErr }] = await Promise.all([
        supabase
          .from('users')
          .select('badge_id')
          .eq('id', user.id)
          .maybeSingle(),
        (supabase as any)
          .from('hr_employees')
          .select('id, first_name, last_name, badge_id')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (!employeeErr && employeeRow) {
        setLinkedEmployee(employeeRow);
      }

      if (!userErr && userRow?.badge_id) {
        setFormData((prev) => ({ ...prev, badge_id: userRow.badge_id }));
        return;
      }

      if (!employeeErr && employeeRow?.badge_id) {
        setFormData((prev) => ({ ...prev, badge_id: employeeRow.badge_id }));
      }
    };

    fetchRoles();
    fetchTerminalAccess();
    fetchTerminalRoles();
    fetchBadgeId();
  }, [user.id]);

  // Look up linked employee whenever badge_id changes
  useEffect(() => {
    const lookupEmployee = async () => {
      const badgeId = formData.badge_id.trim();
      if (!badgeId) {
        setLinkedEmployee(null);
        return;
      }
      setIsCheckingBadge(true);
      try {
        const { data, error } = await (supabase as any)
          .from('hr_employees')
          .select('id, first_name, last_name, badge_id')
          .eq('badge_id', badgeId)
          .maybeSingle();
        if (!error && data) {
          setLinkedEmployee(data);
        } else {
          setLinkedEmployee(null);
        }
      } catch {
        setLinkedEmployee(null);
      } finally {
        setIsCheckingBadge(false);
      }
    };

    const timeout = setTimeout(lookupEmployee, 400);
    return () => clearTimeout(timeout);
  }, [formData.badge_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // HR-restricted editors cannot change the role — always keep the original
      const effectiveRoleId: string | null = restrictSensitive
        ? (initialRoleId === "no_role" ? null : initialRoleId)
        : (formData.role_id === "no_role" ? null : formData.role_id);
      const submitData = {
        ...formData,
        role_id: effectiveRoleId,
        badge_id: formData.badge_id.trim() || null,
      };

      const result = await onSave(user.id, submitData);

      if (result?.success !== false) {
        // If badge matches an hr_employee, update user_id on hr_employees
        // First, clear any old hr_employee links for this user
        await (supabase as any)
          .from('hr_employees')
          .update({ user_id: null })
          .eq('user_id', user.id);

        // Then set the new link if a matching employee was found
        if (linkedEmployee) {
          await (supabase as any)
            .from('hr_employees')
            .update({ user_id: user.id })
            .eq('id', linkedEmployee.id);
        }

        logActionWithCurrentUser({
          actionType: ActionTypes.USER_UPDATED,
          entityType: EntityTypes.USER,
          entityId: user.id,
          module: Modules.USER_MANAGEMENT,
          metadata: { username: formData.username, email: formData.email, role_id: formData.role_id, badge_id: formData.badge_id }
        });

        if (!restrictSensitive && formData.role_id !== initialRoleId) {
          logActionWithCurrentUser({
            actionType: ActionTypes.USER_ROLE_ASSIGNED,
            entityType: EntityTypes.USER,
            entityId: user.id,
            module: Modules.USER_MANAGEMENT,
            metadata: { old_role_id: initialRoleId, new_role_id: formData.role_id }
          });
        }

        // Handle terminal access changes — skipped entirely for HR-restricted editors
        if (!restrictSensitive) {
          const hadAccess = !!currentTerminalRoleId;
          if (terminalAccess && !hadAccess) {
            const selectedErpRole = roles.find(r => r.id === formData.role_id);
            const adminTerminalRole = terminalRoles.find(r => r.name.toLowerCase() === 'admin');
            const autoTerminalRoleId = selectedErpRole?.name?.toLowerCase() === 'admin' && adminTerminalRole
              ? adminTerminalRole.id
              : terminalRoleId;
            const assignedBy = getSessionUserId() || undefined;
            await supabase.rpc("assign_terminal_role", {
              p_user_id: user.id,
              p_role_id: autoTerminalRoleId,
              p_assigned_by: assignedBy,
            });
          } else if (!terminalAccess && hadAccess) {
            await supabase.rpc("remove_terminal_role", {
              p_user_id: user.id,
              p_role_id: currentTerminalRoleId!,
            });
          } else if (terminalAccess && hadAccess && terminalRoleId !== currentTerminalRoleId) {
            await supabase.rpc("remove_terminal_role", {
              p_user_id: user.id,
              p_role_id: currentTerminalRoleId!,
            });
            const assignedBy = getSessionUserId() || undefined;
            await supabase.rpc("assign_terminal_role", {
              p_user_id: user.id,
              p_role_id: terminalRoleId,
              p_assigned_by: assignedBy,
            });
          }
        }

        // The "User updated" toast comes from useUsers.updateUser (onSave) — not repeated here.

        if (currentUser?.id === user.id && formData.role_id !== user.role_id) {
          toast({
            title: "Role Updated",
            description: "Your role has been updated. Permissions refreshed.",
          });
          queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
          queryClient.invalidateQueries({ queryKey: ['current-user'] });
          queryClient.invalidateQueries({ queryKey: ['user-role'] });
        }

        onClose();
      }
      // On failure useUsers.updateUser has already shown the reason; the dialog stays open.
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: "Error",
        description: "Failed to update user",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const credentialsEdited = formData.username !== user.username || formData.email !== user.email;
  const deactivating = formData.status !== user.status && (formData.status === "INACTIVE" || formData.status === "SUSPENDED");
  // Mirrors handleSubmit: a new ERP Admin without Terminal access gets the Terminal "Admin" role automatically.
  const autoAdminTerminal =
    !currentTerminalRoleId &&
    roles.find((r) => r.id === formData.role_id)?.name?.toLowerCase() === "admin" &&
    terminalRoles.some((r) => r.name.toLowerCase() === "admin");

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto pb-0 md:pb-0 md:max-w-xl">
        <DialogHeader className="pr-6">
          <div className="flex items-center gap-3">
            <Initials name={personName(user)} className="h-10 w-10 text-xs" />
            <div className="min-w-0 text-left">
              <DialogTitle className="truncate">{personName(user)}</DialogTitle>
              <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span>@{user.username}</span>
                <RoleChip name={user.role?.name} />
                <UserStatusChip status={user.status} />
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormSection title="Profile">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="Last name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Email address"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone number"
                />
              </div>
            </div>
            {credentialsEdited && (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                After saving a new username or email, this person is signed out at their next session check (about every 30 seconds).
              </p>
            )}
          </FormSection>

          {/* Badge ID with HRMS Employee Linking */}
          <FormSection title="HRMS link" hint="The badge ID connects this login to the person's HRMS employee profile.">
            <div className="space-y-1.5">
              <Label htmlFor="badge_id">Badge ID</Label>
              <Input
                id="badge_id"
                value={formData.badge_id}
                onChange={(e) => setFormData({ ...formData, badge_id: e.target.value })}
                placeholder="e.g. EMP001"
                className="font-mono placeholder:font-sans"
              />
            </div>
            {isCheckingBadge && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up employee…
              </p>
            )}
            {formData.badge_id.trim() && !isCheckingBadge && linkedEmployee && (
              <p className="flex items-center gap-2 rounded-md border border-success/25 bg-success/10 px-2.5 py-2 text-xs text-foreground">
                <UserCheck className="h-4 w-4 shrink-0 text-success" />
                <span>
                  Linked to <span className="font-semibold">{linkedEmployee.first_name} {linkedEmployee.last_name}</span> in HRMS
                </span>
              </p>
            )}
            {formData.badge_id.trim() && !isCheckingBadge && !linkedEmployee && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                No HRMS employee has this badge ID.
              </p>
            )}
          </FormSection>

          <FormSection title="Access">
            {restrictSensitive && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Role and Terminal access can only be changed by someone with full User Management access.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!restrictSensitive && (
              <div className="space-y-1.5">
                <Label htmlFor="role">ERP role</Label>
                <Select value={formData.role_id} onValueChange={(value) => {
                  setFormData({ ...formData, role_id: value });
                  const selectedRole = roles.find(r => r.id === value);
                  if (selectedRole?.name?.toLowerCase() === 'admin') {
                    setTerminalAccess(true);
                    const adminRole = terminalRoles.find(r => r.name.toLowerCase() === 'admin');
                    if (adminRole) setTerminalRoleId(adminRole.id);
                  }
                }}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_role">No role</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' })}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!restrictSensitive && (
              <p className="text-xs text-muted-foreground">
                Permissions and functions come from the role. To change what a role allows, edit the role.
              </p>
            )}
            {deactivating && (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                After saving, this person is signed out at their next session check (about every 30 seconds) and can't use the ERP until set back to Active.
              </p>
            )}
          </FormSection>

          {!restrictSensitive && (
          <FormSection title="P2P Trading Terminal">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="terminal-access" className="text-sm font-medium">Terminal access</Label>
                <p className="text-xs text-muted-foreground">Lets this person open the P2P Trading Terminal.</p>
              </div>
              <Switch
                id="terminal-access"
                checked={terminalAccess}
                onCheckedChange={setTerminalAccess}
              />
            </div>
            {terminalAccess && (
              <div className="space-y-1.5">
                <Label htmlFor="terminal-role">Terminal role</Label>
                <Select value={terminalRoleId} onValueChange={setTerminalRoleId}>
                  <SelectTrigger id="terminal-role">
                    <SelectValue placeholder="Choose a Terminal role" />
                  </SelectTrigger>
                  <SelectContent>
                    {terminalRoles.map((tr) => (
                      <SelectItem key={tr.id} value={tr.id}>{tr.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!terminalRoleId && !autoAdminTerminal && (
                  <p className="text-xs text-warning">Choose a Terminal role, otherwise access is not granted.</p>
                )}
              </div>
            )}
          </FormSection>
          )}

          <StickyFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save changes"}
            </Button>
          </StickyFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
