// Quick edit of one Playbook entry, opened from the "Saved to Playbook" toast. Approvers only (the table's
// access rules allow approvers alone to read or change entries); every change is versioned by the database.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { copilotAdmin } from '@/hooks/useCopilotAdmin';

interface Entry {
  id: string;
  title: string;
  status: 'tentative' | 'approved' | 'retired';
  reply_en: string | null;
  reply_hi: string | null;
  reply_en_auto: boolean;
  reply_hi_auto: boolean;
  internal_note: string | null;
  scope: Record<string, string[]>;
  version: number;
  use_count: number;
}

function scopeText(scope: Record<string, string[]> | null | undefined): string {
  const s = scope ?? {};
  const parts: string[] = [];
  if (s.sides?.length) parts.push(s.sides.join('/') + ' orders');
  if (s.statuses?.length) parts.push('status ' + s.statuses.join('/'));
  if (s.categories?.length) parts.push(s.categories.join('/') + ' orders');
  if (s.client_states?.length) parts.push(s.client_states.join('/') + ' clients');
  if (s.account_ids?.length) parts.push('one Binance account');
  return parts.length ? parts.join(' · ') : 'All orders';
}

export function CopilotEntryDialog({ entryId, onOpenChange }: { entryId: string | null; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const { data: entry, isLoading } = useQuery({
    queryKey: ['copilot-entry', entryId],
    enabled: !!entryId,
    queryFn: async (): Promise<Entry | null> => {
      const { data, error } = await supabase.from('copilot_playbook_entries')
        .select('id, title, status, reply_en, reply_hi, reply_en_auto, reply_hi_auto, internal_note, scope, version, use_count')
        .eq('id', entryId!).maybeSingle();
      if (error) throw error;
      return data as unknown as Entry | null;
    },
  });
  const [title, setTitle] = useState('');
  const [en, setEn] = useState('');
  const [hi, setHi] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title);
    setEn(entry.reply_en ?? '');
    setHi(entry.reply_hi ?? '');
    setNote(entry.internal_note ?? '');
  }, [entry]);

  const save = async (retire = false) => {
    if (!entry) return;
    if (!retire && !en.trim() && !hi.trim()) { toast.error('Keep at least one language version'); return; }
    setSaving(true);
    if (retire) {
      // Through the database function, so the entry's open inbox items close with it.
      try {
        await copilotAdmin.setEntryStatus(entry.id, 'retired');
      } catch (e) {
        setSaving(false);
        toast.error((e as Error).message || 'Could not retire');
        return;
      }
      setSaving(false);
      qc.invalidateQueries({ queryKey: ['copilot-entry', entry.id] });
      qc.invalidateQueries({ queryKey: ['copilot-access'] });
      toast.success('Entry retired — it will no longer be suggested');
      onOpenChange(false);
      return;
    }
    const patch: TablesUpdate<'copilot_playbook_entries'> = {
      title: title.trim() || entry.title,
      reply_en: en.trim() || null,
      reply_hi: hi.trim() || null,
      reply_en_auto: en.trim() === (entry.reply_en ?? '') ? entry.reply_en_auto : false,
      reply_hi_auto: hi.trim() === (entry.reply_hi ?? '') ? entry.reply_hi_auto : false,
      internal_note: note.trim() || null,
    };
    const { error } = await supabase.from('copilot_playbook_entries').update(patch).eq('id', entry.id);
    setSaving(false);
    if (error) { toast.error(error.message || 'Could not save'); return; }
    qc.invalidateQueries({ queryKey: ['copilot-entry', entry.id] });
    qc.invalidateQueries({ queryKey: ['copilot-access'] });
    toast.success('Playbook entry saved');
    onOpenChange(false);
  };

  return (
    <Dialog open={!!entryId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Playbook entry</DialogTitle>
          <DialogDescription>
            Write replies with “sir”; the Copilot switches to “ma'am” when needed. Placeholders: {'{amount}'} {'{orderNo}'} {'{name}'} {'{upi}'} {'{contact:kyc}'} {'{contact:rm}'} {'{contact:support}'}.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !entry ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entry not found.'}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              {entry.status === 'approved' ? 'Approved' : entry.status === 'tentative' ? 'Tentative' : 'Retired'} · used {entry.use_count} times · version {entry.version} · applies to: {scopeText(entry.scope)}
            </p>
            <div className="space-y-1">
              <Label htmlFor="cp-title" className="text-xs">Topic</Label>
              <Input id="cp-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 160))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-en" className="text-xs">English reply {entry.reply_en_auto && <span className="font-normal text-muted-foreground">(translated automatically — check it)</span>}</Label>
              <Textarea id="cp-en" value={en} onChange={(e) => setEn(e.target.value.slice(0, 2000))} rows={3} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-hi" className="text-xs">Hindi reply, in English letters {entry.reply_hi_auto && <span className="font-normal text-muted-foreground">(translated automatically — check it)</span>}</Label>
              <Textarea id="cp-hi" value={hi} onChange={(e) => setHi(e.target.value.slice(0, 2000))} rows={3} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-note" className="text-xs">Note for approvers (never sent)</Label>
              <Textarea id="cp-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={2} className="text-sm" />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={!entry || saving || entry.status === 'retired'} onClick={() => void save(true)}>
            Retire entry
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!entry || saving} onClick={() => void save(false)}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
