// Copilot · Next step (CP-8): the desk's own script, step by step, worked out from the chat without AI.
// Most of what clients send answers our last question (documents, a mobile number, a bank's name, "salary"): what the
// desk needs then is the next message of the script, not a reply to a question, and no AI call at all. The steps and
// their order come from the team's own chats (17–23 Oct 2026, ~1,150 orders): new clients are asked purpose and source
// of funds and get the verification-call message; clients whose KYC we hold are asked which bank, then get the payment
// details; on buy orders we ask PAN and mobile, pay (after a beneficiary wait for new accounts), send proof and ask for
// the release. The words come from the Playbook (entries of kind 'step'), so the approvers own them.
// Pure: no network, no database. Tested in copilot-steps.test.ts.
import type { ClientState, Msg, Side } from './copilot-playbook.ts'
import { applyAddress, greetingFor, maskPII } from './copilot-playbook.ts'
import {
  beforeVerification, covers, fitsOrder, invitesPayment, isPromiseText, isQuestionText, isReAskText, isSmallTalk, isVerificationCallText,
  type OrderFit, type ReplyScope, sharesPaymentDetails, stageDepth,
} from './copilot-situation.ts'

export type StepKey =
  | 'greeting' | 'kyc' | 'purpose' | 'source_of_funds' | 'profession' | 'paying_bank' | 'own_account' | 'verification_call' | 'call_wait'
  | 'pick_up_call'
  | 'please_pay' | 'mark_paid' | 'verify_payment' | 'payment_screenshot'
  | 'buy_details' | 'tds_notice' | 'paying' | 'beneficiary' | 'paid_release' | 'release_reminder' | 'thanks'

export interface StepDef {
  key: StepKey
  /** Short name for the checklist and the chip. */
  label: string
  side: Side | null
  /** Our message (typed, or the ad's automatic one) that does this step: the team's wording and the Playbook's. */
  asked: RegExp | ((text: string) => boolean)
  /** What the client gives back: documents (pictures or a number), a short text answer, or nothing. */
  expects: 'docs' | 'text' | null
}

