import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, LogOut, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  userId: string;
  badgeId?: string | null;
}

export default function MySecurityCard({ userId, badgeId }: Props) {
  const signOutEverywhere = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) toast.error(error.message);
    else toast.success('Signed out of all devices');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" /> Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2 text-sm">
          <Fingerprint className="h-4 w-4 text-muted-foreground" /> Biometric Badge ID:
          <Badge variant="outline" className="font-mono">{badgeId || '—'}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Used at biometric devices for attendance. Contact HR if this changes.</p>
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
