import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, LogOut, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  userId: string;
  badgeId?: string | null;
}

export default function MySecurityCard({ userId, badgeId }: Props) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const changePassword = async () => {
    if (pwd.length < 8) return toast.error('Password must be at least 8 characters');
    if (pwd !== confirm) return toast.error('Passwords do not match');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Password updated');
      setPwd(''); setConfirm('');
    }
  };

  const signOutEverywhere = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) toast.error(error.message);
    else toast.success('Signed out of all devices');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Security</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs">Change Password</Label>
          <Input type="password" placeholder="New password" value={pwd} onChange={e => setPwd(e.target.value)} className="text-foreground" />
          <Input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} className="text-foreground" />
          <Button size="sm" onClick={changePassword} disabled={busy || !pwd}>Update Password</Button>
        </div>
        <div className="border-t pt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Fingerprint className="h-4 w-4" /> Biometric Badge ID:
            <Badge variant="outline" className="font-mono">{badgeId || '—'}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">Used at biometric devices for attendance. Contact HR if this changes.</p>
        </div>
        <div className="border-t pt-4">
          <Button variant="destructive" size="sm" onClick={signOutEverywhere}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out of all devices
          </Button>
          <p className="text-[11px] text-muted-foreground mt-2">Ends every active session across devices.</p>
        </div>
      </CardContent>
    </Card>
  );
}
