import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Eye, EyeOff, Mail, Phone, User, UserPlus } from "lucide-react";

interface RegistrationDialogV2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FormState = {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

const initialForm: FormState = {
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

export function RegistrationDialogV2({ open, onOpenChange }: RegistrationDialogV2Props) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const emailTrimmed = useMemo(() => form.email.trim().toLowerCase(), [form.email]);
  const phoneTrimmed = useMemo(() => form.phone.trim(), [form.phone]);

  const update = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm((p) => ({ ...p, [key]: value }));
  };

  const reset = () => setForm(initialForm);

  const validate = () => {
    if (!form.first_name.trim()) return "First name is required";
    if (!form.last_name.trim()) return "Last name is required";
    if (!form.username.trim()) return "Username is required";
    if (!emailTrimmed) return "Email is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) return "Please enter a valid email address";

    if (!form.password) return "Password is required";
    if (form.password.length < 6) return "Password must be at least 6 characters long";
    if (form.password !== form.confirmPassword) return "Passwords do not match";

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("register_user_request", {
        p_first_name: form.first_name.trim(),
        p_last_name: form.last_name.trim(),
        p_username: form.username.trim(),
        p_email: emailTrimmed,
        // IMPORTANT: always pass a string (RPC args expect string)
        p_phone: phoneTrimmed,
        p_password: form.password,
      });

      if (error) throw error;

      // If it reached here, the request was created.
      setSubmitted(true);
      reset();

      // Keep this toast too (in case modal is closed quickly)
      toast({
        title: "Registration submitted",
        description: "Your request is pending admin approval.",
      });

      // data is the pending_registration id (uuid)
      void data;
    } catch (err: any) {
      console.error("register_user_request failed", err);
      toast({
        title: "Registration Failed",
        description: err?.message || "Failed to submit registration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const closeAll = () => {
    setSubmitted(false);
    onOpenChange(false);
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={closeAll}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-4 rounded-full bg-primary/10 p-3">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
            <DialogTitle className="mb-2 text-xl">Registration submitted</DialogTitle>
            <DialogDescription className="mb-6">
              Your request has been sent to an administrator. You will be able to log in only after approval and role assignment.
            </DialogDescription>
            <Button onClick={closeAll} className="w-full max-w-xs">
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Create Account
          </DialogTitle>
          <DialogDescription>
            Submit your registration request. An administrator will review and approve your account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reg_first_name">First Name *</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reg_first_name"
                  value={form.first_name}
                  onChange={update("first_name")}
                  placeholder="First name"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg_last_name">Last Name *</Label>
              <Input
                id="reg_last_name"
                value={form.last_name}
                onChange={update("last_name")}
                placeholder="Last name"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg_username">Username *</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="reg_username"
                value={form.username}
                onChange={update("username")}
                placeholder="Choose a username"
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg_email">Email *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="reg_email"
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="Enter your email"
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg_phone">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="reg_phone"
                type="tel"
                value={form.phone}
                onChange={update("phone")}
                placeholder="Enter phone number"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg_password">Password *</Label>
            <div className="relative">
              <Input
                id="reg_password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={update("password")}
                placeholder="Create a password"
                className="pr-10"
                required
                minLength={6}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg_confirm_password">Confirm Password *</Label>
            <div className="relative">
              <Input
                id="reg_confirm_password"
                type={showConfirmPassword ? "text" : "password"}
                value={form.confirmPassword}
                onChange={update("confirmPassword")}
                placeholder="Confirm your password"
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword((v) => !v)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Submitting..." : "Register Now"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
