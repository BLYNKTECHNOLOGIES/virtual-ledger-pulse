import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

export interface CopilotSettings {
  id: string;
  enabled: boolean;
  operator_allowlist: string[];
  trainer_allowlist: string[];
  suggestion_count: number;
  auto_suggest: boolean;
  train_watermark: string | null;
  exemplar_count: number;
  account_notes?: Record<string, string>;
  stats?: Record<string, any>;
}

/** Fetch the singleton copilot settings row (cached ~5min). */
export function useCopilotSettings() {
  return useQuery({
    queryKey: ['copilot-settings'],
    queryFn: async (): Promise<CopilotSettings | null> => {
      const { data, error } = await supabase
        .from('copilot_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as CopilotSettings | null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** True when copilot is enabled AND the current terminal user may see suggestions. */
export function useCopilotVisible() {
  const { userId } = useTerminalAuth();
  const { data: settings } = useCopilotSettings();
  return Boolean(
    settings?.enabled && userId && (settings.operator_allowlist || []).includes(userId)
  );
}

/** True when copilot is enabled AND the current terminal user prefetches suggestions (auto_suggest). */
export function useCopilotPrefetch() {
  const { userId } = useTerminalAuth();
  const { data: settings } = useCopilotSettings();
  return Boolean(
    settings?.enabled && settings?.auto_suggest && userId &&
    (settings.operator_allowlist || []).includes(userId)
  );
}

/** True when the current terminal user is a copilot trainer (teach controls). */
export function useCopilotIsTrainer() {
  const { userId } = useTerminalAuth();
  const { data: settings } = useCopilotSettings();
  return Boolean(userId && (settings?.trainer_allowlist || []).includes(userId));
}

export interface CopilotSuggestInput {
  order: {
    number?: string | null;
    side?: string | null;
    asset?: string | null;
    fiat?: string | null;
    amount?: number | string | null;
    price?: number | string | null;
    status?: string | null;
    timeRemaining?: string | number | null;
  };
  clientProfile: {
    pastOrders?: number | null;
    appeals?: number | null;
    name?: string | null;
  };
  messages: Array<{ isSelf: boolean; text: string; time?: string }>;
  exchangeAccountId?: string | null;
  accountLabel?: string | null;
  counterpartyNickname?: string | null;
}

export interface CopilotSuggestResult {
  situation: string;
  suggestions: string[];
  exemplarIds: string[];
}

/** Calls copilot-suggest. ALL context is passed in by the client (no server lookups). */
export async function fetchCopilotSuggestions(
  input: CopilotSuggestInput
): Promise<CopilotSuggestResult> {
  const { data, error } = await supabase.functions.invoke('copilot-suggest', {
    body: input,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return {
    situation: data?.situation || 'other',
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
    exemplarIds: Array.isArray(data?.exemplarIds) ? data.exemplarIds : [],
  };
}

/** Fire-and-forget: log shown suggestions; returns per-suggestion log row ids. */
export async function logSuggestionsShown(params: {
  orderNumber?: string | null;
  exchangeAccountId?: string | null;
  operatorId?: string | null;
  situation: string;
  suggestions: string[];
  exemplarIds: string[];
}): Promise<string[]> {
  try {
    const rows = params.suggestions.map((s) => ({
      order_number: params.orderNumber ?? null,
      exchange_account_id: params.exchangeAccountId ?? null,
      operator_id: params.operatorId ?? null,
      situation_class: params.situation,
      suggestion_text: s,
      exemplar_ids: params.exemplarIds,
      status: 'shown',
    }));
    if (rows.length === 0) return [];
    const { data, error } = await supabase.from('copilot_suggestion_log').insert(rows).select('id');
    if (error) return [];
    return (data || []).map((r: any) => r.id);
  } catch { return []; }
}

/** Fire-and-forget: mark a shown suggestion as inserted when the operator clicks it. */
export async function markSuggestionInserted(logId: string): Promise<void> {
  try { await supabase.from('copilot_suggestion_log').update({ status: 'inserted' }).eq('id', logId); }
  catch { /* non-fatal */ }
}

export interface CopilotTeachItem {
  id: string;
  reply_text?: string;
  pattern_text?: string;
  situation_class?: string;
  exchange_account_id?: string | null;
}

/** Trainer teach controls via copilot-teach edge function. */
export async function copilotTeach(action: string, payload: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('copilot-teach', {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
