// Copilot v2 Playbook page: pure helpers (labels, scope, filters, stats). No React, no network.

export type EntryStatus = 'tentative' | 'approved' | 'retired';
/** stages: situation codes (copilot_situations); statuses: Binance statuses, kept only on replies saved before situations. */
export type Scope = { sides?: string[]; categories?: string[]; statuses?: string[]; client_states?: string[]; account_ids?: string[]; stages?: string[] };
export type ScopeKey = keyof Scope;

/** Scope choices offered on the Playbook page; the values are the codes the server matches on. */
export interface ScopeOption { values: string[]; label: string }
export const SCOPE_GROUPS: Array<{ key: Exclude<ScopeKey, 'account_ids' | 'stages' | 'statuses'>; label: string; options: ScopeOption[] }> = [
  { key: 'sides', label: 'Side', options: [{ values: ['SELL'], label: 'We sell (client pays us)' }, { values: ['BUY'], label: 'We buy (we pay the client)' }] },
  { key: 'client_states', label: 'Client', options: [
    { values: ['new'], label: 'New client' },
    { values: ['linked'], label: 'Known, KYC not done for this side' },
    { values: ['approved'], label: 'KYC done (approved client)' },
  ] },
  { key: 'categories', label: 'Order size', options: [{ values: ['small'], label: 'Small orders' }, { values: ['regular'], label: 'Regular orders' }] },
];
/** Older replies may still be limited by Binance status; shown only when a reply has it, so it can be removed. */
export const LEGACY_STATUS_GROUP: { key: 'statuses'; label: string; options: ScopeOption[] } = { key: 'statuses', label: 'Order status (older setting)', options: [
  { values: ['TRADING'], label: 'Not paid yet' },
  { values: ['BUYER_PAYED'], label: 'Marked paid' },
  { values: ['COMPLETED'], label: 'Completed' },
  { values: ['APPEAL'], label: 'In appeal' },
  { values: ['CANCELLED', 'CANCELLED_BY_SYSTEM'], label: 'Cancelled' },
] };

const SHORT: Record<string, string> = {
  SELL: 'we sell', BUY: 'we buy', TRADING: 'not paid yet', BUYER_PAYED: 'marked paid', COMPLETED: 'completed', APPEAL: 'in appeal',
  CANCELLED: 'cancelled', CANCELLED_BY_SYSTEM: 'cancelled', small: 'small', regular: 'regular', new: 'new client', linked: 'known client',
  approved: 'KYC done',
};

/**
 * "We sell · KYC pending, Checking KYC · new client" — or "All orders" when nothing narrows it.
 * situationNames turns situation codes into words (from copilot_situations); without it the codes are shown.
 */
