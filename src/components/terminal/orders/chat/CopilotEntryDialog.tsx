// Quick edit of one Playbook reply, opened from the "Saved to Playbook" toast. Approvers only (the tables' access
// rules allow approvers alone to read or change replies); each change to a reply is a new version in the database.
// The question's name is shared by all its replies, so renaming it here renames the question. Situations,
// phrasings and example chats are edited on the Playbook page ("Open in Playbook").
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, ExternalLink, Languages, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { copilotAdmin, useCopilotSituations, useCopilotTeams, useRefreshCopilot } from '@/hooks/useCopilotAdmin';
import { copyChangeNote, scopeSummary, staleFlagForEdit, STATUS_LABEL, type EntryStatus, type Scope } from '@/lib/copilot/playbookAdmin';
import { stagesSummary, unknownStages } from '@/lib/copilot/situations';

function StaleNote({ children, onRewrite, onKeep, busy, rewriting, canRewrite, rewriteLabel, dirty }: {
  children: React.ReactNode; onRewrite: () => void; onKeep: () => void; busy: boolean; rewriting: boolean; canRewrite: boolean; rewriteLabel: string; dirty: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
      <span className="min-w-0 flex-1 basis-48">{children}</span>
      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" loading={rewriting} disabled={busy || !canRewrite} onClick={onRewrite}>{rewriteLabel}</Button>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={busy || dirty} title={dirty ? 'Save or undo your changes first' : undefined} onClick={onKeep}>Still right</Button>
    </div>
  );
}

