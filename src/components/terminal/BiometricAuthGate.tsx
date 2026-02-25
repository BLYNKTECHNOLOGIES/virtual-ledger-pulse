import { useState } from 'react';
import { Fingerprint, Loader2, ShieldAlert, Smartphone, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useTerminalBiometricSession } from '@/hooks/useTerminalBiometricSession';
import {
  isBiometricAvailable,
  registerBiometric,
  authenticateBiometric,
} from '@/hooks/useWebAuthn';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BiometricRegistrationDialog } from './BiometricRegistrationDialog';

interface BiometricAuthGateProps {
  children: React.ReactNode;
}

export function BiometricAuthGate({ children }: BiometricAuthGateProps) {
  const { userId, isTerminalAdmin } = useTerminalAuth();
  const { isAuthenticated, isLoading, setSession } = useTerminalBiometricSession(userId);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [hasCheckedCredentials, setHasCheckedCredentials] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);

  // Check if user has registered credentials
  const checkCredentials = async (targetUserId: string) => {
    try {
      const { data } = await supabase.rpc('get_webauthn_credentials', { p_user_id: targetUserId });
      const hasCreds = Array.isArray(data) && data.length > 0;
      if (targetUserId === userId) {
        setHasCredentials(hasCreds);
        setHasCheckedCredentials(true);
      }
      return hasCreds;
    } catch {
      if (targetUserId === userId) setHasCheckedCredentials(true);
      return false;
    }
  };

  const handleAuthenticate = async () => {
    if (!userId) return;
    setIsAuthenticating(true);

    try {
      if (!isBiometricAvailable()) {
        toast.error('Your browser does not support biometric authentication');
        return;
      }

      // Check if user has credentials
      const hasCreds = hasCheckedCredentials ? hasCredentials : await checkCredentials(userId);

      if (!hasCreds) {
        setShowRegistration(true);
        return;
      }

      // Authenticate with own fingerprint
      const sessionToken = await authenticateBiometric(userId);
      setSession(sessionToken);
      toast.success('Biometric verification successful');
    } catch (err: any) {
      console.error('Biometric auth error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Biometric verification was cancelled or timed out');
      } else {
        toast.error(err.message || 'Biometric verification failed');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Admin override: admin uses their own fingerprint to unlock this user's terminal
  const handleAdminOverride = async () => {
    if (!userId) return;
    setIsAuthenticating(true);

    try {
      if (!isBiometricAvailable()) {
        toast.error('Your browser does not support biometric authentication');
        return;
      }

      // Get logged-in ERP user's ID (the admin)
      const session = localStorage.getItem('userSession');
      if (!session) {
        toast.error('No ERP session found');
        return;
      }
      const erpUser = JSON.parse(session);
      const adminId = erpUser.id;

      if (!adminId) {
        toast.error('Admin user ID not found');
        return;
      }

      // Admin authenticates with their own fingerprint, but session is created for target user
      const sessionToken = await authenticateBiometric(userId, adminId);
      setSession(sessionToken);
      toast.success('Admin override: Terminal unlocked');
    } catch (err: any) {
      console.error('Admin override error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Biometric verification was cancelled or timed out');
      } else {
        toast.error(err.message || 'Admin override failed');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleRegistrationComplete = () => {
    setShowRegistration(false);
    setHasCredentials(true);
    setHasCheckedCredentials(true);
    toast.success('Fingerprint registered! Now verify to access the terminal.');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-6 px-4 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse scale-150" />
          <div className="relative bg-card border border-border rounded-full p-6 shadow-lg">
            <Fingerprint className="h-16 w-16 text-primary" />
          </div>
        </div>

        <div className="space-y-2 max-w-sm">
          <h1 className="text-xl font-semibold text-foreground">Biometric Verification Required</h1>
          <p className="text-sm text-muted-foreground">
            The P2P Trading Terminal requires fingerprint verification for security. Only your registered fingerprint can unlock your terminal.
          </p>
        </div>

        <Button
          size="lg"
          onClick={handleAuthenticate}
          disabled={isAuthenticating}
          className="gap-2 min-w-[200px]"
        >
          {isAuthenticating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <Fingerprint className="h-4 w-4" />
              Verify Fingerprint
            </>
          )}
        </Button>

        {isTerminalAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdminOverride}
            disabled={isAuthenticating}
            className="gap-2 text-xs"
          >
            <Shield className="h-3.5 w-3.5" />
            Admin Override (Use Admin Fingerprint)
          </Button>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground/60 mt-4">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Session locks after 15 minutes of inactivity</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
          <Smartphone className="h-3.5 w-3.5" />
          <span>Supports fingerprint, Face ID, and Windows Hello</span>
        </div>
      </div>

      <BiometricRegistrationDialog
        open={showRegistration}
        onOpenChange={setShowRegistration}
        userId={userId!}
        onComplete={handleRegistrationComplete}
      />
    </>
  );
}
