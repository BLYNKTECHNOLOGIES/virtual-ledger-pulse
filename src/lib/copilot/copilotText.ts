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
 * Hides personal numbers and handles in text an approver adds to the Playbook — the same rules, in the same order, the
 * server applies before any AI call (copilot-playbook.ts maskPII; maskParity.test.ts compares them), written without
 * lookbehind so older Safari can parse it. Masking one value can open a word boundary next to another, so it repeats
 * until nothing changes.
 */
export function maskPersonal(input: string | null | undefined): string {
  // Read as the server reads it: Devanagari and full-width digits as digits, invisible characters gone.
  const raw = String(input ?? '');
  const norm = normalizeForMask(raw);
  let t = norm;
  for (let pass = 0; pass < 4; pass++) {
    const prev = t;
    t = maskOnce(t);
    if (t === prev) break;
  }
  // Nothing personal: the text exactly as given.
  return t === norm ? raw : t;
}

/** Where each script's digit zero is (as on the server, copilot-numbers.ts asciiDigits). */
const DIGIT_ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xff10];
/** Characters that do not show (zero-width spaces and joiners, direction marks, soft hyphens, fillers). */
// Each code point is matched on its own (they are what is removed), so a combining one in the class is meant.
// eslint-disable-next-line no-misleading-character-class
const INVISIBLE = /[\p{Cf}\u034F\u115F\u1160\u17B4\u17B5\u180E\u3164\uFE00-\uFE0F\uFFA0\u20E3]/gu;
/** The server's normalizeText (fractions, compatibility forms, keycap ten, invisible characters, digits in ASCII). */
function normalizeForMask(s: string): string {
  const t = s
    .replace(/(\d)\s*½/g, '$1.5').replace(/½/g, '0.5').replace(/(\d)\s*¼/g, '$1.25').replace(/¼/g, '0.25')
    .replace(/(\d)\s*¾/g, '$1.75').replace(/¾/g, '0.75')
    .normalize('NFKC')
    .replace(/\u{1F51F}/gu, ' 10 ')
    .replace(INVISIBLE, '');
  return t.normalize('NFKC').replace(/\p{Nd}/gu, (d) => {
    const c = d.codePointAt(0)!;
    const z = DIGIT_ZEROS.find((zero) => c >= zero && c <= zero + 9);
    return z === undefined ? '9' : String(c - z);
  });
}

/** UPI handles of Indian banks and apps (as on the server). */
const UPI_HANDLES = 'ybl|ibl|axl|apl|yapl|upi|paytm|pt(?:yes|axis|hdfc|sbi)|ok(?:axis|hdfcbank|icici|sbi)|wa(?:axis|hdfcbank|icici|sbi)|[a-z]{2,}bank|icici|sbi|hdfc|axis|kotak|kmbl|yes|idfc\\w*|fbl|freecharge|jio|airtel|slc|mbk|ikwik|abfspay|axisb|pnb|boi|ubi|citi|hsbc|dbs|rbl|indus|federal|aubank|kbl|kvb|jupiteraxis|naviaxis|superyes';
const UPI_ONE_CHAR = new RegExp(`\\b[A-Z0-9]@(?:${UPI_HANDLES})\\b`, 'gi');
const UPI_SPACED = new RegExp(`\\b[A-Z0-9][A-Z0-9._-]{0,255}(?:\\s+@\\s*|\\s*@\\s+)(?:${UPI_HANDLES})\\b`, 'gi');

/** The characters just before `off`. */
const before = (s: string, off: number, n: number) => s.slice(Math.max(0, off - n), off);

/**
 * Replaces each match of the global `re` that `ok` accepts. A match that is refused lets the search go on one character
 * later, which is what the server's lookbehind does (a refused match never hides a later one inside it).
 */
function sub(t: string, re: RegExp, tag: string, ok?: (m: RegExpExecArray, s: string) => boolean): string {
  let out = '';
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (!m[0].length) { re.lastIndex++; continue; }
    if (ok && !ok(m, t)) { re.lastIndex = m.index + 1; continue; }
    out += t.slice(last, m.index) + tag;
    last = m.index + m[0].length;
    re.lastIndex = last;
  }
  return out + t.slice(last);
}

