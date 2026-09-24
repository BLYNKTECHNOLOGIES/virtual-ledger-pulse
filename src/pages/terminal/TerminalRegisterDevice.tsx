import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Eye, Fingerprint, Loader2, AlertTriangle } from 'lucide-react';
import { BiometricRegistrationDialog } from '@/components/terminal/BiometricRegistrationDialog';

export default function TerminalRegisterDevice() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const invite = useQuery({
    queryKey: ['terminal-invite', token],
    enabled: !!token,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('describe_terminal_biometric_invite', { p_token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { userId: u.user?.id ?? null, invite: row ?? null };
    },
  });

  const inv = invite.data?.invite;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-primary" /> Register this device</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {invite.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {!token || (!invite.isLoading && !inv) ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              This link is invalid, expired, already used, or meant for a different account. Make sure you are signed in as the person it was sent to, or ask your admin for a new link.
            </div>
          ) : inv ? (
            <>
              <div className="flex items-center gap-2 text-sm text-foreground">
                {inv.trust_level === 'office'
                  ? <><Building2 className="h-4 w-4" /> Office device — full access</>
                  : <><Eye className="h-4 w-4" /> Personal device — view only</>}
              </div>
              {inv.note && <p className="text-sm text-muted-foreground">Note: {inv.note}</p>}
              <p className="text-xs text-muted-foreground">
                Valid until {new Date(inv.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. Registers this one device only.
              </p>
              <Button className="w-full gap-2" onClick={() => setOpen(true)}>
                <Fingerprint className="h-4 w-4" /> Register fingerprint
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
      {invite.data?.userId && (
        <BiometricRegistrationDialog
          open={open}
          onOpenChange={setOpen}
          userId={invite.data.userId}
          inviteToken={token}
          onComplete={() => navigate('/terminal')}
        />
      )}
    </div>
  );
}