export function scopeSummary(scope: Scope | null | undefined, accountName?: (id: string) => string, situationNames?: (codes: string[]) => string): string {
  const s = scope ?? {};
  const parts: string[] = [];
  const add = (vals?: string[]) => { if (vals?.length) parts.push([...new Set(vals.map((v) => SHORT[v] ?? v.toLowerCase()))].join(' or ')); };
  add(s.sides);
  if (s.stages?.length) parts.push(situationNames ? situationNames(s.stages) : s.stages.join(', '));
  add(s.statuses);
  if (s.categories?.length) parts.push(`${s.categories.map((v) => SHORT[v] ?? v).join(' or ')} orders`);
  add(s.client_states);
  if (s.account_ids?.length) parts.push(s.account_ids.map((id) => (accountName ? accountName(id) : 'one account')).join(' or '));
  if (!parts.length) return 'All orders';
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const CLIENT_WORD: Record<string, string> = { new: 'new', linked: 'known' };
/** Who a reply is limited to by client: "KYC done", "new or known client" (null: any client). */
export function clientLabel(states: string[] | null | undefined): string | null {
  if (!states?.length) return null;
  const set = [...new Set(states)];
  const others = set.filter((v) => v !== 'approved').map((v) => CLIENT_WORD[v] ?? v);
  if (!others.length) return 'KYC done';
  return `${others.join(' or ')} client${set.includes('approved') ? ' or KYC done' : ''}`;
}

/**
 * A reply's short label next to the other replies of its question: its situations, plus the client and order size it
 * is limited to, and the side when no situation says it — "We buy · Any situation", "Any situation · KYC done".
 */
export function replyLabel(scope: Scope | null | undefined, situationNames: (codes: string[]) => string): string {
  const s = scope ?? {};
  const parts = [situationNames(s.stages ?? [])];
  const client = clientLabel(s.client_states);
  if (client) parts.push(client);
  if (s.categories?.length === 1) parts.push(`${SHORT[s.categories[0]] ?? s.categories[0]} orders`);
  if (s.sides?.length === 1 && !s.stages?.length) parts.unshift(s.sides[0] === 'SELL' ? 'We sell' : 'We buy');
  return parts.join(' · ');
}

type Copies = { reply_en: string | null; reply_hi: string | null; reply_en_auto: boolean; reply_hi_auto: boolean; reply_en_stale?: boolean; reply_hi_stale?: boolean };

/** Which copy, if any, an edit of only the other one leaves out of date ('en' | 'hi'), when it was up to date before. */
function leftBehind(e: Copies, en: string, hi: string): 'en' | 'hi' | null {
  const enChanged = en.trim() !== (e.reply_en ?? ''), hiChanged = hi.trim() !== (e.reply_hi ?? '')
  if (enChanged === hiChanged) return null
  if (enChanged) return e.reply_hi && !e.reply_hi_stale && e.reply_en && en.trim() ? 'hi' : null
  return e.reply_en && !e.reply_en_stale && e.reply_hi && hi.trim() ? 'en' : null
}

/** What saving an edit of one language copy does to the other: it is out of date until it is rewritten or kept. */
export function copyChangeNote(e: Copies, en: string, hi: string): string | null {
  const other = leftBehind(e, en, hi)
  return other ? `Saving marks the ${other === 'hi' ? 'Hindi' : 'English'} copy out of date until it is rewritten or kept.` : null
}

/**
 * The flag a page save must send itself: the database leaves the other copy alone when the edited copy was written by
 * the AI (a save from the chat keeps the meaning), but a person's edit on the page may change it.
 */
export function staleFlagForEdit(e: Copies, en: string, hi: string): { reply_en_stale?: boolean; reply_hi_stale?: boolean } {
  const other = leftBehind(e, en, hi)
  if (other === 'hi' && e.reply_en_auto) return { reply_hi_stale: true }
  if (other === 'en' && e.reply_hi_auto) return { reply_en_stale: true }
  return {}
}

/** Drops empty lists so the stored scope stays minimal (an empty list and a missing key both mean "any"). */
export function cleanScope(scope: Scope): Scope {
  const out: Scope = {};
  (Object.keys(scope) as ScopeKey[]).forEach((k) => {
    const v = [...new Set((scope[k] ?? []).filter(Boolean))];
    if (v.length) out[k] = v;
  });
  return out;
}

export const optionChecked = (scope: Scope, key: ScopeKey, values: string[]) => values.every((v) => (scope[key] ?? []).includes(v));

/** Adds or removes every code of one option (e.g. both cancelled statuses). */
export function toggleScope(scope: Scope, key: ScopeKey, values: string[]): Scope {
  const cur = scope[key] ?? [];
  const next = optionChecked(scope, key, values) ? cur.filter((v) => !values.includes(v)) : [...cur, ...values];
  return cleanScope({ ...scope, [key]: next });
}

export const sameScope = (a: Scope | null | undefined, b: Scope | null | undefined): boolean => {
  const norm = (s: Scope | null | undefined) => {
    const c = cleanScope(s ?? {});
    return JSON.stringify((Object.keys(c) as ScopeKey[]).sort().map((k) => [k, [...(c[k] ?? [])].sort()]));
  };
  return norm(a) === norm(b);
};

export const STATUS_LABEL: Record<EntryStatus, string> = { approved: 'Approved', tentative: 'Tentative', retired: 'Retired' };

export interface EntryLike {
  id: string;
  title: string;
  /** 'approved' | 'tentative' | 'retired' (the database column is plain text). */
  status: string;
  reply_en: string | null;
  reply_hi: string | null;
  conflict_open: boolean;
  use_count: number;
  updated_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  reply_en_stale?: boolean;
  reply_hi_stale?: boolean;
}

export type EntryFilter = 'active' | 'approved' | 'tentative' | 'retired' | 'conflicts' | 'all';
export type EntrySort = 'used' | 'recent' | 'title';

/** True when a tentative entry's trial period has ended (it is no longer offered). */
export const isExpired = (e: Pick<EntryLike, 'status' | 'expires_at'>, now: Date = new Date()) =>
  e.status === 'tentative' && !!e.expires_at && new Date(e.expires_at).getTime() <= now.getTime();

export function filterEntries<T extends EntryLike>(rows: T[], filter: EntryFilter, query: string, sort: EntrySort, now: Date = new Date()): T[] {
  const q = query.trim().toLowerCase();
  const out = rows.filter((e) => {
    if (filter === 'active' && (e.status === 'retired' || isExpired(e, now))) return false;
    if (filter === 'approved' && e.status !== 'approved') return false;
    if (filter === 'tentative' && e.status !== 'tentative') return false;
    if (filter === 'retired' && e.status !== 'retired') return false;
    if (filter === 'conflicts' && (!e.conflict_open || e.status === 'retired')) return false;
    if (!q) return true;
    return [e.title, e.reply_en ?? '', e.reply_hi ?? ''].some((t) => t.toLowerCase().includes(q));
  });
  const t = (s: string | null) => (s ? new Date(s).getTime() : 0);
  return out.sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'recent') return t(b.updated_at) - t(a.updated_at);
    return b.use_count - a.use_count || t(b.last_used_at) - t(a.last_used_at) || a.title.localeCompare(b.title);
  });
}