/** Indian mobile numbers: "+91 98765 43210", "9876543210", never inside a longer run of digits. */
function maskPhones(t: string): string {
  const re = /(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
  const bare = /[6-9]\d{4}[\s-]?\d{5}(?!\d)/y;
  let out = '';
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const numAt = m.index + (m[1]?.length ?? 0);
    let end = -1;
    if (!/\d/.test(before(t, numAt, 1))) end = m.index + m[0].length;
    else if (m[1] && !/\d/.test(before(t, m.index, 1))) {
      // The server's regex then tries the same place without the country code.
      bare.lastIndex = m.index;
      const b = bare.exec(t);
      if (b) end = m.index + b[0].length;
    }
    if (end < 0) { re.lastIndex = m.index + 1; continue; }
    out += t.slice(last, m.index) + '[phone]';
    last = end;
    re.lastIndex = end;
  }
  return out + t.slice(last);
}

const prevIs = (s: string, off: number, re: RegExp) => re.test(before(s, off, 2));
function maskOnce(input: string): string {
  let t = input;
  t = sub(t, /\b0x[a-fA-F0-9]{64}\b|\b[a-fA-F0-9]{64}\b/g, '[ref]');
  t = sub(t, /\bT[1-9A-HJ-NP-Za-km-z]{33}\b|\b0x[a-fA-F0-9]{40}\b|\b(?:[bB][cC]1|[lL][tT][cC]1)[a-zA-Z0-9]{25,59}\b|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b|\b[EU]Q[A-Za-z0-9_-]{46}(?![A-Za-z0-9_-])/g, '[wallet]');
  t = sub(t, /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  t = sub(t, /\b[A-Z0-9][A-Z0-9._-]{1,255}@[A-Z][A-Z0-9]{1,63}\b/gi, '[upi]');
  t = sub(t, UPI_ONE_CHAR, '[upi]');
  t = sub(t, /\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, '[pan]');
  t = sub(t, /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, '[ifsc]');
  // Twelve digits in fours, not inside a longer run (a card number is masked whole further down).
  t = sub(t, /\b\d{4}[\s-]\d{4}[\s-]\d{4}\b(?![\s-]\d)/g, '[aadhaar]', (m, s) => !prevIs(s, m.index, /\d[\s-]$/));
  t = maskPhones(t);
  t = sub(t, /\b[A-Z]{2,8}\d{8,}[A-Z0-9]*\b/gi, '[ref]');
  t = sub(t, /\b(?=[A-Z0-9]*\d{4})(?=[A-Z0-9]*[A-Z]{2})[A-Z0-9]{12,}\b/gi, '[ref]');
  t = sub(t, /\d{9,}(?!\d)(?![.,]\d)/g, '[number]', (m, s) => !prevIs(s, m.index, /\d$/) && !prevIs(s, m.index, /\d[.,]$/));
  // Other countries' phone numbers, then 9 or more digits in groups that share one separator, one group of three or more.
  t = sub(t, /\+\d{1,3}(?:[\s-]?\d){7,13}(?!\d)/g, '[phone]');
  t = sub(t, /\d{1,18}([ .-])\d{1,18}(?:\1\d{1,18})*(?!\d)/g, '[number]', (m, s) => {
    if (prevIs(s, m.index, /[\d.,]$/)) return false;
    const groups = m[0].split(m[1]);
    return groups.some((g) => g.length >= 3) && groups.join('').length >= 9;
  });
  // A UPI ID written with spaces around the "@", with a bank's own handle only.
  t = sub(t, UPI_SPACED, '[upi]');
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
  const wording = r.phrasing === 'added' ? ' The client’s wording was added as another way of asking, so a similar message can match without AI next time.' : '';
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

// ─── Order and client facts for the panel ───────────────────────────────────────────────────────────

const IST_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
const IST_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
/** "11:42" in IST; with the date ("18 Oct 11:42") when it is not the same IST day as `now`. */
export function istClock(ms: number, now?: number): string {
  const time = IST_TIME.format(new Date(ms));
  if (now === undefined || IST_DAY.format(new Date(ms)) === IST_DAY.format(new Date(now))) return time;
  return `${IST_DAY.format(new Date(ms))} ${time}`;
}

export interface ContextChip {
  key: string;
  /** The whole text; `main` and `left` split it so that a narrow chip cuts the clock, never the time left. */
  label: string;
  main?: string;
  left?: string;
  title: string;
  tone: 'muted' | 'amber' | 'red';
}

const isoMs = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};
/** Whole minutes to go or since, rounded down (the clock shows no seconds, so the countdown never overstates the time left). */
function until(at: number, now: number): { past: boolean; mins: number } {
  const d = at - now;
  return { past: d <= 0, mins: Math.floor(Math.abs(d) / 60_000) };
}
const minsLabel = (m: number) => {
  if (m >= 2880) return `${Math.floor(m / 1440)} days`;
  if (m >= 60) return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`;
  return m < 1 ? '<1 min' : `${m} min`;
};

/** Binance's order status as the server names it (the screen may pass the numeric code). */
const STATUS_CODES: Record<string, string> = {
  '1': 'TRADING', '2': 'BUYER_PAYED', '3': 'BUYER_PAYED', '4': 'COMPLETED', '5': 'APPEAL', '6': 'CANCELLED', '7': 'CANCELLED_BY_SYSTEM', '8': 'APPEAL',
};
export function orderStatusCode(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) return null;
  return STATUS_CODES[s] ?? (s === 'IN_APPEAL' ? 'APPEAL' : s);
}

export interface DeadlineContext {
  side?: 'BUY' | 'SELL' | null;
  pay_by?: string | null;
  release_by?: string | null;
  appeal_case?: { status: string; response_due: string | null } | null;
  /** A sell order whose client is not verified yet: its pay deadline is shown as the order expiring, never as time to pay. */
  kyc_pending?: boolean;
}
/** The server's last answer, as far as the deadlines need it. */
interface ServerFacts extends DeadlineContext { situation?: string | null; binance_kyc?: number | null; before_verification?: boolean | null }
export interface LiveBinance { kycVerify?: number | null; payBy?: number | null; releaseBy?: number | null }

/**
 * Whether a sell order's client is still to be verified, for the pay deadline's wording: the server's own step decision
 * (the one its drafts follow: a re-check after "verified", say, or Binance's stale "required" next to the chat's Verified
 * notice). Binance's live field only adds caution: a "required, not verified" the answer did not know means not verified;
 * "verified" or "no extra KYC" waits for the facts to be reloaded (the panel asks at once), since our own KYC or a re-check
 * may still apply. With no answer yet, Binance's live field alone, and an unknown field counts as not verified.
 */
function kycPendingFor(live: number | null, server: ServerFacts | null | undefined): boolean {
  const answered = server?.binance_kyc ?? null;
  if (live === 1 && (answered === null || answered < 1)) return true;
  if (typeof server?.before_verification === 'boolean') return server.before_verification;
  if (server) return String(server.situation ?? '').startsWith('sell.kyc');
  return live !== 2 && live !== 0;
}

/**
 * The deadlines to show: Binance's live values from the screen for the order's current status first (so they also show
 * while no client message waits), else the server's last answer; our appeal case comes from the server.
 */
export function deadlineContext(a: {
  tradeType?: string | null; orderStatus?: string | null; live?: LiveBinance | null; server?: ServerFacts | null;
}): DeadlineContext {
  const t = String(a.tradeType ?? '').toUpperCase();
  const side = t === 'BUY' || t === 'SELL' ? t : a.server?.side ?? null;
  const status = orderStatusCode(a.orderStatus);
  // Binance times are milliseconds; anything else (seconds, junk) is not shown.
  const iso = (ms: number | null | undefined) => (typeof ms === 'number' && ms > 1.5e12 && ms < 4.1e12 ? new Date(ms).toISOString() : null);
  const kycPending = side === 'SELL' && kycPendingFor(a.live?.kycVerify ?? null, a.server);
  const out = !status
    ? { side, pay_by: a.server?.pay_by ?? null, release_by: a.server?.release_by ?? null }
    : {
      side,
      pay_by: status === 'TRADING' ? iso(a.live?.payBy) ?? a.server?.pay_by ?? null : null,
      release_by: status === 'BUYER_PAYED' ? iso(a.live?.releaseBy) ?? a.server?.release_by ?? null : null,
    };
  return { ...out, appeal_case: a.server?.appeal_case ?? null, kyc_pending: kycPending };
}

/**
 * Ask again, once, when the screen learns Binance's extra-KYC value for an open sell order and neither the last request
 * nor its answer knew it: "verified" (2), or any value when the answer did not know the field at all. With a client
 * message waiting: fresh suggestions for the right step. With nothing to answer and only the order facts shown: the facts
 * again (no AI), so the situation line follows Binance; drafts asked for by hand are kept. Never while a request is
 * scheduled or running (it carries or brings the value), and never once the order is marked paid (Binance's status
 * decides then).
 */
export function kycReload(a: {
  side: string | null | undefined; status: string | null | undefined; live: number | null | undefined; sent: number | null | undefined;
  answered: number | null | undefined; waiting: boolean; pending: boolean;
  /** What the panel shows is the order facts only (nothing to answer), so a facts-only request replaces nothing. */
  factsOnly: boolean;
}): 'suggest' | 'context' | null {
  if (a.pending || String(a.side ?? '').toUpperCase() !== 'SELL' || orderStatusCode(a.status) !== 'TRADING') return null;
  if (a.live === null || a.live === undefined || a.live === a.sent) return null;
  const news = a.live === 2 ? a.answered !== 2 : a.answered === null || a.answered === undefined;
  if (!news) return null;
  if (a.waiting) return 'suggest';
  return a.factsOnly ? 'context' : null;
}

/**
 * On an open sell order the first request waits a moment (at most 3 s) for Binance's live extra-KYC value while the screen
 * is still loading the order detail, so its suggestions are made for the right step instead of being paid for twice.
 */
export const KYC_WAIT_MS = 3_000;
export function waitForLiveKyc(a: { side: string | null | undefined; status: string | null | undefined; live: number | null | undefined; loading: boolean }): boolean {
  return a.loading && (a.live === null || a.live === undefined) && String(a.side ?? '').toUpperCase() === 'SELL' && orderStatusCode(a.status) === 'TRADING';
}

/**
 * Binance's deadlines that matter now, with the time left: paying while the order is open; releasing once it is marked
 * paid; our appeal case's check-in timer. Amber when close, red when (nearly) over.
 */
export function deadlineChips(ctx: DeadlineContext | null | undefined, now: number): ContextChip[] {
  if (!ctx) return [];
  const out: ContextChip[] = [];
  const clock = (ms: number) => istClock(ms, now);
  const chip = (key: string, main: string, left: string | null, tone: ContextChip['tone'], title: string): ContextChip =>
    ({ key, label: left ? `${main} · ${left}` : main, main, ...(left ? { left } : {}), tone, title });
  const pay = isoMs(ctx.pay_by);
  if (pay) {
    const u = until(pay, now);
    const tone = u.past || u.mins < 3 ? 'red' : u.mins < 10 ? 'amber' : 'muted';
    if (ctx.side === 'SELL' && ctx.kyc_pending) {
      // Before verification the deadline only means the order expires: never "time to pay".
      out.push(chip('pay', u.past ? 'Order time over' : `Order expires ${clock(pay)}`, u.past ? null : minsLabel(u.mins), tone,
        `Binance cancels the order at ${clock(pay)} if it is not marked paid. The client is not verified yet: don't ask them to pay.`));
    } else if (ctx.side === 'BUY') {
      out.push(chip('pay', u.past ? 'Our pay time over' : `We pay by ${clock(pay)}`, u.past ? null : minsLabel(u.mins), tone,
        `Binance cancels the order if we have not paid and marked it paid by ${clock(pay)}.`));
    } else {
      out.push(chip('pay', u.past ? "Client's pay time over" : `Client pays by ${clock(pay)}`, u.past ? null : minsLabel(u.mins), tone,
        `Binance cancels the order if the client has not paid and marked it paid by ${clock(pay)}.`));
    }
  }
  const release = isoMs(ctx.release_by);
  if (release) {
    const u = until(release, now);
    if (ctx.side === 'BUY') {
      out.push(chip('release', u.past ? (u.mins >= 1 ? 'Client release overdue' : 'Client release time up') : `Client releases by ${clock(release)}`,
        u.past ? (u.mins >= 1 ? minsLabel(u.mins) : null) : minsLabel(u.mins), u.past ? 'red' : u.mins < 5 ? 'amber' : 'muted',
        `The client should release the crypto by ${clock(release)}.`));
    } else {
      out.push(chip('release', u.past ? (u.mins >= 1 ? 'Release time passed' : 'Release time up') : `Release by ${clock(release)}`,
        u.past ? (u.mins >= 1 ? `${minsLabel(u.mins)} ago` : null) : minsLabel(u.mins), u.past ? 'red' : u.mins < 5 ? 'amber' : 'muted',
        `Check that the money has arrived in our account, then release (Binance's release time: ${clock(release)}).`));
    }
  }
  const ac = ctx.appeal_case;
  if (ac) {
    const due = isoMs(ac.response_due);
    if (due) {
      const u = until(due, now);
      out.push(chip('appeal-case', u.past ? (u.mins >= 1 ? 'Appeal check-in overdue' : 'Appeal check-in due now') : `Appeal check-in due ${clock(due)}`,
        u.past ? (u.mins >= 1 ? minsLabel(u.mins) : null) : minsLabel(u.mins), u.past || u.mins < 10 ? 'red' : 'amber',
        "Our team's check-in timer on this appeal (Appeals page)."));
    } else {
      out.push({
        key: 'appeal-case', label: ac.status === 'requested' ? 'Appeal requested' : 'Appeal open · no check-in timer', tone: 'amber',
        title: 'Our team has an appeal case for this order (Appeals page).',
      });
    }
  }
  return out;
}

