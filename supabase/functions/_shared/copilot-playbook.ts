// deno-lint-ignore-file no-explicit-any
// Copilot v2 (Playbook): pure helpers shared by copilot-draft and copilot-learn.
// No network, no database, no Deno.env here — everything is unit-tested in copilot-playbook.test.ts.
import { beforeVerification, invitesPayment } from './copilot-situation.ts'
import { normalizeText } from './copilot-numbers.ts'

// ─── Chat transcript ────────────────────────────────────────────────────────────────────────────────

export type Who = 'client' | 'us' | 'auto' | 'system';
export interface ChatRow {
  id?: string | null;
  binance_message_id?: string | null;
  dedupe_key?: string | null;
  message_type?: string | null;
  sender_is_self?: boolean | null;
  is_system_message?: boolean | null;
  is_recall?: boolean | null;
  message_text?: string | null;
  binance_create_time?: number | string | null;
  /** The Binance account the chat is on (as the listener stored it). */
  exchange_account_id?: string | null;
}
/** event: Binance's event type for system messages (e.g. maker_verified_additional_kyc_maker_sell), 'kyc_card' for its KYC card. */
export interface Msg { id: string; at: number; who: Who; text: string; kind: string; event?: string }

const SYSTEM_EVENTS: Record<string, string> = {
  order_created_with_additional_kyc_maker_sell: 'Order created. Binance asked the client for additional KYC.',
  order_created_with_additional_kyc_disclaimer: 'Binance showed the additional-KYC notice.',
  maker_verified_additional_kyc_maker_sell: "We confirmed the client's additional KYC on Binance.",
  seller_payed: 'The order was marked as paid.',
  buyer_payed: 'The order was marked as paid.',
  seller_completed: 'Order completed.',
  buyer_completed: 'Order completed.',
  seller_cancelled: 'Order cancelled.',
  buyer_cancelled: 'Order cancelled.',
  seller_reason_buyer_requested: 'Cancelled at the buyer\'s request.',
  seller_reason_expired: 'Cancelled because the payment time ran out.',
  buyer_merchant_trading: 'Order created.',
  seller_merchant_trading: 'Order created.',
  risk_alert: 'Binance showed a risk warning in this chat.',
  nlp_image_scam: 'Binance flagged an image in this chat as a possible scam.',
  be_appeal: 'An appeal was opened on this order.',
  submit_appeal: 'An appeal was submitted on this order.',
}

function parseJson(text: string): any {
  try { return JSON.parse(text) } catch { return null }
}

export function describeSystem(text: string): string {
  const j = parseJson(text.trim())
  const type = typeof j?.type === 'string' ? j.type : ''
  if (type.startsWith('c2c_extend_pay_time')) return 'Binance offered or applied a payment-time extension.'
  if (type && SYSTEM_EVENTS[type]) return SYSTEM_EVENTS[type]
  if (type) return `Binance notice: ${type.replace(/_/g, ' ')}.`
  return text.slice(0, 200)
}

export function describeCard(text: string): string {
  const j = parseJson(text.trim())
  if (Array.isArray(j?.addKycVrfInfo)) {
    const titles = j.addKycVrfInfo.map((x: any) => String(x?.displayTitleValue ?? '')).filter(Boolean)
    return `[Binance KYC request card${titles.length ? `: ${titles.join(', ')}` : ''}]`
  }
  return '[card]'
}

/** Builds the readable chat (oldest first). Our auto-replies are echoed twice by Binance; keep one. */
export function buildTranscript(rows: ChatRow[], hint?: { id?: string | null; text?: string | null } | null): Msg[] {
  const out: Msg[] = []
  const sorted = [...rows].sort((a, b) => Number(a.binance_create_time ?? 0) - Number(b.binance_create_time ?? 0))
  const seenAuto = new Map<string, number>()
  for (const r of sorted) {
    if (r.is_recall) continue
    const type = String(r.message_type ?? 'text')
    const raw = String(r.message_text ?? '')
    const at = Number(r.binance_create_time ?? 0)
    const id = String(r.binance_message_id || r.dedupe_key || r.id || `${at}`)
    if (type === 'error') continue
    if (type === 'system' || r.is_system_message) {
      const j = parseJson(raw.trim())
      const event = typeof j?.type === 'string' ? j.type : undefined
      out.push({ id, at, who: 'system', kind: 'system', text: describeSystem(raw), ...(event ? { event } : {}) })
      continue
    }
    if (type === 'auto_reply') {
      const key = raw.trim().toLowerCase()
      const prev = seenAuto.get(key)
      if (prev !== undefined && Math.abs(at - prev) < 15_000) continue
      seenAuto.set(key, at)
      out.push({ id, at, who: 'auto', kind: 'auto_reply', text: raw.trim() })
      continue
    }
    const who: Who = r.sender_is_self ? (type === 'card' ? 'auto' : 'us') : 'client'
    const text = type === 'image' ? '[image]' : type === 'file' ? '[file]' : type === 'card' ? describeCard(raw) : raw.trim()
    if (!text) continue
    const kycCard = type === 'card' && text.startsWith('[Binance KYC request card')
    out.push({ id, at, who, kind: type, text, ...(kycCard ? { event: 'kyc_card' } : {}) })
  }
  const h = hint && typeof hint.text === 'string' ? hint.text.trim() : ''
  if (h) {
    const hid = String(hint?.id ?? '')
    const known = out.some((m) => (hid && m.id === hid) || (m.who === 'client' && m.text === h && m === out[out.length - 1]))
    if (!known) out.push({ id: hid || `hint-${out.length}`, at: (out[out.length - 1]?.at ?? 0) + 1, who: 'client', kind: 'text', text: h })
  }
  return out
}

/** Last few chat lines (masked) kept with a suggestion, so an inbox conflict can be judged with the chat in front of you. */
export function chatTail(t: Msg[], n = 6): Array<{ from: string; at: string; text: string }> {
  return t.filter((m) => m.who !== 'system').slice(-n).map((m) => ({
    from: m.who === 'client' ? 'client' : 'us', at: istLabel(m.at), text: maskPII(m.text).slice(0, 220),
  }))
}

/**
 * The chat before the client's current turn (up to and including our last human message): the last few lines,
 * masked, with Binance's events. Its embedding is how a reply's example chats are compared with this chat.
 */
export function chatBefore(t: Msg[], n = 6): Array<{ from: string; text: string }> {
  let lastUs = -1
  t.forEach((m, i) => { if (m.who === 'us') lastUs = i })
  const before = lastUs >= 0 ? t.slice(0, lastUs + 1) : t.filter((m) => m.who === 'system')
  return before.filter((m) => m.who !== 'auto' || m.kind === 'auto_reply').slice(-n).map((m) => ({
    from: m.who === 'client' ? 'client' : m.who === 'system' ? 'system' : 'us', text: maskPII(m.text).slice(0, 160),
  }))
}