export interface TopicLike<E extends EntryLike = EntryLike> { id: string; title: string; replies: E[]; phrasings: number }
export type TopicFilter = EntryFilter | 'outdated';

const live = (e: EntryLike, now: Date) => e.status !== 'retired' && !isExpired(e, now);
export const hasOutdatedCopy = (e: Pick<EntryLike, 'status' | 'reply_en_stale' | 'reply_hi_stale'>) =>
  e.status !== 'retired' && (!!e.reply_en_stale || !!e.reply_hi_stale);

/** Questions for the Playbook list: a question shows when any of its replies matches the filter. */
export function filterTopics<E extends EntryLike, T extends TopicLike<E>>(rows: T[], filter: TopicFilter, query: string, sort: EntrySort, now: Date = new Date()): T[] {
  const q = query.trim().toLowerCase();
  const t = (s: string | null) => (s ? new Date(s).getTime() : 0);
  const out = rows.filter((topic) => {
    const r = topic.replies;
    if (filter === 'active' && !r.some((e) => live(e, now))) return false;
    if (filter === 'approved' && !r.some((e) => e.status === 'approved')) return false;
    if (filter === 'tentative' && !r.some((e) => e.status === 'tentative')) return false;
    if (filter === 'retired' && !r.some((e) => e.status === 'retired')) return false;
    if (filter === 'conflicts' && !r.some((e) => e.conflict_open && e.status !== 'retired')) return false;
    if (filter === 'outdated' && !r.some(hasOutdatedCopy)) return false;
    if (!q) return true;
    return [topic.title, ...r.flatMap((e) => [e.reply_en ?? '', e.reply_hi ?? ''])].some((x) => x.toLowerCase().includes(q));
  });
  const uses = (x: T) => x.replies.reduce((n, e) => n + (e.use_count || 0), 0);
  const changed = (x: T) => Math.max(0, ...x.replies.map((e) => t(e.updated_at)));
  const used = (x: T) => Math.max(0, ...x.replies.map((e) => t(e.last_used_at)));
  return out.sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'recent') return changed(b) - changed(a);
    return uses(b) - uses(a) || used(b) - used(a) || a.title.localeCompare(b.title);
  });
}

