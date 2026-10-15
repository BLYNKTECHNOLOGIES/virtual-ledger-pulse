// One Playbook entry (approvers): reply in both languages, client phrasings, where it applies, and its history.
// Every change is versioned by the database; restoring an old version creates a new one.
import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, History, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Json, TablesUpdate } from '@/integrations/supabase/types';
import {
  cleanScope, expiryText, isExpired, istShort, optionChecked, sameScope, SCOPE_GROUPS, scopeSummary, toggleScope,
  type EntryStatus, type Scope,
} from '@/lib/copilot/playbookAdmin';
import { copilotAdmin, useCopilotEntryDetail, useRefreshCopilot, useUserNames, userLabel, type EntryRow } from '@/hooks/useCopilotAdmin';
import { maskPersonal } from '@/lib/copilot/copilotText';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { Pill, ReplyText, StatusPill } from './PlaybookBits';

interface Form { title: string; en: string; hi: string; note: string; risk: string; scope: Scope }
const formOf = (e: EntryRow): Form => ({
  title: e.title, en: e.reply_en ?? '', hi: e.reply_hi ?? '', note: e.internal_note ?? '', risk: e.risk, scope: (e.scope ?? {}) as Scope,
});
type Snapshot = { title?: string; status?: string; scope?: Scope; reply_en?: string | null; reply_hi?: string | null; reply_en_auto?: boolean; reply_hi_auto?: boolean; internal_note?: string | null; risk?: string };

