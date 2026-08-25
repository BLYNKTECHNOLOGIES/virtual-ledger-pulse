
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PERMISSION_MODULES } from "@/lib/permissions/catalog";


interface AddRoleDialogProps {
  onAddRole: (roleData: { name: string; description: string; permissions: string[] }) => Promise<{ success: boolean; error?: any }>;
}

// Permissions come from the single-source catalog (src/lib/permissions/catalog.ts)
const availablePermissions = Object.values(PERMISSION_MODULES).flatMap((mod) =>
  mod.permissions.map((p) => ({
    id: p.id,
    name: `${mod.label} · ${p.name}`,
    description: p.description,
  }))
);


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
        <Button size="sm" className="bg-info hover:bg-info">
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
              <p className="text-sm text-muted-foreground mb-4">Select which permissions users with this role should have</p>
              
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
                      <span key={perm} className="text-xs bg-info/10 text-info px-2 py-1 rounded">
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
