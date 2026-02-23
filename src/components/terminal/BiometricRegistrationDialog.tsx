import { useState, useEffect } from 'react';
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
import { Fingerprint, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  isBiometricAvailable,
  checkPlatformAuthenticator,
  registerBiometric,
} from '@/hooks/useWebAuthn';
import { toast } from 'sonner';

interface BiometricRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onComplete: () => void;
}

export function BiometricRegistrationDialog({
  open,
  onOpenChange,
  userId,
  onComplete,
}: BiometricRegistrationDialogProps) {
  const [step, setStep] = useState<'info' | 'register' | 'done'>('info');
  const [deviceName, setDeviceName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [hasPlatformAuth, setHasPlatformAuth] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) {
      setStep('info');
      setDeviceName('');
      checkPlatformAuthenticator().then(setHasPlatformAuth);
    }
  }, [open]);

  const handleRegister = async () => {
    setIsRegistering(true);
    try {
      // Get username from session
      const session = localStorage.getItem('userSession');
      const username = session ? JSON.parse(session).username || 'User' : 'User';

      await registerBiometric(userId, username, deviceName || undefined);
      setStep('done');
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Registration was cancelled or your device does not support biometric auth');
      } else {
        toast.error(err.message || 'Failed to register biometric credential');
      }
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'info' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-primary" />
                Set Up Biometric Access
              </DialogTitle>
              <DialogDescription>
                Register your fingerprint or biometric credential to access the P2P Trading Terminal.
                This is a one-time setup per device.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {hasPlatformAuth === false && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    No platform authenticator detected. You may need a USB security key.
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="device-name">Device Name (optional)</Label>
                <Input
                  id="device-name"
                  placeholder="e.g. MacBook Pro, Office PC"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Helps you identify this device later if you have multiple.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleRegister} disabled={isRegistering} className="gap-2">
                {isRegistering ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    Register Fingerprint
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h3 className="text-lg font-semibold">Registration Complete!</h3>
            <p className="text-sm text-muted-foreground text-center">
              Your fingerprint has been registered. You can now use it to access the terminal.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
