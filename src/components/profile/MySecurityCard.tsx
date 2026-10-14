import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Shield, LogOut, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { SectionBlock } from './primitives';

interface Props {
  userId: string;
  badgeId?: string | null;
}

export default function MySecurityCard({ userId, badgeId }: Props) {
  const [busy, setBusy] = useState(false);
  const signOutEverywhere = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success('Signed out of all devices');
  };

  return (
    <SectionBlock title="Security" icon={Shield} description="Your biometric ID and active sessions">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">Biometric badge ID</span>
          </div>
          <span className="rounded bg-card px-2 py-0.5 font-mono text-sm font-semibold text-foreground ring-1 ring-border">{badgeId || '—'}</span>
        </div>
        <p className="text-xs text-muted-foreground">Used at biometric devices for attendance. Contact HR if this changes.</p>
        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Lost a phone or used a shared computer? End every session, including this one.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy}>
                <LogOut className="h-4 w-4 mr-1" /> Sign out of all devices
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out of all devices?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every active session ends, on this device too. You will need to sign in again everywhere.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Stay signed in</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={signOutEverywhere}>
                  Sign out everywhere
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </SectionBlock>
  );
}