/** The text embedded for a chat: its situation and the lines before the client's question. */
export function contextText(lines: Array<{ from: string; text: string }>, situationLabel: string | null | undefined): string {
  const head = situationLabel ? `situation: ${situationLabel}` : ''
  return [head, ...lines.map((l) => `${l.from}: ${l.text}`)].filter(Boolean).join('\n').slice(0, 1500)
}

/** Client messages after our last human message (what still needs an answer). */
export function clientTurn(t: Msg[]): { messages: Msg[]; question: string; lastId: string } | null {
  let lastUs = -1
  t.forEach((m, i) => { if (m.who === 'us') lastUs = i })
  const msgs = t.slice(lastUs + 1).filter((m) => m.who === 'client')
  if (!msgs.length) return null
  const texts = msgs.filter((m) => m.kind === 'text').map((m) => m.text)
  const recent = (texts.length ? texts : msgs.map((m) => m.text)).slice(-3)
  // Masked before it is cut, so a number at the cut is never left half there.
  return { messages: msgs, question: maskPII(recent.join(' / ')).slice(0, 600), lastId: msgs[msgs.length - 1].id }
}

// ─── Personal data masking ──────────────────────────────────────────────────────────────────────────

/** UPI handles of Indian banks and apps (the part after the "@"): Google Pay's "ok…", Paytm's "pt…", names with a bank's
 *  name in them, and the other banks and apps. The screen keeps the same list (copilotText.ts). */
const UPI_HANDLES = String.raw`ok[a-z]{2,16}|pt[a-z]{2,12}|wa(?:axis|hdfcbank|icici|sbi)|[a-z]{0,12}(?:bank|axis|icici|hdfc|sbi|idfc)[a-z]{0,12}|ybl|ibl|axl|apl|yapl|upi|paytm|pockets|freecharge|jio|airtel|slc|mbk|ikwik|abfspay|pnb|boi|ubi|cnrb|cboi|citi|citigold|hsbc|dbs|rbl|aubank|kbl|kvb|kmbl|kmb|kotak|fbl|federal|sib|iob|uco|idbi|jkb|nsdl|fam|timecosmos|dlb|equitas|esaf|fino|finobank|mahb|postbank|psb|sc|scb|tjsb|uboi|utbi|vijb|barodampay|indus|indusind|yes|yesbank|yesbankltd|superyes`

/**
 * Personal numbers and handles, in the order they are masked (each pattern sees the text the earlier ones left). Rewording
 * swaps the same values for reversible tokens (copilot-rephrase.ts), so both always agree on what is personal.
 */
/** Whether a match may be masked, given the whole text (what comes before or after it). Checks that would need a lookbehind
 *  live here, so the screen's copy (copilotText.ts maskPersonal) can run the very same code. */
export type Accept = (m: RegExpExecArray, s: string) => boolean
export type PiiPattern = readonly [RegExp, string, Accept?]

const isDigit = (c: string) => c >= '0' && c <= '9'
const digitsBefore = (s: string, j: number) => { let k = j; while (k > 0 && isDigit(s[k - 1])) k--; return j - k }
const digitsAfter = (s: string, j: number) => { let k = j; while (k < s.length && isDigit(s[k])) k++; return k - j }

/**
 * Nine or more digits in a row, not part of a longer run. "0.123456789" (a fraction) and "123456789.5" (the whole part of a
 * decimal) are amounts, unless the number across the dot is itself that long ("412345678901.412345678902"). Commas never
 * group four or more digits, so "412345678901,412345678902" is two values.
 */
const longRun: Accept = (m, s) => {
  const i = m.index, end = i + m[0].length
  if (isDigit(s.charAt(i - 1)) || isDigit(s.charAt(end))) return false
  if (s.charAt(i - 1) === '.' && digitsBefore(s, i - 1) > 0 && digitsBefore(s, i - 1) < 9) return false
  if (s.charAt(end) === '.' && digitsAfter(s, end + 1) > 0 && digitsAfter(s, end + 1) < 9) return false
  return true
}

/**
 * Digits in groups joined by single spaces, dots or hyphens: ten or more whatever the groups or separators (a phone written
 * "98 76 54 32 10", "0755-234 5678"), nine when the groups share one separator and one has three digits or more
 * ("123 456 789"). One decimal number ("1052.63157894") and a date with or without its hour ("18-10-2026 10") are not
 * values, and neither is a run that starts inside another one.
 */
const groupedRun: Accept = (m, s) => {
  const t = m[0], i = m.index, p = s.charAt(i - 1)
  if (isDigit(p) || ((p === ' ' || p === '.' || p === ',' || p === '-') && isDigit(s.charAt(i - 2)))) return false
  if (/^\d+\.\d+$/.test(t)) return false
  const d = /^(\d{1,2})([.-])(\d{1,2})\2(\d{2}|\d{4})(?: (\d{1,2}))?$/.exec(t)
  if (d && +d[1] >= 1 && +d[1] <= 31 && +d[3] >= 1 && +d[3] <= 12 && (d[5] === undefined || +d[5] <= 23)) return false
  const groups = t.split(/[ .-]/)
  const digits = groups.join('').length
  if (digits >= 10) return true
  return digits === 9 && new Set(t.replace(/\d/g, '')).size === 1 && groups.some((g) => g.length >= 3)
}

/**
 * Replaces each match of the global `re` that `ok` accepts (every match when there is no `ok`). A refused match lets the
 * search go on one character later, as a lookbehind would.
 */
export function replaceAccepted(t: string, re: RegExp, ok: Accept | undefined, by: (m: string) => string): string {
  if (!ok) return t.replace(re, (m) => by(m))
  let out = '', last = 0
  re.lastIndex = 0
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (!m[0].length) { re.lastIndex++; continue }
    if (!ok(m, t)) { re.lastIndex = m.index + 1; continue }
    out += t.slice(last, m.index) + by(m[0])
    last = m.index + m[0].length
    re.lastIndex = last
  }
  re.lastIndex = 0
  return out + t.slice(last)
}

