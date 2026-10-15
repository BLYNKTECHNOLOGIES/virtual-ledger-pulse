// Copilot v2 settings (Automation → AI Copilot). Approvers only: copilot_my_access decides what is shown and the
// tables' access rules let only approvers read or change these rows.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { usersDirectory } from '@/lib/usersDirectory';
import { useCopilotAccess } from '@/hooks/useCopilotPlaybook';
import { copilotAdmin, teamCode, useCopilotTeams, type TeamRow } from '@/hooks/useCopilotAdmin';
import { contactAvailableNow, PHONE_RE, teamLabel } from '@/lib/copilot/copilotText';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BookOpen, Loader2, Phone, Plus, Pencil, Trash2, Users, Wallet, Languages, Cpu, ShieldCheck, ChevronDown, ArrowRight, Building2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

interface Config {
  approver_ids: string[];
  operators_enabled: boolean;
  draft_models: string[];
  utility_model: string;
  embedding_model: string;
  monthly_budget_inr: number;
  budget_alert_pcts: number[];
  hindi_switch_after: number;
  match_threshold: number;
  related_threshold: number;
  learn_threshold: number;
  house_style: string;
}
interface Contact {
  id: string;
  /** The team this number belongs to (copilot_teams.code). */
  purpose: string;
  person_name: string;
  phone: string;
  days: number[];
  available_from: string | null;
  available_to: string | null;
  priority: number;
  is_active: boolean;
  notes: string | null;
}
interface DirUser { id: string; username: string | null; first_name: string | null; last_name: string | null }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MODEL_RE = /^[a-z0-9-]+\/[a-z0-9.-]+$/;
const userLabel = (u: DirUser) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.id.slice(0, 8);
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

