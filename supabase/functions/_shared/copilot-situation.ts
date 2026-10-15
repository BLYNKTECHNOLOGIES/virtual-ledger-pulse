// Copilot v2: the situation of an order chat — what the client is waiting for right now — worked out without AI
// from the Binance status, Binance's own chat events and our standard messages, plus an approver's correction.
// The same question needs a different reply in a different situation ("Can I pay now?" before and after KYC),
// so Playbook replies are chosen by situation. Codes are a tree: a reply for "sell.kyc" covers every KYC step,
// including steps added later, so approved replies keep working when situations are split or added.
// Pure: no network, no database. Tested in copilot-situation.test.ts.
import type { Msg, Side } from './copilot-playbook.ts'

export interface SituationDef {
  code: string
  side: Side | null
  label: string
  /** For the drafting models: what this situation means and what must not be said in it. */
  ai: string
  /** Emitted by the detector (group codes such as "sell.kyc" are only used to scope replies). */
  detectable: boolean
}

/** Same codes, sides and labels as public.copilot_situations (the screen reads that table). */
export const SITUATIONS: SituationDef[] = [
  { code: 'sell.kyc', side: 'SELL', label: 'KYC and verification', detectable: false,
    ai: 'The client is not verified yet (KYC documents, our checks or the KYC team\'s verification call). Do not share payment details or ask the client to pay.' },
  { code: 'sell.kyc.pending', side: 'SELL', label: 'KYC pending', detectable: true,
    ai: 'We asked the client for KYC documents or details (Aadhaar, mobile number, purpose, source of funds) and the client has not shared them yet. Verification has not started. Do not share payment details or ask the client to pay.' },
  { code: 'sell.kyc.review', side: 'SELL', label: 'Checking KYC', detectable: true,
    ai: 'The client shared the requested KYC documents or details and we are checking them. Verification is not complete. Do not share payment details or ask the client to pay.' },
  { code: 'sell.kyc.call', side: 'SELL', label: 'Verification call', detectable: true,
    ai: 'A one-time verification call by our KYC team is due or in progress (the KYC team, not the relationship team, does it). Verification is not complete. Do not share payment details or ask the client to pay.' },
  { code: 'sell.pay', side: 'SELL', label: 'Payment', detectable: false,
    ai: 'The client is verified (or no KYC was needed); the payment step is in progress.' },
  { code: 'sell.pay.ready', side: 'SELL', label: 'Client can pay', detectable: true,
    ai: 'KYC is done or not needed for this order. The payment details are shared in the chat or shown in the order. We are waiting for the client to pay from a bank account in their own name and to mark the order as paid.' },
  { code: 'sell.pay.checking', side: 'SELL', label: 'Checking payment', detectable: true,
    ai: 'The client marked the order as paid. We must check that the money reached our account before releasing; never promise a release before that.' },
  { code: 'buy.details', side: 'BUY', label: 'Details pending', detectable: true,
    ai: 'We asked the client for details (PAN, mobile number or bank details) and they have not shared them yet. We cannot pay until we have them.' },
  { code: 'buy.pay', side: 'BUY', label: 'Payment', detectable: false,
    ai: 'Our payment to the client is in progress or done.' },
  { code: 'buy.pay.processing', side: 'BUY', label: 'We are paying', detectable: true,
    ai: 'We are processing the payment to the client. It has not been sent yet.' },
  { code: 'buy.pay.cooling', side: 'BUY', label: 'Beneficiary activation', detectable: true,
    ai: "We added the client's bank account as a beneficiary; our bank allows the first payment only after a waiting period. We will pay when it ends." },
  { code: 'buy.pay.sent', side: 'BUY', label: 'Waiting for release', detectable: true,
    ai: 'We marked the order as paid and sent the money. We are waiting for the client to check their bank account and release the crypto.' },
  { code: 'done', side: null, label: 'Completed', detectable: true, ai: 'The order is completed.' },
  { code: 'cancelled', side: null, label: 'Cancelled', detectable: true, ai: 'The order was cancelled. No payment should be made for it.' },
  { code: 'appeal', side: null, label: 'In appeal', detectable: true, ai: 'The order is under appeal on Binance. Stay calm and make no commitments.' },
]

