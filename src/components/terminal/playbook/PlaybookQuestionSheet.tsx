// One Playbook question (approvers): its replies (one per situation), the client phrasings they share, the chats
// each reply was used in, and history. Every change to a reply is versioned by the database; restoring an old
// version creates a new one.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, History, Languages, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  cleanScope, copyChangeNote, expiryText, hasOutdatedCopy, isExpired, istShort, replyLabel, sameScope, scopeSummary, staleFlagForEdit, type EntryStatus, type Scope,
} from '@/lib/copilot/playbookAdmin';
import { stagesSummary, unknownStages } from '@/lib/copilot/situations';
import {
  copilotAdmin, useCopilotSituations, useCopilotTeams, useCopilotTopicDetail, useRefreshCopilot, useUserNames, userLabel, type EntryRow,
} from '@/hooks/useCopilotAdmin';
import { maskPersonal } from '@/lib/copilot/copilotText';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { MiniChat, Pill, ReplyText, StatusPill } from './PlaybookBits';
import { ScopeEditor } from './ScopeEditor';

interface Form { en: string; hi: string; note: string; risk: string; scope: Scope }
const formOf = (e: EntryRow): Form => ({ en: e.reply_en ?? '', hi: e.reply_hi ?? '', note: e.internal_note ?? '', risk: e.risk, scope: (e.scope ?? {}) as Scope });
type Snapshot = {
  title?: string; status?: string; scope?: Scope; reply_en?: string | null; reply_hi?: string | null; reply_en_auto?: boolean; reply_hi_auto?: boolean;
  reply_en_stale?: boolean; reply_hi_stale?: boolean; internal_note?: string | null; risk?: string;
};
const SOURCE_LABEL: Record<string, string> = { seed: 'starter set', chat: 'from a chat', manual: 'added', inbox: 'from the inbox', paraphrase: 'suggested' };

export interface SheetTarget { entryId?: string | null; topicId?: string | null }

