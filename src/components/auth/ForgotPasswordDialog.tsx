import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Lock, Mail, KeyRound, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
}

type Step = 'email' | 'verify' | 'done';

export function ForgotPasswordDialog({ open, onOpenChange, defaultEmail = '' }: ForgotPasswordDialogProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(defaultEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('email');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError('');
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  };

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setIsLoading(true);
    try {
      const { error: fnError } = await supabase.functions.invoke('send-erp-password-otp', {
        body: { email: normalized },
      });
      if (fnError) throw fnError;
      toast.success('If an account exists, a verification code has been sent.');
      setStep('verify');
    } catch (err: any) {
      setError(err?.message || 'Failed to send code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-erp-password-otp', {
        body: { email: email.trim().toLowerCase(), otp, newPassword },
      });
      // Edge function returns non-2xx with an { error } body on failure
      if (fnError) {
        const ctx = (fnError as any)?.context;
        let msg = fnError.message;
        try {
          const body = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
          if (body?.error) msg = typeof body.error === 'string' ? body.error : msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setStep('done');
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fieldClass =
    "h-11 border-white/10 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-[hsl(231_81%_60%)] focus-visible:ring-[hsl(231_81%_60%)]/40";
  const primaryBtn =
    "h-11 w-full bg-gradient-to-r from-[hsl(231_81%_58%)] to-[hsl(265_80%_60%)] font-medium text-white shadow-lg shadow-[hsl(231_81%_50%)]/25 transition-transform hover:opacity-95 active:scale-[0.98]";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="ops-rise sm:max-w-md border-white/10 bg-[hsl(231_45%_7%)] text-white backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound className="h-4 w-4 text-[hsl(231_81%_75%)]" />
            Reset Password
          </DialogTitle>
          <DialogDescription className="text-xs text-white/55">
            {step === 'email' && 'Enter your registered ERP email to receive a verification code.'}
            {step === 'verify' && `Enter the 6-digit code sent to ${email} and set a new password.`}
            {step === 'done' && 'Your password has been reset.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={sendOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fp-email" className="text-xs font-medium text-white/70">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-white/50" />
                <Input
                  id="fp-email"
                  type="email"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${fieldClass} pl-10`}
                  required
                />
              </div>
            </div>
            <Button type="submit" className={primaryBtn} disabled={isLoading}>
              {isLoading ? 'Sending…' : 'Send Verification Code'}
            </Button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fp-otp" className="text-xs font-medium text-white/70">Verification Code</Label>
              <Input
                id="fp-otp"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`${fieldClass} text-center text-lg tracking-[0.5em]`}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fp-new" className="text-xs font-medium text-white/70">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-white/50" />
                <Input
                  id="fp-new"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${fieldClass} pl-10 pr-10`}
                  required
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-0 h-full px-3 text-white/60 hover:bg-transparent hover:text-white"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fp-confirm" className="text-xs font-medium text-white/70">Confirm New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-white/50" />
                <Input
                  id="fp-confirm"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${fieldClass} pl-10`}
                  required
                  minLength={8}
                />
              </div>
            </div>

            <Button type="submit" className={primaryBtn} disabled={isLoading}>
              {isLoading ? 'Resetting…' : 'Reset Password'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-white/70 hover:bg-white/5 hover:text-white"
              disabled={isLoading}
              onClick={() => sendOtp()}
            >
              Resend Code
            </Button>
          </form>
        )}

        {step === 'done' && (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-400" />
            <p className="text-sm text-white/60">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <Button className={primaryBtn} onClick={() => handleClose(false)}>
              Back to Login
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
