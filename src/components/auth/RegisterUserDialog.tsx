import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserPlus, CheckCircle2 } from "lucide-react";

interface RegisterUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  phone: "",
  badgeId: "",
  password: "",
  confirmPassword: "",
};

export function RegisterUserDialog({ open, onOpenChange }: RegisterUserDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({ ...EMPTY });
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (field: keyof typeof EMPTY, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const reset = () => {
    setFormData({ ...EMPTY });
    setSubmitted(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName.trim()) {
      toast({ title: "Validation Error", description: "First name is required", variant: "destructive" });
      return;
    }
    if (!formData.username.trim()) {
      toast({ title: "Validation Error", description: "Username is required", variant: "destructive" });
      return;
    }
    if (!formData.email.trim()) {
      toast({ title: "Validation Error", description: "Email is required", variant: "destructive" });
      return;
    }
    if (!formData.password) {
      toast({ title: "Validation Error", description: "Password is required", variant: "destructive" });
      return;
    }
    if (formData.password.length < 6) {
      toast({ title: "Validation Error", description: "Password must be at least 6 characters long", variant: "destructive" });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Validation Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-erp-user", {
        body: {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          username: formData.username.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
          badgeId: formData.badgeId.trim() || null,
          password: formData.password,
        },
      });

      // Supabase wraps non-2xx in error, but the body still carries our message
      const payloadError = (data as { error?: unknown })?.error;
      if (error || payloadError) {
        let message = "Registration failed. Please try again.";
        if (typeof payloadError === "string") message = payloadError;
        else if (error?.message) message = error.message;
        // Try to surface the function's JSON error body
        try {
          const ctx = (error as { context?: Response })?.context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            if (typeof body?.error === "string") message = body.error;
          }
        } catch {
          /* ignore */
        }
        toast({ title: "Registration Failed", description: message, variant: "destructive" });
        return;
      }

      setSubmitted(true);
    } catch (err) {
      toast({
        title: "Registration Failed",
        description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Register New User
          </DialogTitle>
          <DialogDescription>
            Fill in your details. Your request will be sent to the Super Admin for approval.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <h3 className="text-lg font-semibold text-foreground">Registration Submitted</h3>
            <p className="text-sm text-muted-foreground">
              Your registration is pending Super Admin approval. You'll be able to log in once approved.
            </p>
            <Button className="mt-2" onClick={() => handleClose(false)}>
              Back to Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg_first_name">First Name *</Label>
                <Input
                  id="reg_first_name"
                  className="text-foreground"
                  value={formData.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg_last_name">Last Name</Label>
                <Input
                  id="reg_last_name"
                  className="text-foreground"
                  value={formData.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg_username">Username *</Label>
              <Input
                id="reg_username"
                className="text-foreground"
                value={formData.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="Choose a username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg_email">Email *</Label>
              <Input
                id="reg_email"
                type="email"
                className="text-foreground"
                value={formData.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg_phone">Phone</Label>
              <Input
                id="reg_phone"
                className="text-foreground"
                value={formData.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="Phone number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg_badge">Badge ID</Label>
              <Input
                id="reg_badge"
                className="text-foreground"
                value={formData.badgeId}
                onChange={(e) => update("badgeId", e.target.value)}
                placeholder="Badge ID"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg_password">Password *</Label>
                <Input
                  id="reg_password"
                  type="password"
                  className="text-foreground"
                  value={formData.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Password"
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg_confirm">Confirm Password *</Label>
                <Input
                  id="reg_confirm"
                  type="password"
                  className="text-foreground"
                  value={formData.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Confirm password"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                {isLoading ? "Submitting..." : "Submit Registration"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
