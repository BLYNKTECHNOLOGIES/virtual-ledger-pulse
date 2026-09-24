import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Laptop, Building2, Eye, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

interface DeviceRow {
  id: string;
  user_id: string;
  user_name: string | null;
  device_name: string | null;
  trust_level: string;
  enrolled_ip: string | null;
  enrolled_via: string | null;
  created_at: string;
  last_used_at: string | null;
  active_session_mode: string | null;
}

export function TerminalDevicesList() {
  const { isSuperAdmin } = useTerminalAuth();
  const qc = useQueryClient();
  const [pendingRevoke, setPendingRevoke] = useState<DeviceRow | null>(null);

  const devices = useQuery({
    queryKey: ['terminal-devices'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_terminal_devices');
      if (error) throw error;
      return (data || []) as DeviceRow[];
    },
  });


  const setTrust = useMutation({
    mutationFn: async ({ id, trust }: { id: string; trust: string }) => {
      const { error } = await supabase.rpc('set_terminal_device_trust', {
        p_credential_id: id,
        p_trust_level: trust,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Device updated');
      qc.invalidateQueries({ queryKey: ['terminal-devices'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('revoke_terminal_device', { p_credential_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Device revoked');
      setPendingRevoke(null);
      qc.invalidateQueries({ queryKey: ['terminal-devices'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const invites = useQuery({
    queryKey: ['terminal-biometric-invites'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_terminal_biometric_invites');
      if (error) throw error;
      return (data || []).filter(
        (i) => !i.consumed_at && !i.revoked_at && new Date(i.expires_at) > new Date(),
      );
    },
  });

  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('terminal-biometric-invite', {
        body: { action: 'revoke', invite_id: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Registration link cancelled');
      qc.invalidateQueries({ queryKey: ['terminal-biometric-invites'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Pending registration links</CardTitle>
        </CardHeader>
        <CardContent>
          {(invites.data || []).length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No pending links. Send one from the Users tab (Invite).
            </p>
          ) : (
            <div className="space-y-2">
              {(invites.data || []).map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-md border border-border p-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-medium text-foreground">{i.user_name || '—'}</div>
                    <div className="text-muted-foreground">
                      {i.trust_level === 'office' ? 'Office (full)' : 'Personal (view only)'} · {i.sent_to_email || 'not emailed'} · expires{' '}
                      {new Date(i.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                    disabled={cancelInvite.isPending} onClick={() => cancelInvite.mutate(i.id)}>
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Laptop className="h-4 w-4 text-primary" />
            Registered devices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {devices.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (devices.data || []).length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No registered devices.</p>
          ) : (
            <div className="space-y-2">
              {(devices.data || []).map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {d.user_name || d.user_id}
                      </span>
                      {d.trust_level === 'office' ? (
                        <Badge variant="outline" className="gap-1 border-primary/40 text-[10px] text-primary">
                          <Building2 className="h-3 w-3" /> Office
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-warning/40 text-[10px] text-warning">
                          <Eye className="h-3 w-3" /> Personal · view only
                        </Badge>
                      )}
                      {d.active_session_mode && (
                        <Badge variant="secondary" className="text-[10px]">
                          live: {d.active_session_mode === 'view_only' ? 'view only' : 'full'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {d.device_name || 'Unnamed device'}
                      {d.enrolled_ip ? ` · enrolled from ${d.enrolled_ip}` : ''}
                      {d.last_used_at ? ` · last used ${new Date(d.last_used_at).toLocaleString('en-IN')}` : ''}
                    </p>
                  </div>

                  {isSuperAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          setTrust.mutate({
                            id: d.id,
                            trust: d.trust_level === 'office' ? 'view_only' : 'office',
                          })
                        }
                      >
                        {d.trust_level === 'office' ? 'Make view only' : 'Mark as office'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setPendingRevoke(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingRevoke} onOpenChange={(o) => !o && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevoke?.user_name} will have to register their fingerprint again on{' '}
              {pendingRevoke?.device_name || 'this device'}. Any open terminal session is ended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingRevoke && revoke.mutate(pendingRevoke.id)}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
