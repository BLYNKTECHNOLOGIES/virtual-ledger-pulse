// Copilot v2 (Playbook): pure helpers for the Terminal chat panel. No React, no network.
import { fillTemplate, type TemplateOrderValues } from '@/lib/fill-template';

/** A team's code (copilot_teams): kyc, rm, support, or one added later. */
export type ContactPurpose = string;

/** A suggestion the composer can insert (Tab cycles them); sending it saves it to the Playbook ("use = approve"). */
export interface CopilotPick {
  kind: 'entry' | 'draft';
  entryId?: string | null;
  callId?: string | null;
  requestId: string | null;
  /** Text as inserted into the composer (order values and contact numbers filled in). */
  text: string;
  title?: string;
  /** A reply picked for another step: sending it sets the chat to that step, and it is saved under it. */
  situation?: { code: string; label: string; side: 'BUY' | 'SELL'; detected: string | null } | null;
}

interface EntrySource { entryId: string; title: string; text: string; conflict?: boolean }
interface DraftSource { callId: string | null; text: string; blocked: boolean }
interface StepSource extends EntrySource { steps: string[]; stepLabels: string[] }

/**
 * The suggestions in the order the panel shows them and the composer cycles them: the Playbook replies for this
 * step, the AI drafts (also for this step), then the replies for other steps. A reply for another step carries its
 * step (the first one listed: the step the chat will show once it is sent, else the closest), so sending it sets the
 * chat to that step and saves it there.
 */
export function buildCopilotPicks(a: {
  playbook: EntrySource[]; drafts: DraftSource[]; alternatives?: StepSource[] | null; requestId: string | null;
  side: 'BUY' | 'SELL' | null; detected: string | null; fill: (text: string) => string;
}): CopilotPick[] {
  const stepOf = (p: StepSource): CopilotPick['situation'] =>
    (a.side && p.steps[0] ? { code: p.steps[0], label: p.stepLabels[0] ?? p.steps[0], side: a.side, detected: a.detected } : null);
  const picks: CopilotPick[] = [
    ...a.playbook.filter((p) => !p.conflict).map((p) => ({ kind: 'entry' as const, entryId: p.entryId, requestId: a.requestId, text: a.fill(p.text), title: p.title })),
    ...a.drafts.filter((d) => !d.blocked).map((d) => ({ kind: 'draft' as const, callId: d.callId, requestId: a.requestId, text: a.fill(d.text) })),
  ];
  for (const p of a.alternatives ?? []) {
    const situation = stepOf(p);
    if (!p.conflict && situation) picks.push({ kind: 'entry', entryId: p.entryId, requestId: a.requestId, text: a.fill(p.text), title: p.title, situation });
  }
  return picks;
}

/** One suggestion's identity (two suggestions can have the same text; a draft whose call was not logged has no id). */
export const pickKey = (p: Pick<CopilotPick, 'kind' | 'entryId' | 'callId' | 'situation' | 'text'>) =>
  `${p.kind}:${p.entryId ?? p.callId ?? p.text}:${p.situation?.code ?? ''}`;

/** The same text, ignoring spacing and case: a suggestion sent as inserted. */
export const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
export interface PickedContact { name: string; phone: string; availableNow: boolean }
export type PickedContacts = Partial<Record<ContactPurpose, PickedContact>>;

const CONTACT_RE = /\{contact:([a-z][a-z0-9_]{0,23})\}/g;
const TEAM_FALLBACK: Record<string, string> = { kyc: 'KYC team', rm: 'Relationship team', support: 'Support' };
/** The team's name for a {contact:<code>} placeholder (from copilot_teams when given). */
export function teamLabel(code: string, teams?: Array<{ code: string; label: string }>): string {
  return teams?.find((t) => t.code === code)?.label ?? TEAM_FALLBACK[code] ?? code;
}

