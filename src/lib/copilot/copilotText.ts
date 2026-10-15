// Copilot v2 (Playbook): pure helpers for the Terminal chat panel. No React, no network.
import { fillTemplate, type TemplateOrderValues } from '@/lib/fill-template';

export type ContactPurpose = 'rm' | 'kyc' | 'support';
export interface PickedContact { name: string; phone: string; availableNow: boolean }
export type PickedContacts = Partial<Record<ContactPurpose, PickedContact>>;

const CONTACT_RE = /\{contact:(rm|kyc|support)\}/g;
export const CONTACT_LABEL: Record<ContactPurpose, string> = { rm: 'RM', kyc: 'KYC', support: 'Support' };

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

const TOKEN_RE = /\{(amount|orderNo|name|upi|contact:(rm|kyc|support))\}/g;

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
  action?: 'created' | 'merged' | 'promoted' | 'updated' | 'conflict' | 'replaced';
  entryId?: string;
  title?: string;
  stored?: string;
  reason?: string;
  judged?: boolean;
}

/** Toast wording after a reply was saved to the Playbook. */
export function learnToast(r: LearnResult): { title: string; description: string; tone: 'success' | 'warning' } {
  const t = r.title ? `“${r.title}”` : 'this reply';
  switch (r.action) {
    case 'created': return { title: 'Saved to Playbook', description: `New entry ${t}`, tone: 'success' };
    case 'merged': return { title: 'Saved to Playbook', description: `Added as another way of asking ${t}`, tone: 'success' };
    case 'updated': return { title: 'Playbook updated', description: `New wording saved for ${t}`, tone: 'success' };
    case 'promoted': return { title: 'Playbook confirmed', description: `${t} is now approved`, tone: 'success' };
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
