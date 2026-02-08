import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { DatabaseUser } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";

const TERMINAL_ROLES = {
  ADMIN: "1b88841c-bced-47e4-b09d-9b442f4bcdd7",
  OPERATOR: "ac815807-39db-4c83-ab25-8783e10d0f64",
  VIEWER: "e1f3e3e6-45b5-4932-b70b-d85402a32545",
};

interface Role {
  id: string;
  name: string;
  description: string;
}

interface EditUserDialogProps {
  user: DatabaseUser;
  onSave: (userId: string, userData: any) => Promise<any>;
  onClose: () => void;
}

export function EditUserDialog({ user, onSave, onClose }: EditUserDialogProps) {
  // Get the role_id from either user.role_id or from user.role.id (from user_roles junction table)
  const initialRoleId = user.role_id || user.role?.id || "no_role";
  
  const [formData, setFormData] = useState({
    username: user.username,
    email: user.email,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    phone: user.phone || "",
    status: user.status,
    role_id: initialRoleId,
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [terminalAccess, setTerminalAccess] = useState(false);
  const [currentTerminalRoleId, setCurrentTerminalRoleId] = useState<string | null>(null);
  const [terminalRoleId, setTerminalRoleId] = useState<string>(TERMINAL_ROLES.OPERATOR);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    const fetchRoles = async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, description')
        .order('name');

      if (error) {
        console.error('Error fetching roles:', error);
        return;
      }

      setRoles(data || []);
    };

    const fetchTerminalAccess = async () => {
      const { data, error } = await supabase.rpc('get_terminal_user_roles', { p_user_id: user.id });
      if (!error && data && Array.isArray(data) && data.length > 0) {
        setTerminalAccess(true);
        setCurrentTerminalRoleId(data[0].role_id);
        setTerminalRoleId(data[0].role_id);
      }
    };

    fetchRoles();
    fetchTerminalAccess();
  }, [user.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Convert "no_role" back to empty string for the database
      const submitData = {
        ...formData,
        role_id: formData.role_id === "no_role" ? "" : formData.role_id,
      };
      
      const result = await onSave(user.id, submitData);
      
      if (result?.success !== false) {
        // Log the action
        logActionWithCurrentUser({
          actionType: ActionTypes.USER_UPDATED,
          entityType: EntityTypes.USER,
          entityId: user.id,
          module: Modules.USER_MANAGEMENT,
          metadata: { username: formData.username, email: formData.email, role_id: formData.role_id }
        });
        
        // If role was changed, log that separately
        if (formData.role_id !== initialRoleId) {
          logActionWithCurrentUser({
            actionType: ActionTypes.USER_ROLE_ASSIGNED,
            entityType: EntityTypes.USER,
            entityId: user.id,
            module: Modules.USER_MANAGEMENT,
            metadata: { old_role_id: initialRoleId, new_role_id: formData.role_id }
          });
        }

        // Handle terminal access changes
        const hadAccess = !!currentTerminalRoleId;
        if (terminalAccess && !hadAccess) {
          // Determine terminal role: if ERP role is Admin, auto-assign terminal Admin
          const selectedErpRole = roles.find(r => r.id === formData.role_id);
          const autoTerminalRoleId = selectedErpRole?.name?.toLowerCase() === 'admin'
            ? TERMINAL_ROLES.ADMIN
            : terminalRoleId;
          const sessionStr = localStorage.getItem('userSession');
          const assignedBy = sessionStr ? JSON.parse(sessionStr).id : undefined;
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
          // Role changed: remove old, assign new
          await supabase.rpc("remove_terminal_role", {
            p_user_id: user.id,
            p_role_id: currentTerminalRoleId!,
          });
          const sessionStr = localStorage.getItem('userSession');
          const assignedBy = sessionStr ? JSON.parse(sessionStr).id : undefined;
          await supabase.rpc("assign_terminal_role", {
            p_user_id: user.id,
            p_role_id: terminalRoleId,
            p_assigned_by: assignedBy,
          });
        }
        
        toast({
          title: "Success",
          description: "User updated successfully",
        });

        // If the current user's role was changed, trigger a page reload to refresh permissions
        if (currentUser?.id === user.id && formData.role_id !== user.role_id) {
          toast({
            title: "Role Updated",
            description: "Your role has been updated. The page will refresh to apply new permissions.",
          });
          
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
        
        onClose();
      } else {
        toast({
          title: "Error",
          description: result?.error?.message || "Failed to update user",
          variant: "destructive",
        });
      }
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

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="First name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Username"
              required
            />
          </div>

          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Phone number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={formData.role_id} onValueChange={(value) => {
              setFormData({ ...formData, role_id: value });
              const selectedRole = roles.find(r => r.id === value);
              if (selectedRole?.name?.toLowerCase() === 'admin') {
                setTerminalAccess(true);
                setTerminalRoleId(TERMINAL_ROLES.ADMIN);
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_role">No Role</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Functions are inherited from the assigned role. Edit the role to manage functions.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="terminal-access" className="text-sm font-medium">Terminal Access</Label>
                <p className="text-xs text-muted-foreground">Grant access to the P2P Trading Terminal</p>
              </div>
              <Switch
                id="terminal-access"
                checked={terminalAccess}
                onCheckedChange={setTerminalAccess}
              />
            </div>
            {terminalAccess && (
              <div className="space-y-1">
                <Label htmlFor="terminal-role" className="text-xs">Terminal Role</Label>
                <Select value={terminalRoleId} onValueChange={setTerminalRoleId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TERMINAL_ROLES.ADMIN}>Admin</SelectItem>
                    <SelectItem value={TERMINAL_ROLES.OPERATOR}>Operator</SelectItem>
                    <SelectItem value={TERMINAL_ROLES.VIEWER}>Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