/** Fills order values ({amount} {orderNo} {name} {upi}) and company contact numbers. Unknown tokens stay visible. */
export function fillCopilotText(text: string, values: TemplateOrderValues | undefined, contacts: PickedContacts | undefined): string {
  const withValues = fillTemplate(text, values || {});
  return withValues.replace(CONTACT_RE, (whole, purpose: ContactPurpose) => contacts?.[purpose]?.phone ?? whole);
}

export function contactsUsed(text: string): ContactPurpose[] {
  const out = new Set<ContactPurpose>();
  for (const m of text.matchAll(CONTACT_RE)) out.add(m[1] as ContactPurpose);
  return [...out];
}

const TOKEN_RE = /\{(amount|orderNo|name|upi|contact:[a-z][a-z0-9_]{0,23})\}/g;

/**
 * Hides personal numbers and handles in text an approver adds to the Playbook — the same rules the server applies
 * before any AI call (copilot-playbook.ts maskPII), written without lookbehind so older Safari can parse it.
 */
export function maskPersonal(input: string | null | undefined): string {
  let t = String(input ?? '');
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  t = t.replace(/\b[A-Z0-9][A-Z0-9._-]{1,255}@[A-Z][A-Z0-9]{1,63}\b/gi, '[upi]');
  t = t.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, '[pan]');
  t = t.replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, '[ifsc]');
  t = t.replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[aadhaar]');
  t = t.replace(/(\+?91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})(?!\d)/g, (m: string, cc: string | undefined, _n: string, off: number, s: string) =>
    (!cc && off > 0 && /\d/.test(s[off - 1]) ? m : '[phone]'));
  t = t.replace(/\b[A-Z]{2,8}\d{8,}[A-Z0-9]*\b/gi, '[ref]');
  t = t.replace(/\d{9,}/g, (m: string, off: number, s: string) => {
    const before = s.slice(Math.max(0, off - 2), off);
    const after = s.slice(off + m.length, off + m.length + 2);
    if (/\d$/.test(before) || /\d[.,]$/.test(before) || /^\d/.test(after) || /^[.,]\d/.test(after)) return m;
    return '[number]';
  });
  return t;
}

export function hasUnfilledToken(text: string): boolean {
  return unfilledTokens(text).length > 0;
}

/** Placeholders still in a text, e.g. ['{contact:kyc}'] when no KYC number is saved. */
export function unfilledTokens(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[0]))];
}

/** Order status as people say it (the server sends Binance's codes). */
export function statusLabel(status: string | null | undefined, side?: 'BUY' | 'SELL' | null): string | null {
  const s = String(status ?? '').toUpperCase();
  if (!s || s === 'UNKNOWN') return null;
  if (s === 'TRADING') return side === 'BUY' ? 'we have not paid yet' : 'not paid yet';
  if (s === 'BUYER_PAYED') return side === 'BUY' ? 'we marked paid' : 'client marked paid';
  if (s === 'COMPLETED') return 'completed';
  if (s === 'APPEAL') return 'in appeal';
  if (s.startsWith('CANCEL')) return 'cancelled';
  return s.toLowerCase().replace(/_/g, ' ');
}

export interface LearnResult {
  eventId?: string;
  action?: 'created' | 'merged' | 'promoted' | 'updated' | 'conflict' | 'replaced' | 'widened' | 'variant';
  entryId?: string;
  topicId?: string | null;
  title?: string;
  stored?: string;
  reason?: string;
  judged?: boolean;
  /** What happened to the client's wording: added to the question, already there, nearly identical, or none. */
  phrasing?: 'added' | 'known' | 'similar' | 'none' | null;
  /** The chat's situation when it was saved (label). */
  situation?: string | null;
}