export function CopilotEntryDialog({ entryId, onOpenChange }: { entryId: string | null; onOpenChange: (open: boolean) => void }) {
  const refresh = useRefreshCopilot();
  const { data: entry, isLoading } = useQuery({
    queryKey: ['copilot-entry', entryId],
    enabled: !!entryId,
    queryFn: () => copilotAdmin.getEntry(entryId!),
  });
  const { data: situations } = useCopilotSituations(!!entryId);
  const { data: teams = [] } = useCopilotTeams(!!entryId);
  const [title, setTitle] = useState('');
  const [en, setEn] = useState('');
  const [hi, setHi] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title);
    setEn(entry.reply_en ?? '');
    setHi(entry.reply_hi ?? '');
    setNote(entry.internal_note ?? '');
  }, [entry]);

  const replyDirty = !!entry && (en.trim() !== (entry.reply_en ?? '') || hi.trim() !== (entry.reply_hi ?? '') || note.trim() !== (entry.internal_note ?? ''));
  const titleDirty = !!entry && !!title.trim() && title.trim() !== entry.title;
  const scope = (entry?.scope ?? {}) as Scope;
  const lostSituation = unknownStages(scope.stages, situations).length > 0;
  const teamTokens = teams.filter((t) => t.active).map((t) => `{contact:${t.code}}`);

  const run = async (what: string, fn: () => Promise<unknown>, done: string, close = false) => {
    setSaving(what);
    try {
      await fn();
      refresh();
      toast.success(done);
      if (close) onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || 'Not changed');
    } finally {
      setSaving(null);
    }
  };

  const save = () => {
    if (!entry) return;
    const e = en.trim(), h = hi.trim();
    if (!e && !h) { toast.error('Keep at least one language version'); return; }
    void run('save', async () => {
      if (titleDirty) await copilotAdmin.renameTopic(entry.topic_id, title.trim());
      if (replyDirty) {
        await copilotAdmin.updateEntry(entry.id, {
          reply_en: e || null,
          reply_hi: h || null,
          // Saving an AI rewrite after reading it makes it the approver's own wording.
          reply_en_auto: e === (entry.reply_en ?? '') ? entry.reply_en_auto : false,
          reply_hi_auto: h === (entry.reply_hi ?? '') ? entry.reply_hi_auto : false,
          internal_note: note.trim() || null,
          ...staleFlagForEdit(entry, e, h),
        });
      }
    }, 'Playbook reply saved', true);
  };

  const rewrite = (to: 'en' | 'hi') => {
    const from = (to === 'hi' ? en : hi).trim();
    if (!from) return;
    void (async () => {
      setSaving(`rewrite-${to}`);
      try {
        const r = await copilotAdmin.translate(from, to);
        if (to === 'hi') setHi(r.text); else setEn(r.text);
        toast.success(to === 'hi' ? 'Hindi rewritten — check it, then save' : 'English rewritten — check it, then save');
      } catch (err) {
        toast.error((err as Error).message || 'Could not rewrite');
      } finally {
        setSaving(null);
      }
    })();
  };
  const keep = (lang: 'en' | 'hi') => entry && void run(`keep-${lang}`,
    () => copilotAdmin.updateEntry(entry.id, lang === 'hi' ? { reply_hi_stale: false } : { reply_en_stale: false }),
    lang === 'hi' ? 'Hindi kept as it is' : 'English kept as it is');
  const retire = () => entry && void run('retire', () => copilotAdmin.setEntryStatus(entry.id, 'retired'), 'Reply retired — it will no longer be suggested', true);

  const busy = !!saving;
  return (
    <Dialog open={!!entryId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Playbook reply</DialogTitle>
          <DialogDescription>
            Write replies with “sir”; the Copilot switches to “ma'am” when needed. Placeholders: {'{amount}'} {'{orderNo}'} {'{name}'} {'{upi}'}
            {teamTokens.length ? <>, and a team's number: {teamTokens.join(' ')}</> : null}. Give a number only when the client asks for one.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !entry ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reply not found.'}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-0.5 text-[11px] text-muted-foreground">
              <p>{STATUS_LABEL[entry.status as EntryStatus] ?? entry.status} · used {entry.use_count} times · version {entry.version}</p>
              <p>Applies to: <span className="text-foreground">{scopeSummary(scope, undefined, (codes) => stagesSummary(codes, situations))}</span></p>
            </div>
            {lostSituation && (
              <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />Its situation no longer exists, so it is not offered. Pick one in the Playbook.
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="cp-title" className="text-xs">Question <span className="font-normal text-muted-foreground">(shared by all its replies)</span></Label>
              <Input id="cp-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 160))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-en" className="text-xs">English reply {entry.reply_en_auto && <span className="font-normal text-warning">(written by the AI — check it)</span>}</Label>
              {entry.reply_en_stale && (
                <StaleNote busy={busy} rewriting={saving === 'rewrite-en'} canRewrite={!!hi.trim()} rewriteLabel="Rewrite from Hindi" dirty={replyDirty}
                  onRewrite={() => rewrite('en')} onKeep={() => keep('en')}>
                  Older than the Hindi copy, which was edited after it.
                </StaleNote>
              )}
              <Textarea id="cp-en" value={en} onChange={(e) => setEn(e.target.value.slice(0, 2000))} rows={3} className="text-sm" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="cp-hi" className="text-xs">Hindi reply, in English letters {entry.reply_hi_auto && <span className="font-normal text-warning">(written by the AI — check it)</span>}</Label>
                {!entry.reply_hi_stale && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" disabled={!en.trim() || busy} loading={saving === 'rewrite-hi'} onClick={() => rewrite('hi')}>
                    <Languages className="h-3 w-3" />{hi.trim() ? 'Rewrite from English' : 'Write from English'}
                  </Button>
                )}
              </div>
              {entry.reply_hi_stale && (
                <StaleNote busy={busy} rewriting={saving === 'rewrite-hi'} canRewrite={!!en.trim()} rewriteLabel="Rewrite from English" dirty={replyDirty}
                  onRewrite={() => rewrite('hi')} onKeep={() => keep('hi')}>
                  Out of date: the English was edited after it. Clients writing Hindi get the English reply until this is fixed.
                </StaleNote>
              )}
              <Textarea id="cp-hi" value={hi} onChange={(e) => setHi(e.target.value.slice(0, 2000))} rows={3} className="text-sm" />
              {copyChangeNote(entry, en, hi) && <p className="text-[11px] text-muted-foreground">{copyChangeNote(entry, en, hi)}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-note" className="text-xs">Note for approvers (never sent)</Label>
              <Textarea id="cp-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={2} className="text-sm" />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={!entry || busy || entry.status === 'retired'} onClick={retire}>
              Retire reply
            </Button>
            {entry && (
              <Button asChild variant="ghost">
                <Link to={`/terminal/playbook?entry=${entry.id}`} onClick={() => onOpenChange(false)}>Open in Playbook<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!entry || busy || (!replyDirty && !titleDirty)} loading={saving === 'save'} onClick={save}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