export const STEP_DEFS: StepDef[] = [
  { key: 'greeting', label: 'Greeting', side: null, asked: /^\s*(good\s+(morning|afternoon|evening|day)|hello|hi|hey|namaste|namaskar)\b/i, expects: null },
  { key: 'kyc', label: 'KYC documents', side: 'SELL', asked: /\baadha+r\b|\badhar\b|\b(front|back|other)\s*side\b|\bbackside\b/i, expects: 'docs' },
  { key: 'purpose', label: 'Purpose', side: 'SELL', asked: /\bpurpose\b/i, expects: 'text' },
  { key: 'source_of_funds', label: 'Source of funds', side: 'SELL', asked: /\bsource of (funds?|income)\b|\b(funds?|income|paise) ka source\b/i, expects: 'text' },
  { key: 'profession', label: 'Profession', side: 'SELL', asked: /\b(profession|occupation)\b/i, expects: 'text' },
  { key: 'paying_bank', label: 'Paying bank', side: 'SELL', asked: /\bwhich bank\b|\bbank (will|are) you\b|\bbank (do )?you (are going to |will )?(use|pay)\b|\bkis bank\b/i, expects: 'text' },
  // After the client names their bank: the payment must come from their own account (returning clients get the details next).
  { key: 'own_account', label: 'Own account', side: 'SELL', asked: /\b(own name|own account|apne naam|same bank account)\b/i, expects: null },
  { key: 'verification_call', label: 'Verification call', side: 'SELL', asked: (t) => isVerificationCallText(t), expects: null },
  { key: 'call_wait', label: 'Call status update', side: 'SELL', asked: /\bthank you for your patience\b|\bkeep your phone\b|\bphone (free|available)\b|\bcall you (shortly|soon|in a few)\b/i, expects: null },
  { key: 'pick_up_call', label: 'Pick up the call', side: 'SELL', asked: /\bpick\s*(up)?\s*(the |our )?call\b|\b(receive|attend)\s+(the |our )?call\b/i, expects: null },
  { key: 'please_pay', label: 'Ask to pay', side: 'SELL', asked: /^\s*(please|kindly|pls|plz)?\s*pay(\s+(now|sir|ma'?am|on it|it))*\s*[.!]*\s*$|\bpay on it\b|\b(please|kindly)\s+(make|do|complete)\s+(the |your )?payment\b/i, expects: null },
  { key: 'mark_paid', label: 'Mark as paid', side: 'SELL', asked: /\bmark(ed)?\s+(it\s+|the order\s+|order\s+)?(as\s+)?paid\b|\bpaid\s+mark\b/i, expects: null },
  { key: 'verify_payment', label: 'Checking the payment', side: 'SELL', asked: /\b(verify|verifying|check|checking)\b[^.?!]{0,40}\bpayment\b|\bpayment\s+(check|verify)\w*\b/i, expects: null },
  { key: 'payment_screenshot', label: 'Payment screenshot', side: 'SELL', asked: /\bscreenshot\b/i, expects: 'docs' },
  { key: 'buy_details', label: 'PAN and mobile', side: 'BUY', asked: /\bpan\b|\bmobile\s*(no|number)\b|\bbank\s*details\b/i, expects: 'docs' },
  { key: 'tds_notice', label: 'TDS and amount', side: 'BUY', asked: /\btds\b|\b194\s*s\b/i, expects: null },
  { key: 'paying', label: 'Paying', side: 'BUY', asked: /\bpaying on\b|\bprocess(ing|ed)\b|\bin process\b|\bprocess ho (raha|rahi|gaya|gayi)\b|\bfinance team\b/i, expects: null },
  { key: 'beneficiary', label: 'Beneficiary added', side: 'BUY', asked: /\bbeneficiary\b/i, expects: null },
  // "We have sent the payment, sir. Please check…": the request may follow in the next sentence.
  { key: 'paid_release', label: 'Paid — please release', side: 'BUY', asked: /\b(payment (is |has been )?(done|sent|made|completed)|we have (sent|made|completed) the payment|payment (bhej|kar) (diya|di|diye)|paid)\b[^?!]{0,80}\b(check|release)\b/i, expects: null },
  { key: 'release_reminder', label: 'Release reminder', side: 'BUY', asked: /\b(kindly|please)\b[^.?!]{0,40}\brelease\b/i, expects: null },
  { key: 'thanks', label: 'Thanks', side: null, asked: /\bfor trading with us\b|\bpositive feedback\b/i, expects: null },
]
const DEF = new Map(STEP_DEFS.map((d) => [d.key, d]))
export const stepDef = (key: string | null | undefined): StepDef | null => (key ? DEF.get(key as StepKey) ?? null : null)
export const isStepKey = (key: unknown): key is StepKey => typeof key === 'string' && DEF.has(key as StepKey)
const asks = (d: StepDef, text: string) => (typeof d.asked === 'function' ? d.asked(text) : d.asked.test(text))

// ─── What the client sent ───────────────────────────────────────────────────────────────────────────

/** Words that only label a value ("mobile no: …", "my PAN is …"). */
const DATA_WORDS = /^(mobile|mob|number|no|num|phone|ph|contact|aadha+r|adhar|pan|card|name|account|acc|a\/c|ac|ifsc|upi|id|my|is|sir|here|details?|bank|front|back|and|&|-|ji|bro)$/i
/** A message that is only values: a number, a PAN, a UPI ID…, perhaps with a label. Nothing to answer. */
export function isDataOnly(text: string | null | undefined): boolean {
  const raw = String(text ?? '').trim()
  if (!raw) return false
  const masked = maskPII(raw)
  if (masked === raw && !/\d/.test(raw)) return false
  const words = masked.replace(/\[[a-z]+\]/gi, ' ').replace(/[\d.,:;+\-–—()#/*_|=]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  return words.every((w) => DATA_WORDS.test(w))
}

// Banks and payment apps by name. Names that are also ordinary words ("yes", "union", "indian", "central") count only
// with "bank" after them, except as the answer to "which bank?".
const BANKS = String.raw`(sbi|state bank( of india)?|hdfc|icici|axis|kotak( mahindra)?|boi|bank of (india|baroda|maharashtra)|bob|baroda|pnb|punjab national|punjab (and|&) sind|idfc( first)?|indusind|canara|au small finance|rbl|paytm( payments)?|airtel payments|fino|idbi|uco|iob|indian overseas|ubi|jupiter|equitas|ujjivan|bandhan|kvb|karur vysya|dbs|dcb|csb|cub|scb|hsbc|standard chartered|j ?& ?k|jammu (and|&) kashmir|saraswat|cosmos|tmb|dhanlaxmi|esaf|suryoday|nsdl|gpay|google pay|phonepe|phone ?pe|phone ?pay|mobi ?kwik|mobiwik|(yes|union|federal|au|indian|central|karnataka|south indian|city union|citi|airtel|fi|jio|jana)\s+(bank|payments|small))`
const BANKS_LOOSE = String.raw`(${BANKS}|union|federal|indian|central|karnataka|south indian|city union|citi|au|airtel|jio|jana|slice)`
/** Words around a bank's name in a message that only names it ("my sbi account", "kotak se", "HDFC bank sir"). */
const BANK_FILLER_NARROW = String.raw`\b(haan|han|ha|hmm+|ok|okay|my|mere|mera|meri|apne|apna|own|from|frm|through|thru|via|of|india|bank|banks|account|accounts|acc|ac|a\/c|savings?|current|se|hi|only|ka|ki|ke|and|or|sir|bro|ji|bhai|ltd|limited|wala|wale)\b`
/** …and in the answer to "which bank?" ("same hdfc", "paying from idfc", "i will use pnb bank", "icici or axis"). */
const BANK_FILLER = String.raw`\b(haan|han|ha|hmm+|same|as|always|again|regular|usual|paying|payment|payments|pay|from|frm|thru|through|via|by|use|using|will|i|am|im|i'?m|going|to|my|mere|mera|meri|apne|apna|own|with|and|or|sir|bro|ji|bhai|bank|banks|account|accounts|acc|ac|a\/c|savings?|current|upi|app|se|hi|only|ka|ki|ke|small|finance|co|operative|cooperative|of|india|have|three|two|both|good|morning|afternoon|evening|hello|ok|okay|yes|ya|ltd|limited|wala|wale|me|mein|net\s*banking|card|debit)\b`
/**
 * "sbi", "HDFC bank", "from my SBI account", "Union Bank of India", "same hdfc", "paying from idfc", "HDFC and ICICI": the
 * paying bank (or app) by name, with nothing else to it ("UPI" alone is a way of paying and may be a request; "sbi not
 * working", "can I pay from sbi?" or "pay with gpay" are not). `loose`: as the answer to "which bank?", with the words
 * clients put around it ("same hdfc", "I will use pnb bank") and the names that are also ordinary words ("indian").
 */
export function isBankOnly(text: string | null | undefined, loose = false): boolean {
  const t = String(text ?? '').trim()
  if (!t || t.includes('?')) return false
  const name = () => new RegExp(String.raw`\b${loose ? BANKS_LOOSE : BANKS}\b`, 'gi')
  if (!name().test(t)) return false
  const rest = t.replace(name(), ' ').replace(new RegExp(loose ? BANK_FILLER : BANK_FILLER_NARROW, 'gi'), ' ')
  return rest.replace(/[\s\p{P}\p{S}]+/gu, '') === ''
}
/** The strict form, as a pattern (tests and older callers). */
export const BANK_ONLY = { test: (text: string) => isBankOnly(text) }

/** Something a client asks or wants, not a plain answer ("can I pay", "send UPI", "why"). */
const REQUESTY = /\?|\b(can|could|will|would|should|may|shall|is|are|do|does|did|please|pls|plz|kindly|send|share|give|release|verify|fast|hurry|cancel|refund|upi|details?|call|number|payment|pay|paid|why|how|when|what|where|which|kya|kab|kitna|kitne|kaise|kyu|kyun|kaha|kahan|nahi|nahin|not|no)\b/i
/** "done", "sent", "uploaded": the client says the documents are sent. */
const DOCS_SENT = /^\s*(ok(ay)?\s+)?(done|sent|send|sended|uploaded|shared|submitted|ho gaya|kar diya|bhej diya)(\s+(sir|bro|ji|already|now))*\s*[.!✅👍]*\s*$/i
/** "wait", "1 min", "sending", "bhej raha hu", "haan ji": about to send something, or asking us to wait, and nothing else. */
const HOLD_ON_SRC = String.raw`\b(wait(ing)?|hold on|just a (sec|second|min|minute)|(one|ek|1|2|two|5|five|do) (sec|secs|second|seconds|min|mins|minute|minutes)|ruko|sending|(i'?ll|i will|will) (send|share|upload)|(send|share) kar (raha|rahi|rha|rhi|deta|deti|dunga|dungi|unga|ungi)|bhej (raha|rahi|rha|rhi|deta|deti|dunga|dungi)|bhejta|bhejti|abhi bhej\w*)\b`
const FILLER_SRC = String.raw`\b(sir|ji|bro|bhai|ma'?am|madam|ok(ay)?|haan|han|ha|haa|hmm+|yes|ya|yeah|abhi|now|just|bas|i|am|i'?m|main|mai|hu|hoon|hun|raha|rahi|rha|rhi|hai)\b`
/** What is being sent ("sending docs", "abhi aadhar bhej raha hu"): counts only next to a promise. */
const SENT_THING_SRC = String.raw`\b(docs?|documents?|aadha+r|adhar|pan|card|cards|pics?|photos?|images?|screenshots?|ss|it)\b`
export function onlyHoldOn(text: string | null | undefined): boolean {
  const t = String(text ?? '')
  const promise = new RegExp(HOLD_ON_SRC, 'i').test(t)
  const rest = t.replace(new RegExp(HOLD_ON_SRC, 'gi'), ' ').replace(new RegExp(FILLER_SRC, 'gi'), ' ')
  const left = rest.replace(/[\s\p{P}\p{S}]+/gu, '')
  if (left === '') return true
  return promise && rest.replace(new RegExp(SENT_THING_SRC, 'gi'), ' ').replace(/[\s\p{P}\p{S}]+/gu, '') === ''
}
/** "ji", "haan sir", "ok," before an answer ("ji trading", "Haan sir salary", "ji sbi"). */
const LEAD_FILLER = /^\s*((ji|haan|han|ha|haa|hmm+|ok(ay)?|yes|ya|yeah|sir|ma'?am|bro|bhai)\b[\s,.:!-]*)+/i
/** The client's answer without "ji", "haan sir"… in front. */
export const answerCore = (text: string | null | undefined) => String(text ?? '').replace(LEAD_FILLER, '').trim()
/** A short plain answer to our question ("salary", "for trading", "business income"). */
export const looksLikeAnswer = (text: string | null | undefined) => {
  const t = String(text ?? '').trim()
  return !!t && !REQUESTY.test(t) && !isPromiseText(t) && !DOCS_SENT.test(t) && !onlyHoldOn(t) && !isSmallTalk(t)
    && t.split(/\s+/).length <= 8
}
/** Words of a problem, a complaint or KYC: the client is telling or asking us something else, not answering. */
const NOT_AN_ANSWER = /\b(kyc|verif\w*|already|before|pehle|again|dobara|fraud|scam|cheat\w*|police|complaint|complain|appeal|jaldi|asap|urgent|freeze|frozen|block(ed)?|server|down|problem|issue|error|fail\w*|wrong|galat|refund|limit|deduct\w*|missing|cancel\w*|otp|utr|not working|sorry|check|reply|b(a)?tao|bataiye|bolo|samjhao|whats\s*a+p+|front|back\s*side|photo|image|aadha+r|adhar|pan\s*card|documents?|id\s*proof)\b/i
/** For a profession only complaints, hurry and KYC talk ("police constable", "server engineer", "photo studio owner" are answers). */
const NOT_A_PROFESSION = /\b(kyc|already|before|pehle|again|dobara|fraud|scam|cheat\w*|complaint|complain|appeal|jaldi|asap|urgent|sorry|reply|b(a)?tao|bataiye|bolo|samjhao|whats\s*a+p+|cancel\w*|refund|freeze|frozen|blocked|not working|wrong|galat|fail\w*|otp|utr)\b/i
/** Words of a purpose, a source of funds or a profession; a longer answer must have one ("I am doing a private job"). */
const ANSWER_WORDS = /\b(trad\w*|tred\w*|trend\w*|invest\w*|deposit\w*|buy\w*|byy|purchas\w*|hold\w*|sav\w*|forex|crypto|coins?|btc|eth|bitcoin|usdt|nft|token|spot|futures?|gold|xau\w*|stocks?|shares|exness|quotex|qutex|xm|vantage|binance|wallet|stake|gaming|prop\s*firm|propfirm|funded|challenge|margin|capital|asset\w*|earn\w*|yield|yeild|reward|transfer\w*|abroad|shopping|personal|own|self|khud|apne liye|use|p2p|arbitrage|business\w*|bus+i?n?es+\w*|buisness|biz\w*|salar\w*|saler\w*|salry|income|job|naukri|service|profit|pension|rent\w*|shop\w*|dukaan|factory|loans?|fund\w*|money|paisa|family|father|mother|parents?|husband|wife|brother|sister|friend|dost|baap|farm\w*|agri\w*|kheti|freelanc\w*|employ\w*|work\w*|kaam|engineer\w*|enginner|teacher|doctor|professor|student\w*|mba|driver|police|officer|clerk|manager|developer|designer|accountant|agent|contractor|consult\w*|affiliate|marketing|publisher|influencer|owner|host|insurance|construction|logistics|pharmac\w*|tester|software|company|mnc|pvt|private|government|govt|real\s*estate|office|school|college|coaching|hotel|restaurant|kitchen|retail|outlet)\b/i
/**
 * Whether a client's text answers the step we asked ("ji", "haan sir" in front aside): the paying bank only by a bank's
 * name; purpose, source of funds and profession by a short plain answer that is not about something else ("I am already
 * verified", "scam", "jaldi karo", "mera account freeze ho gaya"): up to four words, or up to eight with a word of such
 * an answer.
 */
export function answersStep(key: StepKey | null, text: string | null | undefined): boolean {
  const d = stepDef(key)
  const t = answerCore(text)
  if (!d || d.expects !== 'text' || !t) return false
  if (key === 'paying_bank') return isBankOnly(text, true)
  // A number, a PAN or a UPI ID in it is a value sent, not the answer.
  if (!looksLikeAnswer(t) || isDataOnly(t) || maskPII(t) !== t || (key === 'profession' ? NOT_A_PROFESSION : NOT_AN_ANSWER).test(t)) return false
  return t.split(/\s+/).length <= 4 || ANSWER_WORDS.test(t)
}
/** The client says they paid ("paid", "payment done", "kar diya"). */
export const PAID_CLAIM = /\b(paid|payment (is )?(done|sent|completed|successful)|done (the )?payment|transferred|payment kar (diya|di)|pay kar (diya|di)|bhej (diya|di))\b/i
/**
 * …unless they say they have not ("not paid yet", "abhi paid nahi kiya", "payment nahi hua"). A "not" about something else
 * ("Paid sir, not released yet", "payment done, not received USDT") leaves the claim.
 */
const NOT_PAID = /\b(not|nahi|nahin|nhi|didn'?t|haven'?t|hasn'?t|yet to|never)\b[^.?!]{0,20}\b(paid|pay|payment|transfer\w*)\b|\b(paid|payment|transfer\w*)\s+((is|has|abhi|bhi)\s+)?(not|nahi|nahin|nhi)\b/i
export const saysPaid = (text: string | null | undefined) => PAID_CLAIM.test(String(text ?? '')) && !NOT_PAID.test(String(text ?? ''))

/**
 * A client wording that asks nothing: pictures or other masked values only, a greeting or "ok", values, or a bank's name
 * (a request's question joins up to three messages with " / "; every part must be such). Never kept as a way of asking:
 * it would match every picture or number later.
 */
export function notAQuestion(text: string | null | undefined): boolean {
  const parts = String(text ?? '').split(/\s+\/\s+/).map((p) => p.trim()).filter(Boolean)
  return !parts.length || parts.every((part) => {
    const words = maskPII(part).replace(/\[[a-z_]+\]/gi, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    return !/\p{L}/u.test(words) || isSmallTalk(part) || isDataOnly(part) || isBankOnly(part)
  })
}

const isDoc = (m: Msg) => m.who === 'client' && (m.kind === 'image' || m.kind === 'file')
const ours = (m: Msg) => (m.who === 'us' || m.who === 'auto') && (m.kind === 'text' || m.kind === 'auto_reply')

/**
 * Whether the client's latest messages (after our last message) still need an answer: a question or a request. Pictures,
 * values, a bank's name, a greeting or "ok", "sending", "done" while documents are awaited, and a short plain answer to
 * the question we asked last need the next step instead, and no AI.
 */
export function turnNeedsAnswer(turn: Msg[], waitingFor: StepKey | null): boolean {
  const def = stepDef(waitingFor)
  for (const m of turn) {
    if (m.who !== 'client' || isDoc(m)) continue
    const text = String(m.text ?? '').trim()
    if (!text || m.kind !== 'text') continue
    if (/^\s*(\[[a-z_]+\]\s*)+$/i.test(text) || isSmallTalk(text) || isDataOnly(text) || isBankOnly(text)) continue
    // "sending", "will send", "1 min", "wait", "haan ji" and nothing else: nothing to look up ("ji mera account freeze ho
    // gaya" and "sending?" are).
    if (!text.includes('?') && onlyHoldOn(text)) continue
    const asks = REQUESTY.test(text)
    if (!asks && def?.expects === 'docs' && DOCS_SENT.test(text)) continue
    if (answersStep(waitingFor, text)) continue
    return true
  }
  return false
}

/**
 * Since when the client has been waiting for us: the first client message after our last message (typed or a picture).
 * Null when we wrote last. The ad's automatic reply and Binance's cards and notices never end a wait.
 */
export function waitingSince(t: Msg[]): number | null {
  let since: number | null = null
  for (const m of t) {
    // Only a person on our side answers the client: the ad's auto-reply and Binance's cards do not.
    if (m.who === 'us') since = null
    else if (m.who === 'client' && since === null) since = m.at
  }
  return since
}

// ─── The plan ────────────────────────────────────────────────────────────────────────────────────────

export type StepStatus = 'done' | 'asked' | 'todo' | 'skipped'
export interface StepState {
  key: StepKey
  label: string
  state: StepStatus
  /** The client's short answer (masked), e.g. "salary"; null for documents or no answer. */
  answer: string | null
}
/**
 * An action in Binance or the bank rather than a message: share the payment details once the checks are done; send the
 * payment screenshot (a buy order marked paid with no proof in the chat); extend the payment time (KYC still running and
 * the order about to expire: Binance's offer was used in none of the 27 cancelled orders that showed it during KYC).
 */
export type StepHint = 'share_details' | 'send_proof' | 'extend_time'
export interface StepPlan {
  /** The script for this chat: done (asked and answered, or sent), asked (waiting for the client), to do, or not needed. */
  checklist: StepState[]
  /** The next message(s): usually one (two when the chat has not been greeted yet). */
  next: StepKey[]
  /** Messages the desk sometimes adds here (a question it asks now and then, "Ask for KYC again"…). */
  options: StepKey[]
  /** Our last question the client has not answered: nothing new to send until they do. */
  waitingFor: StepKey | null
  hints: StepHint[]
  /** The client's KYC is on file with us and nobody asked for KYC in this chat: the KYC questions are not needed by default. */
  knownClient: boolean
}
export interface PlanInput {
  side: Side | null
  /** Binance's status: TRADING, BUYER_PAYED, COMPLETED, CANCELLED… */
  status: string
  /** The chat's situation code (copilot-situation.ts). */
  stage: string | null
  clientState: ClientState
  /** What we hold on the client ('pan', 'aadhaar', 'phone', …). */
  onFile?: string[]
  transcript: Msg[]
  now: number
  /** Binance's deadline to pay (ms), while the order is open. */
  payBy?: number | null
}

/** Minutes after our proof before a reminder to release is offered (and between reminders). */
export const RELEASE_REMINDER_MS = 10 * 60_000
/** After our verification-call message (or our last message), the wait before a status update or "please pick up" is offered. */
const CALL_NUDGE_MS = 3 * 60_000
/** "Extend the payment time" once the order expires within this while KYC is still running. */
export const EXTEND_WINDOW_MS = 8 * 60_000

const EMPTY: StepPlan = { checklist: [], next: [], options: [], waitingFor: null, hints: [], knownClient: false }

export function planSteps(input: PlanInput): StepPlan {
  const { side, stage, clientState, now } = input
  const status = String(input.status ?? '').toUpperCase()
  const t = input.transcript
  const onFile = new Set((input.onFile ?? []).map((x) => String(x).toLowerCase()))
  if (!side || !stage || status.startsWith('CANCEL') || status === 'APPEAL' || stage === 'appeal' || stage === 'cancelled') return EMPTY

  const lastOurs = (key: StepKey, after = -Infinity): Msg | null => {
    const d = DEF.get(key)!
    for (let i = t.length - 1; i >= 0; i--) {
      const m = t[i]
      if (m.at <= after) break
      if (ours(m) && asks(d, m.text)) return m
    }
    return null
  }
  const event = (names: string[]): Msg | null =>
    [...t].reverse().find((m) => m.who === 'system' && !!m.event && names.includes(m.event)) ?? null
  /** The client's answer to a step asked at `at` (the first one after it). */
  const answerAfter = (key: StepKey, at: number): { at: number; text: string | null } | null => {
    const d = DEF.get(key)!
    for (const m of t) {
      if (m.at <= at || m.who !== 'client') continue
      if (d.expects === 'docs') {
        if (isDoc(m) || (m.kind === 'text' && isDataOnly(m.text))) return { at: m.at, text: null }
      } else if (d.expects === 'text' && m.kind === 'text') {
        const s = String(m.text ?? '').trim()
        if (answersStep(key, s)) return { at: m.at, text: maskPII(answerCore(s)).slice(0, 28) }
      }
    }
    return null
  }
  const row = (key: StepKey, state: StepStatus, answer: string | null = null): StepState => ({ key, label: DEF.get(key)!.label, state, answer })
  const state = (key: StepKey): StepState => {
    const d = DEF.get(key)!
    // Documents count whenever they came: clients often upload them before anyone asks (Binance's KYC card prompts it).
    // Asked again (the photo is not clear, the back side): only what came after that request counts.
    if (d.expects === 'docs' && (key === 'kyc' || key === 'buy_details')) {
      const ask = lastOurs(key)
      const from = ask && ask.who === 'us' && isReAskText(ask.text) ? ask.at : -Infinity
      if (t.some((m) => m.at > from && (isDoc(m) || (m.who === 'client' && m.kind === 'text' && isDataOnly(m.text))))) return row(key, 'done')
      if (from > -Infinity) return row(key, 'asked')
    }
    const asked = lastOurs(key)
    if (!asked) return row(key, 'todo')
    if (!d.expects) return row(key, 'done')
    const a = answerAfter(key, asked.at)
    return row(key, a ? 'done' : 'asked', a?.text ?? null)
  }
  const waitingOf = (list: StepState[]): StepKey | null => {
    let best: { key: StepKey; at: number } | null = null
    for (const s of list) {
      if (s.state !== 'asked') continue
      const at = lastOurs(s.key)?.at ?? 0
      if (!best || at > best.at) best = { key: s.key, at }
    }
    return best?.key ?? null
  }
  // The first message of ours in an open chat is the greeting (the team greets in about 9 of 10 chats).
  const greet = status === 'TRADING' && !t.some((m) => m.who === 'us')
  // KYC still running on an open sell order that is about to expire: extend the payment time, whatever else is awaited.
  const left = typeof input.payBy === 'number' && Number.isFinite(input.payBy) ? input.payBy - now : null
  const extend = side === 'SELL' && status === 'TRADING' && covers('sell.kyc', stage) && left !== null && left > 0 && left <= EXTEND_WINDOW_MS
  const plan = (checklist: StepState[], next: StepKey[], extra: Partial<StepPlan> = {}): StepPlan => {
    const waitingFor = extra.waitingFor ?? null
    const steps = [...(greet ? ['greeting' as StepKey] : []), ...(waitingFor ? [] : next)].filter((k, i, a) => a.indexOf(k) === i)
    const options = (extra.options ?? []).filter((k) => !steps.includes(k))
    const hints: StepHint[] = [...(extend ? ['extend_time' as StepHint] : []), ...(waitingFor ? [] : extra.hints ?? [])]
    return { checklist, next: steps, options, waitingFor, hints, knownClient: extra.knownClient ?? false }
  }

  // ── Completed: thanks, once ──
  if (status === 'COMPLETED' || stage === 'done') {
    const done = event(['seller_completed', 'buyer_completed'])
    const thanked = lastOurs('thanks', done ? done.at - 10 * 60_000 : -Infinity)
    return plan([row('thanks', thanked ? 'done' : 'todo')], thanked ? [] : ['thanks'])
  }

  if (side === 'SELL') {
    if (covers('sell.kyc', stage)) {
      // A client whose KYC we hold is asked which bank, then gets the payment details, unless someone typed a KYC request
      // in this chat (the ad's automatic first message asks every client for Aadhaar, so it does not count here).
      const typedKyc = (['kyc', 'purpose', 'source_of_funds', 'profession'] as StepKey[]).some((k) => {
        const d = DEF.get(k)!
        return t.some((m) => m.who === 'us' && m.kind === 'text' && asks(d, m.text))
      })
      if (clientState === 'approved' && !typedKyc) {
        const bank = state('paying_bank')
        // Once the bank is named: "pay from your own account" (if not said since), then the details after Binance's Verify.
        const own = bank.state === 'done' && !lastOurs('own_account', lastOurs('paying_bank')?.at ?? -Infinity)
        return plan([row('kyc', 'skipped'), bank], bank.state === 'todo' ? ['paying_bank'] : own ? ['own_account'] : [], {
          options: ['kyc'], waitingFor: waitingOf([bank]), hints: bank.state === 'done' ? ['share_details'] : [], knownClient: true,
        })
      }
      const seq: StepKey[] = ['kyc', 'purpose', 'source_of_funds', 'verification_call']
      const all = [...seq, 'profession', 'paying_bank', 'call_wait', 'pick_up_call'].map((k) => state(k as StepKey))
      const by = new Map(all.map((s) => [s.key, s]))
      const waitingFor = waitingOf(all)
      const firstTodo = seq.find((k) => by.get(k)!.state === 'todo') ?? null
      const options: StepKey[] = []
      // Asked now and then once the source of funds is known: profession, the paying bank.
      if (by.get('source_of_funds')!.state === 'done') {
        if (by.get('profession')!.state === 'todo') options.push('profession')
        if (by.get('paying_bank')!.state === 'todo') options.push('paying_bank')
      }
      if (by.get('paying_bank')!.state === 'done' && !lastOurs('own_account', lastOurs('paying_bank')?.at ?? -Infinity)) options.push('own_account')
      // The call takes ~10 minutes (documents to Verify: median 13): clients who hear nothing cancel. A few minutes after the
      // call message, with nothing from us since, a status update; and "please pick up" for when the team calls.
      const call = lastOurs('verification_call')
      const lastUs = [...t].reverse().find((m) => m.who === 'us' || m.who === 'auto')?.at ?? 0
      if (call && now - call.at >= CALL_NUDGE_MS && now - lastUs >= CALL_NUDGE_MS) options.push('call_wait')
      if (call && now - call.at >= CALL_NUDGE_MS && !lastOurs('pick_up_call', call.at)) options.push('pick_up_call')
      const allDone = seq.every((k) => by.get(k)!.state === 'done')
      // The checklist lists the script's steps and any other step already asked.
      const checklist = all.filter((s) => seq.includes(s.key) || s.state !== 'todo')
      return plan(checklist, firstTodo ? [firstTodo] : [], { options, waitingFor, hints: allDone ? ['share_details'] : [] })
    }
    if (stage === 'sell.pay.ready') {
      const details = [...t].reverse().find((m) => m.who === 'us' && m.kind === 'text' && sharesPaymentDetails(m.text)) ?? null
      const askedToPay = details ? lastOurs('please_pay', details.at - 1) : null
      const lastClient = [...t].reverse().find((m) => m.who === 'client') ?? null
      const saidPaid = !!lastClient && lastClient.kind === 'text' && saysPaid(lastClient.text) && !isQuestionText(lastClient.text)
        && (!details || lastClient.at > details.at)
      if (saidPaid && status === 'TRADING') {
        const asked = lastOurs('mark_paid', lastClient!.at)
        return plan([row('please_pay', askedToPay ? 'done' : 'todo'), row('mark_paid', asked ? 'done' : 'todo')], asked ? [] : ['mark_paid'])
      }
      if (!details) return plan([row('please_pay', 'todo')], [], { hints: ['share_details'] })
      return plan([row('please_pay', askedToPay ? 'done' : 'todo')], askedToPay ? [] : ['please_pay'])
    }
    if (stage === 'sell.pay.checking') {
      const paid = event(['seller_payed', 'buyer_payed'])
      const told = lastOurs('verify_payment', paid ? paid.at - 60_000 : -Infinity)
      const shot = state('payment_screenshot')
      const checklist = [row('verify_payment', told ? 'done' : 'todo'), ...(shot.state !== 'todo' ? [shot] : [])]
      return plan(checklist, told ? [] : ['verify_payment'], {
        options: shot.state === 'todo' ? ['payment_screenshot'] : [], waitingFor: shot.state === 'asked' ? 'payment_screenshot' : null,
      })
    }
    return EMPTY
  }

  // ── Buy orders ──
  const tdsTold = lastOurs('tds_notice')
  if (stage === 'buy.pay.sent' || status === 'BUYER_PAYED') {
    // "We have sent the payment" only once our proof is in the chat (a screenshot or our payment-done text): the order
    // is sometimes marked paid before the money goes.
    const paid = event(['seller_payed', 'buyer_payed'])
    const from = paid ? paid.at - 5 * 60_000 : -Infinity
    const shot = [...t].reverse().find((m) => m.who === 'us' && (m.kind === 'image' || m.kind === 'file') && m.at > from) ?? null
    const told = lastOurs('paid_release', from)
    const proofAt = Math.max(shot?.at ?? -Infinity, told?.at ?? -Infinity)
    if (!Number.isFinite(proofAt)) return plan([row('paid_release', 'todo')], [], { hints: ['send_proof'] })
    if (!told) return plan([row('paid_release', 'todo')], ['paid_release'])
    const lastUs = [...t].reverse().find((m) => m.who === 'us' || m.who === 'auto')?.at ?? told.at
    const remind = now - lastUs >= RELEASE_REMINDER_MS && now - proofAt >= RELEASE_REMINDER_MS
    return plan([row('paid_release', 'done')], remind ? ['release_reminder'] : [])
  }
  if (stage === 'buy.pay.cooling') {
    return plan([state('buy_details'), row('tds_notice', tdsTold ? 'done' : 'todo'), row('beneficiary', 'done')], tdsTold ? [] : ['tds_notice'])
  }
  if (covers('buy.details', stage) || stage === 'buy.pay.processing') {
    const details = state('buy_details')
    const onRecord = onFile.has('pan') && onFile.has('phone')
    const paying = lastOurs('paying')
    const beneficiary = lastOurs('beneficiary')
    const checklist: StepState[] = [
      onRecord && details.state === 'todo' ? row('buy_details', 'skipped') : details,
      row('tds_notice', tdsTold ? 'done' : 'todo'),
      row('paying', paying ? 'done' : 'todo'),
      ...(beneficiary ? [row('beneficiary', 'done')] : []),
    ]
    if (details.state === 'asked') return plan(checklist, [], { waitingFor: 'buy_details' })
    if (details.state === 'todo' && !onRecord) return plan(checklist, ['buy_details'], { options: tdsTold ? [] : ['tds_notice'] })
    // Before paying, the amount after TDS (clients who learn it only after the payment dispute it), then paying.
    if (!tdsTold) return plan(checklist, ['tds_notice'], { options: paying || beneficiary ? [] : ['paying', 'beneficiary'] })
    if (paying || beneficiary) return plan(checklist, [])
    return plan(checklist, ['paying'], { options: ['beneficiary'] })
  }
  return EMPTY
}

/**
 * What we were waiting for when the client's current turn began: the plan of the chat without that turn. The client's
 * "trading" is a plain answer to our purpose question, though the full chat already counts the purpose as answered.
 * Whatever the step (an order with no KYC sign, a step set by hand), the question our last message asked counts too: a
 * one-word answer to "which bank?" or "the purpose?" is an answer.
 */
export function waitingBefore(input: PlanInput, turn: Msg[]): StepKey | null {
  const ids = new Set(turn.map((m) => m.id))
  const t = turn.length ? input.transcript.filter((m) => !ids.has(m.id)) : input.transcript
  const planned = planSteps({ ...input, transcript: t }).waitingFor
  if (planned) return planned
  const last = [...t].reverse().find(ours)
  if (!last) return null
  const asked = STEP_DEFS.filter((d) => d.expects && (!d.side || !input.side || d.side === input.side) && asks(d, last.text))
  return (asked.find((d) => d.expects === 'text') ?? asked[0])?.key ?? null
}

// ─── The words: Playbook steps ───────────────────────────────────────────────────────────────────────

/** A Playbook entry of kind 'step' (copilot_playbook_entries): the words for one step of the script. */
export interface StepEntry {
  id: string
  step_key: string | null
  title: string
  status: string
  scope: ReplyScope
  reply_en: string | null
  reply_hi: string | null
  reply_en_stale?: boolean | null
  reply_hi_stale?: boolean | null
  /** A tentative entry stops being offered at this time unless used (null: never). */
  expires_at?: string | null
}
export interface StepOffer {
  key: StepKey
  label: string
  entryId: string
  title: string
  status: 'approved' | 'tentative'
  /** The words to insert ({greeting} filled, "ma'am" where the client is a woman; order values are filled on the screen). */
  text: string
  language: 'en' | 'hi'
  /** The chat's language copy is out of date or missing, so the other one is offered ("hindi_outdated"…). */
  languageNote: string | null
  /** An option the desk sometimes adds, not the next step itself. */
  option: boolean
}
export interface NextSteps {
  offers: StepOffer[]
  checklist: StepState[]
  waitingFor: StepKey | null
  hints: StepHint[]
  knownClient: boolean
  /** Since when the client has been waiting for us (ISO), for the panel's clock. */
  waitingSince: string | null
  /** Next steps with no words in the Playbook for this order yet (none approved, no tentative one offered). */
  missing: Array<{ key: StepKey; label: string }>
}

/** The plan's next steps that have no words to offer. */
export const missingSteps = (plan: StepPlan, offers: StepOffer[]): Array<{ key: StepKey; label: string }> =>
  plan.next.filter((k) => !offers.some((o) => o.key === k)).map((k) => ({ key: k, label: DEF.get(k)!.label }))

/** A reply scoped to a kind of client is more specific than one for every client at the same depth. */
const specificity = (scope: ReplyScope, stage: string | null) => {
  const clients = scope?.client_states
  return stageDepth(scope, stage) * 2 + (Array.isArray(clients) && clients.length ? 1 : 0)
}

function wordsOf(e: StepEntry, lang: 'en' | 'hi'): { text: string; language: 'en' | 'hi'; note: string | null } | null {
  const en = e.reply_en && !e.reply_en_stale ? e.reply_en : null
  const hi = e.reply_hi && !e.reply_hi_stale ? e.reply_hi : null
  if (lang === 'hi' && hi) return { text: hi, language: 'hi', note: null }
  if (lang === 'en' && en) return { text: en, language: 'en', note: null }
  const other = lang === 'hi' ? en : hi
  if (!other) return null
  const own = lang === 'hi' ? e.reply_hi : e.reply_en
  return { text: other, language: lang === 'hi' ? 'en' : 'hi', note: `${lang === 'hi' ? 'hindi' : 'english'}_${own ? 'outdated' : 'missing'}` }
}

/**
 * The Playbook's words for the plan's steps: per step, an approved entry that applies to this order (side, size,
 * account, status, client, situation) before a tentative one (offered only when `tentative`, and only until it
 * expires), the most specific first. A step with no usable words is left out (it still shows in the checklist). Before
 * verification on our sell orders, words that invite payment are never offered.
 */
export function stepOffers(plan: StepPlan, entries: StepEntry[], o: {
  order: OrderFit; stage: string | null; side: Side | null; lang: 'en' | 'hi'; address: 'sir' | 'maam'; now: Date; tentative: boolean
}): StepOffer[] {
  const out: StepOffer[] = []
  const live = (e: StepEntry) => e.status === 'approved'
    || (o.tentative && e.status === 'tentative' && (!e.expires_at || Date.parse(e.expires_at) > o.now.getTime()))
  const keys = [...plan.next.map((k) => ({ k, option: false })), ...plan.options.map((k) => ({ k, option: true }))]
  for (const { k, option } of keys) {
    const fitting = entries.filter((e) => e.step_key === k && live(e) && fitsOrder(e.scope, o.order, o.stage))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'approved' ? -1 : 1) || specificity(b.scope, o.stage) - specificity(a.scope, o.stage))
    for (const e of fitting) {
      const w = wordsOf(e, o.lang)
      if (!w) continue
      const text = applyAddress(w.text.replace(/\{greeting\}/g, greetingFor(o.now)), o.address)
      if (beforeVerification(o.side, o.stage) && invitesPayment(text)) continue
      out.push({ key: k, label: DEF.get(k)!.label, entryId: e.id, title: e.title, status: e.status === 'approved' ? 'approved' : 'tentative', text, language: w.language, languageNote: w.note, option })
      break
    }
  }
  return out
}

