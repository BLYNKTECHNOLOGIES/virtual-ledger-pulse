import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, ShieldCheck, Clock, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { BiometricRegistrationDialog } from './BiometricRegistrationDialog';
import { isBiometricAvailable } from '@/hooks/useWebAuthn';
import { toast } from 'sonner';

/**
 * Standby mode — the default state of a Terminal account.
 *
 * An ERP user holding "Terminal Access (Standby)" can sign into the Terminal
 * but reaches nothing except biometric enrolment. Operational access is only
 * unlocked once a Terminal role is assigned in Terminal → Users & Roles.
 */
export function TerminalStandby() {
  const { userId, username, firstName, lastName } = useTerminalAuth();
  const [credentials, setCredentials] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegistration, setShowRegistration] = useState(false);

  const loadCredentials = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase.rpc('get_webauthn_credentials', { p_user_id: userId });
      setCredentials(Array.isArray(data) ? data : []);
    } catch {
      setCredentials([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleEnroll = () => {
    if (!isBiometricAvailable()) {
      toast.error('This device or browser does not support biometric enrolment');
      return;
    }
    setShowRegistration(true);
  };

  const display = firstName && lastName ? `${firstName} ${lastName}` : username || 'Operator';
  const enrolled = credentials.length > 0;

  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-warning/10 flex items-center justify-center">
            <Clock className="h-7 w-7 text-warning" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Terminal — Standby Mode</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, {display}. Your Terminal account is active but no Terminal role has been
            assigned yet, so trading, ads, orders and settings stay locked.
          </p>
          <Badge variant="outline" className="text-xs border-warning/40 text-warning">
            Awaiting role assignment
          </Badge>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              Step 1 — Register your biometrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              This is the only action available in standby mode. Enrol the device you will use for
              Terminal so that access works the moment a role is granted to you.
            </p>

            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking enrolment…
              </div>
            ) : enrolled ? (
              <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm text-success">
                  <ShieldCheck className="h-4 w-4" />
                  Biometrics registered ({credentials.length} device
                  {credentials.length !== 1 ? 's' : ''})
                </div>
                <ul className="space-y-1">
                  {credentials.map((c: any, i: number) => (
                    <li key={c.id || i} className="text-xs text-muted-foreground t-mono truncate">
                      {c.device_name || c.name || 'Registered device'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                No biometric credential registered on this account yet.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleEnroll}>
                <Fingerprint className="h-4 w-4" />
                {enrolled ? 'Add another device' : 'Register biometrics'}
              </Button>
              <Button size="sm" variant="outline" onClick={loadCredentials}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Step 2 — Role assignment (by a Terminal administrator)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              A Terminal administrator can see you under <span className="text-foreground">Users
              &amp; Roles → Standby</span> and assign your role there. Once assigned, reload this
              page and the Terminal workspace opens with exactly the rights that role carries.
            </p>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/dashboard')}>
            <LogOut className="h-4 w-4" />
            Back to ERP
          </Button>
        </div>
      </div>

      {userId && (
        <BiometricRegistrationDialog
          open={showRegistration}
          onOpenChange={setShowRegistration}
          userId={userId}
          onComplete={() => {
            setShowRegistration(false);
            loadCredentials();
            toast.success('Biometrics registered — waiting for role assignment');
          }}
        />
      )}
    </div>
  );
}