function useConfig() {
  return useQuery({
    queryKey: ['copilot-config'],
    queryFn: async (): Promise<Config | null> => {
      const { data, error } = await supabase.from('copilot_config').select('*').eq('id', true).maybeSingle();
      if (error) throw error;
      return data ? {
        ...data,
        monthly_budget_inr: Number(data.monthly_budget_inr), match_threshold: Number(data.match_threshold),
        related_threshold: Number(data.related_threshold), learn_threshold: Number(data.learn_threshold),
      } : null;
    },
  });
}
function useContacts() {
  return useQuery({
    queryKey: ['copilot-contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase.from('copilot_contacts').select('*').order('purpose').order('priority').order('person_name');
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });
}
function useDirectory() {
  return useQuery({
    queryKey: ['copilot-user-directory'],
    queryFn: async (): Promise<DirUser[]> => {
      const { data, error } = await usersDirectory().select('id, username, first_name, last_name').order('first_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DirUser[];
    },
    staleTime: 5 * 60_000,
  });
}

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

const emptyContact = (purpose: string): Omit<Contact, 'id'> => ({ purpose, person_name: '', phone: '', days: [1, 2, 3, 4, 5, 6, 7], available_from: null, available_to: null, priority: 100, is_active: true, notes: null });

function ContactForm({ initial, teams, onCancel, onSave, saving }: { initial: Omit<Contact, 'id'> & { id?: string }; teams: TeamRow[]; onCancel: () => void; onSave: (c: Omit<Contact, 'id'> & { id?: string }) => void; saving: boolean }) {
  const [c, setC] = useState(initial);
  const [anyTime, setAnyTime] = useState(!initial.available_from);
  const phoneOk = PHONE_RE.test(c.phone.trim());
  // Active teams, plus the number's own team if it was switched off since (so the form still shows it).
  const choices = teams.filter((t) => t.active || t.code === initial.purpose);
  const valid = c.person_name.trim().length > 0 && phoneOk && c.days.length > 0 && (anyTime || (!!c.available_from && !!c.available_to))
    && teams.some((t) => t.code === c.purpose);
  const toggleDay = (d: number) => setC((x) => ({ ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d].sort() }));
  return (
    <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Team</Label>
          <Select value={c.purpose} onValueChange={(v) => setC((x) => ({ ...x, purpose: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a team" /></SelectTrigger>
            <SelectContent>
              {choices.map((t) => <SelectItem key={t.code} value={t.code} className="text-xs">{t.label}{t.active ? '' : ' (switched off)'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cc-name" className="text-xs">Person</Label>
          <Input id="cc-name" value={c.person_name} onChange={(e) => setC((x) => ({ ...x, person_name: e.target.value.slice(0, 80) }))} className="h-8 text-xs" placeholder="Name shown to approvers" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cc-phone" className="text-xs">Phone</Label>
          <Input id="cc-phone" value={c.phone} onChange={(e) => setC((x) => ({ ...x, phone: e.target.value.slice(0, 20) }))} className={`h-8 text-xs ${c.phone && !phoneOk ? 'border-destructive' : ''}`} placeholder="+91 98xxx xxxxx" inputMode="tel" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Days (IST)</Label>
        <div className="flex flex-wrap gap-1">
          {DAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => toggleDay(i + 1)} aria-pressed={c.days.includes(i + 1)}
              className={`h-7 rounded-md border px-2.5 text-xs ${c.days.includes(i + 1) ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-xs text-foreground">
          <Switch checked={anyTime} onCheckedChange={(v) => { setAnyTime(v); if (v) setC((x) => ({ ...x, available_from: null, available_to: null })); }} />
          Any time
        </label>
        {!anyTime && (
          <>
            <div className="space-y-1">
              <Label htmlFor="cc-from" className="text-xs">From</Label>
              <Input id="cc-from" type="time" value={hhmm(c.available_from)} onChange={(e) => setC((x) => ({ ...x, available_from: e.target.value || null }))} className="h-8 w-28 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-to" className="text-xs">To</Label>
              <Input id="cc-to" type="time" value={hhmm(c.available_to)} onChange={(e) => setC((x) => ({ ...x, available_to: e.target.value || null }))} className="h-8 w-28 text-xs" />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label htmlFor="cc-prio" className="text-xs">Order</Label>
          <Input id="cc-prio" type="number" min={1} max={999} value={c.priority} onChange={(e) => setC((x) => ({ ...x, priority: Math.max(1, Math.min(999, Number(e.target.value) || 100)) }))} className="h-8 w-20 text-xs" title="Lower comes first among people available at the same time" />
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground">
          <Switch checked={c.is_active} onCheckedChange={(v) => setC((x) => ({ ...x, is_active: v }))} />
          Active
        </label>
      </div>
      {!anyTime && c.available_from && c.available_to && c.available_from > c.available_to && (
        <p className="text-[11px] text-muted-foreground">Crosses midnight: available from {hhmm(c.available_from)} until {hhmm(c.available_to)} the next morning.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-8 text-xs" disabled={!valid || saving} onClick={() => onSave({ ...c, person_name: c.person_name.trim(), phone: c.phone.trim(), available_from: anyTime ? null : c.available_from, available_to: anyTime ? null : c.available_to })}>
          {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}Save contact
        </Button>
      </div>
    </div>
  );
}

/** Add or rename a team. The code (used in {contact:<code>}) is set once, from the first name, and never changes. */
function TeamForm({ initial, existing, saving, onCancel, onSave }: {
  initial: TeamRow | null; existing: TeamRow[]; saving: boolean; onCancel: () => void;
  onSave: (t: { code: string; label: string; description: string }) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const code = initial?.code ?? teamCode(label);
  const clash = !initial && existing.some((t) => t.code === code);
  const sameName = existing.some((t) => t.code !== initial?.code && t.label.trim().toLowerCase() === label.trim().toLowerCase());
  const valid = label.trim().length > 0 && !clash && !sameName && (!initial || label.trim() !== initial.label || description.trim() !== initial.description);
  return (
    <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="space-y-1">
          <Label htmlFor="ct-label" className="text-xs">Team name</Label>
          <Input id="ct-label" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} className="h-8 text-xs" placeholder="e.g. Payments team" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ct-desc" className="text-xs">What they handle <span className="text-muted-foreground">(the AI reads this)</span></Label>
          <Input id="ct-desc" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} className="h-8 text-xs" placeholder="e.g. Refunds and payment problems" />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        In replies: <span className="font-mono text-foreground">{`{contact:${code}}`}</span>{initial ? '' : ' — set now and kept, so saved replies keep working when you rename the team.'}
        {clash && <span className="text-destructive"> A team with this code already exists.</span>}
        {sameName && <span className="text-destructive"> Another team has this name.</span>}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-8 text-xs" disabled={!valid || saving} onClick={() => onSave({ code, label: label.trim(), description: description.trim() })}>
          {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}{initial ? 'Save team' : 'Add team'}
        </Button>
      </div>
    </div>
  );
}

export function CopilotPlaybookSettings() {
  const qc = useQueryClient();
  const { data: access, isLoading: accessLoading } = useCopilotAccess();
  const isApprover = !!access?.is_approver;
  const { data: cfg, isLoading } = useConfig();
  const { data: contacts = [] } = useContacts();
  const { data: users = [] } = useDirectory();
  const { data: teams = [] } = useCopilotTeams(isApprover);

  const [budget, setBudget] = useState('');
  const [style, setStyle] = useState('');
  const [models, setModels] = useState<string[]>(['', '']);
  const [utility, setUtility] = useState('');
  const [thresholds, setThresholds] = useState({ match: '', related: '', learn: '' });
  const [editing, setEditing] = useState<(Omit<Contact, 'id'> & { id?: string }) | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [approverOpen, setApproverOpen] = useState(false);
  const [teamEditing, setTeamEditing] = useState<TeamRow | 'new' | null>(null);

  useEffect(() => {
    if (!cfg) return;
    setBudget(String(Math.round(cfg.monthly_budget_inr)));
    setStyle(cfg.house_style);
    setModels([cfg.draft_models[0] ?? '', cfg.draft_models[1] ?? '']);
    setUtility(cfg.utility_model);
    setThresholds({ match: String(cfg.match_threshold), related: String(cfg.related_threshold), learn: String(cfg.learn_threshold) });
  }, [cfg]);

  const updateConfig = useMutation({
    mutationFn: async (patch: TablesUpdate<'copilot_config'>) => {
      const { error } = await supabase.from('copilot_config').update(patch).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['copilot-config'] }); qc.invalidateQueries({ queryKey: ['copilot-access'] }); toast.success('Copilot settings saved'); },
    onError: (e: Error) => toast.error(e?.message || 'Could not save'),
  });
  const saveContact = useMutation({
    mutationFn: async (c: Omit<Contact, 'id'> & { id?: string }) => {
      const { id, ...row } = c;
      const { error } = id
        ? await supabase.from('copilot_contacts').update(row as TablesUpdate<'copilot_contacts'>).eq('id', id)
        : await supabase.from('copilot_contacts').insert(row as TablesInsert<'copilot_contacts'>);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['copilot-contacts'] }); setEditing(null); toast.success('Contact saved'); },
    onError: (e: Error) => toast.error(e?.message || 'Could not save the contact'),
  });
  const saveTeam = useMutation({
    mutationFn: async ({ t, isNew }: { t: { code: string; label: string; description: string }; isNew: boolean }) => {
      if (isNew) await copilotAdmin.addTeam(t);
      else await copilotAdmin.updateTeam(t.code, { label: t.label, description: t.description });
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['copilot-teams'] }); setTeamEditing(null); toast.success(v.isNew ? 'Team added' : 'Team saved'); },
    onError: (e: Error) => toast.error(e?.message || 'Could not save the team'),
  });
  const toggleTeam = useMutation({
    mutationFn: async ({ code, active }: { code: string; active: boolean }) => copilotAdmin.updateTeam(code, { active }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['copilot-teams'] }); toast.success(v.active ? 'Team switched on' : 'Team switched off', { description: v.active ? undefined : 'Replies stop giving its number; its contacts are kept.' }); },
    onError: (e: Error) => toast.error(e?.message || 'Could not change the team'),
  });
  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('copilot_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['copilot-contacts'] }); toast.success('Contact removed'); },
    onError: (e: Error) => toast.error(e?.message || 'Could not remove the contact'),
  });

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  // Numbers grouped the way the teams are listed, then by their order.
  const sortedContacts = useMemo(() => {
    const rank = new Map(teams.map((t, i) => [t.code, t.sort * 1000 + i]));
    return [...contacts].sort((a, b) => (rank.get(a.purpose) ?? 1e9) - (rank.get(b.purpose) ?? 1e9) || a.priority - b.priority || a.person_name.localeCompare(b.person_name));
  }, [contacts, teams]);
  const onPlaybookPage = useLocation().pathname.startsWith('/terminal/playbook');
  const now = new Date();

  if (accessLoading || isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  if (!isApprover || !cfg) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Copilot settings are managed by the Copilot approvers. Operators see no AI suggestions.
        </CardContent>
      </Card>
    );
  }

  const spent = access?.budget?.spent_inr ?? 0;
  const limit = cfg.monthly_budget_inr;
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 100;
  const approved = access?.approved_entries ?? 0;
  const budgetValid = /^\d{1,7}$/.test(budget) && Number(budget) >= 0;
  const modelsValid = models.filter(Boolean).length >= 1 && models.filter(Boolean).every((m) => MODEL_RE.test(m)) && MODEL_RE.test(utility);
  const th = { match: Number(thresholds.match), related: Number(thresholds.related), learn: Number(thresholds.learn) };
  const thValid = th.match >= 0.5 && th.match <= 0.99 && th.related >= 0.3 && th.related <= th.match && th.learn >= 0.3 && th.learn <= 0.95;

  const toggleApprover = (id: string) => {
    const next = cfg.approver_ids.includes(id) ? cfg.approver_ids.filter((x) => x !== id) : [...cfg.approver_ids, id];
    if (next.length === 0) { toast.error('Keep at least one approver'); return; }
    updateConfig.mutate({ approver_ids: next });
  };

  return (
    <div className="space-y-4">
      <Section icon={<BookOpen className="h-4 w-4 text-primary" />} title="AI Copilot — Playbook"
        description="Approvers see suggestions in the order chat. Approved Playbook replies come first; AI drafts only for a chat an approver has open. Sending or approving a suggestion saves it to the Playbook. Operators see no AI.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-secondary/30 p-3">
            <p className="text-[11px] text-muted-foreground">Approved replies</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">{approved}</p>
            <p className="text-[11px] text-muted-foreground">{approved >= 50 ? 'Enough to plan replies for operators' : `${50 - approved} more before operators can be considered`}</p>
          </div>
          <div className="rounded-md border border-border bg-secondary/30 p-3">
            <p className="text-[11px] text-muted-foreground">Open in the Playbook inbox</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">{access?.open_inbox ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">Conflicts and tentative replies to review</p>
          </div>
          <div className="rounded-md border border-border bg-secondary/30 p-3">
            <p className="text-[11px] text-muted-foreground">AI spend this month</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">₹{Math.round(spent).toLocaleString('en-IN')}</p>
            <Progress value={pct} className="mt-1 h-1.5" />
            <p className="mt-1 text-[11px] text-muted-foreground">of ₹{Math.round(limit).toLocaleString('en-IN')} · alerts at {cfg.budget_alert_pcts.join('% and ')}%</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Operators: off. Approved replies for operators (no AI) are a separate step after about 50 approved replies.</p>
        {!onPlaybookPage && (
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/terminal/playbook">Open the Playbook — inbox, questions and stats<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
          </Button>
        )}
      </Section>

      <Section icon={<Users className="h-4 w-4 text-primary" />} title="Approvers" description="Only these people see AI drafts, and only what they send, approve or save goes into the Playbook.">
        <div className="flex flex-wrap items-center gap-1.5">
          {cfg.approver_ids.map((id) => (
            <span key={id} className="inline-flex h-7 items-center rounded-full border border-primary/30 bg-primary/10 px-3 text-xs text-primary">
              {userById.get(id) ? userLabel(userById.get(id)!) : id.slice(0, 8)}
            </span>
          ))}
          <Popover open={approverOpen} onOpenChange={setApproverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">Change <ChevronDown className="ml-1 h-3 w-3" /></Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
                {users.map((u) => (
                  <button key={u.id} type="button" onClick={() => toggleApprover(u.id)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-secondary/80">
                    <input type="checkbox" readOnly checked={cfg.approver_ids.includes(u.id)} className="accent-primary" />
                    <span className="truncate text-xs text-foreground">{userLabel(u)}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </Section>

      <Section icon={<Building2 className="h-4 w-4 text-primary" />} title="Teams"
        description="Who a reply can send the client to. Replies name a team, never a person: {contact:kyc} becomes the number of the KYC team member available now. A new client still in verification gets the KYC team; once KYC is done, the Relationship team. A number is given only when the client asks for one.">
        <div className="space-y-1.5">
          {teams.map((t) => (
            teamEditing !== 'new' && teamEditing?.code === t.code ? (
              <TeamForm key={t.code} initial={t} existing={teams} saving={saveTeam.isPending} onCancel={() => setTeamEditing(null)} onSave={(x) => saveTeam.mutate({ t: x, isNew: false })} />
            ) : (
              <div key={t.code} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 ${t.active ? 'bg-secondary/20' : 'bg-transparent opacity-70'}`}>
                <span className="min-w-[7rem] text-xs font-medium text-foreground">{t.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{`{contact:${t.code}}`}</span>
                <span className="min-w-0 flex-1 basis-48 text-[11px] text-muted-foreground">{t.description || 'No description'}</span>
                {(() => {
                  const n = contacts.filter((c) => c.purpose === t.code && c.is_active).length;
                  return n ? <span className="text-[11px] tabular-nums text-muted-foreground">{n} {n === 1 ? 'number' : 'numbers'}</span>
                    : <span className={`text-[11px] ${t.active ? 'text-warning' : 'text-muted-foreground'}`}>No number yet</span>;
                })()}
                <span className="ml-auto flex items-center gap-1">
                  <Switch checked={t.active} disabled={toggleTeam.isPending} onCheckedChange={(v) => toggleTeam.mutate({ code: t.code, active: v })} aria-label={`${t.active ? 'Switch off' : 'Switch on'} ${t.label}`} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTeamEditing(t)} aria-label={`Rename ${t.label}`}><Pencil className="h-3.5 w-3.5" /></Button>
                </span>
              </div>
            )
          ))}
        </div>
        {teamEditing === 'new' ? (
          <TeamForm initial={null} existing={teams} saving={saveTeam.isPending} onCancel={() => setTeamEditing(null)} onSave={(x) => saveTeam.mutate({ t: x, isNew: true })} />
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setTeamEditing('new')}><Plus className="mr-1 h-3.5 w-3.5" />Add team</Button>
        )}
      </Section>

      <Section icon={<Phone className="h-4 w-4 text-primary" />} title="Company contact numbers"
        description="The Copilot never types a phone number. When a reply gives a team's number, it uses one of these — the person available now (IST) first, then by order.">
        {contacts.length === 0 && !editing && <p className="text-xs text-muted-foreground">No contact numbers yet. Replies that need one will show a reminder.</p>}
        <div className="space-y-1.5">
          {sortedContacts.map((c) => (
            editing?.id === c.id ? null : (
              <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-secondary/20 px-3 py-2">
                <span className="w-28 shrink-0 truncate text-[11px] font-medium text-muted-foreground">{teamLabel(c.purpose, teams)}</span>
                <span className="min-w-0 truncate text-xs font-medium text-foreground">{c.person_name}</span>
                <span className="text-xs tabular-nums text-foreground">{c.phone}</span>
                <span className="text-[11px] text-muted-foreground">
                  {c.days.length === 7 ? 'Every day' : c.days.map((d) => DAYS[d - 1]).join(' ')} · {c.available_from ? `${hhmm(c.available_from)}–${hhmm(c.available_to)}` : 'any time'}
                </span>
                {!c.is_active ? <span className="text-[11px] text-muted-foreground">Inactive</span>
                  : contactAvailableNow(c, now) ? <span className="text-[11px] text-trade-buy">Available now</span>
                  : <span className="text-[11px] text-muted-foreground">Not available now</span>}
                <span className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing({ ...c })} aria-label={`Edit ${c.person_name}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(c)} aria-label={`Remove ${c.person_name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </span>
              </div>
            )
          ))}
        </div>
        {editing ? (
          <ContactForm initial={editing} teams={teams} saving={saveContact.isPending} onCancel={() => setEditing(null)} onSave={(c) => saveContact.mutate(c)} />
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={!teams.some((t) => t.active)}
            onClick={() => setEditing(emptyContact(teams.find((t) => t.active)?.code ?? 'kyc'))}><Plus className="mr-1 h-3.5 w-3.5" />Add contact</Button>
        )}
      </Section>

      <Section icon={<Wallet className="h-4 w-4 text-primary" />} title="AI budget" description="AI drafting stops when the month's spend reaches the cap; approved Playbook replies keep working.">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="cp-budget" className="text-xs">Monthly cap (₹)</Label>
            <Input id="cp-budget" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, '').slice(0, 7))} className="h-8 w-36 text-xs" inputMode="numeric" />
          </div>
          <Button size="sm" className="h-8 text-xs" disabled={!budgetValid || Number(budget) === Math.round(cfg.monthly_budget_inr) || updateConfig.isPending}
            onClick={() => updateConfig.mutate({ monthly_budget_inr: Number(budget) })}>Save</Button>
        </div>
      </Section>

      <Section icon={<Languages className="h-4 w-4 text-primary" />} title="Language" description="Replies are in English. The Copilot switches to Hindi (in English letters) only when the client keeps writing in Hindi after this many of our English replies, and switches back if the client returns to English.">
        <div className="flex gap-2">
          {[2, 3].map((n) => (
            <Button key={n} variant={cfg.hindi_switch_after === n ? 'default' : 'outline'} size="sm" className="h-8 text-xs" disabled={updateConfig.isPending}
              onClick={() => cfg.hindi_switch_after !== n && updateConfig.mutate({ hindi_switch_after: n })}>
              After {n} English replies
            </Button>
          ))}
        </div>
      </Section>

      <Section icon={<Cpu className="h-4 w-4 text-primary" />} title="Models" description="Two models draft side by side so you can compare them. Use the exact Lovable AI Gateway model IDs.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-1">
              <Label htmlFor={`cp-model-${i}`} className="text-xs">Draft model {i === 0 ? 'A' : 'B'}{i === 1 && <span className="text-muted-foreground"> (optional)</span>}</Label>
              <Input id={`cp-model-${i}`} value={models[i]} onChange={(e) => setModels((m) => { const n = [...m]; n[i] = e.target.value.trim(); return n; })} className="h-8 font-mono text-xs" />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="cp-utility" className="text-xs">Saving and translation model</Label>
            <Input id="cp-utility" value={utility} onChange={(e) => setUtility(e.target.value.trim())} className="h-8 font-mono text-xs" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Question matching: <span className="font-mono">{cfg.embedding_model}</span></p>
        <details className="group">
          <summary className="cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">Matching thresholds (advanced)</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {([['match', 'Show as approved reply (no AI)'], ['related', 'Show as related'], ['learn', 'Compare when saving']] as const).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`cp-th-${k}`} className="text-xs">{label}</Label>
                <Input id={`cp-th-${k}`} value={thresholds[k]} onChange={(e) => setThresholds((t) => ({ ...t, [k]: e.target.value.replace(/[^\d.]/g, '').slice(0, 4) }))} className="h-8 w-24 text-xs" inputMode="decimal" />
              </div>
            ))}
          </div>
        </details>
        <Button size="sm" className="h-8 text-xs" disabled={!modelsValid || !thValid || updateConfig.isPending}
          onClick={() => updateConfig.mutate({ draft_models: models.filter(Boolean), utility_model: utility, match_threshold: th.match, related_threshold: th.related, learn_threshold: th.learn })}>
          Save models
        </Button>
      </Section>

      <Section icon={<BookOpen className="h-4 w-4 text-primary" />} title="House style" description="Every AI draft follows this. Keep it short and specific.">
        <Textarea value={style} onChange={(e) => setStyle(e.target.value.slice(0, 4000))} rows={10} className="font-mono text-xs leading-relaxed" />
        <div className="flex justify-end">
          <Button size="sm" className="h-8 text-xs" disabled={!style.trim() || style === cfg.house_style || updateConfig.isPending} onClick={() => updateConfig.mutate({ house_style: style.trim() })}>Save house style</Button>
        </div>
      </Section>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.person_name}?</AlertDialogTitle>
            <AlertDialogDescription>The Copilot will stop offering this number. Replies already sent are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) deleteContact.mutate(deleting.id); setDeleting(null); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
