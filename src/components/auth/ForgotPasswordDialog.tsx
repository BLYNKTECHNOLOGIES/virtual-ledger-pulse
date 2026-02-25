import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mail, CheckCircle, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ForgotPasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'form' | 'success';

export function ForgotPasswordDialog({ open, onClose }: ForgotPasswordDialogProps) {
  const [step, setStep] = useState<Step>('form');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Look up user by email or username
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq.${emailOrUsername.trim()},username.eq.${emailOrUsername.trim()}`)
        .single();

      if (userError || !userData) {
        toast.error('No account found with that email or username.');
        setIsLoading(false);
        return;
      }

      // Insert password reset request
      const { error } = await supabase.from('password_reset_requests').insert({
        user_id: userData.id,
        reason: reason || 'Requested from login page',
        status: 'pending',
      });

      if (error) throw error;

      setStep('success');
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('form');
    setEmailOrUsername('');
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Request New Password
          </DialogTitle>
          <DialogDescription>
            {step === 'form' && 'Submit a request to the Super Admin to reset your password.'}
            {step === 'success' && 'Your request has been submitted successfully.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <form onSubmit={handleSubmitRequest} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email or Username</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reset-email"
                  type="text"
                  placeholder="Enter your email or username"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-reason">Reason (optional)</Label>
              <Input
                id="reset-reason"
                type="text"
                placeholder="e.g. Forgot my password"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </form>
        )}

        {step === 'success' && (
          <div className="space-y-4 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Request Submitted!</h3>
                <p className="text-sm text-muted-foreground">
                  Your password reset request has been sent to the Super Admin. 
                  They will reset your password shortly.
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
