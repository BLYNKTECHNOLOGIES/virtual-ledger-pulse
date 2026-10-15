// Copilot v2 Playbook page (approvers only): inbox, questions with their situation replies, history and stats.
// The tables' access rules let only Copilot approvers read or change these rows; decisions that touch several
// rows go through database functions (copilot_inbox_decide, copilot_resolve_conflict, copilot_add_question,
// copilot_set_order_situation).
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables } from '@/integrations/supabase/types';
import { usersDirectory } from '@/lib/usersDirectory';
import type { ModelStats, Scope } from '@/lib/copilot/playbookAdmin';
import type { SituationRow } from '@/lib/copilot/situations';
import { copilotIndex, copilotTranslate } from '@/hooks/useCopilotPlaybook';

/** Columns added in CP-4 may be newer than the generated types; these rows carry them explicitly. */
export type EntryRow = Tables<'copilot_playbook_entries'> & { topic_id: string; reply_en_stale: boolean; reply_hi_stale: boolean };
export type InboxRow = Tables<'copilot_inbox_items'>;
export type VersionRow = Tables<'copilot_playbook_versions'>;
export interface QuestionRow {
  id: string; topic_id: string; entry_id: string | null; question_text: string; language: string; source: string;
  embedding_model: string | null; created_by: string | null; created_at: string;
}
export interface TopicRow { id: string; title: string; seed_batch: string | null; created_at: string; updated_at: string }
export interface ExampleRow {
  id: string; entry_id: string; situation: string | null; chat: Array<{ from: string; text: string; at?: string }>; source: 'seed' | 'chat';
  order_number: string | null; created_by: string | null; created_at: string; embedding_model: string | null;
}
export interface TeamRow { code: string; label: string; description: string; sort: number; active: boolean }
export type TopicWithReplies = TopicRow & { replies: EntryRow[]; phrasings: number };

// The vector columns are never selected: they are large and only the server needs them.
const QUESTION_COLS = 'id, topic_id, entry_id, question_text, language, source, embedding_model, created_by, created_at';
const EXAMPLE_COLS = 'id, entry_id, situation, chat, source, order_number, created_by, created_at, embedding_model';

type RpcResult<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
// Functions and tables newer than the generated types; this narrow view keeps the calls typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Untyped = { rpc: <T>(fn: string, args?: Record<string, unknown>) => RpcResult<T>; from: (table: string) => any };
const untyped = supabase as unknown as Untyped;

