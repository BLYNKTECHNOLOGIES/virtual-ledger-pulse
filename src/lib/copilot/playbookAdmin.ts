// Copilot v2 Playbook page: pure helpers (labels, scope, filters, stats). No React, no network.

export type EntryStatus = 'tentative' | 'approved' | 'retired';
export type Scope = { sides?: string[]; categories?: string[]; statuses?: string[]; client_states?: string[]; account_ids?: string[] };
export type ScopeKey = keyof Scope;

/** Scope choices offered on the Playbook page; the values are the codes the server matches on. */
export interface ScopeOption { values: string[]; label: string }
export const SCOPE_GROUPS: Array<{ key: Exclude<ScopeKey, 'account_ids'>; label: string; options: ScopeOption[] }> = [
  { key: 'sides', label: 'Side', options: [{ values: ['SELL'], label: 'We sell (client pays us)' }, { values: ['BUY'], label: 'We buy (we pay the client)' }] },
  { key: 'statuses', label: 'Order status', options: [
    { values: ['TRADING'], label: 'Not paid yet' },
    { values: ['BUYER_PAYED'], label: 'Marked paid' },
    { values: ['COMPLETED'], label: 'Completed' },
    { values: ['APPEAL'], label: 'In appeal' },
    { values: ['CANCELLED', 'CANCELLED_BY_SYSTEM'], label: 'Cancelled' },
  ] },
  { key: 'categories', label: 'Order size', options: [{ values: ['small'], label: 'Small orders' }, { values: ['regular'], label: 'Regular orders' }] },
  { key: 'client_states', label: 'Client', options: [
    { values: ['new'], label: 'New client' },
    { values: ['linked'], label: 'Known, not approved for this side' },
    { values: ['approved'], label: 'Approved client' },
  ] },
];

const SHORT: Record<string, string> = {
  SELL: 'we sell', BUY: 'we buy', TRADING: 'not paid yet', BUYER_PAYED: 'marked paid', COMPLETED: 'completed', APPEAL: 'in appeal',
  CANCELLED: 'cancelled', CANCELLED_BY_SYSTEM: 'cancelled', small: 'small', regular: 'regular', new: 'new client', linked: 'known client',
  approved: 'approved client',
};

/** "We sell · not paid yet · approved client" — or "All orders" when nothing narrows it. */
export function scopeSummary(scope: Scope | null | undefined, accountName?: (id: string) => string): string {
  const s = scope ?? {};
  const parts: string[] = [];
  const add = (vals?: string[]) => { if (vals?.length) parts.push([...new Set(vals.map((v) => SHORT[v] ?? v.toLowerCase()))].join(' or ')); };
  add(s.sides);
  add(s.statuses);
  if (s.categories?.length) parts.push(`${s.categories.map((v) => SHORT[v] ?? v).join(' or ')} orders`);
  add(s.client_states);
  if (s.account_ids?.length) parts.push(s.account_ids.map((id) => (accountName ? accountName(id) : 'one account')).join(' or '));
  if (!parts.length) return 'All orders';
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
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
  created: 'New entry', merged: 'Another way of asking', promoted: 'Tentative approved', updated: 'Wording updated',
  conflict: 'Conflict raised', replaced: 'Replaced a tentative reply',
};
export const CAUSE_LABEL: Record<string, string> = { sent: 'sent in chat', approved: 'approved without sending', saved: 'saved' };