const ON_FILE: Record<string, string> = {
  aadhaar: 'Aadhaar', pan: 'PAN', vkyc: 'VKYC', bank_statement: 'bank statement', source_of_fund: 'source of funds', phone: 'phone',
};

/** What we hold on the client, for one line in the panel ("4 earlier orders · on file: Aadhaar, PAN, phone"), plus warnings. */
export function clientSummary(c: {
  on_file: string[]; earlier_orders: number | null; appeals: number | null; name_check: string | null; limit_request_pending: boolean;
} | null | undefined): { text: string | null; warnings: ContextChip[] } {
  if (!c) return { text: null, warnings: [] };
  const parts: string[] = [];
  if (c.earlier_orders != null) parts.push(c.earlier_orders === 0 ? 'first order on this side' : `${c.earlier_orders} earlier order${c.earlier_orders === 1 ? '' : 's'}`);
  const files = (c.on_file ?? []).map((k) => ON_FILE[k] ?? k.replace(/_/g, ' '));
  parts.push(files.length ? `on file: ${files.join(', ')}` : 'nothing on file');
  const warnings: ContextChip[] = [];
  if (c.name_check === 'mismatch') {
    warnings.push({ key: 'name', label: 'Name differs from client record', tone: 'amber', title: 'The name on Binance does not match our client record: watch for a third-party payment.' });
  }
  if (c.appeals) {
    warnings.push({ key: 'appeals', label: `${c.appeals} appeal${c.appeals === 1 ? '' : 's'} on this client's orders`, tone: 'amber', title: "Appeal cases on this client's orders, this one included (as the client card counts them)." });
  }
  if (c.limit_request_pending) warnings.push({ key: 'limit', label: 'Limit request pending', tone: 'amber', title: 'This client has a limit request waiting.' });
  return { text: parts.join(' · '), warnings };
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
