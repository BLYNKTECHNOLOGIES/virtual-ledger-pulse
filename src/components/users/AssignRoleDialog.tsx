
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";

interface AssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  userDisplayName: string;
  onRoleAssigned: () => void;
}

interface Role {
  id: string;
  name: string;
  description: string;
}

interface UserRole {
  id: string;
  role_id: string;
  roles: {
    id: string;
    name: string;
  };
}

export function AssignRoleDialog({ open, onOpenChange, username, userDisplayName, onRoleAssigned }: AssignRoleDialogProps) {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('name');

      if (error) throw error;
      setRoles(data || []);
    } catch (error: any) {
      console.error('Error fetching roles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch roles",
        variant: "destructive"
      });
    }
  };

  const fetchUserRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          id,
          role_id,
          roles (
            id,
            name
          )
        `)
        .eq('user_id', username);

      if (error) throw error;
      setUserRoles(data || []);
    } catch (error: any) {
      console.error('Error fetching user roles:', error);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedRoleId) {
      toast({
        title: "Error",
        description: "Please select a role",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: username,
          role_id: selectedRoleId,
          assigned_by: 'admin' // You can get this from auth context
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Role assigned successfully"
      });

      setSelectedRoleId("");
      fetchUserRoles();
      onRoleAssigned();
    } catch (error: any) {
      console.error('Error assigning role:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign role",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveRole = async (userRoleId: string, roleName: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', userRoleId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Role "${roleName}" removed successfully`
      });

      fetchUserRoles();
      onRoleAssigned();
    } catch (error: any) {
      console.error('Error removing role:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove role",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    if (open) {
      fetchRoles();
      fetchUserRoles();
    }
  }, [open, username]);

  const availableRoles = roles.filter(role => 
    !userRoles.some(userRole => userRole.role_id === role.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Roles for {userDisplayName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Current Roles */}
          <div className="space-y-2">
            <Label>Current Roles</Label>
            <div className="flex flex-wrap gap-2">
              {userRoles.length > 0 ? (
                userRoles.map((userRole) => (
                  <Badge key={userRole.id} variant="default" className="flex items-center gap-1">
                    {userRole.roles.name}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-auto p-0 ml-1"
                      onClick={() => handleRemoveRole(userRole.id, userRole.roles.name)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))
              ) : (
                <span className="text-gray-500 text-sm">No roles assigned</span>
              )}
            </div>
          </div>

          {/* Assign New Role */}
          <div className="space-y-2">
            <Label>Assign New Role</Label>
            <div className="flex gap-2">
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAssignRole} disabled={isLoading || !selectedRoleId}>
                {isLoading ? "Assigning..." : "Assign"}
              </Button>
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
