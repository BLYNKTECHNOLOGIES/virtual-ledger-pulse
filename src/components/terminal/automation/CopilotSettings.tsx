import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { Sparkles, Users, GraduationCap, ChevronDown, Play, Loader2, Database, Clock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { CopilotSettings as Settings } from '@/hooks/useCopilot';

interface TUser { id: string; username: string | null; first_name: string | null; last_name: string | null; }

function useTerminalUsersList() {
  return useQuery({
    queryKey: ['copilot-user-list'],
    queryFn: async (): Promise<TUser[]> => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, first_name, last_name')
        .order('first_name', { ascending: true });
      if (error) throw error;
      return (data || []) as TUser[];
    },
  });
}

const userLabel = (u: TUser) =>
  [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.id.slice(0, 8);

function MultiUserSelect({
  users, selected, onChange, placeholder, icon,
}: {
  users: TUser[]; selected: string[]; onChange: (ids: string[]) => void;
  placeholder: string; icon: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-9 text-xs font-normal">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {icon}
            {selected.length ? `${selected.length} selected` : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/80 text-left"
              >
                <input type="checkbox" readOnly checked={selected.includes(u.id)} className="accent-primary" />
                <span className="text-xs text-foreground truncate">{userLabel(u)}</span>
              </button>
            ))}
            {users.length === 0 && <p className="text-[10px] text-muted-foreground p-2">No users.</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function CopilotSettings() {
  const qc = useQueryClient();
  const [training, setTraining] = useState(false);
  const { data: users = [] } = useTerminalUsersList();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['copilot-settings'],
    queryFn: async (): Promise<(Settings & { updated_at?: string }) | null> => {
      const { data, error } = await supabase.from('copilot_settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      if (!settings?.id) throw new Error('No settings row');
      const { error } = await supabase.from('copilot_settings').update(patch).eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['copilot-settings'] }),
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  });

  const trainNow = async () => {
    setTraining(true);
    try {
      const { data, error } = await supabase.functions.invoke('copilot-train', { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Trained: ${data?.inserted ?? 0} new, ${data?.skipped ?? 0} skipped`);
      qc.invalidateQueries({ queryKey: ['copilot-settings'] });
    } catch (e: any) {
      toast.error(e.message || 'Training failed');
    } finally {
      setTraining(false);
    }
  };

  if (isLoading || !settings) {
    return <Card><CardContent className="p-6 text-xs text-muted-foreground">Loading copilot settings…</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Copilot
          <Badge variant="outline" className={`ml-1 text-[10px] ${settings.enabled ? 'border-success/40 text-success' : 'border-border text-muted-foreground'}`}>
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-xs font-medium text-foreground">Enable AI Copilot</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Show risk-free reply suggestions in order chats</p>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(v) => save.mutate({ enabled: v })} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Who sees suggestions</Label>
            <MultiUserSelect
              users={users}
              selected={settings.operator_allowlist || []}
              onChange={(ids) => save.mutate({ operator_allowlist: ids })}
              placeholder="Select operators"
              icon={<Users className="h-3.5 w-3.5" />}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Who it learns from</Label>
            <MultiUserSelect
              users={users}
              selected={settings.trainer_allowlist || []}
              onChange={(ids) => save.mutate({ trainer_allowlist: ids })}
              placeholder="Select trainers"
              icon={<GraduationCap className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        <div className="space-y-1.5 max-w-[200px]">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggestions per reply</Label>
          <Select
            value={String(settings.suggestion_count)}
            onValueChange={(v) => save.mutate({ suggestion_count: Number(v) })}
          >
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-md bg-secondary/40 border border-border p-3">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-foreground tabular-nums">{settings.exemplar_count ?? 0}</span>
            <span className="text-[10px] text-muted-foreground">exemplars</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Last trained:</span>
            <span className="text-[10px] text-foreground">
              {settings.updated_at ? format(new Date(settings.updated_at), 'dd MMM HH:mm') : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Watermark:</span>
            <span className="text-[10px] text-foreground">
              {settings.train_watermark ? format(new Date(settings.train_watermark), 'dd MMM HH:mm') : '—'}
            </span>
          </div>
          <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={trainNow} disabled={training}>
            {training ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Train Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
