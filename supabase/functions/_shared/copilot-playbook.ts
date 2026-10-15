// deno-lint-ignore-file no-explicit-any
// Copilot v2 (Playbook): pure helpers shared by copilot-draft and copilot-learn.
// No network, no database, no Deno.env here — everything is unit-tested in copilot-playbook.test.ts.

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
}
export interface Msg { id: string; at: number; who: Who; text: string; kind: string }

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
    if (type === 'system' || r.is_system_message) { out.push({ id, at, who: 'system', kind: 'system', text: describeSystem(raw) }); continue }
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
    out.push({ id, at, who, kind: type, text })
  }
  const h = hint && typeof hint.text === 'string' ? hint.text.trim() : ''
  if (h) {
    const hid = String(hint?.id ?? '')
    const known = out.some((m) => (hid && m.id === hid) || (m.who === 'client' && m.text === h && m === out[out.length - 1]))
    if (!known) out.push({ id: hid || `hint-${out.length}`, at: (out[out.length - 1]?.at ?? 0) + 1, who: 'client', kind: 'text', text: h })
  }
  return out
}

/** Client messages after our last human message (what still needs an answer). */
export function clientTurn(t: Msg[]): { messages: Msg[]; question: string; lastId: string } | null {
  let lastUs = -1
  t.forEach((m, i) => { if (m.who === 'us') lastUs = i })
  const msgs = t.slice(lastUs + 1).filter((m) => m.who === 'client')
  if (!msgs.length) return null
  const texts = msgs.filter((m) => m.kind === 'text').map((m) => m.text)
  const recent = (texts.length ? texts : msgs.map((m) => m.text)).slice(-3)
  return { messages: msgs, question: recent.join(' / ').slice(0, 600), lastId: msgs[msgs.length - 1].id }
}

// ─── Personal data masking ──────────────────────────────────────────────────────────────────────────

