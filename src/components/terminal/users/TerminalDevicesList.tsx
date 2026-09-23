import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Laptop, Building2, Eye, KeyRound, Loader2, ShieldCheck, Trash2, Wifi } from 'lucide-react';
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
  const [issuedCode, setIssuedCode] = useState<{ name: string; code: string } | null>(null);
  const [newNetwork, setNewNetwork] = useState({ label: '', cidr: '' });

  const devices = useQuery({
    queryKey: ['terminal-devices'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_terminal_devices');
      if (error) throw error;
      return (data || []) as DeviceRow[];
    },
  });

  const networks = useQuery({
    queryKey: ['terminal-trusted-networks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_trusted_networks')
        .select('id, label, cidr, is_active')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  });

  const settings = useQuery({
    queryKey: ['terminal-device-guard-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_device_guard_settings')
        .select('enforcement_mode, require_office_network')
        .eq('id', true)
        .maybeSingle();
      if (error) throw error;
      return data;
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

  const issueCode = useMutation({
    mutationFn: async (row: { userId: string; name: string }) => {
      const { data, error } = await supabase.functions.invoke('terminal-webauthn', {
        body: { action: 'issue_office_code', target_user_id: row.userId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed');
      return { name: row.name, code: data.code as string };
    },
    onSuccess: (res) => setIssuedCode(res),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSettings = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from('terminal_device_guard_settings')
        .update(patch)
        .eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Protection settings saved');
      qc.invalidateQueries({ queryKey: ['terminal-device-guard-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNetwork = useMutation({
    mutationFn: async () => {
      if (!newNetwork.label.trim() || !newNetwork.cidr.trim()) throw new Error('Name and IP range are required');
      const { error } = await supabase
        .from('terminal_trusted_networks')
        .insert({ label: newNetwork.label.trim(), cidr: newNetwork.cidr.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewNetwork({ label: '', cidr: '' });
      toast.success('Office network added');
      qc.invalidateQueries({ queryKey: ['terminal-trusted-networks'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {isSuperAdmin && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Personal-device protection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Mode</Label>
                <Select
                  value={settings.data?.enforcement_mode ?? 'log_only'}
                  onValueChange={(v) => saveSettings.mutate({ enforcement_mode: v })}
                >
                  <SelectTrigger className="h-8 w-52 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off — no restriction</SelectItem>
                    <SelectItem value="log_only">Log only — record, don't block</SelectItem>
                    <SelectItem value="enforce">Enforce — block actions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch
                  checked={settings.data?.require_office_network ?? true}
                  onCheckedChange={(v) => saveSettings.mutate({ require_office_network: v })}
                />
                <span className="text-xs text-muted-foreground">Office devices must be on an office network</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-xs">
                <Wifi className="h-3 w-3" /> Office networks
              </Label>
              <div className="flex flex-wrap gap-2">
                {(networks.data || []).map((n: { id: string; label: string; cidr: string; is_active: boolean }) => (
                  <Badge key={n.id} variant="outline" className="gap-1 text-[11px]">
                    {n.label}: {n.cidr}
                    {!n.is_active && <span className="text-muted-foreground">(off)</span>}
                  </Badge>
                ))}
                {(networks.data || []).length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    None yet — add your office public IP (e.g. 103.25.11.8/32) before enforcing.
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-8 w-40 text-xs"
                  placeholder="Name (Head Office)"
                  value={newNetwork.label}
                  onChange={(e) => setNewNetwork((s) => ({ ...s, label: e.target.value }))}
                />
                <Input
                  className="h-8 w-44 text-xs"
                  placeholder="IP range (1.2.3.4/32)"
                  value={newNetwork.cidr}
                  onChange={(e) => setNewNetwork((s) => ({ ...s, cidr: e.target.value }))}
                />
                <Button size="sm" className="h-8 text-xs" onClick={() => addNetwork.mutate()}>
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                        className="h-7 gap-1 text-[11px]"
                        onClick={() => issueCode.mutate({ userId: d.user_id, name: d.user_name || 'user' })}
                      >
                        <KeyRound className="h-3 w-3" /> Office code
                      </Button>
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

      <AlertDialog open={!!issuedCode} onOpenChange={(o) => !o && setIssuedCode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Office enrolment code</AlertDialogTitle>
            <AlertDialogDescription>
              Give this code to {issuedCode?.name} to use on the office computer within 10 minutes. It works once,
              and only on an approved office network.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 text-center font-mono text-3xl tracking-[0.3em] text-foreground">
            {issuedCode?.code}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIssuedCode(null)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