export const PII_PATTERNS: ReadonlyArray<PiiPattern> = [
  // Transaction hashes (0x + 64 hex, or 64 hex), then crypto wallet addresses (TRON, Ethereum/BSC, Bitcoin and Litecoin in
  // either case, TON), before the digit patterns cut them into pieces.
  [/\b0x[a-fA-F0-9]{64}\b|\b[a-fA-F0-9]{64}\b/g, '[ref]'],
  [/\bT[1-9A-HJ-NP-Za-km-z]{33}\b|\b0x[a-fA-F0-9]{40}\b|\b(?:[bB][cC]1|[lL][tT][cC]1)[a-zA-Z0-9]{25,59}\b|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b|\b[EU]Q[A-Za-z0-9_-]{46}(?![A-Za-z0-9_-])/g, '[wallet]'],
  [/[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  [/\b[A-Z0-9][A-Z0-9._-]{1,255}@[A-Z][A-Z0-9]{1,63}\b/gi, '[upi]'],
  // A one-character UPI name only with a bank's own handle ("a@ybl"): elsewhere "x@yz" is too often something else.
  [new RegExp(String.raw`\b[A-Z0-9]@(?:${UPI_HANDLES})\b`, 'gi'), '[upi]'],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, '[pan]'],
  [/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, '[ifsc]'],
  // Twelve digits in fours; a longer run (a card number) is masked whole further down.
  [/(?<!\d[\s-])\b\d{4}[\s-]\d{4}[\s-]\d{4}\b(?![\s-]\d)/g, '[aadhaar]'],
  [/(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, '[phone]'],
  [/\b[A-Z]{2,8}\d{8,}[A-Z0-9]*\b/gi, '[ref]'],
  // A long reference of letters and digits mixed ("UTRABCDE1234F567890"), whatever shape its middle has.
  [/\b(?=[A-Z0-9]*\d{4})(?=[A-Z0-9]*[A-Z]{2})[A-Z0-9]{12,}\b/gi, '[ref]'],
  [/\d{9,}/g, '[number]', longRun],
  // Other countries' phone numbers, then digits in groups (987-654-3210, 98765 43210, account and card numbers in groups, a
  // phone written digit by digit). Commas never join digits here, so amounts such as 1,00,000 stay.
  [/\+\d{1,3}(?:[\s-]?\d){7,13}(?!\d)/g, '[phone]'],
  [/\d{1,18}(?:[ .-]\d{1,18})+/g, '[number]', groupedRun],
  // A UPI ID written with spaces around the "@" ("blynk @ ybl", "a @ ybl"), with a bank's own handle only.
  [new RegExp(String.raw`\b[A-Z0-9][A-Z0-9._-]{0,255}(?:\s+@\s*|\s*@\s+)(?:${UPI_HANDLES})\b`, 'gi'), '[upi]'],
]

/**
 * Masks personal numbers and handles before any text reaches an AI model or the Playbook. Masking one value can open a word
 * boundary next to another ("98765 43210ABCDE1234F"), so it repeats until nothing changes.
 */
export function maskPII(input: string | null | undefined): string {
  // Read as the checks read it: Devanagari and full-width digits as digits, invisible characters gone.
  const raw = String(input ?? '')
  const norm = normalizeText(raw)
  let t = norm
  for (let pass = 0; pass < 4; pass++) {
    const before = t
    for (const [re, tag, ok] of PII_PATTERNS) t = replaceAccepted(t, re, ok, () => tag)
    if (t === before) break
  }
  // Nothing personal: the text exactly as given (callers compare maskPII(x) with x to tell "something was masked").
  return t === norm ? raw : t
}

// ─── Language and address ───────────────────────────────────────────────────────────────────────────

const HINDI_WORDS = new Set([
  'hai', 'hain', 'ho', 'hoga', 'hogi', 'hoge', 'hua', 'hui', 'hue', 'kya', 'kyu', 'kyun', 'kyon', 'kaise', 'kaisa', 'kab', 'kahan',
  'kitna', 'kitni', 'kitne', 'nahi', 'nahin', 'nhi', 'haan', 'ji', 'aap', 'aapka', 'aapke', 'aapki', 'apna', 'apne', 'apni',
  'mera', 'meri', 'mere', 'mujhe', 'muje', 'mai', 'main', 'hum', 'humko', 'hame', 'hamara', 'hamare', 'tum', 'tumhe', 'karo', 'kar',
  'karna', 'karke', 'kiya', 'kiye', 'kari', 'krna', 'kro', 'kr', 'diya', 'diye', 'dena', 'dedo', 'dijiye', 'kijiye', 'karein',
  'lena', 'bhej', 'bhejo', 'bhejna', 'bhejdo', 'bheja', 'bheji', 'raha', 'rahi', 'rahe', 'rha', 'rhi', 'rhe', 'paisa', 'paise', 'abhi',
  'jaldi', 'thoda', 'thodi', 'accha', 'acha', 'achha', 'theek', 'thik', 'wala', 'wali', 'wale', 'gaya', 'gayi', 'gya', 'gyi',
  'chahiye', 'sakta', 'sakti', 'sakte', 'bhai', 'bhaiya', 'yaar', 'kripya', 'dhanyawad', 'dhanyavad', 'shukriya', 'matlab', 'lekin',
  'aur', 'bhi', 'toh', 'mein', 'ka', 'ki', 'ke', 'se', 'hu', 'hoon', 'hun', 'tha', 'thi', 'the', 'ab', 'kal', 'aaj', 'kuch',
  'sab', 'baad', 'pehle', 'wapas', 'batao', 'bataiye', 'dekho', 'dekhiye', 'samjha', 'samjhe', 'bolo', 'boliye', 'liye', 'gye',
])
// "the" is excluded from the English list below because Hinglish uses "the" (were) as well.
const ENGLISH_WORDS = new Set([
  'is', 'are', 'am', 'was', 'were', 'be', 'been', 'you', 'your', 'i', 'my', 'we', 'our', 'it', 'this', 'that', 'please',
  'when', 'will', 'would', 'can', 'could', 'how', 'what', 'why', 'where', 'which', 'who', 'have', 'has', 'had', 'does', 'did',
  'not', 'with', 'for', 'from', 'and', 'or', 'but', 'if', 'of', 'in', 'on', 'at', 'by', 'about', 'after', 'before', 'now',
  'then', 'there', 'here', 'yes', 'thanks', 'thank', 'kindly', 'sure', 'sent', 'received', 'waiting', 'give', 'get', 'got',
  'need', 'want', 'already', 'still', 'yet', 'just', 'an', 'a', 'me', 'us', 'they', 'them', 'do', 'to', 'so', 'should', 'shall',
  'let', 'know', 'tell', 'much', 'many', 'long', 'time', 'today', 'tomorrow', 'done', 'okay',
])

export type Lang = 'en' | 'hi' | 'neutral'

export function detectLang(text: string | null | undefined): Lang {
  const t = String(text ?? '')
  if (/[ऀ-ॿ]/.test(t)) return 'hi'
  const words = t.toLowerCase().match(/[a-z']+/g) ?? []
  let h = 0, e = 0
  for (const w of words) {
    if (HINDI_WORDS.has(w)) h++
    else if (ENGLISH_WORDS.has(w)) e++
  }
  if (h >= 2 && h >= e) return 'hi'
  if (h >= 1 && e === 0) return 'hi'
  if (e >= 1 && e > h) return 'en'
  return 'neutral'
}

export interface LanguageDecision { lang: 'en' | 'hi'; englishRepliesInStreak: number; clientWritesHindi: boolean; reason: string }

/**
 * English by default. Switch to Hindi (Roman script) only when the client keeps writing Hindi after
 * `switchAfter` of our English replies; then stay in Hindi unless the client goes back to English.
 * If one of us already replied in Hindi, follow that.
 */
export function decideLanguage(t: Msg[], switchAfter: number): LanguageDecision {
  let mode: 'en' | 'hi' = 'en'
  let streak = false
  let englishReplies = 0
  let reason = 'English by default'
  for (const m of t) {
    if (m.who === 'client' && m.kind === 'text') {
      const l = detectLang(m.text)
      if (l === 'hi') {
        if (!streak) { streak = true; englishReplies = 0 }
        if (mode === 'en' && englishReplies >= switchAfter) { mode = 'hi'; reason = `The client kept writing in Hindi after ${englishReplies} English replies` }
      } else if (l === 'en') {
        streak = false
        englishReplies = 0
        if (mode === 'hi') { mode = 'en'; reason = 'The client went back to English' }
      }
    } else if (m.who === 'us' && m.kind === 'text') {
      const l = detectLang(m.text)
      if (l === 'hi') { mode = 'hi'; reason = 'We already replied in Hindi in this chat' }
      else if (l === 'en' && streak) englishReplies++
    }
  }
  return { lang: mode, englishRepliesInStreak: englishReplies, clientWritesHindi: streak, reason }
}

const FEMININE = [
  /\b(rahi|karti|chahti|sakti|chuki|deti|leti|bhejti|gayi|gai|aayi|aai)\s+(hu|hun|hoon|hoo|hu+n)\b/i,
  /\b(main|mai)\s+(?:\w+\s+){0,3}(rahi|karti|chahti|sakti|chuki|gayi|aayi)\s+thi\b/i,
  /\bi\s*(am|'m)\s+(a\s+)?(lady|woman|girl|female|housewife|mother|mom)\b/i,
  /\b(myself|this is|i am|i'm)\s+(mrs|ms|miss)\b/i,
  /\b(call|address)\s+me\s+(as\s+)?ma'?am\b/i,
  /\bas\s+a\s+(woman|lady)\b/i,
  /(रही|करती|गई|सकती|चाहती)\s*(हूँ|हूं|हू)/,
]

/** "ma'am" only when the client refers to herself in the feminine, in her own words. Never from a name. */
export function decideAddress(t: Msg[]): 'sir' | 'maam' {
  return t.some((m) => m.who === 'client' && m.kind === 'text' && FEMININE.some((re) => re.test(m.text))) ? 'maam' : 'sir'
}

/** Stored replies use "sir"; this switches them for the chat at hand (and back, for storage). */
export function applyAddress(text: string, address: 'sir' | 'maam'): string {
  if (address === 'maam') {
    return text.replace(/\bsir\b/gi, (w) => (w === 'SIR' ? "MA'AM" : w[0] === 'S' ? "Ma'am" : "ma'am"))
  }
  return text.replace(/\bma'?am\b/gi, (w) => (w === w.toUpperCase() ? 'SIR' : w[0] === 'M' ? 'Sir' : 'sir'))
}

export function greetingFor(date: Date): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(date))
  if (h >= 4 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function istLabel(ms: number | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms)
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

// ─── Order and client context ───────────────────────────────────────────────────────────────────────

export type Side = 'BUY' | 'SELL'
export interface SmallRange { min: number; max: number; enabled: boolean }

export function normSide(v: unknown): Side | null {
  const s = String(v ?? '').trim().toUpperCase()
  return s === 'BUY' || s === 'SELL' ? s : null
}

export function normStatus(v: unknown): string {
  const s = String(v ?? '').trim().toUpperCase()
  const num: Record<string, string> = { '1': 'TRADING', '2': 'BUYER_PAYED', '3': 'BUYER_PAYED', '4': 'COMPLETED', '5': 'APPEAL', '6': 'CANCELLED', '7': 'CANCELLED_BY_SYSTEM' }
  if (num[s]) return num[s]
  if (s === 'IN_APPEAL') return 'APPEAL'
  return s || 'UNKNOWN'
}

export function orderCategory(side: Side | null, amount: number | null, sales: SmallRange | null, buys: SmallRange | null): 'small' | 'regular' {
  const r = side === 'SELL' ? sales : side === 'BUY' ? buys : null
  if (!r || !r.enabled || amount === null || !Number.isFinite(amount)) return 'regular'
  return amount >= r.min && amount <= r.max ? 'small' : 'regular'
}

export function sideMeaning(side: Side | null): string {
  if (side === 'SELL') return 'We sell crypto to the client. The client pays us in INR; we release the crypto only after we verify the money in our account.'
  if (side === 'BUY') return 'We buy crypto from the client. We pay the client in INR; the client then releases the crypto to us.'
  return 'Side unknown.'
}

export function statusMeaning(side: Side | null, status: string): string {
  if (status === 'TRADING') return side === 'BUY' ? 'Order open: we have not paid the client yet.' : 'Order open: the client has not marked the order as paid yet.'
  if (status === 'BUYER_PAYED') return side === 'BUY' ? 'We marked the order as paid; waiting for the client to release the crypto.' : 'The client marked the order as paid; we must verify the money before releasing.'
  if (status === 'COMPLETED') return 'Order completed.'
  if (status.startsWith('CANCEL')) return 'Order cancelled.'
  if (status === 'APPEAL') return 'Order is under appeal: stay calm and make no commitments.'
  return 'Status unknown.'
}

export type ClientState = 'new' | 'linked' | 'approved'

/** Client panel data (get_terminal_order_client) → the facts the AI may use. Nothing personal. */
export function clientFacts(side: Side | null, c: any): { state: ClientState; facts: Record<string, unknown> } {
  if (!c || c.status !== 'linked' || !c.client) {
    return { state: 'new', facts: { state: 'new', note: c?.status === 'identity_pending' ? 'Client identity not known yet' : 'Not an existing client in our records' } }
  }
  const cl = c.client
  const approval = side === 'BUY' ? cl.seller_status : cl.buyer_status
  const state: ClientState = String(approval ?? '').toUpperCase() === 'APPROVED' ? 'approved' : 'linked'
  const docs = c.documents ?? {}
  const onFile = ['aadhaar', 'pan', 'vkyc', 'bank_statement', 'source_of_fund'].filter((k) => docs[k] === true)
  const hist = c.history ?? {}
  const oc = c.order_context ?? {}
  const count = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  const nameCheck = ['match', 'partial', 'mismatch'].includes(String(oc.name_check)) ? String(oc.name_check) : 'unknown'
  return {
    state,
    facts: {
      state,
      kyc_status: cl.kyc_status ?? null,
      approval_for_this_side: approval ?? null,
      documents_on_file: onFile,
      // Yes or no only: the number itself never leaves the database.
      phone_on_file: !!cl.phone_masked,
      purpose_on_file: cl.purpose ? true : false,
      source_of_funds_on_file: c.client?.income?.source ? true : false,
      completed_buys_with_us: hist.buy_count ?? null,
      completed_sells_to_us: hist.sell_count ?? null,
      earlier_binance_orders_this_side: count(oc.side_completed),
      other_orders_today_this_side: count(oc.today_other_count),
      orders_last_90_days: count(oc.orders_90d),
      cancelled_last_90_days: count(oc.cancelled_90d),
      appeals_on_this_clients_orders: count(oc.appeals),
      binance_name_vs_client_record: nameCheck,
      limit_request_pending: c.limit_request_pending === true,
    },
  }
}

// ─── Risk signals (no AI) ───────────────────────────────────────────────────────────────────────────

export interface Risk { code: string; label: string; level: 'amber' | 'red' }
const RISK_RULES: Array<{ code: string; label: string; level: 'amber' | 'red'; re: RegExp }> = [
  { code: 'third_party', label: 'Third-party money mentioned', level: 'red',
    re: /\b(friend'?s?|brother'?s?|father'?s?|mother'?s?|wife'?s?|husband'?s?|relative'?s?|someone else'?s?|other person'?s?|third[\s-]?party|dost|bhai|papa|mummy|bhabhi|biwi)\b[^.?!]{0,30}\b(account|a\/c|upi|card|pay|payment|se pay|ke account|ka account|bhejega|bhejegi|karega|karegi)\b|\b(dusre|kisi aur)\s+(ke|ka|ki)\s+(account|upi)\b/i },
  { code: 'police', label: 'Police, cyber cell or legal notice mentioned', level: 'red',
    re: /\b(police|cyber\s*(cell|crime|police)|fir|court|legal\s+notice|lien|freeze|frozen|hold\s+on\s+(my\s+)?account|1930)\b/i },
  { code: 'threat', label: 'Threat or abuse', level: 'red',
    re: /\b(i will (report|complain|expose)|see you in court|complaint (kar|karunga|karungi)|report kar(unga|ungi|denge))\b/i },
  { code: 'outside_binance', label: 'Offer to trade or pay outside Binance', level: 'red',
    re: /\b(outside|without|off)\s+binance\b|\boff[\s-]?platform\b|\bdirect\s+(deal|trade|transfer|payment)\b|\b(trade|deal|payment|pay)\b[^.?!]{0,30}\b(on|via|through|over)\s+(whatsapp|telegram)\b/i },
  { code: 'scam_fear', label: 'Client mentions scam or fraud', level: 'amber', re: /\b(scam|scammer|fraud|cheat(ing|er)?|dhokha|chor)\b/i },
  { code: 'dispute', label: 'Appeal, chargeback or reversal mentioned', level: 'amber', re: /\b(appeal|chargeback|charge\s*back|reversal|reversed|refund)\b/i },
]

export function detectRisks(t: Msg[], opts: { hasComplaint?: boolean; status?: string } = {}): Risk[] {
  const found = new Map<string, Risk>()
  for (const m of t) {
    if (m.who === 'client' && m.kind === 'text') {
      for (const r of RISK_RULES) if (!found.has(r.code) && r.re.test(m.text)) found.set(r.code, { code: r.code, label: r.label, level: r.level })
    }
    if (m.who === 'system') {
      if (/risk warning|possible scam/i.test(m.text) && !found.has('binance_risk')) found.set('binance_risk', { code: 'binance_risk', label: m.text.replace(/\.$/, ''), level: 'amber' })
      if (/appeal/i.test(m.text) && !found.has('appeal')) found.set('appeal', { code: 'appeal', label: 'Appeal opened on this order', level: 'red' })
    }
  }
  if (opts.hasComplaint && !found.has('appeal')) found.set('appeal', { code: 'appeal', label: 'Active complaint on this order', level: 'red' })
  if (opts.status === 'APPEAL' && !found.has('appeal')) found.set('appeal', { code: 'appeal', label: 'Order is under appeal', level: 'red' })
  return [...found.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1))
}

// ─── Draft safety checks ────────────────────────────────────────────────────────────────────────────

export const PLACEHOLDERS = ['{amount}', '{orderNo}', '{name}', '{upi}']
/** A team's code from copilot_teams (kyc, rm, support, or one added later). */
export type ContactPurpose = string
const CONTACT_TOKEN = /\{contact:([a-z][a-z0-9_]{0,23})\}/g
/** Team codes used in a text, e.g. ['kyc'] for "...reach them at {contact:kyc}". */
export const contactCodes = (text: string): string[] => [...new Set([...String(text ?? '').matchAll(CONTACT_TOKEN)].map((m) => m[1]))]

export interface Guarded { text: string; flags: string[]; blocked: boolean; reasons: string[]; contacts: ContactPurpose[] }

// Hinglish release promises ("USDT abhi release kar denge") unless tied to the payment check ("confirm hote hi").
const HI_RELEASE = /\breleas\w*\s+(kar|kr|ho)\s*(denge|dunga|dungi|diya|dijiye|jayega|jaega|jayegi|raha|rahe|rhe|de|do|rahi)\b/i
const HI_CONDITION = /\b(confirm|verify|verif\w*|check|receive|credit|reflect)\w*\s*(hote hi|hone ke baad|hone par|hone pe|karke|kar ke|ke baad)\b|\b(milte hi|aate hi|aane ke baad|milne ke baad|milne par|aane par)\b/i

/** Safety checks for an AI draft. With the order's side and situation it also holds back a request to pay before KYC is done. */
export function guardDraft(input: string, opts: { side?: Side | null; situation?: string | null } = {}): Guarded {
  let text = String(input ?? '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
  // Normalise placeholder spelling the models sometimes vary.
  text = text.replace(/\{\s*contact\s*[:_-]\s*([a-z][a-z0-9_]{0,23})\s*\}/gi, (_w, p) => `{contact:${String(p).toLowerCase()}}`)
    .replace(/\{\s*(amount|upi|name)\s*\}/gi, (_w, p) => `{${String(p).toLowerCase()}}`)
    .replace(/\{\s*order\s*_?no\s*\}/gi, '{orderNo}')
  const flags: string[] = []
  const reasons: string[] = []
  const block = (flag: string, reason: string) => { if (!flags.includes(flag)) { flags.push(flag); reasons.push(reason) } }

  const promise = /\b(will|shall|'ll|going to|would)\s+(be\s+)?(releas|send (you )?(the )?(usdt|crypto|coins?))/i.test(text)
    || /\breleas(e|ing)\s+(it\s+|the\s+\w+\s+|your\s+\w+\s+)?(now|right away|shortly|soon|immediately|in\s+(a|\d+)\s+(min|minute|second))/i.test(text)
  const conditional = /\b(after|once|as soon as|when|only if)\b[^.?!]{0,80}\b(verif|confirm|receiv|credit|reflect|check)/i.test(text)
  if (promise && !conditional) block('release_promise', 'Promises a release before the payment is verified')
  if (HI_RELEASE.test(text) && !HI_CONDITION.test(text) && !conditional) block('release_promise', 'Promises a release before the payment is verified')

  if (beforeVerification(opts.side ?? null, opts.situation ?? null) && invitesPayment(text)) {
    block('pay_before_verification', 'Asks the client to pay or shows payment details before KYC and verification are complete')
  }

  if (/\b(outside|without|off)\s+(of\s+)?binance\b|\boff[\s-]?platform\b|\bdirect\s+(deal|trade|transfer|payment)\b|\b(trade|deal|buy|sell|pay|payment|transfer)\b[^.?!]{0,40}\b(on|via|through|over)\s+(whatsapp|telegram|signal)\b/i.test(text)) {
    block('outside_binance', 'Suggests trading or paying outside Binance')
  }

  const masked = maskPII(text)
  if (masked !== text || /(?<![\d{])\d{8,}(?!\d)/.test(text)) block('typed_number', 'Contains a phone number, UPI ID, account number or reference typed by the AI')

  const soft: string[] = []
  if (/(₹|\brs\.?|\binr)\s?\d/i.test(text) || /\b\d{1,3}(,\d{2,3})+(\.\d+)?\b/.test(text) || /(?<![\d{])\d{4,7}(?!\d)/.test(text)) soft.push('number_check')
  const unknown = (text.match(/\{[^{}]{1,40}\}/g) ?? []).filter((p) => !PLACEHOLDERS.includes(p) && !/^\{contact:[a-z][a-z0-9_]{0,23}\}$/.test(p))
  if (unknown.length) soft.push('unknown_placeholder')
  if (text.length > 500) soft.push('long')
  if (!text) block('empty', 'The model returned no text')

  const contacts = contactCodes(text)
  return { text, flags: [...flags, ...soft], blocked: reasons.length > 0, reasons, contacts }
}

// ─── Cost ───────────────────────────────────────────────────────────────────────────────────────────

export interface Usage { input: number; output: number; reasoning: number; estimated: boolean }
export type Prices = Record<string, { in: number; out: number }>

export function costInr(model: string, u: Usage, prices: Prices, usdInr: number): number {
  const p = prices?.[model] ?? { in: 10, out: 50 }
  const usd = (u.input * Number(p.in ?? 10) + u.output * Number(p.out ?? 50)) / 1_000_000
  return Math.round(usd * usdInr * 10_000) / 10_000
}

/** Token usage from an OpenAI-compatible response; estimated from text length when missing. */
export function readUsage(resp: any, promptChars: number, outputChars: number): Usage {
  const u = resp?.usage
  const input = Number(u?.prompt_tokens ?? u?.input_tokens ?? NaN)
  const output = Number(u?.completion_tokens ?? u?.output_tokens ?? NaN)
  const reasoning = Number(u?.completion_tokens_details?.reasoning_tokens ?? u?.output_tokens_details?.reasoning_tokens ?? 0) || 0
  if (Number.isFinite(input) && Number.isFinite(output)) return { input, output: Math.max(output, reasoning), reasoning, estimated: false }
  return { input: Math.ceil(promptChars / 3.5), output: Math.ceil(outputChars / 3.5) + 400, reasoning: 0, estimated: true }
}

// ─── Draft prompt ───────────────────────────────────────────────────────────────────────────────────

export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    new_policy: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['reply', 'new_policy', 'note'],
  additionalProperties: false,
}

export const INSTRUCTIONS: Record<string, string> = {
  shorter: 'Make it shorter: one sentence if possible.',
  formal: 'Make it more formal and polite.',
  detail: 'Add a little more detail or explanation, still crisp.',
  hindi: 'Write it in Hindi using English letters (Roman script).',
  english: 'Write it in English.',
}

export interface DraftContext {
  houseStyle: string
  lang: 'en' | 'hi'
  address: 'sir' | 'maam'
  greet: string | null
  order: Record<string, unknown>
  client: Record<string, unknown>
  approved: Array<{ title: string; status: string; examples: string[]; answer: string; similarity: number }>
  /** Approved answers to the same question for other situations: style and still-true facts only. */
  otherSituations?: Array<{ title: string; situations: string[]; answer: string }>
  avoid: Array<{ draft: string; why: string }>
  chat: Array<{ from: string; at: string; text: string }>
  answerThis: string | null
  instruction: string | null
  risks: Risk[]
  now: string
  /** Company teams whose numbers can be given ({contact:<code>}). */
  teams?: Array<{ code: string; label: string; description: string }>
}

/** How Hindi replies are written (drafts, translations): natural Hinglish, not textbook Hindi. */
export const HINGLISH_RULE = 'Hinglish in English letters, the way a polite Indian desk executive chats: short and direct, with the everyday English words people use mixed in (payment, verification, details, account, bank, KYC, order, release, check, confirm, share, wait, minute, process, update). Use the respectful "aap" form. No bookish Hindi: write "please" not "kripya", "thank you" not "dhanyavaad", "contact" not "sampark", "as per" not "anusaar", "under" not "ke tahat", "complete" not "poora", "wait" not "pratiksha", "safe" not "surakshit". Examples: "Sir, verification complete hote hi payment details share kar denge." "Sir, aapka payment process ho raha hai, bas kuch minute." "Sir, apna Aadhaar card (front aur back) aur mobile number share kar dijiye."'

export function buildDraftMessages(c: DraftContext): { system: string; user: string } {
  const langRule = c.lang === 'hi' ? `${HINGLISH_RULE} Keep terms such as Aadhaar, PAN, UPI ID and UTR in English.` : 'English.'
  const system = [
    'You draft one reply that a desk operator of a crypto P2P merchant will send to a client in a Binance P2P order chat. A senior manager reviews every draft before anything is sent.',
    '',
    c.houseStyle.trim(),
    '',
    'For this draft:',
    `- Language: ${langRule}`,
    `- Address the client as "${c.address === 'maam' ? "ma'am" : 'sir'}".`,
    c.greet ? `- This is our first message in the chat: start with "${c.greet}, ${c.address === 'maam' ? "ma'am" : 'sir'}."` : '- Do not greet again.',
    '- Answer "answer_this" (the client\'s latest messages). If it is empty, write the most useful next message for this order.',
    '- "order.situation" is what the client is waiting for right now (worked out from the chat and Binance); "order.situation_means" says what it means and what must not be said. The same question needs a different answer in a different situation (before and after KYC, before and after payment): answer for this one.',
    '- "approved_answers" are company policy for this situation. When one fits, keep its substance exactly; you may adapt the wording slightly. Answers marked "tentative" are unconfirmed suggestions.',
    '- "other_situation_answers" answer the same question for other situations. Use them only for tone and for facts that are still true now; never copy a step that does not fit the current situation.',
    '- Use only facts from the data given. Never state anything about this order, payment or client that is not in the data. If you need information, ask the client, or say we will check.',
    '- "client" holds our internal records: use them to decide what to ask (never ask again for a document or detail we have on file) and how careful to be. Never mention internal records, order counts, past appeals or name checks to the client.',
    '- Deadlines in "order" come from Binance. Only when order.pay_deadline is given on a sell order may you tell the client how much time is left to pay; before verification order.order_expires only lets you ask them to finish the KYC steps quickly. Never promise anything by a deadline.',
    '- Placeholders: {amount} is the order amount, {orderNo} the order number, {name} the client\'s name, {upi} our UPI ID; a company team\'s number is {contact:<team>} with the teams listed in "teams". Use them instead of writing any such value.',
    '- Give a contact number only when the client asks for one (for example which number will call them); never offer one otherwise. Pick the team from "teams" that fits this client and situation.',
    '- Never ask the client to skip or avoid KYC, and never say KYC is not needed. KYC rules come only from the approved answers.',
    '- "avoid" lists earlier drafts a manager rejected for similar questions, with the reason. Do not repeat those mistakes.',
    '- Set "new_policy" to true when your reply states a rule, limit, time frame or requirement that is not in the approved answers or the order data.',
    '- "note": at most 12 words for the manager, for example what you assumed. Empty if nothing to add.',
    c.instruction ? `- Manager's instruction for this draft: ${c.instruction}` : '',
    'Return JSON only.',
  ].filter((l) => l !== '').join('\n')
  const user = JSON.stringify({
    now_ist: c.now,
    order: c.order,
    client: c.client,
    risk_signals: c.risks.map((r) => r.label),
    teams: (c.teams ?? []).map((t) => ({ placeholder: `{contact:${t.code}}`, team: t.label, handles: t.description })),
    approved_answers: c.approved.map((a) => ({ title: a.title, status: a.status, question_examples: a.examples, answer: a.answer })),
    other_situation_answers: (c.otherSituations ?? []).map((a) => ({ title: a.title, for_situations: a.situations, answer: a.answer })),
    avoid: c.avoid,
    chat: c.chat,
    answer_this: c.answerThis ?? '',
  })
  return { system, user }
}

// ─── Question router ("AI picks, Playbook speaks") ──────────────────────────────────────────────────

/** A Playbook question the client may be asking: short id for the model, its title, client wordings, today's reply. */
export interface RouteCandidate { id: string; title: string; wordings: string[]; replyNow: string | null }

/** The model can only answer with one of the candidates' ids or "none". */
export function routeSchema(ids: string[]) {
  return {
    type: 'object',
    properties: {
      pick: { type: 'string', enum: [...ids, 'none'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      reason: { type: 'string' },
    },
    required: ['pick', 'confidence', 'reason'],
    additionalProperties: false,
  }
}

/**
 * When matching by meaning is unsure, a small model picks which approved question the client is asking (or none). It
 * never writes the reply: the approved text of the picked question is what the approver sees.
 */
export function buildRouteMessages(input: {
  now: string
  order: Record<string, unknown>
  chat: Array<{ from: string; at: string; text: string }>
  message: string
  candidates: RouteCandidate[]
}): { system: string; user: string } {
  const system = [
    'You match the latest messages of a client in a Binance P2P order chat with a crypto merchant to one question in the merchant\'s Playbook, so that a manager can be shown its approved reply. You never write replies.',
    '- Pick the candidate the client is asking about now. Read the chat and order.situation: the same words can be a different question at a different step (for example "how long?" after a KYC request is about the KYC; after the client paid it is about the release).',
    '- Pick by what the client asks, even when the candidate has no reply for this step (reply_now is null).',
    '- Pick "none" when no candidate is the same question, when the client asks nothing (a greeting, thanks, "ok"), or only gives information.',
    '- When the client asks several things, pick the main question.',
    '- confidence: "high" when it is clearly the same question, "medium" when it is probably the same question, "low" when unsure.',
    '- reason: at most 12 words, for the manager.',
    'Return JSON only.',
  ].join('\n')
  const user = JSON.stringify({
    now_ist: input.now,
    order: input.order,
    chat: input.chat,
    client_message: input.message,
    candidates: input.candidates.map((c) => ({ id: c.id, question: c.title, client_wordings: c.wordings, reply_now: c.replyNow })),
  })
  return { system, user }
}

// ─── Learning helpers ───────────────────────────────────────────────────────────────────────────────

export interface TemplateValues { amount?: number | string | null; orderNo?: string | null; name?: string | null; upi?: string | null }

function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** Turns a sent message back into a reusable reply: filled values → placeholders, contact numbers → {contact:x}, ma'am → sir. */
export function generalize(text: string, v: TemplateValues, contacts: Array<{ purpose: string; phone: string }>): string {
  let t = String(text ?? '')
  const amt = v.amount === null || v.amount === undefined || v.amount === '' ? null : Number(v.amount)
  if (amt !== null && Number.isFinite(amt)) {
    const forms = new Set<string>([
      amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amt.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      amt.toFixed(2),
      String(amt),
    ])
    for (const f of [...forms].sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(`(?<![\\d,.])${esc(f)}(?![\\d])`, 'g'), '{amount}')
  }
  if (v.orderNo) t = t.replace(new RegExp(esc(String(v.orderNo)), 'g'), '{orderNo}')
  if (v.upi) t = t.replace(new RegExp(esc(String(v.upi)), 'gi'), '{upi}')
  // The client's name as a word, never inside a UPI ID, an email or a handle ("ravi@ybl", "ravi.kumar@okaxis"): replaced
  // there, the value would no longer look like one to the masking, and the saved reply would pay another client's name.
  if (v.name && String(v.name).trim().length >= 3) {
    t = t.replace(new RegExp(`(?<![\\w@.-])${esc(String(v.name).trim())}(?![\\w@-]|\\.\\w)`, 'gi'), '{name}')
  }
  for (const c of contacts) {
    const digits = String(c.phone).replace(/\D/g, '')
    if (digits.length < 7) continue
    const core = digits.slice(-10)
    const pattern = core.split('').join('[\\s-]?')
    const purpose = /^[a-z][a-z0-9_]{0,23}$/.test(String(c.purpose)) ? c.purpose : 'support'
    t = t.replace(new RegExp(`(?:\\+?91[\\s-]?)?${pattern}`, 'g'), `{contact:${purpose}}`)
  }
  return applyAddress(t, 'sir').trim()
}

export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    relation: { type: 'string', enum: ['new', 'merge', 'update', 'widen', 'variant', 'conflict'] },
    target_entry_id: { type: 'string' },
    target_question_id: { type: 'string' },
    client_specific: { type: 'boolean' },
    generalized_reply: { type: 'string' },
    other_language_reply: { type: 'string' },
    title: { type: 'string' },
    phrasing: { type: 'string' },
    situation_specific: { type: 'boolean' },
    scope_sides: { type: 'array', items: { type: 'string', enum: ['BUY', 'SELL'] } },
    scope_client_states: { type: 'array', items: { type: 'string', enum: ['new', 'linked', 'approved'] } },
    scope_categories: { type: 'array', items: { type: 'string', enum: ['small', 'regular'] } },
    account_specific: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['relation', 'target_entry_id', 'target_question_id', 'client_specific', 'generalized_reply', 'other_language_reply', 'title',
    'phrasing', 'situation_specific', 'scope_sides', 'scope_client_states', 'scope_categories', 'account_specific', 'reason'],
  additionalProperties: false,
}

export interface JudgeCandidate {
  questionId: string
  title: string
  similarity: number
  questions: string[]
  replies: Array<{ entryId: string; status: string; situations: string[]; fitsNow: boolean; answer: string; exampleChat?: Array<{ from: string; text: string }> }>
}

export function buildJudgeMessages(input: {
  question: string
  reply: string
  replyLang: 'en' | 'hi'
  context: Record<string, unknown>
  candidates: JudgeCandidate[]
  houseStyle: string
}): { system: string; user: string } {
  const other = input.replyLang === 'en' ? HINGLISH_RULE : 'English'
  const system = [
    'You maintain the reply Playbook of a crypto P2P desk. A manager just used a reply in a client chat. Decide how it fits the Playbook.',
    'The Playbook is a list of questions. A question has one or more replies, each for the situations it applies to (what the client is waiting for: KYC pending, checking KYC, verification call, client can pay, checking payment, details pending, we are paying, beneficiary activation, waiting for release, completed, cancelled, in appeal; "any situation" when it fits whatever the order\'s progress). order_context.situation is the chat\'s situation now; fits_now tells whether a reply applies in it.',
    '- "merge": a reply of a candidate question already says the same thing (same facts, rules and instructions) and fits now. Wording differences or small adaptations to this client do not matter. target_entry_id = that reply.',
    '- "update": like merge, but the new wording is a clear general improvement that should replace that reply\'s wording. target_entry_id = that reply.',
    '- "widen": a reply of a candidate question says the same thing but is limited to other situations; it is right in this situation too. target_entry_id = that reply.',
    '- "variant": a candidate is the same question, but the circumstances differ (another step, or something earlier in the chat that changes the answer, as order_context.chat_before shows against a reply\'s example_chat) so this different answer is right here. target_question_id = that question.',
    '- "conflict": a reply that fits now, in the same circumstances, answers the same question with a different substance (different rule, time frame, amount, requirement or instruction). target_entry_id = that reply.',
    '- "new": no candidate is the same question.',
    'Use "" for an id you do not need.',
    'generalized_reply: the reply in its own language with anything that only fits this client or order replaced by placeholders ({amount}, {orderNo}, {name}, {upi}, {contact:<team>}) or removed. Change nothing else. client_specific tells whether you had to change anything.',
    `other_language_reply: the same reply in ${other} Keep placeholders and terms such as Aadhaar, PAN, UPI ID and UTR.`,
    'title: a short name for the question (at most 6 words), for example "TDS certificate timing".',
    'phrasing: the client\'s message, or the part of it, that this reply answers, copied word for word from client_question, at most 120 characters.',
    'situation_specific: true when this reply would be wrong in another situation of the same side (it asks the client to pay, to wait for verification, says the payment was sent, and so on); false when it fits whatever the order\'s progress (a TDS rule, a contact number, why we ask for KYC).',
    'Scope: list only the conditions under which this reply would be wrong otherwise; leave a list empty when the reply fits any value. account_specific is true only if it depends on which Binance account the order is on.',
    'reason: at most 15 words.',
    '',
    'House style of the Playbook:',
    input.houseStyle.trim(),
    'Return JSON only.',
  ].join('\n')
  const user = JSON.stringify({
    client_question: input.question,
    reply_used: input.reply,
    reply_language: input.replyLang === 'en' ? 'English' : 'Hindi (Roman script)',
    order_context: input.context,
    candidates: input.candidates.map((c) => ({
      question_id: c.questionId, title: c.title, similarity: Math.round(c.similarity * 100) / 100, question_examples: c.questions,
      replies: c.replies.map((r) => ({
        entry_id: r.entryId, status: r.status, situations: r.situations.length ? r.situations : ['any situation'], fits_now: r.fitsNow, answer: r.answer,
        ...(r.exampleChat?.length ? { example_chat: r.exampleChat } : {}),
      })),
    })),
  })
  return { system, user }
}

/** Prompt for "Rewrite Hindi from English" (and back) on the Playbook page. */
export function buildTranslateMessages(text: string, to: 'en' | 'hi', houseStyle: string): { system: string; user: string } {
  const target = to === 'hi' ? HINGLISH_RULE : 'English, professional and crisp.'
  const system = [
    'You rewrite one reply that a crypto P2P desk sends to clients in Binance order chats into the other language. Keep exactly the same meaning, facts and instructions; add nothing.',
    `Write it in ${target}`,
    'Keep placeholders such as {amount}, {orderNo}, {name}, {upi} and {contact:kyc} unchanged, and terms such as Aadhaar, PAN, UPI ID and UTR in English. Keep "sir" or "ma\'am".',
    '',
    'House style:',
    houseStyle.trim(),
    'Return JSON only: {"text": "..."}',
  ].join('\n')
  return { system, user: JSON.stringify({ reply: text }) }
}

export const TRANSLATE_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false,
}

export function normText(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,]+$/g, '').trim()
}