export function PlaybookQuestionSheet({ target, onOpenChange }: { target: SheetTarget | null; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useCopilotTopicDetail(target);
  const { data: situations } = useCopilotSituations();
  const { data: teams = [] } = useCopilotTeams();
  const refresh = useRefreshCopilot();
  const { accounts, nameFor } = useExchangeAccount();
  const { data: users = [] } = useUserNames();
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const topic = data?.topic ?? null;
  const replies = useMemo(() => [...(data?.replies ?? [])].sort((a, b) => Number(a.status === 'retired') - Number(b.status === 'retired')), [data?.replies]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reply = replies.find((r) => r.id === selectedId) ?? null;
  const [form, setForm] = useState<Form | null>(null);
  const [adding, setAdding] = useState<Form | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [phraseLang, setPhraseLang] = useState<'en' | 'hi'>('en');
  const [tab, setTab] = useState('reply');
  const [title, setTitle] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const indexedFor = useRef<string | null>(null);
  const names = (codes: string[]) => stagesSummary(codes, situations);

  // Open on the reply the sheet was opened from (else the first live one).
  useEffect(() => {
    if (!data?.replies.length) { setSelectedId(null); return; }
    setSelectedId((cur) => (cur && data.replies.some((r) => r.id === cur) ? cur
      : (target?.entryId && data.replies.some((r) => r.id === target.entryId) ? target.entryId : (data.replies.find((r) => r.status !== 'retired') ?? data.replies[0]).id)));
  }, [data?.replies, target?.entryId]);
  useEffect(() => { if (reply) setForm(formOf(reply)); }, [reply]);
  useEffect(() => { setTab('reply'); setPhrase(''); setAdding(null); setTitle(null); }, [target?.entryId, target?.topicId]);

  // Phrasings and example chats not searchable yet become searchable when the question is opened.
  useEffect(() => {
    if (!topic || indexedFor.current === topic.id) return;
    const waiting = (data?.questions ?? []).some((q) => !q.embedding_model) || (data?.examples ?? []).some((x) => !x.embedding_model);
    if (!waiting) return;
    indexedFor.current = topic.id;
    setIndexing(true);
    copilotAdmin.indexAll().then((n) => { if (n) refresh(); }).catch(() => { /* stays waiting; shown on the phrasing */ }).finally(() => setIndexing(false));
  }, [topic, data?.questions, data?.examples, refresh]);

  const dirty = !!(reply && form) && (
    form.en.trim() !== (reply.reply_en ?? '') || form.hi.trim() !== (reply.reply_hi ?? '') || form.note.trim() !== (reply.internal_note ?? '')
    || form.risk !== reply.risk || !sameScope(form.scope, reply.scope as Scope));
  const valid = !!form && (form.en.trim().length > 0 || form.hi.trim().length > 0);

  const act = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setSaving(what);
    try { await fn(); toast.success(done); refresh(); } catch (e) { toast.error((e as Error).message || 'Not changed'); } finally { setSaving(null); }
  };

  const save = () => {
    if (!reply || !form || !valid) return;
    const en = form.en.trim(), hi = form.hi.trim();
    void act('save', () => copilotAdmin.updateEntry(reply.id, {
      reply_en: en || null,
      reply_hi: hi || null,
      reply_en_auto: en === (reply.reply_en ?? '') ? reply.reply_en_auto : false,
      reply_hi_auto: hi === (reply.reply_hi ?? '') ? reply.reply_hi_auto : false,
      internal_note: form.note.trim() || null,
      risk: form.risk,
      scope: cleanScope(form.scope),
      ...staleFlagForEdit(reply, en, hi),
    }), 'Reply saved');
  };
  const setStatus = (status: 'approved' | 'retired', done: string) => reply && void act(status, async () => {
    const r = await copilotAdmin.setEntryStatus(reply.id, status);
    if (r?.closed_items) toast(r.closed_items === 1 ? 'Its inbox item was closed too' : `${r.closed_items} inbox items were closed too`);
  }, done);
  const restore = (s: Snapshot, version: number) => reply && void act(`v${version}`, async () => {
    await copilotAdmin.updateEntry(reply.id, {
      reply_en: s.reply_en ?? null, reply_hi: s.reply_hi ?? null, reply_en_auto: !!s.reply_en_auto, reply_hi_auto: !!s.reply_hi_auto,
      internal_note: s.internal_note ?? null, risk: s.risk ?? reply.risk, scope: (s.scope ?? {}) as Scope,
    });
    // Then that version's own out-of-date flags (kept with versions saved from now on): the edit above may have
    // flagged a copy that was right in it, or cleared one that was out of date.
    if (typeof s.reply_en_stale === 'boolean' && typeof s.reply_hi_stale === 'boolean') {
      await copilotAdmin.updateEntry(reply.id, { reply_en_stale: s.reply_en_stale, reply_hi_stale: s.reply_hi_stale });
    }
  }, `Version ${version} restored as a new version`);

  const rewrite = async (to: 'en' | 'hi', apply: (text: string) => void, from: string) => {
    if (!from.trim()) return;
    setSaving(`rewrite-${to}`);
    try {
      const r = await copilotAdmin.translate(from.trim(), to);
      apply(r.text);
      toast.success(to === 'hi' ? 'Hindi rewritten — check it, then save' : 'English rewritten — check it, then save');
    } catch (e) { toast.error((e as Error).message || 'Could not rewrite'); } finally { setSaving(null); }
  };
  const stillRight = (lang: 'en' | 'hi') => reply && void act(`ok-${lang}`, () => copilotAdmin.updateEntry(reply.id, lang === 'hi' ? { reply_hi_stale: false } : { reply_en_stale: false }),
    lang === 'hi' ? 'Hindi kept as it is' : 'English kept as it is');

  const addPhrase = () => {
    const text = phrase.trim();
    if (!topic || text.length < 2) return;
    void act('phrase', async () => {
      // Personal numbers and handles never enter the Playbook (same rule as the server's masking).
      const id = await copilotAdmin.addQuestion(topic.id, maskPersonal(text), phraseLang);
      if (!id) throw new Error('This question already has that phrasing');
      setPhrase('');
      try { await copilotAdmin.indexAll(); } catch { toast('Saved; it becomes searchable with the next chat'); }
    }, 'Phrasing added — searchable now');
  };
  const rename = () => {
    const t = (title ?? '').trim();
    if (!topic || !t || t === topic.title) { setTitle(null); return; }
    void act('title', async () => { await copilotAdmin.renameTopic(topic.id, t.slice(0, 160)); setTitle(null); }, 'Question renamed');
  };
  const startAdding = () => {
    const base = (reply?.scope ?? {}) as Scope;
    setAdding({ en: '', hi: '', note: '', risk: reply?.risk ?? 'none', scope: cleanScope({ ...base, stages: [] }) });
  };
  const addReply = () => {
    if (!topic || !adding || (!adding.en.trim() && !adding.hi.trim())) return;
    void act('add', async () => {
      const id = await copilotAdmin.addReply(topic, {
        reply_en: adding.en.trim() || null, reply_hi: adding.hi.trim() || null, scope: cleanScope(adding.scope),
        kind: reply?.kind, step_key: reply?.kind === 'step' ? reply.step_key : null,
      });
      setAdding(null);
      setSelectedId(id);
    }, 'Reply added for that situation');
  };

  const versions = (data?.versions ?? []).filter((v) => v.entry_id === reply?.id);
  const examples = (data?.examples ?? []).filter((x) => x.entry_id === reply?.id);
  const expired = reply ? isExpired(reply) : false;
  const placeholderHelp = (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      Write with “sir”; the Copilot switches to “ma'am” when needed. Filled in when inserted: {'{amount}'} {'{orderNo}'} {'{name}'} {'{upi}'}
      {teams.filter((t) => t.active).map((t) => <span key={t.code}> · {`{contact:${t.code}}`} {t.label}</span>)}. Give a number only where the client asks for one.
    </p>
  );
  const labelOf = (r: EntryRow) => replyLabel(r.scope as Scope, names);

  return (
    <Sheet open={!!target} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1.5 border-b border-border px-4 py-3 text-left">
          {title !== null ? (
            <form className="flex items-center gap-2 pr-6" onSubmit={(e) => { e.preventDefault(); rename(); }}>
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value.slice(0, 160))} className="h-8 text-sm" aria-label="Question" />
              <Button type="submit" size="sm" className="h-8" loading={saving === 'title'}>Save</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setTitle(null)}>Cancel</Button>
            </form>
          ) : (
            <SheetTitle className="flex items-start gap-1.5 pr-6 text-base">
              <span className="min-w-0 break-words">{topic?.title ?? 'Playbook question'}</span>
              {topic && <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground" aria-label="Rename question" onClick={() => setTitle(topic.title)}><Pencil className="h-3 w-3" /></Button>}
            </SheetTitle>
          )}
          <SheetDescription asChild>
            <div className="text-[11px] text-muted-foreground">
              {replies.filter((r) => r.status !== 'retired').length} {replies.filter((r) => r.status !== 'retired').length === 1 ? 'reply' : 'replies'} by situation
              {' · '}{data?.questions.length ?? 0} phrasings · used {replies.reduce((n, r) => n + r.use_count, 0)}×
            </div>
          </SheetDescription>
          {replies.length > 0 && (
            <div className="-mx-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto px-1 pb-0.5" role="tablist" aria-label="Replies by situation">
              {replies.map((r) => {
                const on = r.id === selectedId && !adding;
                const dot = r.conflict_open && r.status !== 'retired' ? 'bg-destructive' : r.status === 'approved' ? 'bg-trade-buy' : r.status === 'tentative' ? 'bg-warning' : 'bg-muted-foreground/50';
                return (
                  <button key={r.id} type="button" role="tab" aria-selected={on} onClick={() => { setAdding(null); setSelectedId(r.id); }}
                    className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors ${on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'} ${r.status === 'retired' ? 'opacity-60' : ''}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
                    <span className="max-w-[14rem] truncate">{labelOf(r)}</span>
                    {hasOutdatedCopy(r) && <Languages className="h-3 w-3 text-warning" aria-label="A language copy is out of date" />}
                  </button>
                );
              })}
              <button type="button" onClick={startAdding}
                className={`flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed px-2.5 text-[11px] ${adding ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                <Plus className="h-3 w-3" />Reply for another situation
              </button>
            </div>
          )}
        </SheetHeader>

        {isLoading || !topic ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Question not found.'}
          </div>
        ) : adding ? (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              <p className="text-xs text-foreground">A new reply to “{topic.title}” for a situation its other replies do not cover. It is offered first in that situation and shares this question's phrasings.</p>
              <ScopeEditor scope={adding.scope} onChange={(scope) => setAdding({ ...adding, scope })} situations={situations} accounts={accounts} idPrefix="add" />
              <div className="space-y-1">
                <Label htmlFor="add-en" className="text-xs">English reply</Label>
                <Textarea id="add-en" value={adding.en} onChange={(e) => setAdding({ ...adding, en: e.target.value.slice(0, 2000) })} rows={3} className="text-sm" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="add-hi" className="text-xs">Hindi reply, in English letters</Label>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" disabled={!adding.en.trim() || !!saving} loading={saving === 'rewrite-hi'}
                    onClick={() => void rewrite('hi', (t) => setAdding((a) => (a ? { ...a, hi: t } : a)), adding.en)}>
                    <Languages className="h-3 w-3" />Write Hindi from English
                  </Button>
                </div>
                <Textarea id="add-hi" value={adding.hi} onChange={(e) => setAdding({ ...adding, hi: e.target.value.slice(0, 2000) })} rows={3} className="text-sm" />
              </div>
              {placeholderHelp}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button size="sm" variant="ghost" className="h-8" disabled={!!saving} onClick={() => setAdding(null)}>Cancel</Button>
              <Button size="sm" className="h-8" loading={saving === 'add'} disabled={!!saving || (!adding.en.trim() && !adding.hi.trim()) || !(adding.scope.stages?.length || adding.scope.client_states?.length)}
                title={!(adding.scope.stages?.length || adding.scope.client_states?.length) ? 'Pick the situation (or client) this reply is for' : undefined} onClick={addReply}>
                Add reply
              </Button>
            </div>
          </>
        ) : !reply || !form ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No replies yet.</div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-3 grid h-9 grid-cols-5">
              <TabsTrigger value="reply" className="text-xs">Reply</TabsTrigger>
              <TabsTrigger value="scope" className="text-xs">Applies to</TabsTrigger>
              <TabsTrigger value="questions" className="text-xs">Phrasings</TabsTrigger>
              <TabsTrigger value="chats" className="text-xs">Chats</TabsTrigger>
              <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <TabsContent value="reply" className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <StatusPill status={reply.status as EntryStatus} conflict={reply.conflict_open && reply.status !== 'retired'} expired={expired} />
                  <Pill tone="primary">{scopeSummary(reply.scope as Scope, nameFor, names)}</Pill>
                  <span>used {reply.use_count}× · version {reply.version}{reply.status === 'tentative' && reply.expires_at ? ` · ${expiryText(reply.expires_at)}` : ''}</span>
                  {reply.approved_at && <span>· approved {istShort(reply.approved_at)} by {userLabel(userById.get(reply.approved_by ?? ''), reply.approved_by)}</span>}
                </div>
                {unknownStages((reply.scope as Scope)?.stages, situations).length > 0 && (
                  <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />Its situation no longer exists. Pick one on “Applies to”.
                  </p>
                )}
                <div className="space-y-1">
                  <Label htmlFor="pq-en" className="text-xs">English reply {reply.reply_en_auto && <span className="font-normal text-warning">(written by the AI — check it)</span>}</Label>
                  {reply.reply_en_stale && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                      <span className="min-w-0 flex-1">Older than the Hindi copy, which was edited after it.</span>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" loading={saving === 'rewrite-en'} disabled={!!saving}
                        onClick={() => void rewrite('en', (t) => setForm((f) => (f ? { ...f, en: t } : f)), form.hi)}>Rewrite from Hindi</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={!!saving || dirty} onClick={() => stillRight('en')}>Still right</Button>
                    </div>
                  )}
                  <Textarea id="pq-en" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value.slice(0, 2000) })} rows={4} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="pq-hi" className="text-xs">Hindi reply, in English letters {reply.reply_hi_auto && <span className="font-normal text-warning">(written by the AI — check it)</span>}</Label>
                    {!reply.reply_hi_stale && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" disabled={!form.en.trim() || !!saving} loading={saving === 'rewrite-hi'}
                        onClick={() => void rewrite('hi', (t) => setForm((f) => (f ? { ...f, hi: t } : f)), form.en)}>
                        <Languages className="h-3 w-3" />{form.hi.trim() ? 'Rewrite from English' : 'Write from English'}
                      </Button>
                    )}
                  </div>
                  {reply.reply_hi_stale && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                      <span className="min-w-0 flex-1">Out of date: the English was edited after it. Clients writing Hindi get the English reply until this is fixed.</span>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" loading={saving === 'rewrite-hi'} disabled={!!saving}
                        onClick={() => void rewrite('hi', (t) => setForm((f) => (f ? { ...f, hi: t } : f)), form.en)}>Rewrite from English</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={!!saving || dirty} onClick={() => stillRight('hi')}>Still right</Button>
                    </div>
                  )}
                  <Textarea id="pq-hi" value={form.hi} onChange={(e) => setForm({ ...form, hi: e.target.value.slice(0, 2000) })} rows={4} className="text-sm" />
                  {copyChangeNote(reply, form.en, form.hi) && <p className="text-[11px] text-muted-foreground">{copyChangeNote(reply, form.en, form.hi)}</p>}
                </div>
                {placeholderHelp}
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <div className="space-y-1">
                    <Label htmlFor="pq-note" className="text-xs">Note for approvers (never sent)</Label>
                    <Textarea id="pq-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value.slice(0, 2000) })} rows={2} className="text-sm" />
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

              <TabsContent value="scope" className="mt-3">
                <ScopeEditor scope={form.scope} onChange={(scope) => setForm({ ...form, scope })} situations={situations} accounts={accounts} idPrefix="pq" />
              </TabsContent>

              <TabsContent value="questions" className="mt-3 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Ways clients ask this question, shared by all its replies — the chat's situation decides which reply is offered.
                  Sending or approving a reply in a chat adds the client's wording here; you can remove any of them.
                </p>
                <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); addPhrase(); }}>
                  <Input value={phrase} onChange={(e) => setPhrase(e.target.value.slice(0, 300))} placeholder="Add how a client asks it" className="h-9 text-sm" aria-label="New phrasing" />
                  <Select value={phraseLang} onValueChange={(v) => setPhraseLang(v as 'en' | 'hi')}>
                    <SelectTrigger className="h-9 w-24 text-xs" aria-label="Phrasing language"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="en" className="text-xs">English</SelectItem><SelectItem value="hi" className="text-xs">Hindi</SelectItem></SelectContent>
                  </Select>
                  <Button type="submit" size="sm" className="h-9" loading={saving === 'phrase'} disabled={phrase.trim().length < 2 || !!saving} aria-label="Add phrasing"><Plus className="h-4 w-4" /></Button>
                </form>
                {indexing && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Making new phrasings searchable…</p>}
                <ul className="space-y-1">
                  {(data?.questions ?? []).map((q) => (
                    <li key={q.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-xs text-foreground">“{q.question_text}”</p>
                        <p className="text-[10px] text-muted-foreground">
                          {SOURCE_LABEL[q.source] ?? q.source}{q.created_by ? ` · ${userLabel(userById.get(q.created_by), q.created_by)}` : ''} · {istShort(q.created_at)}
                          {!q.embedding_model && !indexing && <span title="It will be searchable after the next chat or when this question is opened again"> · not searchable yet</span>}
                        </p>
                      </div>
                      {q.language === 'hi' && <Pill>Hindi</Pill>}
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remove “${q.question_text}”`}
                        disabled={!!saving} onClick={() => void act(`q-${q.id}`, () => copilotAdmin.removeQuestion(q.id), 'Phrasing removed')}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                  {!data?.questions.length && <li className="text-xs text-muted-foreground">No phrasings yet — this question is never matched to a client message.</li>}
                </ul>
              </TabsContent>

              <TabsContent value="chats" className="mt-3 space-y-2">
                <p className="text-[11px] text-muted-foreground">Chats this reply was used in. A new chat that reads like one of these brings this reply up first.</p>
                {examples.map((x) => (
                  <MiniChat key={x.id} lines={x.chat}
                    label={x.source === 'seed' ? 'Typical chat (starter set)' : `${istShort(x.created_at)}${x.order_number ? ` · order …${x.order_number.slice(-6)}` : ''}${x.situation ? ` · ${names([x.situation])}` : ''}`} />
                ))}
                {!examples.length && <p className="text-xs text-muted-foreground">No chats yet — it learns from the chats you send it in.</p>}
              </TabsContent>

              <TabsContent value="history" className="mt-3 space-y-2">
                {versions.map((v) => {
                  const s = (v.snapshot ?? {}) as Snapshot;
                  const isCurrent = v.version === reply.version;
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
                      <ReplyText text={s.reply_en ?? s.reply_hi ?? ''} />
                      {s.reply_en && s.reply_hi && <ReplyText text={s.reply_hi} className="block text-muted-foreground" />}
                      <p className="text-[10px] text-muted-foreground">Applies to: {scopeSummary(s.scope, nameFor, names)}</p>
                    </div>
                  );
                })}
              </TabsContent>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              {reply.status === 'tentative' && (
                <Button size="sm" variant="outline" className="h-8" loading={saving === 'approved'} disabled={!!saving || dirty}
                  title={dirty ? 'Save your changes first' : undefined} onClick={() => setStatus('approved', 'Approved — offered as an approved reply from now on')}>
                  <CheckCircle2 className="h-3.5 w-3.5" />Approve
                </Button>
              )}
              {reply.status !== 'retired' ? (
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
              {dirty && <Button size="sm" variant="ghost" className="h-8" disabled={!!saving} onClick={() => setForm(formOf(reply))}>Discard</Button>}
              <Button size="sm" className="h-8" loading={saving === 'save'} disabled={!dirty || !valid || !!saving} onClick={save}>Save changes</Button>
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

