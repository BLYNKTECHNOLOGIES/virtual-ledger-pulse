import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Loader2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { FormSection, StickyFooter } from "./umUi";

interface AddUserDialogProps {
  onAddUser: (userData: {
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    password: string;
    badge_id?: string;
  }) => Promise<{ success: boolean }>;
}

export function AddUserDialog({ onAddUser }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user, isAdmin, hasRole, isLoading: authLoading } = useAuth();

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    badge_id: "",
    password: "",
    confirmPassword: "",
    department_id: "",
    position_id: ""
  });

  // Fetch departments and positions
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('hierarchy_level', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions', formData.department_id],
    queryFn: async () => {
      if (!formData.department_id) return [];
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('department_id', formData.department_id)
        .eq('is_active', true)
        .order('hierarchy_level', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!formData.department_id,
  });

  // Enhanced permission check with detailed logging
  const canCreateUsers = () => {

    // Don't show permission denied while still loading
    if (authLoading) {
      return false;
    }

    const hasPermission = isAdmin || hasRole('user_management') || hasRole('admin');

    return hasPermission;
  };

  const userCanCreate = canCreateUsers();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();


    if (!userCanCreate) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to create users. Please contact an administrator.",
        variant: "destructive",
      });
      return;
    }

    // Validation
    if (!formData.username.trim()) {
      toast({
        title: "Validation Error",
        description: "Username is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email.trim()) {
      toast({
        title: "Validation Error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.password) {
      toast({
        title: "Validation Error",
        description: "Password is required",
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Validation Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await onAddUser({
        username: formData.username.trim(),
        email: formData.email.trim(),
        first_name: formData.first_name.trim() || undefined,
        last_name: formData.last_name.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        password: formData.password,
        badge_id: formData.badge_id.trim() || undefined
      });

      if (result.success) {
        // Log the action
        logActionWithCurrentUser({
          actionType: ActionTypes.USER_CREATED,
          entityType: EntityTypes.USER,
          entityId: formData.username, // Will be replaced with actual user ID
          module: Modules.USER_MANAGEMENT,
          metadata: { username: formData.username, email: formData.email }
        });

        // Reset form
        setFormData({
          username: "",
          email: "",
          first_name: "",
          last_name: "",
          phone: "",
          badge_id: "",
          password: "",
          confirmPassword: "",
          department_id: "",
          position_id: ""
        });
        setOpen(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <Button size="sm" className="h-8 gap-1.5" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        New user
      </Button>
    );
  }

  if (!userCanCreate) {
    const why = "Your role can't add users here yet. Ask an Admin to create the account.";
    return (
      <span title={why} className="inline-flex">
        <Button size="sm" className="h-8 gap-1.5" disabled aria-describedby="add-user-locked">
          <UserPlus className="h-3.5 w-3.5" />
          New user
        </Button>
        <span id="add-user-locked" className="sr-only">{why}</span>
      </span>
    );
  }

  const passwordsDiffer = !!formData.confirmPassword && formData.password !== formData.confirmPassword;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5">
          <UserPlus className="h-3.5 w-3.5" />
          New user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto pb-0 md:pb-0 md:max-w-xl">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>Create an ERP login. Fields marked * are required.</DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-md border border-info/25 bg-info/10 px-3 py-2 text-xs text-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
          New users start without a role. After creating the account, open Edit to give them a role (and Terminal access if they need it).
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormSection title="Person">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                  placeholder="Last name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="badge_id">Badge ID</Label>
                <Input
                  id="badge_id"
                  value={formData.badge_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, badge_id: e.target.value }))}
                  placeholder="HRMS badge, e.g. EMP001"
                  className="font-mono placeholder:font-sans"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">Department</Label>
                <Select
                  value={formData.department_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, department_id: value, position_id: "" }))}
                >
                  <SelectTrigger id="department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.icon} {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="position">Position</Label>
                <Select
                  value={formData.position_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, position_id: value }))}
                  disabled={!formData.department_id}
                >
                  <SelectTrigger id="position">
                    <SelectValue placeholder={formData.department_id ? "Select position" : "Pick a department first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((pos) => (
                      <SelectItem key={pos.id} value={pos.id}>
                        {pos.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection title="Sign-in">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username <span className="text-destructive">*</span></Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="e.g. aarav.sharma"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="name@company.com"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password <span className="text-destructive">*</span></Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Type it again"
                  autoComplete="new-password"
                  aria-invalid={passwordsDiffer || undefined}
                  required
                />
                {passwordsDiffer && <p className="text-xs text-destructive">Passwords don't match yet.</p>}
              </div>
            </div>
          </FormSection>

          <StickyFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Creating..." : "Create user"}
            </Button>
          </StickyFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