/** Masks personal numbers and handles before any text reaches an AI model or the Playbook. */
export function maskPII(input: string | null | undefined): string {
  let t = String(input ?? '')
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  t = t.replace(/\b[A-Z0-9][A-Z0-9._-]{1,255}@[A-Z][A-Z0-9]{1,63}\b/gi, '[upi]')
  t = t.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi, '[pan]')
  t = t.replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, '[ifsc]')
  t = t.replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[aadhaar]')
  t = t.replace(/(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, '[phone]')
  t = t.replace(/\b[A-Z]{2,8}\d{8,}[A-Z0-9]*\b/gi, '[ref]')
  t = t.replace(/(?<!\d)(?<!\d[.,])\d{9,}(?!\d)(?![.,]\d)/g, '[number]')
  return t
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
  return {
    state,
    facts: {
      state,
      kyc_status: cl.kyc_status ?? null,
      approval_for_this_side: approval ?? null,
      documents_on_file: onFile,
      purpose_on_file: cl.purpose ? true : false,
      source_of_funds_on_file: c.client?.income?.source ? true : false,
      completed_buys_with_us: hist.buy_count ?? null,
      completed_sells_to_us: hist.sell_count ?? null,
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

export const PLACEHOLDERS = ['{amount}', '{orderNo}', '{name}', '{upi}', '{contact:rm}', '{contact:kyc}', '{contact:support}']
export type ContactPurpose = 'rm' | 'kyc' | 'support'

export interface Guarded { text: string; flags: string[]; blocked: boolean; reasons: string[]; contacts: ContactPurpose[] }

export function guardDraft(input: string): Guarded {
  let text = String(input ?? '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
  // Normalise placeholder spelling the models sometimes vary.
  text = text.replace(/\{\s*contact\s*[:_-]\s*(rm|kyc|support)\s*\}/gi, (_w, p) => `{contact:${String(p).toLowerCase()}}`)
    .replace(/\{\s*(amount|upi|name)\s*\}/gi, (_w, p) => `{${String(p).toLowerCase()}}`)
    .replace(/\{\s*order\s*_?no\s*\}/gi, '{orderNo}')
  const flags: string[] = []
  const reasons: string[] = []
  const block = (flag: string, reason: string) => { if (!flags.includes(flag)) { flags.push(flag); reasons.push(reason) } }

  const promise = /\b(will|shall|'ll|going to|would)\s+(be\s+)?(releas|send (you )?(the )?(usdt|crypto|coins?))/i.test(text)
    || /\breleas(e|ing)\s+(it\s+|the\s+\w+\s+|your\s+\w+\s+)?(now|right away|shortly|soon|immediately|in\s+(a|\d+)\s+(min|minute|second))/i.test(text)
  const conditional = /\b(after|once|as soon as|when|only if)\b[^.?!]{0,80}\b(verif|confirm|receiv|credit|reflect|check)/i.test(text)
  if (promise && !conditional) block('release_promise', 'Promises a release before the payment is verified')

  if (/\b(outside|without|off)\s+(of\s+)?binance\b|\boff[\s-]?platform\b|\bdirect\s+(deal|trade|transfer|payment)\b|\b(trade|deal|buy|sell|pay|payment|transfer)\b[^.?!]{0,40}\b(on|via|through|over)\s+(whatsapp|telegram|signal)\b/i.test(text)) {
    block('outside_binance', 'Suggests trading or paying outside Binance')
  }

  const masked = maskPII(text)
  if (masked !== text || /(?<![\d{])\d{8,}(?!\d)/.test(text)) block('typed_number', 'Contains a phone number, UPI ID, account number or reference typed by the AI')

  const soft: string[] = []
  if (/(₹|\brs\.?|\binr)\s?\d/i.test(text) || /\b\d{1,3}(,\d{2,3})+(\.\d+)?\b/.test(text) || /(?<![\d{])\d{4,7}(?!\d)/.test(text)) soft.push('number_check')
  const unknown = (text.match(/\{[^{}]{1,40}\}/g) ?? []).filter((p) => !PLACEHOLDERS.includes(p))
  if (unknown.length) soft.push('unknown_placeholder')
  if (text.length > 500) soft.push('long')
  if (!text) block('empty', 'The model returned no text')

  const contacts = (['rm', 'kyc', 'support'] as ContactPurpose[]).filter((p) => text.includes(`{contact:${p}}`))
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
  avoid: Array<{ draft: string; why: string }>
  chat: Array<{ from: string; at: string; text: string }>
  answerThis: string | null
  instruction: string | null
  risks: Risk[]
  now: string
}

export function buildDraftMessages(c: DraftContext): { system: string; user: string } {
  const langRule = c.lang === 'hi'
    ? 'Hindi written in English letters (Roman script), polite and professional, for example "Kripya apna Aadhaar card (front aur back) share karein." Keep terms such as Aadhaar, PAN, UPI ID, UTR and payment in English.'
    : 'English.'
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
    '- "approved_answers" are company policy. When one fits, keep its substance exactly; you may adapt the wording slightly. Answers marked "tentative" are unconfirmed suggestions.',
    '- Use only facts from the data given. Never state anything about this order, payment or client that is not in the data. If you need information, ask the client, or say we will check.',
    '- Placeholders: {amount} is the order amount, {orderNo} the order number, {name} the client\'s name, {upi} our UPI ID, {contact:rm}, {contact:kyc} and {contact:support} company contact numbers. Use them instead of writing any such value.',
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
    approved_answers: c.approved.map((a) => ({ title: a.title, status: a.status, question_examples: a.examples, answer: a.answer })),
    avoid: c.avoid,
    chat: c.chat,
    answer_this: c.answerThis ?? '',
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
  if (v.name && String(v.name).trim().length >= 3) t = t.replace(new RegExp(`\\b${esc(String(v.name).trim())}\\b`, 'gi'), '{name}')
  for (const c of contacts) {
    const digits = String(c.phone).replace(/\D/g, '')
    if (digits.length < 7) continue
    const core = digits.slice(-10)
    const pattern = core.split('').join('[\\s-]?')
    const purpose = ['rm', 'kyc', 'support'].includes(c.purpose) ? c.purpose : 'support'
    t = t.replace(new RegExp(`(?:\\+?91[\\s-]?)?${pattern}`, 'g'), `{contact:${purpose}}`)
  }
  return applyAddress(t, 'sir').trim()
}

export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    relation: { type: 'string', enum: ['new', 'merge', 'update', 'conflict'] },
    target_entry_id: { type: 'string' },
    client_specific: { type: 'boolean' },
    generalized_reply: { type: 'string' },
    other_language_reply: { type: 'string' },
    title: { type: 'string' },
    scope_sides: { type: 'array', items: { type: 'string', enum: ['BUY', 'SELL'] } },
    scope_statuses: { type: 'array', items: { type: 'string', enum: ['TRADING', 'BUYER_PAYED', 'COMPLETED', 'CANCELLED', 'APPEAL'] } },
    scope_client_states: { type: 'array', items: { type: 'string', enum: ['new', 'linked', 'approved'] } },
    scope_categories: { type: 'array', items: { type: 'string', enum: ['small', 'regular'] } },
    account_specific: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['relation', 'target_entry_id', 'client_specific', 'generalized_reply', 'other_language_reply', 'title',
    'scope_sides', 'scope_statuses', 'scope_client_states', 'scope_categories', 'account_specific', 'reason'],
  additionalProperties: false,
}

export function buildJudgeMessages(input: {
  question: string
  reply: string
  replyLang: 'en' | 'hi'
  context: Record<string, unknown>
  candidates: Array<{ id: string; title: string; status: string; similarity: number; questions: string[]; answer: string }>
  houseStyle: string
}): { system: string; user: string } {
  const other = input.replyLang === 'en' ? 'Hindi written in English letters (Roman script)' : 'English'
  const system = [
    'You maintain the reply Playbook of a crypto P2P desk. A manager just used a reply in a client chat. Decide how it fits the Playbook.',
    '- "merge": a candidate already answers this question with the same substance (same facts, rules and instructions). Wording differences or small adaptations to this client do not matter.',
    '- "update": same question and same substance as a candidate, but the new wording is a clear general improvement that should replace it.',
    '- "conflict": a candidate answers the same question with a different substance (different rule, time frame, amount, requirement or instruction).',
    '- "new": no candidate answers this question.',
    'Pick target_entry_id from the candidates for merge, update or conflict; use "" for new.',
    'generalized_reply: the reply in its own language with anything that only fits this client or order replaced by placeholders ({amount}, {orderNo}, {name}, {upi}, {contact:rm}, {contact:kyc}, {contact:support}) or removed. Change nothing else. client_specific tells whether you had to change anything.',
    `other_language_reply: the same reply in ${other}, in the same professional style, keeping placeholders and terms such as Aadhaar, PAN, UPI ID and UTR.`,
    'title: a short topic name (at most 6 words), for example "TDS certificate timing".',
    'Scope: list only the conditions under which this reply would be wrong otherwise (for example a reply asking the client to pay only fits SELL orders that are TRADING). Leave a list empty when the reply fits any value. account_specific is true only if it depends on which Binance account the order is on.',
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
    candidates: input.candidates.map((c) => ({ id: c.id, title: c.title, status: c.status, similarity: Math.round(c.similarity * 100) / 100, question_examples: c.questions, answer: c.answer })),
  })
  return { system, user }
}

export function normText(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,]+$/g, '').trim()
}