/** Toast wording after a reply was saved to the Playbook. */
export function learnToast(r: LearnResult): { title: string; description: string; tone: 'success' | 'warning' } {
  const t = r.title ? `“${r.title}”` : 'this reply';
  const sit = r.situation ? ` (${r.situation})` : '';
  const wording = r.phrasing === 'added' ? ' The client’s wording was added as another way of asking.' : '';
  switch (r.action) {
    case 'created': return { title: 'Saved to Playbook', description: `New question ${t}${sit}`, tone: 'success' };
    case 'merged': return { title: 'Saved to Playbook', description: `Reply for ${t}${sit} used again.${wording}`, tone: 'success' };
    case 'updated': return { title: 'Playbook updated', description: `New wording saved for ${t}.${wording}`, tone: 'success' };
    case 'promoted': return { title: 'Playbook confirmed', description: `${t}${sit} is now approved.${wording}`, tone: 'success' };
    case 'widened': return { title: 'Playbook updated', description: `${t} now also applies${sit ? ` here${sit}` : ' in this situation'}.${wording}`, tone: 'success' };
    case 'variant': return { title: 'Saved to Playbook', description: `New reply for ${t}${sit}.`, tone: 'success' };
    case 'replaced': return { title: 'Saved to Playbook', description: `Your answer replaced the tentative ${t}`, tone: 'success' };
    case 'conflict': return { title: 'Saved — conflict to resolve', description: `Differs from the approved ${t}. Pick one in the Playbook inbox.`, tone: 'warning' };
    default: return { title: 'Saved to Playbook', description: t, tone: 'success' };
  }
}

/** Short display name for a model id. */
export function modelLabel(model: string): string {
  const known: Record<string, string> = {
    'openai/gpt-6-astra': 'GPT-6 Astra',
    'google/gemini-4-argon': 'Gemini 4 Argon',
    'google/gemini-3-flash-preview': 'Gemini 3 Flash',
  };
  if (known[model]) return known[model];
  const tail = model.split('/').pop() || model;
  return tail.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const FLAG_LABEL: Record<string, string> = {
  number_check: 'Check the number',
  unknown_placeholder: 'Unknown placeholder',
  long: 'Long',
  release_promise: 'Promises a release',
  outside_binance: 'Outside Binance',
  typed_number: 'Typed number',
  empty: 'Empty',
  pay_before_verification: 'Asks to pay before verification',
};

export const REJECT_REASONS = ['Wrong information', 'Wrong tone', 'Too long', 'Against our policy', 'Not what the client asked'];

/** Next item for Tab / Shift+Tab cycling through suggestions. */
export function cycleIndex(length: number, current: number, dir: 1 | -1): number {
  if (length <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : length - 1;
  return (current + dir + length) % length;
}

/** The latest client message that still needs an answer, from the chat panel's messages. */
export interface PanelMessage {
  id: string;
  senderType: 'operator' | 'counterparty' | 'system';
  text: string | null;
  imageUrl?: string;
  timestamp: number;
  messageType?: string;
  source?: 'binance' | 'local';
  _deliveryStatus?: 'sending' | 'queued' | 'failed';
}

export function latestUnanswered(messages: PanelMessage[]): { key: string; hint: { id: string; text: string } | null } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.senderType === 'system') continue;
    const type = String(m.messageType || '').toLowerCase();
    if (m.senderType === 'operator') {
      if (type === 'auto_reply' || type === 'card') continue;
      if (m.source === 'local' && m._deliveryStatus === 'failed') continue;
      return null;
    }
    const text = (m.text || '').trim() || (m.imageUrl ? '[image]' : '');
    if (!text) continue;
    // Live socket ids are Binance message ids; stored copies are already on the server, so no hint is needed.
    const hint = m.id.startsWith('binance-') ? { id: m.id.slice('binance-'.length), text } : null;
    return { key: `${Math.floor((m.timestamp || 0) / 5000)}|${text}`, hint };
  }
  return null;
}

/** Same rule as copilot_pick_contacts: IST weekday (1 = Monday … 7 = Sunday) and a window that may cross midnight. */
export function contactAvailableNow(
  c: { days: number[]; available_from: string | null; available_to: string | null; is_active?: boolean },
  at: Date = new Date(),
): boolean {
  if (c.is_active === false) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const dow = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[wd] ?? 1;
  if (!c.days.includes(dow)) return false;
  if (!c.available_from || !c.available_to) return true;
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const now = hh * 60 + mm;
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const from = toMin(c.available_from), to = toMin(c.available_to);
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

export const PHONE_RE = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;