const BY_CODE = new Map(SITUATIONS.map((s) => [s.code, s]))
export const situationDef = (code: string | null | undefined): SituationDef | null => (code ? BY_CODE.get(code) ?? null : null)

/** Set from Binance's order status; an approver's correction never overrides these. */
export const STATUS_SITUATIONS = new Set(['done', 'cancelled', 'appeal', 'sell.pay.checking', 'buy.pay.sent'])

/** True when a reply scoped to `scopeCode` applies in `code` (same code, or a step inside it). */
export function covers(scopeCode: string, code: string | null | undefined): boolean {
  if (!code) return false
  return code === scopeCode || code.startsWith(`${scopeCode}.`)
}

/** On our sell orders, any step before the client is verified. */
export const beforeVerification = (side: Side | null, code: string | null | undefined) => side === 'SELL' && covers('sell.kyc', code)

/** True when a code can be set by an approver for an order on this side. */
export function markable(code: string, side: Side | null): boolean {
  const d = situationDef(code)
  return !!d && d.detectable && !STATUS_SITUATIONS.has(code) && (d.side === null || d.side === side)
}

export interface Evidence { at: number | null; text: string }
export interface Detected {
  code: string | null
  evidence: Evidence[]
  /** Time of our last step or Binance event behind it (an approver's correction made after it wins; client messages never count). */
  since: number
  /** Beneficiary activation: when the bank should allow the payment (ms). */
  readyAt?: number | null
}
export interface Mark { code: string | null; at: number; by: string | null }
export interface Situation extends Detected {
  label: string | null
  detectedCode: string | null
  marked: { by: string | null; at: number } | null
}

const hhmm = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms))

const ours = (m: Msg) => m.who === 'us' || m.who === 'auto'

