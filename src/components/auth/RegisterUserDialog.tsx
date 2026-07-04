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

const fieldClass =
  "h-11 border-white/10 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-[hsl(231_81%_60%)] focus-visible:ring-[hsl(231_81%_60%)]/30";

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
      <DialogContent className="sm:max-w-[500px] max-h-[92vh] overflow-y-auto gap-0 border-white/10 bg-[hsl(231_45%_9%)]/95 p-0 text-white backdrop-blur-2xl">
        {/* Gradient header band */}
        <div className="relative overflow-hidden rounded-t-lg border-b border-white/10 bg-gradient-to-br from-[hsl(231_60%_16%)] to-[hsl(265_55%_16%)] px-6 py-6">
          <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-[hsl(231_81%_60%)]/30 blur-3xl" />
          <DialogHeader className="relative space-y-3 text-left">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(231_81%_60%)] to-[hsl(265_80%_60%)] shadow-lg">
              <UserPlus className="h-6 w-6 text-white" />
            </div>
            <DialogTitle className="text-xl font-bold text-white">Create your account</DialogTitle>
            <DialogDescription className="text-sm text-white/60">
              Fill in your details — your request will be sent to the Super Admin for approval.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
              <CheckCircle2 className="h-9 w-9 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Registration submitted</h3>
            <p className="max-w-sm text-sm text-white/60">
              Your registration is pending Super Admin approval. You'll be able to log in once approved.
            </p>
            <Button
              className="mt-2 bg-gradient-to-r from-[hsl(231_81%_58%)] to-[hsl(265_80%_60%)] text-white hover:opacity-90"
              onClick={() => handleClose(false)}
            >
              Back to Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg_first_name" className="text-white/80">First Name *</Label>
                <Input
                  id="reg_first_name"
                  className={fieldClass}
                  value={formData.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg_last_name" className="text-white/80">Last Name</Label>
                <Input
                  id="reg_last_name"
                  className={fieldClass}
                  value={formData.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg_username" className="text-white/80">Username *</Label>
              <Input
                id="reg_username"
                className={fieldClass}
                value={formData.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="Choose a username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg_email" className="text-white/80">Email *</Label>
              <Input
                id="reg_email"
                type="email"
                className={fieldClass}
                value={formData.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@company.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg_phone" className="text-white/80">Phone</Label>
                <Input
                  id="reg_phone"
                  className={fieldClass}
                  value={formData.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg_badge" className="text-white/80">Badge ID</Label>
                <Input
                  id="reg_badge"
                  className={fieldClass}
                  value={formData.badgeId}
                  onChange={(e) => update("badgeId", e.target.value)}
                  placeholder="Badge ID"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg_password" className="text-white/80">Password *</Label>
                <Input
                  id="reg_password"
                  type="password"
                  className={fieldClass}
                  value={formData.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Password"
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg_confirm" className="text-white/80">Confirm Password *</Label>
                <Input
                  id="reg_confirm"
                  type="password"
                  className={fieldClass}
                  value={formData.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Confirm password"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={isLoading}
                className="border-white/15 bg-transparent text-white/80 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-gradient-to-r from-[hsl(231_81%_58%)] to-[hsl(265_80%_60%)] font-semibold text-white shadow-lg shadow-[hsl(231_81%_50%)]/30 hover:opacity-90"
              >
                {isLoading ? "Submitting..." : "Submit Registration"}
              </Button>
            </div>
          </form>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