async function must<T>(p: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export function useCopilotSituations(enabled = true) {
  return useQuery({
    queryKey: ['copilot-situations'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => must<SituationRow[]>(untyped.from('copilot_situations').select('code, side, label, description, detectable, sort, active').order('sort')),
  });
}

export function useCopilotTeams(enabled = true) {
  return useQuery({
    queryKey: ['copilot-teams'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => must<TeamRow[]>(untyped.from('copilot_teams').select('code, label, description, sort, active').order('sort').order('code')),
  });
}

export interface InboxData {
  items: InboxRow[];
  entries: Map<string, EntryRow>;
  topics: Map<string, TopicRow>;
  /** Every reply of the items' questions (to compare situations). */
  siblings: Map<string, EntryRow[]>;
  questions: Map<string, QuestionRow[]>;
  examples: Map<string, ExampleRow[]>;
}

export function useCopilotInbox(enabled: boolean) {
  return useQuery({
    queryKey: ['copilot-inbox'],
    enabled,
    queryFn: async (): Promise<InboxData> => {
      const items = await must(supabase.from('copilot_inbox_items').select('*').eq('status', 'open')
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(500));
      const ids = [...new Set(items.flatMap((i) => [i.entry_id, i.other_entry_id]).filter((x): x is string => !!x))];
      const entries = ids.length ? await must<EntryRow[]>(untyped.from('copilot_playbook_entries').select('*').in('id', ids)) : [];
      const topicIds = [...new Set(entries.map((e) => e.topic_id))];
      const [topics, siblings, questions] = topicIds.length
        ? await Promise.all([
          must<TopicRow[]>(untyped.from('copilot_playbook_topics').select('id, title, seed_batch, created_at, updated_at').in('id', topicIds)),
          must<EntryRow[]>(untyped.from('copilot_playbook_entries').select('*').in('topic_id', topicIds).neq('status', 'retired').order('created_at')),
          must<QuestionRow[]>(untyped.from('copilot_playbook_questions').select(QUESTION_COLS).in('topic_id', topicIds).order('created_at', { ascending: true })),
        ])
        : [[], [], []];
      const allEntryIds = [...new Set([...ids, ...siblings.map((e) => e.id)])];
      const examples = allEntryIds.length
        ? await must<ExampleRow[]>(untyped.from('copilot_playbook_examples').select(EXAMPLE_COLS).in('entry_id', allEntryIds).order('created_at', { ascending: false }).limit(500))
        : [];
      const group = <T, K extends string>(rows: T[], key: (r: T) => K) => {
        const m = new Map<K, T[]>();
        for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
        return m;
      };
      return {
        items,
        entries: new Map([...entries, ...siblings].map((e) => [e.id, e])),
        topics: new Map(topics.map((t) => [t.id, t])),
        siblings: group(siblings, (e) => e.topic_id),
        questions: group(questions, (q) => q.topic_id),
        examples: group(examples, (x) => x.entry_id),
      };
    },
  });
}

export function useCopilotTopics(enabled: boolean) {
  return useQuery({
    queryKey: ['copilot-topics'],
    enabled,
    queryFn: async (): Promise<TopicWithReplies[]> => {
      const [topics, entries] = await Promise.all([
        must<Array<TopicRow & { copilot_playbook_questions: Array<{ count: number }> | null }>>(
          untyped.from('copilot_playbook_topics').select('id, title, seed_batch, created_at, updated_at, copilot_playbook_questions(count)').limit(2000)),
        must<EntryRow[]>(untyped.from('copilot_playbook_entries').select('*').order('created_at').limit(5000)),
      ]);
      const byTopic = new Map<string, EntryRow[]>();
      for (const e of entries) byTopic.set(e.topic_id, [...(byTopic.get(e.topic_id) ?? []), e]);
      return topics.map(({ copilot_playbook_questions: qc, ...t }) => ({
        ...t, replies: byTopic.get(t.id) ?? [], phrasings: Number(qc?.[0]?.count ?? 0),
      }));
    },
  });
}

export interface TopicDetail {
  topic: TopicRow | null;
  replies: EntryRow[];
  questions: QuestionRow[];
  versions: VersionRow[];
  examples: ExampleRow[];
}

/** One question with all its replies; opened from a reply (entry id) or the question itself. */
export function useCopilotTopicDetail(ref: { entryId?: string | null; topicId?: string | null } | null) {
  return useQuery({
    queryKey: ['copilot-topic-detail', ref?.entryId ?? null, ref?.topicId ?? null],
    enabled: !!(ref?.entryId || ref?.topicId),
    queryFn: async (): Promise<TopicDetail> => {
      let topicId = ref?.topicId ?? null;
      if (!topicId && ref?.entryId) {
        const e = await must<{ topic_id: string } | null>(untyped.from('copilot_playbook_entries').select('topic_id').eq('id', ref.entryId).maybeSingle());
        topicId = e?.topic_id ?? null;
      }
      if (!topicId) return { topic: null, replies: [], questions: [], versions: [], examples: [] };
      const [topic, replies, questions] = await Promise.all([
        must<TopicRow | null>(untyped.from('copilot_playbook_topics').select('id, title, seed_batch, created_at, updated_at').eq('id', topicId).maybeSingle()),
        must<EntryRow[]>(untyped.from('copilot_playbook_entries').select('*').eq('topic_id', topicId).order('created_at')),
        must<QuestionRow[]>(untyped.from('copilot_playbook_questions').select(QUESTION_COLS).eq('topic_id', topicId).order('created_at', { ascending: true })),
      ]);
      const ids = replies.map((r) => r.id);
      const [versions, examples] = ids.length
        ? await Promise.all([
          must<VersionRow[]>(supabase.from('copilot_playbook_versions').select('*').in('entry_id', ids).order('version', { ascending: false }).limit(300)),
          must<ExampleRow[]>(untyped.from('copilot_playbook_examples').select(EXAMPLE_COLS).in('entry_id', ids).order('created_at', { ascending: false }).limit(300)),
        ])
        : [[], []];
      return { topic, replies, questions, versions, examples };
    },
  });
}

export interface CopilotStats {
  days: number;
  entries: { approved: number; tentative: number; expired: number; retired: number; conflicts: number; uses: number; questions?: number; outdated_copies?: number };
  coverage: { questions: number; approved: number; tentative: number };
  situations?: { checked: number; corrected: number; changes: Array<{ detected: string | null; set: string; n: number }> };
  models: ModelStats[];
  model_errors: number;
  spend: { month_inr: number; limit_inr: number; alert_pcts: number[]; by_day: Array<{ day: string; inr: number }>; by_purpose: Record<string, number> };
  learning: { by_action: Record<string, number>; undone: number };
  recent: Array<{ id: string; at: string; user_id: string; action: string; cause: string; entry_id: string | null; title: string | null; order_number: string | null; undone: boolean }>;
}

export function useCopilotStats(days: number, enabled: boolean) {
  return useQuery({
    queryKey: ['copilot-stats', days],
    enabled,
    staleTime: 30_000,
    queryFn: () => must(untyped.rpc<CopilotStats>('copilot_stats', { p_days: days })),
  });
}

export interface DirUser { id: string; username: string | null; first_name: string | null; last_name: string | null }
export const userLabel = (u: DirUser | undefined, id?: string | null) =>
  u ? ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.id.slice(0, 8)) : (id ? 'Someone' : 'System');

export function useUserNames() {
  return useQuery({
    queryKey: ['copilot-user-directory'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DirUser[]> => {
      const { data, error } = await usersDirectory().select('id, username, first_name, last_name').order('first_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DirUser[];
    },
  });
}

/** Refreshes every Copilot view after a change (inbox counts, questions, stats, sidebar badge). */
export function useRefreshCopilot() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of ['copilot-inbox', 'copilot-topics', 'copilot-topic-detail', 'copilot-stats', 'copilot-access', 'copilot-entry', 'copilot-teams']) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);
}

export interface ReplyPatch {
  reply_en?: string | null; reply_hi?: string | null; reply_en_auto?: boolean; reply_hi_auto?: boolean;
  reply_en_stale?: boolean; reply_hi_stale?: boolean; internal_note?: string | null; risk?: string; scope?: Scope; title?: string;
}

export const copilotAdmin = {
  /** One reply (for the quick edit opened from the chat). Replies have no vector columns, so all columns are read. */
  getEntry: (id: string) => must<EntryRow | null>(untyped.from('copilot_playbook_entries').select('*').eq('id', id).maybeSingle()),
  decideSeed: (itemId: string, decision: 'approve' | 'reject') =>
    must(untyped.rpc<{ entry_status: string | null }>('copilot_inbox_decide', { p_item_id: itemId, p_decision: decision })),
  /** Approve, retire or restore a reply; its open inbox items close in the same step (database function). */
  setEntryStatus: (entryId: string, status: 'approved' | 'retired') =>
    must(untyped.rpc<{ changed: boolean; closed_items: number }>('copilot_set_entry_status', { p_entry_id: entryId, p_status: status })),
  resolveConflict: (itemId: string, keep: 'new' | 'old' | 'both') =>
    must(supabase.rpc('copilot_resolve_conflict', { p_item_id: itemId, p_keep: keep })),
  updateEntry: async (id: string, patch: ReplyPatch) => {
    const { error } = await untyped.from('copilot_playbook_entries').update({ ...patch, scope: patch.scope as Json | undefined }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  /** A reply for another situation in the same question (approved: an approver writes it). */
  addReply: async (topic: { id: string; title: string }, fields: { reply_en: string | null; reply_hi: string | null; scope: Scope; kind?: string; step_key?: string | null }) => {
    const { data, error } = await untyped.from('copilot_playbook_entries').insert({
      topic_id: topic.id, title: topic.title, status: 'approved', source: 'manual', scope: fields.scope as Json,
      reply_en: fields.reply_en, reply_hi: fields.reply_hi, kind: fields.kind ?? 'reply', step_key: fields.step_key ?? null,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  },
  renameTopic: async (topicId: string, title: string) => {
    const { error } = await untyped.from('copilot_playbook_topics').update({ title }).eq('id', topicId);
    if (error) throw new Error(error.message);
  },
  addQuestion: (topicId: string, text: string, language: 'en' | 'hi') =>
    must(untyped.rpc<string | null>('copilot_add_question', { p_topic_id: topicId, p_text: text, p_language: language })),
  removeQuestion: async (id: string) => {
    const { error } = await untyped.from('copilot_playbook_questions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
  /** Makes new phrasings and example chats searchable now (repeats while more are waiting, at most 4 rounds). */
  indexAll: async () => {
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const r = await copilotIndex();
      total += r.indexed;
      if (!r.left) break;
    }
    return total;
  },
  translate: copilotTranslate,
  setSituation: (orderNumber: string, side: 'BUY' | 'SELL', code: string | null, detected: string | null) =>
    must(untyped.rpc<{ id: string; code: string | null }>('copilot_set_order_situation', { p_order_number: orderNumber, p_side: side, p_code: code, p_detected: detected })),
  addTeam: async (team: { code: string; label: string; description: string }) => {
    const { error } = await untyped.from('copilot_teams').insert(team);
    if (error) throw new Error(error.message);
  },
  updateTeam: async (code: string, patch: Partial<Pick<TeamRow, 'label' | 'description' | 'active'>>) => {
    const { error } = await untyped.from('copilot_teams').update(patch).eq('code', code);
    if (error) throw new Error(error.message);
  },
};

/** "Payments team" → "payments_team": a team's code for {contact:<code>} placeholders. */
export function teamCode(label: string): string {
  const base = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 't_$1');
  return (base || 'team').slice(0, 24);
}