/** Whole-number percent, or a dash when there is nothing to divide by. */
export const pct = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

export const inr = (n: number, digits = 0): string =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** "15 Oct, 21:40" in IST. */
export function istShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso));
}

const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

/** "trial ends today / tomorrow / in 12 days" for a tentative entry, by IST calendar date. */
export function expiryText(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const end = new Date(iso);
  if (end.getTime() <= now.getTime()) return 'trial ended';
  const days = Math.round((Date.parse(istDay(end)) - Date.parse(istDay(now))) / 86_400_000);
  if (days <= 0) return 'trial ends today';
  if (days === 1) return 'trial ends tomorrow';
  return `trial ends in ${days} days`;
}

export interface ModelStats {
  model: string;
  drafts: number;
  held_back: number;
  new_policy: number;
  used: number;
  approved: number;
  unedited: number;
  rejected: number;
  avg_latency_ms: number | null;
  cost_inr: number;
}

/** Ranks the draft models by how often their drafts were taken without edits (then by use). */
export function rankModels(rows: ModelStats[]): Array<ModelStats & { takenPct: string; uneditedPct: string; costPerTaken: number | null }> {
  return [...rows]
    .map((m) => {
      const taken = m.used + m.approved;
      return { ...m, takenPct: pct(taken, m.drafts), uneditedPct: pct(m.unedited, m.drafts), costPerTaken: taken > 0 ? Number(m.cost_inr) / taken : null };
    })
    .sort((a, b) => (b.drafts ? b.unedited / b.drafts : 0) - (a.drafts ? a.unedited / a.drafts : 0) || (b.used + b.approved) - (a.used + a.approved));
}

export const ACTION_LABEL: Record<string, string> = {
  created: 'New question', merged: 'Used again', promoted: 'Tentative approved', updated: 'Wording updated',
  conflict: 'Conflict raised', replaced: 'Replaced a tentative reply', widened: 'Now also for this situation', variant: 'Reply for a new situation',
};
export const CAUSE_LABEL: Record<string, string> = { sent: 'sent in chat', approved: 'approved without sending', saved: 'saved' };

/** An operator's sent rewrite waiting in the inbox (copilot-rephrase "used"): all of it masked on the server. */
export interface OperatorReply {
  /** What the operator typed before the rewrite: the reason behind the reply. */
  rough: string | null;
  /** What was sent, as the Playbook keeps replies (order values as placeholders, other personal data masked). */
  sent: string;
  /** The rewrite the Copilot offered (masked), shown beside what was sent when the operator edited it. */
  suggestion: string | null;
  edited: boolean;
  sentAt: number | null;
  situationLabel: string | null;
  chat: Array<{ from: string; text: string; at?: string }>;
}

/** The operator's reply in an inbox item's context, or null when it has none. */
export function operatorReplyOf(context: unknown): OperatorReply | null {
  const c = context && typeof context === 'object' && !Array.isArray(context) ? (context as Record<string, unknown>) : null;
  const sent = typeof c?.sent === 'string' ? c.sent.trim() : '';
  if (!c || !sent) return null;
  const chat = Array.isArray(c.chat)
    ? c.chat.filter((l): l is { from: string; text: string; at?: string } => !!l && typeof l === 'object' && typeof (l as { text?: unknown }).text === 'string'
      && typeof (l as { from?: unknown }).from === 'string')
    : [];
  const at = Number(c.sent_at);
  return {
    rough: typeof c.rough === 'string' && c.rough.trim() ? c.rough.trim() : null,
    sent,
    suggestion: typeof c.suggestion === 'string' && c.suggestion.trim() ? c.suggestion.trim() : null,
    edited: c.edited === true,
    sentAt: Number.isFinite(at) && at > 0 ? at : null,
    situationLabel: typeof c.situation_label === 'string' ? c.situation_label : null,
    chat,
  };
}
