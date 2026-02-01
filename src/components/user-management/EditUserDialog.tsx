import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { DatabaseUser } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
    is_purchase_creator: user.is_purchase_creator ?? false,
    is_payer: user.is_payer ?? false,
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

      console.log('Fetched roles:', data);
      setRoles(data || []);
    };

    fetchRoles();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Convert "no_role" back to empty string for the database
      const submitData = {
        ...formData,
        role_id: formData.role_id === "no_role" ? "" : formData.role_id,
        is_purchase_creator: formData.is_purchase_creator,
        is_payer: formData.is_payer,
      };
      
      const result = await onSave(user.id, submitData);
      
      if (result?.success !== false) {
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
          
          // Small delay to let the user see the toast, then reload
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
            <Select value={formData.role_id} onValueChange={(value) => setFormData({ ...formData, role_id: value })}>
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

          {/* Purchase Functions Section */}
          <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
            <Label className="text-sm font-medium">Purchase Functions</Label>
            <p className="text-xs text-muted-foreground">
              Enable specific functions for this user in the Purchase terminal. If both are enabled, full workflow applies.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="is_purchase_creator"
                  checked={formData.is_purchase_creator}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_purchase_creator: checked === true })}
                />
                <div className="grid gap-1 leading-none">
                  <Label htmlFor="is_purchase_creator" className="text-sm font-medium cursor-pointer">
                    Purchase Creator
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Creates orders, collects TDS/payment details. Cannot add to bank.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="is_payer"
                  checked={formData.is_payer}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_payer: checked === true })}
                />
                <div className="grid gap-1 leading-none">
                  <Label htmlFor="is_payer" className="text-sm font-medium cursor-pointer">
                    Payer
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Handles bank additions and payments. Cannot collect details.
                  </p>
                </div>
              </div>
            </div>
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
