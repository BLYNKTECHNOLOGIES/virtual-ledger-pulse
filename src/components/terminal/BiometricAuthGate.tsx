import { useState } from 'react';
import { Fingerprint, Loader2, ShieldAlert, Smartphone, Shield, KeyRound, QrCode, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const { userId, isTerminalAdmin, isSuperAdmin } = useTerminalAuth();
  const { isAuthenticated, isLoading, setSession } = useTerminalBiometricSession(userId);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [hasCheckedCredentials, setHasCheckedCredentials] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [showBypassInput, setShowBypassInput] = useState(false);
  const [bypassCode, setBypassCode] = useState('');
  const [isValidatingBypass, setIsValidatingBypass] = useState(false);
  const [showHiddenOptions, setShowHiddenOptions] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const tapTimerRef = useState<NodeJS.Timeout | null>(null);

  const handleSecretTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (tapTimerRef[0]) clearTimeout(tapTimerRef[0]);
    if (newCount >= 5) {
      setShowHiddenOptions(true);
      setTapCount(0);
    } else {
      tapTimerRef[0] = setTimeout(() => setTapCount(0), 1500);
    }
  };

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

      const hasCreds = hasCheckedCredentials ? hasCredentials : await checkCredentials(userId);

      if (!hasCreds) {
        setShowRegistration(true);
        return;
      }

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

  const handleAdminOverride = async () => {
    if (!userId) return;
    setIsAuthenticating(true);

    try {
      if (!isBiometricAvailable()) {
        toast.error('Your browser does not support biometric authentication');
        return;
      }

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

      const adminHasCreds = await checkCredentials(adminId);
      if (!adminHasCreds) {
        toast.error('Admin fingerprint not registered. Please register your fingerprint first via your own terminal session.');
        return;
      }

      const sessionToken = await authenticateBiometric(userId, adminId);
      setSession(sessionToken);
      toast.success('Admin override: Terminal unlocked');
    } catch (err: any) {
      console.error('Admin override error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Admin biometric verification was cancelled or timed out. Ensure your fingerprint is registered.');
      } else {
        toast.error(err.message || 'Admin override failed');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleBypassCodeSubmit = async () => {
    if (!userId || !bypassCode.trim()) return;
    setIsValidatingBypass(true);

    try {
      const { data, error } = await supabase.functions.invoke('terminal-webauthn', {
        body: { action: 'validate_bypass', user_id: userId, code: bypassCode.trim() },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Invalid code');

      setSession(data.session_token);
      toast.success('Bypass code accepted! Terminal unlocked.');
      setBypassCode('');
      setShowBypassInput(false);
    } catch (err: any) {
      console.error('Bypass code error:', err);
      toast.error(err.message || 'Invalid or expired bypass code');
    } finally {
      setIsValidatingBypass(false);
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
        <div className="relative cursor-pointer select-none" onClick={handleSecretTap}>
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
          onClick={() => handleAuthenticate()}
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
              Verify Identity
            </>
          )}
        </Button>

        {showHiddenOptions && isSuperAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdminOverride}
            disabled={isAuthenticating}
            className="gap-2 text-xs"
          >
            <Shield className="h-3.5 w-3.5" />
            Super Admin Override (Use Your Fingerprint)
          </Button>
        )}

        {showHiddenOptions && (
          showBypassInput ? (
            <div className="w-full max-w-xs space-y-3 p-4 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 justify-center text-sm font-medium">
                <KeyRound className="h-4 w-4 text-primary" />
                Enter Bypass Code
              </div>
              <p className="text-[10px] text-muted-foreground">
                Enter the 6-digit code generated by your Super Admin from the Users &amp; Roles page.
              </p>
              <Input
                placeholder="000000"
                value={bypassCode}
                onChange={(e) => setBypassCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl font-mono tracking-[0.5em] h-12"
                maxLength={6}
                inputMode="numeric"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => { setShowBypassInput(false); setBypassCode(''); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-xs gap-1"
                  onClick={handleBypassCodeSubmit}
                  disabled={bypassCode.length !== 6 || isValidatingBypass}
                >
                  {isValidatingBypass ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <KeyRound className="h-3 w-3" />
                      Verify Code
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBypassInput(true)}
              className="gap-2 text-xs text-muted-foreground"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Have a bypass code?
            </Button>
          )
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
