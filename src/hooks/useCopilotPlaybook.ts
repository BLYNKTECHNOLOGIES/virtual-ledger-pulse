// Copilot v2 (Playbook): access, suggestions and auto-save calls for the Terminal chat panel.
// copilot_my_access feeds the screen; every Copilot gate in the UI reads it (the server checks again).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import type { TemplateOrderValues } from '@/lib/fill-template';
import type { LearnResult, PickedContacts } from '@/lib/copilot/copilotText';

export interface CopilotAccess {
  is_approver: boolean;
  operators_enabled: boolean;
  hindi_switch_after?: number;
  budget?: { limit_inr: number; spent_inr: number; alert_pcts: number[] };
  approved_entries?: number;
  open_inbox?: number;
}

export function useCopilotAccess() {
  const { userId } = useTerminalAuth();
  return useQuery({
    queryKey: ['copilot-access', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<CopilotAccess> => {
      const { data, error } = await supabase.rpc('copilot_my_access');
      if (error) throw error;
      return ((data as unknown as CopilotAccess | null) ?? { is_approver: false, operators_enabled: false });
    },
  });
}

export interface CopilotRisk { code: string; label: string; level: 'amber' | 'red' }
export interface CopilotContext {
  side: 'BUY' | 'SELL' | null;
  status: string;
  category: 'small' | 'regular';
  account: string | null;
  client_state: 'new' | 'linked' | 'approved';
  kyc_status: string | null;
  address: 'sir' | 'maam';
  language: 'en' | 'hi';
  language_reason: string;
  risks: CopilotRisk[];
}
export interface PlaybookSuggestion {
  entryId: string;
  title: string;
  status: 'approved' | 'tentative';
  conflict: boolean;
  similarity: number;
  text: string;
  language: 'en' | 'hi';
  machineTranslated: boolean;
  missingLanguage: boolean;
  risk: string;
  note: string | null;
  version: number;
}
export interface AiDraft {
  callId: string | null;
  model: string;
  label: string;
  text: string;
  newPolicy: boolean;
  note: string;
  flags: string[];
  blocked: boolean;
  blockedReasons: string[];
  contacts: string[];
  language: 'en' | 'hi';
}
export interface DraftResponse {
  status: 'ready' | 'capped' | 'nothing_to_answer' | 'pending';
  skippedReason?: string | null;
  context: CopilotContext;
  question?: { text: string; language: 'en' | 'hi' } | null;
  playbook: PlaybookSuggestion[];
  related: PlaybookSuggestion[];
  drafts: AiDraft[];
  contacts?: PickedContacts;
  missingContacts?: string[];
  budget?: { spentInr: number; limitInr: number; pct: number; alertPct: number | null; capped: boolean };
  requestId?: string | null;
  cached?: boolean;
  /** How many draft models failed this time (0 when all answered). */
  aiFailed?: number;
}
export interface OrderHint {
  tradeType?: string | null;
  status?: string | null;
  totalPrice?: number | string | null;
  asset?: string | null;
  payMethod?: string | null;
  latest?: { id: string; text: string } | null;
}

export class CopilotError extends Error {
  constructor(message: string, public code: string | null, public status: number) { super(message); }
}

async function invoke<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let payload: { message?: string; error?: string } | null = null;
    try { payload = ctx && typeof ctx.json === 'function' ? await ctx.clone().json() : null; } catch { /* not JSON */ }
    throw new CopilotError(payload?.message || payload?.error || error.message || 'Request failed', payload?.error ?? null, ctx?.status ?? 0);
  }
  return data as T;
}

/** Suggestions for an open chat. A chat state already being drafted (by either approver) is waited for, not paid twice. */
export async function copilotDraft(
  body: { orderNumber: string; exchangeAccountId?: string | null; mode?: 'suggest' | 'redraft' | 'force'; instruction?: string | null; hint?: OrderHint },
  isCancelled: () => boolean = () => false,
): Promise<DraftResponse> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const data = await invoke<DraftResponse>('copilot-draft', body);
    if (data?.status !== 'pending') return data;
    if (isCancelled()) throw new CopilotError('cancelled', 'cancelled', 0);
    await new Promise((r) => setTimeout(r, 2500));
    if (isCancelled()) throw new CopilotError('cancelled', 'cancelled', 0);
  }
  throw new CopilotError('Suggestions are taking longer than usual. Try again.', 'timeout', 0);
}

export interface LearnBody {
  cause: 'sent' | 'approved' | 'saved';
  orderNumber: string;
  exchangeAccountId?: string | null;
  requestId?: string | null;
  sourceEntryId?: string | null;
  sourceCallId?: string | null;
  insertedText?: string | null;
  finalText: string;
  templateValues?: TemplateOrderValues;
  hint?: OrderHint;
  beforeAt?: number | null;
}

export function copilotLearn(body: LearnBody): Promise<LearnResult> {
  return invoke<LearnResult>('copilot-learn', { action: 'learn', ...body });
}
export function copilotReject(callId: string, reason: string): Promise<{ rejected: boolean }> {
  return invoke('copilot-learn', { action: 'reject', callId, reason });
}
export function copilotUndo(eventId: string): Promise<{ undone: boolean; reason?: string }> {
  return invoke('copilot-learn', { action: 'undo', eventId });
}
