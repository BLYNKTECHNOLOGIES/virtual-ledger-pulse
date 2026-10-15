// Copilot v2 Playbook page (approvers only): inbox, entries, history and stats.
// The tables' access rules let only Copilot approvers read or change these rows; decisions that touch several
// rows go through database functions (copilot_inbox_decide, copilot_resolve_conflict, copilot_add_question).
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { usersDirectory } from '@/lib/usersDirectory';
import type { ModelStats } from '@/lib/copilot/playbookAdmin';

export type EntryRow = Tables<'copilot_playbook_entries'>;
export type InboxRow = Tables<'copilot_inbox_items'>;
export type VersionRow = Tables<'copilot_playbook_versions'>;
export type QuestionRow = Pick<Tables<'copilot_playbook_questions'>, 'id' | 'entry_id' | 'question_text' | 'language' | 'source' | 'embedding_model' | 'created_at'>;
export type EntryWithCount = EntryRow & { questions: number };

// The vector column is never selected: it is large and only the server needs it.
const QUESTION_COLS = 'id, entry_id, question_text, language, source, embedding_model, created_at';

type RpcResult<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
// Functions added in CP-3 can be newer than the generated types; this narrow view keeps the calls typed here.
const untyped = supabase as unknown as { rpc: <T>(fn: string, args?: Record<string, unknown>) => RpcResult<T> };

async function must<T>(p: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export interface InboxData {
  items: InboxRow[];
  entries: Map<string, EntryRow>;
  questions: Map<string, QuestionRow[]>;
}

export function useCopilotInbox(enabled: boolean) {
  return useQuery({
    queryKey: ['copilot-inbox'],
    enabled,
    queryFn: async (): Promise<InboxData> => {
      const items = await must(supabase.from('copilot_inbox_items').select('*').eq('status', 'open')
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(500));
      const ids = [...new Set(items.flatMap((i) => [i.entry_id, i.other_entry_id]).filter((x): x is string => !!x))];
      const [entries, questions] = ids.length
        ? await Promise.all([
          must(supabase.from('copilot_playbook_entries').select('*').in('id', ids)),
          must(supabase.from('copilot_playbook_questions').select(QUESTION_COLS).in('entry_id', ids).order('created_at', { ascending: true })),
        ])
        : [[], []];
      const qmap = new Map<string, QuestionRow[]>();
      for (const q of questions as QuestionRow[]) qmap.set(q.entry_id, [...(qmap.get(q.entry_id) ?? []), q]);
      return { items, entries: new Map((entries as EntryRow[]).map((e) => [e.id, e])), questions: qmap };
    },
  });
}

export function useCopilotEntries(enabled: boolean) {
  return useQuery({
    queryKey: ['copilot-entries'],
    enabled,
    queryFn: async (): Promise<EntryWithCount[]> => {
      const rows = await must(supabase.from('copilot_playbook_entries').select('*, copilot_playbook_questions(count)').order('updated_at', { ascending: false }).limit(2000));
      return rows.map(({ copilot_playbook_questions: qc, ...e }) => ({ ...(e as EntryRow), questions: Number((qc as Array<{ count: number }> | null)?.[0]?.count ?? 0) }));
    },
  });
}

export interface EntryDetail { entry: EntryRow | null; questions: QuestionRow[]; versions: VersionRow[] }

export function useCopilotEntryDetail(id: string | null) {
  return useQuery({
    queryKey: ['copilot-entry-detail', id],
    enabled: !!id,
    queryFn: async (): Promise<EntryDetail> => {
      const [entry, questions, versions] = await Promise.all([
        must(supabase.from('copilot_playbook_entries').select('*').eq('id', id!).maybeSingle()),
        must(supabase.from('copilot_playbook_questions').select(QUESTION_COLS).eq('entry_id', id!).order('created_at', { ascending: true })),
        must(supabase.from('copilot_playbook_versions').select('*').eq('entry_id', id!).order('version', { ascending: false }).limit(50)),
      ]);
      return { entry, questions: questions as QuestionRow[], versions };
    },
  });
}

export interface CopilotStats {
  days: number;
  entries: { approved: number; tentative: number; expired: number; retired: number; conflicts: number; uses: number };
  coverage: { questions: number; approved: number; tentative: number };
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

/** Refreshes every Copilot view after a change (inbox counts, entries, stats, sidebar badge). */
export function useRefreshCopilot() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of ['copilot-inbox', 'copilot-entries', 'copilot-entry-detail', 'copilot-stats', 'copilot-access', 'copilot-entry']) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);
}

export const copilotAdmin = {
  decideSeed: (itemId: string, decision: 'approve' | 'reject') =>
    must(untyped.rpc<{ entry_status: string | null }>('copilot_inbox_decide', { p_item_id: itemId, p_decision: decision })),
  /** Approve, retire or restore an entry; its open inbox items close in the same step (database function). */
  setEntryStatus: (entryId: string, status: 'approved' | 'retired') =>
    must(untyped.rpc<{ changed: boolean; closed_items: number }>('copilot_set_entry_status', { p_entry_id: entryId, p_status: status })),
  resolveConflict: (itemId: string, keep: 'new' | 'old' | 'both') =>
    must(supabase.rpc('copilot_resolve_conflict', { p_item_id: itemId, p_keep: keep })),
  updateEntry: async (id: string, patch: TablesUpdate<'copilot_playbook_entries'>) => {
    const { error } = await supabase.from('copilot_playbook_entries').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },
  addQuestion: (entryId: string, text: string, language: 'en' | 'hi') =>
    must(untyped.rpc<string | null>('copilot_add_question', { p_entry_id: entryId, p_text: text, p_language: language })),
  removeQuestion: async (id: string) => {
    const { error } = await supabase.from('copilot_playbook_questions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
