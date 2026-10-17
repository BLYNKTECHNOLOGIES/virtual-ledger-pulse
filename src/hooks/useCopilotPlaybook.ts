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
  /** What the client is waiting for now (situation code and label), why, and whether an approver set it. */
  situation?: string | null;
  situation_label?: string | null;
  situation_evidence?: string;
  situation_detected?: string | null;
  situation_detected_label?: string | null;
  situation_marked?: { by: string | null; at: string } | null;
  situation_ready_at?: string | null;
  /** Binance's extra-KYC field on our sell orders: 0 not required, 1 required and not verified, 2 verified. */
  binance_kyc?: number | null;
  /** Sell orders: the client is not verified yet (the step decision the drafts follow). Null on buy orders. */
  before_verification?: boolean | null;
  /** Binance says the extra KYC is not verified and the chat shows neither its notice nor our payment details. */
  binance_kyc_open?: boolean;
  /** Binance's deadlines that matter now (ISO): paying while open; releasing once marked paid. */
  pay_by?: string | null;
  release_by?: string | null;
  /** Our team's open appeal case for the order. */
  appeal_case?: { status: string; response_due: string | null } | null;
  /** What we hold on the client (counts and yes/no only); null for a client not in our records. */
  client?: CopilotClientSummary | null;
}
export interface CopilotClientSummary {
  on_file: string[];
  earlier_orders: number | null;
  /** Appeal cases on the client's orders, this one included (as the client card counts them). */
  appeals: number | null;
  name_check: string | null;
  limit_request_pending: boolean;
}
export interface PlaybookSuggestion {
  entryId: string;
  topicId?: string;
  title: string;
  status: 'approved' | 'tentative';
  conflict: boolean;
  similarity: number;
  text: string;
  language: 'en' | 'hi';
  machineTranslated: boolean;
  missingLanguage: boolean;
  /** 'hindi_outdated' etc.: the chat's language copy is out of date (or missing), so the other one is shown. */
  languageNote?: string | null;
  /** Situations this reply is limited to (labels); empty = any situation. */
  situations?: string[];
  specific?: boolean;
  /** How closely this chat resembles the chats the reply was used in (0–1), null when it has none yet. */
  contextSimilarity?: number | null;
  risk: string;
  note: string | null;
  version: number;
  /** Shown first although below the match threshold: picked by the AI, or a clear best match. */
  pickedBy?: 'ai' | 'lead';
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
  /** Known questions with approved replies only for other situations. */
  otherSituations?: Array<{ topicId: string; title: string; similarity: number; situations: string[] }>;
  /** Approved replies not offered here, and why (e.g. asks to pay before verification). */
  heldBack?: Array<{ entryId: string; title: string; reason: string }>;
  /** The question's replies for the other steps the client could be at (KYC happens outside the chat). */
  alternatives?: StepSuggestion[];
  /** Other steps the client could be at with no saved reply: a tap switches the chat to that step. */
  otherSteps?: Array<{ code: string; label: string }>;
  /** When matching by meaning was unsure, the AI picked the question (or none). Null when it was not asked. */
  route?: CopilotRoute | null;
  /** A clear best match below the threshold: its score and the next question's. */
  lead?: { topicId: string; similarity: number; next: number | null } | null;
  /** status 'pending': when the request being made may be taken over (ms). */
  retryAfterMs?: number;
}
export interface CopilotRoute {
  result: 'picked' | 'unsure' | 'none' | 'failed' | 'capped';
  topicId: string | null;
  title: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  reason: string | null;
}
/** A reply for another step ("If: Checking KYC"); `steps` are the step codes it is the reply for, closest first. */
export interface StepSuggestion extends PlaybookSuggestion {
  steps: string[];
  stepLabels: string[];
}
export interface OrderHint {
  tradeType?: string | null;
  status?: string | null;
  totalPrice?: number | string | null;
  asset?: string | null;
  payMethod?: string | null;
  latest?: { id: string; text: string } | null;
  /** From the live Binance order detail on the screen (fresher than the stored order). */
  kycVerify?: number | null;
  payBy?: number | null;
  releaseBy?: number | null;
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

/**
 * Suggestions for an open chat. A chat state already being drafted (by either approver) is waited for, not paid twice:
 * until its answer is ready or, if that request died, until the server may take it over (it says when), so the waiting
 * approver gets the suggestions without pressing Retry.
 */
export async function copilotDraft(
  body: { orderNumber: string; exchangeAccountId?: string | null; mode?: 'suggest' | 'redraft' | 'force' | 'context'; instruction?: string | null; hint?: OrderHint },
  isCancelled: () => boolean = () => false,
): Promise<DraftResponse> {
  const started = Date.now();
  let until = started + 45_000;
  for (let attempt = 0; attempt < 40; attempt++) {
    const data = await invoke<DraftResponse>('copilot-draft', body);
    if (data?.status !== 'pending') return data;
    const takeover = Number(data.retryAfterMs);
    if (Number.isFinite(takeover) && takeover >= 0) until = Math.max(until, Date.now() + Math.min(takeover, 120_000) + 5_000);
    if (Date.now() >= until) break;
    if (isCancelled()) throw new CopilotError('cancelled', 'cancelled', 0);
    // Often at first (the other request usually lands within seconds), then gently: each check counts against the
    // approver's allowance.
    const waited = Date.now() - started;
    await new Promise((r) => setTimeout(r, waited < 15_000 ? 2_500 : waited < 45_000 ? 5_000 : 10_000));
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
  /** The step a reply was picked for ("If: Checking KYC"): it is saved under that step. */
  situation?: string | null;
}

export function copilotLearn(body: LearnBody): Promise<LearnResult> {
  return invoke<LearnResult>('copilot-learn', { action: 'learn', ...body });
}
/** Makes phrasings and example chats added since the last chat searchable right away (approvers; one small call). */
export function copilotIndex(): Promise<{ indexed: number; left: number }> {
  return invoke('copilot-learn', { action: 'index' });
}
/** "Rewrite Hindi from English" (and back): the AI's rewrite, for the approver to check before saving. */
export function copilotTranslate(text: string, to: 'en' | 'hi'): Promise<{ text: string; language: 'en' | 'hi' }> {
  return invoke('copilot-learn', { action: 'translate', text, to });
}
export function copilotReject(callId: string, reason: string): Promise<{ rejected: boolean }> {
  return invoke('copilot-learn', { action: 'reject', callId, reason });
}
export function copilotUndo(eventId: string): Promise<{ undone: boolean; reason?: string }> {
  return invoke('copilot-learn', { action: 'undo', eventId });
}