export function PlaybookEntrySheet({ entryId, onOpenChange }: { entryId: string | null; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useCopilotEntryDetail(entryId);
  const refresh = useRefreshCopilot();
  const { accounts, nameFor } = useExchangeAccount();
  const { data: users = [] } = useUserNames();
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const entry = data?.entry ?? null;
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [phraseLang, setPhraseLang] = useState<'en' | 'hi'>('en');
  const [tab, setTab] = useState('reply');

  useEffect(() => { if (entry) setForm(formOf(entry)); }, [entry]);
  useEffect(() => { setTab('reply'); setPhrase(''); }, [entryId]);

  const dirty = !!(entry && form) && (
    form.title.trim() !== entry.title || form.en.trim() !== (entry.reply_en ?? '') || form.hi.trim() !== (entry.reply_hi ?? '')
    || form.note.trim() !== (entry.internal_note ?? '') || form.risk !== entry.risk || !sameScope(form.scope, entry.scope as Scope));
  const valid = !!form && form.title.trim().length > 0 && (form.en.trim().length > 0 || form.hi.trim().length > 0);

  const act = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setSaving(what);
    try { await fn(); toast.success(done); refresh(); } catch (e) { toast.error((e as Error).message || 'Not changed'); } finally { setSaving(null); }
  };

  const save = () => {
    if (!entry || !form || !valid) return;
    const en = form.en.trim(), hi = form.hi.trim();
    const patch: TablesUpdate<'copilot_playbook_entries'> = {
      title: form.title.trim().slice(0, 160),
      reply_en: en || null,
      reply_hi: hi || null,
      reply_en_auto: en === (entry.reply_en ?? '') ? entry.reply_en_auto : false,
      reply_hi_auto: hi === (entry.reply_hi ?? '') ? entry.reply_hi_auto : false,
      internal_note: form.note.trim() || null,
      risk: form.risk,
      scope: cleanScope(form.scope) as Json,
    };
    void act('save', () => copilotAdmin.updateEntry(entry.id, patch), 'Entry saved');
  };
  const setStatus = (status: 'approved' | 'retired', done: string) => entry && void act(status, async () => {
    const r = await copilotAdmin.setEntryStatus(entry.id, status);
    if (r?.closed_items) toast(r.closed_items === 1 ? 'Its inbox item was closed too' : `${r.closed_items} inbox items were closed too`);
  }, done);
  const restore = (s: Snapshot, version: number) => entry && void act(`v${version}`, () => copilotAdmin.updateEntry(entry.id, {
    title: s.title ?? entry.title, reply_en: s.reply_en ?? null, reply_hi: s.reply_hi ?? null,
    reply_en_auto: !!s.reply_en_auto, reply_hi_auto: !!s.reply_hi_auto, internal_note: s.internal_note ?? null,
    risk: s.risk ?? entry.risk, scope: (s.scope ?? {}) as Json,
  }), `Version ${version} restored as a new version`);
  const addPhrase = () => {
    const text = phrase.trim();
    if (!entry || text.length < 2) return;
    void act('phrase', async () => {
      // Personal numbers and handles never enter the Playbook (same rule as the server's masking).
      const id = await copilotAdmin.addQuestion(entry.id, maskPersonal(text), phraseLang);
      if (!id) throw new Error('This entry already has that phrasing');
      setPhrase('');
    }, 'Phrasing added — it becomes searchable the next time a chat is opened');
  };

  const expired = entry ? isExpired(entry) : false;

  return (
    <Sheet open={!!entryId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b border-border px-4 py-3 text-left">
          <SheetTitle className="pr-6 text-base">{entry?.title ?? 'Playbook entry'}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {entry && <StatusPill status={entry.status as EntryStatus} conflict={entry.conflict_open && entry.status !== 'retired'} expired={expired} />}
              {entry && <span>used {entry.use_count}× · version {entry.version}{entry.status === 'tentative' && entry.expires_at ? ` · ${expiryText(entry.expires_at)}` : ''}</span>}
              {entry?.approved_at && <span>· approved {istShort(entry.approved_at)} by {userLabel(userById.get(entry.approved_by ?? ''), entry.approved_by)}</span>}
            </div>
          </SheetDescription>
        </SheetHeader>

        {isLoading || !entry || !form ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entry not found.'}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-3 grid h-9 grid-cols-4">
              <TabsTrigger value="reply" className="text-xs">Reply</TabsTrigger>
              <TabsTrigger value="questions" className="text-xs">Phrasings ({data?.questions.length ?? 0})</TabsTrigger>
              <TabsTrigger value="scope" className="text-xs">Applies to</TabsTrigger>
              <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <TabsContent value="reply" className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="pe-title" className="text-xs">Topic</Label>
                  <Input id="pe-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value.slice(0, 160) })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pe-en" className="text-xs">English reply {entry.reply_en_auto && <span className="font-normal text-warning">(translated automatically — check it)</span>}</Label>
                  <Textarea id="pe-en" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value.slice(0, 2000) })} rows={4} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pe-hi" className="text-xs">Hindi reply, in English letters {entry.reply_hi_auto && <span className="font-normal text-warning">(translated automatically — check it)</span>}</Label>
                  <Textarea id="pe-hi" value={form.hi} onChange={(e) => setForm({ ...form, hi: e.target.value.slice(0, 2000) })} rows={4} className="text-sm" />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Write with “sir”; the Copilot switches to “ma'am” when needed. Placeholders filled in automatically: {'{amount}'} {'{orderNo}'} {'{name}'} {'{upi}'} {'{contact:kyc}'} {'{contact:rm}'} {'{contact:support}'}.
                </p>
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <div className="space-y-1">
                    <Label htmlFor="pe-note" className="text-xs">Note for approvers (never sent)</Label>
                    <Textarea id="pe-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value.slice(0, 2000) })} rows={2} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Topic risk</Label>
                    <Select value={form.risk} onValueChange={(v) => setForm({ ...form, risk: v })}>
                      <SelectTrigger className="h-9 text-xs" aria-label="Topic risk"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">Normal</SelectItem>
                        <SelectItem value="amber" className="text-xs">Take care</SelectItem>
                        <SelectItem value="red" className="text-xs">Risk topic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="questions" className="mt-3 space-y-3">
                <p className="text-[11px] text-muted-foreground">Ways clients ask this. A client message that reads like one of these brings this reply up first.</p>
                <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); addPhrase(); }}>
                  <Input value={phrase} onChange={(e) => setPhrase(e.target.value.slice(0, 300))} placeholder="Add how a client asks it" className="h-9 text-sm" aria-label="New phrasing" />
                  <Select value={phraseLang} onValueChange={(v) => setPhraseLang(v as 'en' | 'hi')}>
                    <SelectTrigger className="h-9 w-24 text-xs" aria-label="Phrasing language"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="en" className="text-xs">English</SelectItem><SelectItem value="hi" className="text-xs">Hindi</SelectItem></SelectContent>
                  </Select>
                  <Button type="submit" size="sm" className="h-9" loading={saving === 'phrase'} disabled={phrase.trim().length < 2 || !!saving} aria-label="Add phrasing"><Plus className="h-4 w-4" /></Button>
                </form>
                <ul className="space-y-1">
                  {(data?.questions ?? []).map((q) => (
                    <li key={q.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1 break-words text-xs text-foreground">“{q.question_text}”</span>
                      {q.language === 'hi' && <Pill>Hindi</Pill>}
                      {!q.embedding_model && <Pill tone="amber" title="Becomes searchable the next time an approver opens a chat">pending</Pill>}
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remove “${q.question_text}”`}
                        disabled={!!saving} onClick={() => void act(`q-${q.id}`, () => copilotAdmin.removeQuestion(q.id), 'Phrasing removed')}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                  {!data?.questions.length && <li className="text-xs text-muted-foreground">No phrasings yet — this reply is never matched to a client message.</li>}
                </ul>
              </TabsContent>

              <TabsContent value="scope" className="mt-3 space-y-4">
                <p className="text-[11px] text-muted-foreground">Leave a group empty to apply to all. Now: <span className="text-foreground">{scopeSummary(form.scope, nameFor)}</span></p>
                {SCOPE_GROUPS.map((g) => (
                  <fieldset key={g.key} className="space-y-1.5">
                    <legend className="text-xs font-medium text-foreground">{g.label}</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {g.options.map((o) => {
                        const id = `pe-${g.key}-${o.values[0]}`;
                        return (
                          <label key={id} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                            <Checkbox id={id} checked={optionChecked(form.scope, g.key, o.values)} onCheckedChange={() => setForm({ ...form, scope: toggleScope(form.scope, g.key, o.values) })} />
                            {o.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                {accounts.length > 1 && (
                  <fieldset className="space-y-1.5">
                    <legend className="text-xs font-medium text-foreground">Binance account</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {accounts.map((a) => {
                        const id = `pe-acc-${a.id}`;
                        return (
                          <label key={a.id} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                            <Checkbox id={id} checked={optionChecked(form.scope, 'account_ids', [a.id])} onCheckedChange={() => setForm({ ...form, scope: toggleScope(form.scope, 'account_ids', [a.id]) })} />
                            {a.account_name}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-3 space-y-2">
                {(data?.versions ?? []).map((v) => {
                  const s = (v.snapshot ?? {}) as Snapshot;
                  const isCurrent = v.version === entry.version;
                  return (
                    <div key={v.id} className={`space-y-1.5 rounded-md border p-2.5 ${isCurrent ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-secondary/10'}`}>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <History className="h-3 w-3" />
                        <span className="font-medium text-foreground">Version {v.version}</span>
                        <span>· {istShort(v.created_at)} · {userLabel(userById.get(v.changed_by ?? ''), v.changed_by)}</span>
                        {s.status && <StatusPill status={s.status as EntryStatus} />}
                        {isCurrent ? <Pill tone="primary">Current</Pill> : (
                          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[11px]" loading={saving === `v${v.version}`} disabled={!!saving || dirty}
                            title={dirty ? 'Save or discard your changes first' : undefined} onClick={() => restore(s, v.version)}>
                            <RotateCcw className="h-3 w-3" />Restore
                          </Button>
                        )}
                      </div>
                      {s.title && s.title !== entry.title && <p className="text-[11px] text-muted-foreground">Topic: {s.title}</p>}
                      <ReplyText text={s.reply_en ?? s.reply_hi ?? ''} />
                      {s.reply_en && s.reply_hi && <ReplyText text={s.reply_hi} className="block text-muted-foreground" />}
                      <p className="text-[10px] text-muted-foreground">Applies to: {scopeSummary(s.scope, nameFor)}</p>
                    </div>
                  );
                })}
              </TabsContent>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              {entry.status === 'tentative' && (
                <Button size="sm" variant="outline" className="h-8" loading={saving === 'approved'} disabled={!!saving || dirty}
                  title={dirty ? 'Save your changes first' : undefined} onClick={() => setStatus('approved', 'Approved — offered as an approved reply from now on')}>
                  <CheckCircle2 className="h-3.5 w-3.5" />Approve
                </Button>
              )}
              {entry.status !== 'retired' ? (
                <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" loading={saving === 'retired'} disabled={!!saving || dirty}
                  title={dirty ? 'Save or discard your changes first' : undefined} onClick={() => setStatus('retired', 'Retired — it will no longer be offered')}>
                  <Trash2 className="h-3.5 w-3.5" />Retire
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8" loading={saving === 'approved'} disabled={!!saving || dirty}
                  title={dirty ? 'Save or discard your changes first' : undefined} onClick={() => setStatus('approved', 'Restored as an approved reply')}>
                  <RotateCcw className="h-3.5 w-3.5" />Restore as approved
                </Button>
              )}
              <span className="flex-1" />
              {dirty && <Button size="sm" variant="ghost" className="h-8" disabled={!!saving} onClick={() => setForm(formOf(entry))}>Discard</Button>}
              <Button size="sm" className="h-8" loading={saving === 'save'} disabled={!dirty || !valid || !!saving} onClick={save}>Save changes</Button>
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
