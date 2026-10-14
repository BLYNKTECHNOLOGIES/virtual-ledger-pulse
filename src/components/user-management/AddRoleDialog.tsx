
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PermissionMatrix } from "./PermissionMatrix";
import { FormSection, StickyFooter } from "./umUi";


interface AddRoleDialogProps {
  onAddRole: (roleData: { name: string; description: string; permissions: string[] }) => Promise<{ success: boolean; error?: any }>;
}

// Permissions come from the single-source catalog (src/lib/permissions/catalog.ts), via PermissionMatrix.


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

  const onTemplateApplied = (templateName: string) => {
    toast({ title: "Template Applied", description: `Applied "${templateName}" template` });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New role
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto pb-0 md:pb-0 md:max-w-4xl">
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>Name the role, then tick what people with it may do. You can start from a template.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormSection title="Role details">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Role name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Payments Associate"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What is this role for?"
                  rows={2}
                />
              </div>
            </div>
          </FormSection>

          <PermissionMatrix
            value={formData.permissions}
            onChange={(update) => setFormData((prev) => ({ ...prev, permissions: update(prev.permissions) }))}
            templates
            onTemplateApplied={onTemplateApplied}
          />

          <StickyFooter>
            <span className="w-full text-xs text-muted-foreground sm:mr-auto sm:w-auto">
              {formData.permissions.length === 0
                ? "No permissions selected"
                : `${formData.permissions.length} permission${formData.permissions.length === 1 ? "" : "s"} selected`}
            </span>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create role"}
            </Button>
          </StickyFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
