import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserPlus, Shield, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface AddUserDialogProps {
  onAddUser: (userData: {
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    password: string;
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
    password: "",
    confirmPassword: ""
  });

  // Enhanced permission check with detailed logging
  const canCreateUsers = () => {
    console.log('=== Permission Check Debug ===');
    console.log('Auth loading:', authLoading);
    console.log('Current user:', user);
    console.log('User roles:', user?.roles);
    console.log('isAdmin value:', isAdmin);
    console.log('hasRole("user_management"):', hasRole('user_management'));
    console.log('hasRole("admin"):', hasRole('admin'));
    
    // Don't show permission denied while still loading
    if (authLoading) {
      return false;
    }
    
    const hasPermission = isAdmin || hasRole('user_management') || hasRole('admin');
    console.log('Final permission result:', hasPermission);
    console.log('=== End Permission Check ===');
    
    return hasPermission;
  };

  const userCanCreate = canCreateUsers();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Form submit - checking permissions...');
    
    if (!userCanCreate) {
      console.log('Permission denied for user creation');
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
      console.log('Attempting to create user...');
      const result = await onAddUser({
        username: formData.username.trim(),
        email: formData.email.trim(),
        first_name: formData.first_name.trim() || undefined,
        last_name: formData.last_name.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        password: formData.password
      });

      if (result.success) {
        // Reset form
        setFormData({
          username: "",
          email: "",
          first_name: "",
          last_name: "",
          phone: "",
          password: "",
          confirmPassword: ""
        });
        setOpen(false);
        console.log('User created successfully');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm">Loading permissions...</span>
      </div>
    );
  }

  if (!userCanCreate) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm">
          Insufficient permissions (Current roles: {user?.roles?.join(', ') || 'None'})
          {user ? ` - User ID: ${user.id}` : ' - Not logged in'}
        </span>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
          <UserPlus className="h-4 w-4 mr-2" />
          New User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Add New User
          </DialogTitle>
        </DialogHeader>
        
        {isAdmin && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              You're creating a user as an administrator. The new user will have basic access rights.
            </AlertDescription>
          </Alert>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                placeholder="Enter first name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                placeholder="Enter last name"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              placeholder="Enter username"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="Enter email"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="Enter phone number"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter password"
              required
              minLength={6}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password *</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              placeholder="Confirm password"
              required
            />
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
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
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