// Our standard messages (operators follow a script; checked against 30 days of chats). The verification call is the
// KYC team's, even where operators' messages say "RM team".
const KYC_ASK = /\baadha+r\b|\bmobile (no|number)\b|\bpurpose of (buying|purchas)|\bsource of (fund|income)|\bkyc\b[^.?!]{0,40}\b(share|send|complete|submit|provide)\b|\b(share|send|provide)\b[^.?!]{0,40}\b(documents?|kyc)\b/i
const RM = /one[\s-]?time verification|\brm\b|relationship manager|verifying with (the )?team|verification (is )?(in progress|pending|under process)|team will (connect|call|reach)|\bvideo kyc\b|\bvkyc\b|will (call|connect with) you/i
const UPI_ID = /\b[a-z0-9._-]{2,}@[a-z]{2,}\b(?![.@])/i
const DETAILS = [UPI_ID, /\b[A-Z]{4}0[A-Z0-9]{6}\b/i, /\b(account|a\/c)\s*(no|number)?\b[^.?!]{0,20}\d{6,}/i,
  /\bpay (on|to) (it|this|the (above|same|given) (upi|details|account))\b/i, /^\s*(please |kindly )?pay( now)?( on it)?( sir| ma'?am)?\s*\.?\s*$/i]
const BUY_ASK = /\b(pan( card| no| number| details)?|mobile (no|number)|bank (details|account)|account (no|number|details)|ifsc|upi id)\b/i
const ASKING = /\b(share|send|provide|kindly|please|need)\b|\?/i
const PAYING = /\bpaying on\b|\bprocess(ing)?\b|\bin process\b|\bpayment is (in )?progress\b|\bfinance team\b|\binitiat/i
const COOLING = /\bbeneficiary\b/i
const QUESTION = /\?|^\s*(how|what|when|why|where|which|kitna|kitni|kitne|kya|kab|kyu|kyon|kaise|any update|update)\b/i
const SMALL_TALK = /^\s*(good\s+(morning|afternoon|evening|night)|hello|hii*|hey|namaste|namaskar|thanks?|thank\s*you|ok(ay)?|k|yes|yeah|no|sure|wait|sir|ji|hmm+)[\s.!,]*(sir|ji|bro|ma'?am|bhai|please)?[\s.!]*$/i
/** Our message says KYC is finished rather than asking for it ("your KYC is complete"; not "not done yet"). */
const KYC_DONE = /\b(verified|completed?|done|received|successful(ly)?|approved)\b/i
const KYC_NOT_DONE = /\b(not|nahi|nahin|yet to|pending|incomplete)\b[^.?!]{0,20}\b(verified|completed?|done|approved|received)\b|\b(verified|completed?|done|approved|received)\b[^.?!]{0,12}\b(nahi|nahin|not|yet)\b/i
const saysKycDone = (text: string) => KYC_DONE.test(text) && !KYC_NOT_DONE.test(text)
const PROMISE = /\b(sending|will send|i will share|bhej (raha|rahi|deta|deti|dunga|dungi)|abhi bhej|one min(ute)?|1 min)\b/i

const latest = (t: Msg[], f: (m: Msg) => boolean): Msg | null => {
  for (let i = t.length - 1; i >= 0; i--) if (f(t[i])) return t[i]
  return null
}
const first = (t: Msg[], f: (m: Msg) => boolean): Msg | null => t.find(f) ?? null
const isText = (m: Msg) => m.kind === 'text' || m.kind === 'auto_reply'
/** The client gave something: documents, or an answer (not a question, a greeting or "sending now"). */
const answer = (m: Msg) => m.who === 'client' && (m.kind === 'image' || m.kind === 'file'
  || (m.kind === 'text' && !QUESTION.test(m.text) && !SMALL_TALK.test(m.text) && !PROMISE.test(m.text)))

function fromStatus(side: Side | null, status: string, t: Msg[]): Detected | null {
  const ev = (names: string[]) => latest(t, (m) => m.who === 'system' && !!m.event && names.includes(m.event))
  if (status === 'COMPLETED') { const e = ev(['seller_completed', 'buyer_completed']); return { code: 'done', evidence: [{ at: e?.at ?? null, text: 'Order completed' }], since: e?.at ?? 0 } }
  if (status.startsWith('CANCEL')) { const e = ev(['seller_cancelled', 'buyer_cancelled']); return { code: 'cancelled', evidence: [{ at: e?.at ?? null, text: 'Order cancelled' }], since: e?.at ?? 0 } }
  // Binance's status is live; its appeal notice counts only when the status is not known (a withdrawn appeal leaves
  // the notice in the chat while the order goes back to paid).
  const appeal = ev(['be_appeal', 'submit_appeal'])
  if (status === 'APPEAL' || (appeal && (status === 'UNKNOWN' || status === ''))) {
    return { code: 'appeal', evidence: [{ at: appeal?.at ?? null, text: 'Appeal opened' }], since: appeal?.at ?? 0 }
  }
  if (status === 'BUYER_PAYED') {
    const e = ev(['seller_payed', 'buyer_payed'])
    if (side === 'SELL') return { code: 'sell.pay.checking', evidence: [{ at: e?.at ?? null, text: 'Client marked the order as paid' }], since: e?.at ?? 0 }
    if (side === 'BUY') return { code: 'buy.pay.sent', evidence: [{ at: e?.at ?? null, text: 'We marked the order as paid' }], since: e?.at ?? 0 }
  }
  return null
}

/** One of our messages asking for KYC (an instruction to pay that mentions the mobile number is not one). */
const kycAsk = (m: Msg) => ours(m) && isText(m) && KYC_ASK.test(m.text) && !asksToPayNow(m.text)

function detectSell(t: Msg[]): Detected {
  const kycEvent = first(t, (m) => (m.who === 'system' && m.event === 'order_created_with_additional_kyc_maker_sell') || (m.who === 'auto' && m.event === 'kyc_card'))
  let askMsg = latest(t, kycAsk)
  const firstAsk = first(t, kycAsk)
  const verified = latest(t, (m) => m.who === 'system' && m.event === 'maker_verified_additional_kyc_maker_sell')
  const details = latest(t, (m) => m.who === 'us' && m.kind === 'text' && DETAILS.some((re) => re.test(m.text)))
  const rm = latest(t, (m) => m.who === 'us' && m.kind === 'text' && RM.test(m.text))
  let kycStart = [kycEvent?.at, firstAsk?.at].filter((x): x is number => typeof x === 'number').sort((a, b) => a - b)[0] ?? null

  let reask = false
  if (verified || details) {
    const doneAt = Math.max(verified?.at ?? 0, details?.at ?? 0)
    // A re-check after the details were shared or the client was verified puts the order back in verification, so
    // the client is not asked to pay: a verification call, or a real KYC request (asking for something, not
    // "your KYC is complete").
    const again = latest(t, (m) => m.at > doneAt && kycAsk(m) && ASKING.test(m.text) && !saysKycDone(m.text))
    if (rm && rm.at > doneAt && rm.at >= (again?.at ?? 0)) return { code: 'sell.kyc.call', evidence: [{ at: rm.at, text: 'Verification call message sent' }], since: rm.at }
    if (!again) {
      const ev: Evidence[] = []
      if (verified) ev.push({ at: verified.at, text: 'Verified on Binance' })
      if (details) ev.push({ at: details.at, text: 'Payment details shared' })
      return { code: 'sell.pay.ready', evidence: ev, since: doneAt }
    }
    reask = true
    askMsg = again
    kycStart = again.at
  } else if (rm && rm.at >= (askMsg?.at ?? 0)) {
    return { code: 'sell.kyc.call', evidence: [{ at: rm.at, text: 'Verification call message sent' }], since: rm.at }
  }
  if (kycStart === null) return { code: 'sell.pay.ready', evidence: [{ at: null, text: 'No extra KYC on this order' }], since: 0 }

  const after = askMsg?.at ?? kycStart
  const gave = latest(t, (m) => m.at > after && answer(m))
  const docs = latest(t, (m) => m.at > kycStart! && m.who === 'client' && (m.kind === 'image' || m.kind === 'file'))
  if (gave) {
    const ev: Evidence[] = []
    if (docs) ev.push({ at: docs.at, text: 'Documents received' })
    if (!docs || gave.at > docs.at) ev.push({ at: gave.at, text: 'Client answered' })
    // since = our last step: the client's own messages never undo an approver's correction.
    return { code: 'sell.kyc.review', evidence: ev, since: after }
  }
  // The client still owes something: the documents, or the answer to our latest KYC question.
  const ev: Evidence[] = []
  if (docs) ev.push({ at: docs.at, text: 'Documents received' })
  ev.push(askMsg ? { at: askMsg.at, text: reask ? 'KYC asked again' : docs ? 'Question asked' : 'KYC asked' } : { at: kycEvent!.at, text: 'Binance asked for extra KYC' })
  ev.push({ at: null, text: docs ? 'waiting for the answer' : 'nothing received yet' })
  return { code: 'sell.kyc.pending', evidence: ev, since: after }
}

function detectBuy(t: Msg[], now: number): Detected {
  const ask = latest(t, (m) => m.who === 'us' && m.kind === 'text' && BUY_ASK.test(m.text) && ASKING.test(m.text) && !COOLING.test(m.text))
  const cooling = latest(t, (m) => m.who === 'us' && m.kind === 'text' && COOLING.test(m.text))
  const paying = latest(t, (m) => m.who === 'us' && m.kind === 'text' && PAYING.test(m.text) && !COOLING.test(m.text))
  const last = [ask && { k: 'ask' as const, m: ask }, cooling && { k: 'cooling' as const, m: cooling }, paying && { k: 'paying' as const, m: paying }]
    .filter((x): x is { k: 'ask' | 'cooling' | 'paying'; m: Msg } => !!x)
    .sort((a, b) => b.m.at - a.m.at)[0]
  if (!last) return { code: 'buy.pay.processing', evidence: [{ at: null, text: 'Order open; not paid yet' }], since: 0 }
  if (last.k === 'cooling') {
    const mins = Number(last.m.text.match(/(\d{1,3})\s*(?:min|minute)/i)?.[1] ?? 45)
    const readyAt = last.m.at + Math.min(Math.max(mins, 5), 240) * 60_000
    if (now < readyAt) {
      return { code: 'buy.pay.cooling', evidence: [{ at: last.m.at, text: 'Beneficiary added' }, { at: readyAt, text: 'payment possible from about' }], since: last.m.at, readyAt }
    }
    return { code: 'buy.pay.processing', evidence: [{ at: readyAt, text: 'Beneficiary waiting period ended' }], since: readyAt, readyAt }
  }
  if (last.k === 'ask') {
    const gave = latest(t, (m) => m.at > last.m.at && answer(m))
    if (gave) return { code: 'buy.pay.processing', evidence: [{ at: gave.at, text: 'Details received' }], since: last.m.at }
    return { code: 'buy.details', evidence: [{ at: last.m.at, text: 'Details asked' }, { at: null, text: 'nothing received yet' }], since: last.m.at }
  }
  return { code: 'buy.pay.processing', evidence: [{ at: last.m.at, text: 'Payment in process' }], since: last.m.at }
}

/** The situation from the chat and the order status alone. */
export function detectSituation(side: Side | null, status: string, t: Msg[], now: number): Detected {
  const s = fromStatus(side, String(status ?? '').toUpperCase(), t)
  if (s) return s
  if (side === 'SELL') return detectSell(t)
  if (side === 'BUY') return detectBuy(t, now)
  return { code: null, evidence: [], since: 0 }
}

/**
 * The order status as Binance's own chat notices show it up to the end of this (possibly cut) chat: used when a reply
 * sent earlier is saved, so it is filed under the situation it was sent in, not today's.
 */
export function statusFromEvents(t: Msg[]): string {
  let status = 'TRADING'
  for (const m of t) {
    if (m.who !== 'system' || !m.event) continue
    if (m.event === 'seller_payed' || m.event === 'buyer_payed') status = 'BUYER_PAYED'
    else if (m.event === 'seller_completed' || m.event === 'buyer_completed') status = 'COMPLETED'
    else if (m.event === 'seller_cancelled' || m.event === 'buyer_cancelled' || m.event.startsWith('seller_reason_')) status = 'CANCELLED'
    else if (m.event === 'be_appeal' || m.event === 'submit_appeal') status = 'APPEAL'
  }
  return status
}

/**
 * An approver's correction wins over the detection until a newer step happens in the chat (a status change or one
 * of our standard messages after it). Status situations (paid, completed, cancelled, appeal) always come from Binance.
 */
export function resolveSituation(side: Side | null, d: Detected, mark: Mark | null): Situation {
  const base: Situation = { ...d, label: situationDef(d.code)?.label ?? null, detectedCode: d.code, marked: null }
  if (!mark || !d.code || STATUS_SITUATIONS.has(d.code)) return base
  if (mark.at <= d.since) return base
  if (mark.code === null) return base
  if (!markable(mark.code, side)) return base
  return { ...base, code: mark.code, label: situationDef(mark.code)?.label ?? null, marked: { by: mark.by, at: mark.at } }
}

/** "Verified on Binance 11:26 · Payment details shared 11:26" */
export function evidenceText(ev: Evidence[]): string {
  return ev.map((e) => (e.at ? `${e.text} ${hhmm(e.at)}` : e.text)).join(' · ')
}

// ─── Replies that ask the client to pay ─────────────────────────────────────────────────────────────

/** Our payment details themselves: a reply that carries them invites payment, whatever else it says. */
const PAY_DETAILS: RegExp[] = [
  /\{upi\}/i, /\[upi\]/i, UPI_ID, /\[ifsc\]/i, /\b[A-Z]{4}0[A-Z0-9]{6}\b/,
  /\b(account|a\/c|acc)\s*(no|number|num)?\b[^.?!]{0,20}(\d{6,}|\[number\])/i,
]
export const hasPaymentDetails = (text: string | null | undefined) => PAY_DETAILS.some((re) => re.test(String(text ?? '')))

/** Ways of asking the client to pay now, in English and Hinglish (each match is then checked for "not" and "after verification"). */
const PAY_ASK: RegExp[] = [
  /\b(please|kindly|pls|plz|you (can|may|could|should)|go ahead( and)?|now|just|feel free to|proceed to)\s+(\w+\s+){0,2}?(pay|transfer)\b/gi,
  /\b(make|do|complete|proceed with|go ahead with|initiate)\s+(the |your |this )?(payment|transfer)\b(?!\s+(verification|details?|check))/gi,
  /\b(transfer|send|deposit|remit)\s+(the |your |this )?(amount|money|funds|payment(?!\s+details?))\b/gi,
  /\b(pay|paying)\s+(on|to|via|using|through|at|in|into)\s+(it|this|the|our|these|that|above|below|given|same|upi|qr)\b/gi,
  /\bpay\s+(the|this|your)\s+(amount|money|payment|order)\b/gi,
  /\bpayment\s+(can|may|should|could)\s+(now\s+)?be\s+(made|done|sent|transferred|completed)\b/gi,
  /\b(good|free|ok|okay|clear)\s+to\s+(pay|transfer|make the payment)\b/gi,
  /\b(waiting|wait)\s+for\s+(your|the)\s+payment\b/gi,
  /\b(after|once|when)\s+(you\s+)?(pay|paying|make the payment|making the payment|have paid)\b/gi,
  /\b(don'?t|do not|no need to)\s+(wait|hesitate|delay|forget|worry|panic)\b[^.?!]{0,15}\b(pay|payment|transfer)\b/gi,
  /\bpayment details\b[^.?!]{0,25}\b(below|above|here|are as follows)\b/gi,
  /\b(pay|payment|transfer|amount|paise|paisa|money)\s+(\w+\s+)?(kar|kr)\s*(do|dijiye|dijie|dijiyega|dein|de|dena|sakte|sakti|sakta|skte|skti|skta|lijiye|lijiyega|lo|lein|len)\b/gi,
  /\b(pay|payment|transfer)\s+(kijiye|kijie|kijiyega|karein|karen|kariye|kariyega|karo|kro|kare)\b/gi,
  /\b(pay|payment|transfer)\s+(karke|kar\s+ke|krke|karne\s+ke\s+baad|krne\s+ke\s+baad)\b/gi,
  /\b(amount|paise|paisa|payment|money)\s+(bhej|send|transfer|daal|dal|deposit)\s*(do|dijiye|dijie|dijiyega|dein|de|dena|sakte|sakti|sakta|skte)\b/gi,
  /\b(amount|paise|paisa|payment|money)\s+(send|transfer|deposit)\s+(kar|kr)\b/gi,
  /\b(amount|paise|paisa|payment|money)\s+(bhejiye|bhejein|bhejo|daaliye|daliye|daalo|dalo)\b/gi,
  /\b(aapko|aap)\s+(\w+\s+){0,2}?(payment|pay|transfer)\s+(karna|krna)\s+(hai|hoga|padega)\b/gi,
  /\b(is|isi|iss|yeh|ye|inhi|isme)\s+(upi|account|number|details?)\s+(par|pe|mein|me)\b/gi,
  /\b(upi|qr|account|details?)\s+(par|pe)\s+(\w+\s+){0,2}?(bhej\s*(do|dijiye|dijie|dein|de)|bhejiye|bhejein|bhejo|daal\s*(do|dijiye|dijie)|daaliye|dalo|send\s+kar\w*|transfer\s+kar\w*)\b/gi,
]
/** "Pay now, sir." on its own. */
const PAY_BARE = /^\s*((sir|ma'?am|ji)[\s,]+)?(please |kindly |pls )?(pay|transfer)(\s+(now|it))?[\s,]*(sir|ma'?am|ji)?[\s.!]*$/i
/** "Do not pay", "payment mat kar dijiye". Reassurances ("don't wait / worry / forget to pay") are not refusals. */
const NEG_BEFORE = /\b(do not|don'?t|never|no need to|not to|avoid)\s+(\w+\s+){0,2}$/i
const NEG_INSIDE = /\b(do not|don'?t|never|no need to|not to|avoid)\b|\b(mat|na|nahi|nahin)\b/i
const REASSURE = /\b(do not|don'?t|never|no need to)\s+(wait|hesitate|delay|worry|panic|mind|forget|be (afraid|scared|worried|confused)|get (confused|worried))\b/gi
/** "Before you make the payment, please share …": a step to do first, not a request to pay. */
const BEFORE_STEP = /\bbefore\s+(you\s+)?$/i

/** The client's verification finished (not "documents shared", not "payment verified"). */
const VERIF = String.raw`(kyc|verification|video kyc|vkyc|one[\s-]?time verification)`
const DONE = String.raw`(complete|completed|done|finished|successful|approved|verified|over|cleared)`
const VERIFIED_EN: RegExp[] = [
  new RegExp(String.raw`\b(after|once|as soon as|when|until|till|post)\s+((your|the|a)\s+)?${VERIF}(\s+process)?\s+((is|gets|get|has been|have been)\s+)?${DONE}\b`, 'gi'),
  new RegExp(String.raw`\b(after|post)\s+((your|the)\s+)?${VERIF}\b(?!\s+(documents?|details?|papers?|card|form|link|call|request|process))`, 'gi'),
  new RegExp(String.raw`\b(after|once|as soon as|when|until|till)\s+(you are|you're|you have been|you get|your account is|your kyc is)\s+((fully|successfully)\s+)?(verified|approved)\b`, 'gi'),
]
const VERIFIED_HI: RegExp[] = [
  new RegExp(String.raw`\b${VERIF}\s+(\w+\s+){0,2}?(complete|done|verify|approve|poori|puri|clear)\s+(hone\s+ke\s+baad|hote\s+hi|hone\s+par|ho\s+jaane\s+ke\s+baad|ho\s+jane\s+ke\s+baad|ho\s+jaye\s+to|hone\s+tak)`, 'gi'),
  new RegExp(String.raw`\b${VERIF}\s+(ke\s+baad|hone\s+ke\s+baad|hote\s+hi|hone\s+par)`, 'gi'),
]
/** After a condition placed after the request: another main clause ("we will release") means it governs that one. */
const CLAUSE_BREAK = /\b(we|we'll|our|us|hum|humari|hamari|hamara|release|released|releasing|share|shared|send|sent|bhej\w*|karenge|denge|team|usdt|crypto|coins?|will|order)\b/i
/** Words that may sit between a condition and the request it governs ("Once verified, sir, you can pay"). */
const FILLER = /^(sir|ma'?am|maam|ji|please|kindly|pls|plz|then|you|can|may|could|also|only|just|hi|aap|phir|fir|tab|to|toh|bhi|and|now|abhi|easily|directly|go|ahead|feel|free)$/i
const onlyFiller = (x: string) => x.split(/[\s,;:.!?]+/).filter((w) => /\w/.test(w)).every((w) => FILLER.test(w))
const FIRST_DONE_EN = /\bfirst\b/i
const DONE_EN = /\b(complete|finish|do|get)\s+(your |the )?(kyc|verification|video kyc|vkyc)\b|\b(get|be|are|is)\s+(fully\s+)?verified\b|\b(kyc|verification)\b[^.?!,]{0,15}\b(complete|completed|done)\b/i
const FIRST_DONE_HI = /\bpehle\b/i
const DONE_HI = /\b(kyc|verification)\b[^.?!]{0,15}\b(complete|poori|puri|done|clear|verify)\b/i

interface Span { start: number; end: number }
const spans = (res: RegExp[], s: string): Span[] => {
  const out: Span[] = []
  for (const re of res) {
    re.lastIndex = 0
    for (let m = re.exec(s); m; m = re.exec(s)) {
      out.push({ start: m.index, end: m.index + m[0].length })
      if (!m[0].length) re.lastIndex++
    }
  }
  return out
}
const words = (x: string) => x.split(/\s+/).filter((w) => /\w/.test(w)).length

/** True when this request to pay (a span of the sentence) is a "do not pay", a step before paying, or a "pay once verified". */
function excused(s: string, h: Span): boolean {
  const text = s.slice(h.start, h.end)
  const before = s.slice(0, h.start)
  const blank = (x: string) => x.replace(REASSURE, (m) => ' '.repeat(m.length))
  if (NEG_BEFORE.test(blank(before.slice(-40))) || NEG_INSIDE.test(blank(text))) return true
  if (BEFORE_STEP.test(before)) return true
  // A condition before the request governs it when only filler words sit between ("Once verified, you can pay";
  // "verification ke baad hi payment kijiye"). After the request, an English condition governs it when it ends the
  // sentence ("you can pay after your verification is complete"), not when it opens another clause.
  for (const c of [...spans(VERIFIED_EN, s), ...spans(VERIFIED_HI, s)]) {
    if (c.end <= h.start && onlyFiller(s.slice(c.end, h.start))) return true
  }
  for (const c of spans(VERIFIED_EN, s)) {
    const between = s.slice(h.end, c.start)
    if (c.start >= h.end && words(between) <= 8 && !CLAUSE_BREAK.test(between) && onlyFiller(s.slice(c.end))) return true
  }
  // "Complete your KYC first, then you can pay" / "Pehle KYC complete kijiye, phir payment kar sakte hain".
  const lead = s.slice(Math.max(0, h.start - 25), h.start)
  if (FIRST_DONE_EN.test(before) && DONE_EN.test(before) && /\b(then|after that|afterwards)\b[\s,]*(\w+\s+){0,2}$/i.test(lead)) return true
  if (FIRST_DONE_HI.test(before) && DONE_HI.test(before) && /\b(phir|fir|uske baad|iske baad|tab)\b[\s,]*(\w+\s+){0,2}$/i.test(lead)) return true
  return false
}

/**
 * True when a reply asks the client to pay now or shows our payment details. Each request to pay is checked within
 * its own sentence: "please pay, we will release once the payment is verified" counts, "you can pay after your
 * verification is complete" does not. Errs on the side of holding a reply back: a missed invitation could have a
 * client pay before verification.
 */
export function invitesPayment(text: string | null | undefined): boolean {
  const t = String(text ?? '')
  if (hasPaymentDetails(t)) return true
  for (const s of t.split(/(?<=[.?!;])\s+|\n+/)) {
    const hits = spans(PAY_ASK, s)
    // A bare "pay now" clause (between commas, or after "and").
    let pos = 0
    for (const part of s.split(/(\s*[,:]\s*|\s+(?:and|aur)\s+)/i)) {
      if (PAY_BARE.test(part)) hits.push({ start: pos, end: pos + part.length })
      pos += part.length
    }
    if (hits.some((h) => !excused(s, h))) return true
  }
  return false
}

/**
 * A reply that plainly asks the client to pay now: our payment details, or a request to pay that says nothing of KYC
 * or verification. Used when saving, to file such a reply under "Client can pay" (a reply about KYC that also talks
 * about paying stays where it is; the check above still holds it back before verification).
 */
export function asksToPayNow(text: string | null | undefined): boolean {
  const t = String(text ?? '')
  return hasPaymentDetails(t) || (invitesPayment(t) && !ASKS_FOR_KYC.test(t))
}
/** The reply asks the client for KYC (documents, details, the KYC itself). */
const ASKS_FOR_KYC = /\b(share|send|provide|upload|submit|complete|do|finish)\b[^.?!]{0,30}\b(kyc|aadha+r|documents?|pan( card)?|details|verification|selfie|video kyc)\b|\b(kyc|aadha+r|documents?)\b[^.?!]{0,25}\b(share|bhej\w*|send|kijiye|karein|dijiye)\b/i
