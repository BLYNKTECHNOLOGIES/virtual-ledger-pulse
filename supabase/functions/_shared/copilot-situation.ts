// Copilot v2: the situation of an order chat — what the client is waiting for right now — worked out without AI
// from the Binance status, Binance's own chat events and our standard messages, plus an approver's correction.
// Binance's order data (its extra-KYC field) fills a KYC notice the chat does not have.
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
  /** Sell order with no KYC sign at all in the chat (no Binance KYC notice, no KYC request from us). */
  noKyc?: boolean
  /**
   * Sell order whose extra KYC Binance says is required and not verified, with neither Binance's Verified notice nor our
   * payment details in the chat: it stays in KYC, whatever an approver's correction says.
   */
  kycRequired?: boolean
}
/** An approver's correction; detected: the step the chat showed when it was made. */
export interface Mark { code: string | null; at: number; by: string | null; detected?: string | null }
/**
 * What the chat itself may not show: Binance's order data, for the gaps in the chat (a notice not synced yet, or missed;
 * the chat's own notices win when present, as they carry the time), and what the approvers' corrections say about it.
 */
export interface OrderSignals {
  /** additionalKycVerify on our sell orders: 0 no extra KYC, 1 extra KYC required and not verified, 2 verified. */
  kycVerify?: number | null
  /** When the order was created (ms): the time of a KYC requirement known only from the order data. */
  createdAt?: number | null
  /** The latest moment by which the approvers' corrections say the client was verified (see verifiedBy). */
  verifiedBy?: number | null
  /**
   * kycVerify 1 standing for Binance's "verified" at an unknown moment (a reply sent earlier is being filed): KYC was
   * required, but whether it was verified by then is unknown, so an approver's correction made then still counts.
   */
  verifiedLater?: boolean
}
/**
 * For filing a reply sent earlier: whether KYC was required never changes, but "verified" now says nothing about the
 * moment that reply was sent.
 */
export const requiredOnly = (s: OrderSignals | null | undefined): OrderSignals =>
  s?.kycVerify === 2
    ? { kycVerify: 1, createdAt: s?.createdAt ?? null, verifiedLater: true }
    : { kycVerify: s?.kycVerify ?? null, createdAt: s?.createdAt ?? null }

/**
 * The latest moment by which the approvers' corrections say the client was verified (marks newest first): their newest
 * "Client can pay" set by hand, or their newest move from "Client can pay" back to a KYC step (a re-check: the
 * verification came before it). Binance's "verified" known only from its order data then counts no later than this, so
 * our KYC messages after it read as a re-check, as they do after Binance's notice or our payment details. A KYC step set
 * while the chat already showed KYC, or going back to what the chat shows, says nothing about it.
 */
export function verifiedBy(marks: Mark[]): number | null {
  for (const m of marks) {
    if (!m.code) continue
    if (covers('sell.pay', m.code)) return m.at
    if (covers('sell.kyc', m.code) && m.detected && covers('sell.pay', m.detected)) return m.at
  }
  return null
}
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
const RM = /one[\s-]?time verification|\brm\b|relationship manager|verifying with (the )?team|verification (is )?(in progress|pending|under process)|team will (connect|call|reach)|\bvideo kyc\b|\bvkyc\b|will (call|connect with) you|\bek\s*baar\s*(ka\s+|ki\s+)?verification\b(?!\s+(complete|poori|puri|done|ho\s+ja|hone|hote|ke\s+baad))|\b(kyc|verification)\b[^.?!]{0,60}\b(connect|call)\s+(karegi|karega|karenge)\b/i
// A UPI ID may end a sentence ("our UPI ID is blynk@ybl."); "blynk@ybl.in" is an e-mail address, not a UPI ID.
const UPI_ID = /\b[a-z0-9._-]{2,}@[a-z]{2,}\b(?!@|[.-][a-z0-9])/i
const DETAIL_VALUES = [UPI_ID, /\b[A-Z]{4}0[A-Z0-9]{6}\b/i, /\b(account|a\/c)\s*(no|number)?\b[^.?!]{0,20}\d{6,}/i]
const DETAIL_ASKS = [/\bpay (on|to) (it|this|the (above|same|given) (upi|details|account))\b/i, /^\s*(please |kindly )?pay( now)?( on it)?( sir| ma'?am)?\s*\.?\s*$/i]
/**
 * Our message gives the payment details, or tells the client to pay to them now ("pay on this UPI"). Not "you can pay
 * to the given account once your verification is complete": that is still a KYC reply.
 */
const sharesDetails = (text: string) =>
  DETAIL_VALUES.some((re) => re.test(text)) || hasPaymentDetails(text) || (DETAIL_ASKS.some((re) => re.test(text)) && invitesPayment(text))
const BUY_ASK = /\b(pan( card| no| number| details)?|mobile (no|number)|bank (details|account)|account (no|number|details)|ifsc|upi id)\b/i
const ASKING = /\b(share|send|provide|kindly|please|need)\b|\?/i
/**
 * "Please share the requested details" / "pehle details share kar dijiye": a request for details, whatever else it
 * says ("so that we can process the payment"). Only a request: "please ... share ... details", or the Hinglish
 * imperative, not "details share karne ke liye thank you" or "aapne details share kar di hai".
 */
const DETAILS_ASK = /\b(please|kindly|pls|plz)\b[^.?!]{0,30}\b(share|send|provide)\b[^.?!]{0,40}\bdetails\b|\bdetails\b[^.?!]{0,25}\b(share|send|bhej)\w*\s+(kar\s+)?(dijiye|dijie|dijiyega|kijiye|kariye|karo|do|dein)\b/i
/** "We will share the details" / "details share kar denge": our promise, not a request. */
const OUR_PROMISE = /\b(we|i)\s*('ll|will|shall|are going to)\s+(share|send|provide)\b|\b(share|send|bhej)\w*\s+(kar\s+)?(denge|dunga|dungi|karenge|karunga|karungi)\b/i
/** "Please do not share your details with anyone": a warning, not a request. */
const NOT_ASKING = /\b(do not|don'?t|never|no need to)\s+(\w+\s+){0,2}(share|send|provide)\b|\b(share|send|bhej)\w*\s+(mat|na)\b|\bmat\s+(share|send|bhej)/i
const PAYING = /\bpaying on\b|\bprocess(ing)?\b|\bin process\b|\bpayment is (in )?progress\b|\bfinance team\b|\binitiat/i
const COOLING = /\bbeneficiary\b/i
const QUESTION = /\?|^\s*(how|what|when|why|where|which|kitna|kitni|kitne|kya|kab|kyu|kyon|kaise|any update|update)\b/i
const SMALL_TALK = /^\s*(good\s+(morning|afternoon|evening|night)|hello|hii*|hey|namaste|namaskar|thanks?|thank\s*you|ok(ay)?|k|yes|yeah|no|sure|wait|sir|ji|hmm+)[\s.!,]*(sir|ji|bro|ma'?am|bhai|please)?[\s.!]*$/i
/** A greeting, thanks or "ok" on its own: nothing to look up. */
export const isSmallTalk = (text: string | null | undefined) => SMALL_TALK.test(String(text ?? ''))
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

function detectSell(t: Msg[], sig: OrderSignals, now: number): Detected {
  const akv = sig.kycVerify
  // Binance's order data fills a notice the chat does not have (not synced yet, missed, or older than the messages
  // loaded): extra KYC is required from the order's creation, so a missing notice never makes an order look like "no KYC,
  // client can pay"; and "verified" (see below).
  const kycEvent = first(t, (m) => (m.who === 'system' && m.event === 'order_created_with_additional_kyc_maker_sell') || (m.who === 'auto' && m.event === 'kyc_card'))
    ?? (akv === 1 || akv === 2
      ? { id: 'binance-order-kyc', at: sig.createdAt && sig.createdAt > 0 ? sig.createdAt : 0, who: 'system' as const, kind: 'system', text: '', event: 'order_created_with_additional_kyc_maker_sell' }
      : null)
  let askMsg = latest(t, kycAsk)
  const firstAsk = first(t, kycAsk)
  const chatVerified = latest(t, (m) => m.who === 'system' && m.event === 'maker_verified_additional_kyc_maker_sell')
  const details = latest(t, (m) => m.who === 'us' && m.kind === 'text' && sharesDetails(m.text))
  const rm = latest(t, (m) => m.who === 'us' && m.kind === 'text' && RM.test(m.text))
  // Binance says the extra KYC is required and not verified, and the chat shows neither its Verified notice nor our payment
  // details: KYC it is (an approver's "Client can pay" does not change that).
  const out = akv === 1 && !sig.verifiedLater && !chatVerified && !details ? (d: Detected): Detected => ({ ...d, kycRequired: true }) : (d: Detected) => d
  // Verified per Binance's order data while the chat has no notice (not synced yet, or missed): the click's time is
  // unknown. With our payment details shared, those decide (a KYC request after them is still a re-check). Otherwise it
  // counts from our latest KYC step (a KYC request or the verification-call message; or Binance's KYC notice): the click
  // normally follows it, and an approver's correction made after it still wins, which our small talk ("ok sir, please
  // wait") never undoes. Once an approver set "Client can pay", or moved the chat from it back to a KYC step (a re-check),
  // the click came before that: it counts from our latest KYC step before then, and our KYC messages after it are a
  // re-check, as they are after Binance's notice.
  const until = sig.verifiedBy ?? Infinity
  const lastStep = latest(t, (m) => m.at <= until && (kycAsk(m) || (m.who === 'us' && m.kind === 'text' && RM.test(m.text))))
  const verified = chatVerified ?? (akv === 2 && !details
    ? { id: 'binance-order-verified', at: Math.min(Math.max(lastStep?.at ?? 0, kycEvent?.at ?? 0), until), who: 'system' as const, kind: 'system', text: '' }
    : null)
  const verifiedByOrderData = !chatVerified && akv === 2
  let kycStart = [kycEvent?.at, firstAsk?.at].filter((x): x is number => typeof x === 'number').sort((a, b) => a - b)[0] ?? null

  let reask = false
  if (verified || details) {
    const doneAt = Math.max(verified?.at ?? 0, details?.at ?? 0)
    // A re-check after the details were shared or the client was verified puts the order back in verification, so
    // the client is not asked to pay: a verification call, or a real KYC request (asking for something, not
    // "your KYC is complete").
    const again = latest(t, (m) => m.at > doneAt && kycAsk(m) && ASKING.test(m.text) && !saysKycDone(m.text))
    if (rm && rm.at > doneAt && rm.at >= (again?.at ?? 0)) return out({ code: 'sell.kyc.call', evidence: [{ at: rm.at, text: 'Verification call message sent' }], since: rm.at })
    if (!again) {
      const ev: Evidence[] = []
      if (chatVerified) ev.push({ at: chatVerified.at, text: 'Verified on Binance' })
      else if (verifiedByOrderData) ev.push({ at: null, text: 'Verified on Binance' })
      if (details) ev.push({ at: details.at, text: 'Payment details shared' })
      return out({ code: 'sell.pay.ready', evidence: ev, since: doneAt })
    }
    reask = true
    askMsg = again
    kycStart = again.at
  } else if (rm && rm.at >= (askMsg?.at ?? 0)) {
    return out({ code: 'sell.kyc.call', evidence: [{ at: rm.at, text: 'Verification call message sent' }], since: rm.at })
  }
  if (kycStart === null) {
    // No KYC sign in the chat. Only Binance saying "no extra KYC" (0) lets the client pay from the start; while its field
    // is not known yet (a new order not stored yet, the screen's value not in), the order is treated as needing KYC.
    if (akv === 0) return out({ code: 'sell.pay.ready', evidence: [{ at: null, text: 'No extra KYC on Binance for this order' }], since: 0, noKyc: true })
    return out({ code: 'sell.kyc.pending', evidence: [{ at: null, text: "Binance's KYC setting not known yet" }, { at: null, text: 'nothing received yet' }], since: 0 })
  }

  const after = askMsg?.at ?? kycStart
  const gave = latest(t, (m) => m.at > after && answer(m))
  const docs = latest(t, (m) => m.at > kycStart! && m.who === 'client' && (m.kind === 'image' || m.kind === 'file'))
  if (gave) {
    const ev: Evidence[] = []
    if (docs) ev.push({ at: docs.at, text: 'Documents received' })
    if (!docs || gave.at > docs.at) ev.push({ at: gave.at, text: 'Client answered' })
    // since = our last step: the client's own messages never undo an approver's correction.
    return out({ code: 'sell.kyc.review', evidence: ev, since: after })
  }
  // The client still owes something: the documents, or the answer to our latest KYC question.
  const ev: Evidence[] = []
  if (docs) ev.push({ at: docs.at, text: 'Documents received' })
  ev.push(askMsg
    ? { at: askMsg.at, text: reask ? 'KYC asked again' : docs ? 'Question asked' : 'KYC asked' }
    : kycEvent!.id === 'binance-order-kyc' ? { at: null, text: 'Extra KYC required on Binance' } : { at: kycEvent!.at, text: 'Binance asked for extra KYC' })
  ev.push({ at: null, text: docs ? 'waiting for the answer' : 'nothing received yet' })
  return out({ code: 'sell.kyc.pending', evidence: ev, since: after })
}

function detectBuy(t: Msg[], now: number): Detected {
  const asksDetails = (text: string) =>
    (BUY_ASK.test(text) || (DETAILS_ASK.test(text) && !OUR_PROMISE.test(text) && !NOT_ASKING.test(text))) && ASKING.test(text) && !COOLING.test(text)
  const ask = latest(t, (m) => m.who === 'us' && m.kind === 'text' && asksDetails(m.text))
  const cooling = latest(t, (m) => m.who === 'us' && m.kind === 'text' && COOLING.test(m.text))
  // "Please share the details so that we can process your payment" asks for details; it does not say we are paying.
  const paying = latest(t, (m) => m.who === 'us' && m.kind === 'text' && PAYING.test(m.text) && !COOLING.test(m.text) && !asksDetails(m.text))
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

/** The situation from the order status, the chat, and Binance's order data where the chat has a gap. */
export function detectSituation(side: Side | null, status: string, t: Msg[], now: number, signals: OrderSignals | null = null): Detected {
  const s = fromStatus(side, String(status ?? '').toUpperCase(), t)
  if (s) return s
  if (side === 'SELL') return detectSell(t, signals ?? {}, now)
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
 * of our standard messages after it). Status situations (paid, completed, cancelled, appeal) always come from Binance,
 * and a sell order whose extra KYC Binance says is not verified stays in KYC.
 */
export function resolveSituation(side: Side | null, d: Detected, mark: Mark | null): Situation {
  const base: Situation = { ...d, label: situationDef(d.code)?.label ?? null, detectedCode: d.code, marked: null }
  if (!mark || !d.code || STATUS_SITUATIONS.has(d.code)) return base
  if (mark.at <= d.since) return base
  if (mark.code === null) return base
  if (!markable(mark.code, side)) return base
  if (d.kycRequired && !covers('sell.kyc', mark.code)) return base
  return { ...base, code: mark.code, label: situationDef(mark.code)?.label ?? null, marked: { by: mark.by, at: mark.at } }
}

/** "Verified on Binance 11:26 · Payment details shared 11:26" */
export function evidenceText(ev: Evidence[]): string {
  return ev.map((e) => (e.at ? `${e.text} ${hhmm(e.at)}` : e.text)).join(' · ')
}

// ─── Other steps the client could be at ─────────────────────────────────────────────────────────────

// The steps worked out from our messages and the client's (not from Binance): KYC happens outside the chat, so the
// detected step is a best guess and the approver may know better. In flow order.
const KYC_STEPS = ['sell.kyc.pending', 'sell.kyc.review', 'sell.kyc.call']
const BUY_STEPS = ['buy.details', 'buy.pay.processing', 'buy.pay.cooling']
const NEIGHBOURS: Record<string, string[]> = {
  'sell.kyc.pending': ['sell.kyc.review', 'sell.kyc.call'],
  'sell.kyc.review': ['sell.kyc.call', 'sell.kyc.pending'],
  'sell.kyc.call': ['sell.kyc.review', 'sell.kyc.pending'],
  'buy.details': ['buy.pay.processing', 'buy.pay.cooling'],
  'buy.pay.processing': ['buy.pay.cooling', 'buy.details'],
  'buy.pay.cooling': ['buy.pay.processing', 'buy.details'],
}

/**
 * The other steps this chat could really be at, closest first, for the approver to pick from: the neighbouring KYC
 * steps (documents, our check, the KYC team's call) or our payment steps on a buy order. Never "Client can pay" before
 * verification: that comes only from Binance's Verified notice or our payment details. A sell order with no KYC sign
 * at all, for a client not approved by us, may still need KYC. Status situations (paid, completed, cancelled,
 * appeal) come from Binance and have no alternatives.
 */
export function alternativeSteps(side: Side | null, s: { code: string | null; noKyc?: boolean }, clientState: string | null): string[] {
  const code = s.code
  if (!code || !side || STATUS_SITUATIONS.has(code)) return []
  if (side === 'SELL' && KYC_STEPS.includes(code)) return [...NEIGHBOURS[code]]
  if (side === 'SELL' && code === 'sell.pay.ready' && s.noKyc && clientState !== 'approved') return ['sell.kyc.pending']
  if (side === 'BUY' && BUY_STEPS.includes(code)) return [...NEIGHBOURS[code]]
  return []
}

// ─── Reply scopes ───────────────────────────────────────────────────────────────────────────────────

/** A Playbook reply's scope (empty or missing list = any). */
export type ReplyScope = Partial<Record<'stages' | 'sides' | 'categories' | 'account_ids' | 'statuses' | 'client_states', unknown>> | null | undefined
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
export const scopeStages = (scope: ReplyScope): string[] => list(scope?.stages)
/** A reply applies in this situation when it lists no situations, or one that covers it. Unknown situation: only "any". */
export const fitsStage = (scope: ReplyScope, stage: string | null) => {
  const s = scopeStages(scope)
  return s.length === 0 || (!!stage && s.some((c) => covers(c, stage)))
}
const allows = (v: unknown, x: string | null) => !Array.isArray(v) || v.length === 0 || (!!x && v.includes(x))
export interface OrderFit { side: string | null; category: string; accountId: string | null; status: string; clientState: string }
/** Same rule as the database's "fits": the reply applies to this order now (side, size, account, status, client, situation). */
export function fitsOrder(scope: ReplyScope, o: OrderFit, stage: string | null) {
  return allows(scope?.sides, o.side) && allows(scope?.categories, o.category) && allows(scope?.account_ids, o.accountId)
    && allows(scope?.statuses, o.status) && allows(scope?.client_states, o.clientState) && fitsStage(scope, stage)
}
/** Same rule as the database's specificity: the depth of the most specific listed situation covering this one (0 = any). */
export function stageDepth(scope: ReplyScope, stage: string | null): number {
  return scopeStages(scope).filter((c) => covers(c, stage)).reduce((n, c) => Math.max(n, c.split('.').length), 0)
}

// ─── Replies that ask the client to pay ─────────────────────────────────────────────────────────────

/** Our payment details themselves: a reply that carries them invites payment, whatever else it says. */
const PAY_DETAILS: RegExp[] = [
  /\{upi\}/i, /\[upi\]/i, UPI_ID, /\[ifsc\]/i, /\b[A-Z]{4}0[A-Z0-9]{6}\b/i,
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
  /\byou\s+(need|have|must)\s+to\s+(pay|make the payment|transfer)(?=\s+(it|now|the amount|within|in|before|by)\b|\s*[.,!]|\s*$)/gi,
  // "…, so pay fast": the connector stays outside the match, so "complete the KYC first, then pay" is still read as a step
  // first. Not "so pay later once we confirm", not "pay attention" ("pay only from your own account" still counts).
  /(?<=\b(so|and|then)\s+)((please|kindly|pls|plz)\s+)?(pay|transfer|make the payment)\b(?!\s+(verification|details?|check|later|attention|heed)\b)/gi,
  /\b(pay|transfer)\s+(fast|quickly|asap|soon|immediately|jaldi|jldi)\b/gi,
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
/**
 * The time left to pay ("15 minutes to pay", "payment ka time 6 minute bacha hai"): it hurries the client to pay, unless a
 * condition on verification comes first in the sentence ("once your KYC is done, you will have 15 minutes to pay").
 */
const PAY_TIME: RegExp[] = [
  /\b(left|remaining)\s+(to|for)\s+(pay|paying|make the payment|the payment|transfer)\b/gi,
  /\btime\s+to\s+(pay|make the payment|transfer)\b/gi,
  /\b(min|mins|minutes?|time)\s+((left|remaining)\s+)?(to|for)\s+(pay|paying|payment|the payment|make the payment|transfer)\b(?!\s+(verification|details?|check|confirmation|to reflect|reflect))/gi,
  /\b(pay|payment|transfer)\s+(karne|krne)\s+(ke\s+liye|ko)\s+(\w+\s+){0,3}?(minute|minutes|min|mins|time|samay|ghante|ghanta)\s+(bache|bacha|bachi|baaki|baki|left|hai|hain|he)\b/gi,
  /\b(pay|payment)\s+(karne\s+)?ke\s+liye\s+(\w+\s+){0,3}?(minute|minutes|min|mins|time|samay)\b/gi,
  /\b(minute|minutes|min|mins)\s+(bache|bacha|baaki|baki)\s+(hain|hai|he)\s+(pay|payment)\b/gi,
  /\b(pay|payment)\s+(ka|ki|ke)\s+(time|samay)\b[^.?!]{0,25}?\b(bacha|bache|bachi|baaki|baki|left)\b/gi,
]
/** "Pay now, sir." on its own. */
const PAY_BARE =/^\s*((sir|ma'?am|ji)[\s,]+)?(please |kindly |pls )?(pay|transfer)(\s+(now|it))?[\s,]*(sir|ma'?am|ji)?[\s.!]*$/i
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
/**
 * Between a verification condition and a later time to pay: another clause ("we will release", "order release hoga")
 * means the condition governs that one, not the time to pay ("you will have" does not).
 */
const TIME_BREAK = /\b(we|we'll|our|us|hum|humari|hamari|hamara|release\w*|share\w*|send|sent|bhej\w*|karenge|denge|hoga|hogi|jayega|jaega|jayegi|team|usdt|crypto|coins?|order|confirm\w*|will\s+be|it'?ll|but|however|right\s+now|currently|abhi|meanwhile|lekin|par)\b/i
/** Words that may sit between a condition and the request it governs ("Once your KYC is done, sir, you can pay"). */
const FILLER = /^(sir|ma'?am|maam|ji|please|kindly|pls|plz|then|you|can|may|could|also|only|just|hi|aap|phir|fir|tab|to|toh|bhi|and|now|abhi|easily|directly|go|ahead|feel|free)$/i
const onlyFiller = (x: string) => x.split(/[\s,;:.!?]+/).filter((w) => /\w/.test(w)).every((w) => FILLER.test(w))
/** Words that may open a clause before its condition ("Sir, once your KYC is done, …"; "aapka KYC complete hone ke baad …"). */
const LEAD_WORDS = /^(sir|ma'?am|maam|ji|dear|hello|hi|ok|okay|please|kindly|pls|plz|and|so|then|also|just|bas|your|the|aapka|aapki|aapke|apka|apki|apke|ek|baar|jab)$/i
/**
 * The condition opens its own clause: "we will release the USDT once your verification is complete, please pay now" closes
 * "we will release", so it governs that clause, not the request after it.
 */
const opensClause = (s: string, c: { start: number }) =>
  (s.slice(0, c.start).split(/[,;:]/).pop() ?? '').split(/\s+/).filter((w) => /\w/.test(w)).every((w) => LEAD_WORDS.test(w))
const FIRST_DONE_EN = /\bfirst\b/i
const DONE_EN = /\b(complete|finish|do|get)\s+(your |the )?(kyc|verification|video kyc|vkyc)\b|\b(get|be|are|is)\s+(fully\s+)?verified\b|\b(kyc|verification)\b[^.?!,]{0,15}\b(complete|completed|done)\b/i
/**
 * An instruction to do the client's KYC ("complete your KYC, then pay"): a step first even without "first". Only the
 * client's own KYC ("the verification" could be of our account name), never negated ("you need not do the KYC again"), and
 * not when what follows before the request is a call, a link, documents, a person or an account ("complete the KYC
 * verification call and then pay"). Tested on the text before the request only.
 */
const DO_KYC_EN = new RegExp(String.raw`(?<!\b(?:not|never|no need to|don'?t|didn'?t|needn'?t)\s+)\b((complete|finish|do|get)\s+((your|the)\s+)?(kyc|video kyc|vkyc)|(complete|finish|do|get)\s+your\s+(one[\s-]?time\s+)?verification|get\s+(fully\s+)?verified)\b`
  + String.raw`(?![^.?!,;]*?\b(call|link|documents?|team|officer|rm|executive|agent|account|name|upi|bank|beneficiary|payee|payment)\b)`, 'i')
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
  // A condition before the request governs it when it opens its clause and only filler words sit between ("Once your KYC
  // is done, you can pay"; "verification ke baad hi payment kijiye"). After the request, an English condition governs it
  // when it ends the sentence ("you can pay after your verification is complete"), not when it opens another clause. A
  // bare "once verified" names no subject (the payment? the beneficiary?), so it is no condition.
  for (const c of [...spans(VERIFIED_EN, s), ...spans(VERIFIED_HI, s)]) {
    if (c.end <= h.start && opensClause(s, c) && onlyFiller(s.slice(c.end, h.start))) return true
  }
  for (const c of spans(VERIFIED_EN, s)) {
    const between = s.slice(h.end, c.start)
    if (c.start >= h.end && words(between) <= 8 && !CLAUSE_BREAK.test(between) && onlyFiller(s.slice(c.end))) return true
  }
  // "Complete your KYC first, then you can pay" / "Pehle KYC complete kijiye, phir payment kar sakte hain".
  const lead = s.slice(Math.max(0, h.start - 25), h.start)
  const thenLead = /\b(then|after that|afterwards)\b[\s,]*(\w+\s+){0,2}$/i.test(lead)
  if (thenLead && ((FIRST_DONE_EN.test(before) && DONE_EN.test(before)) || DO_KYC_EN.test(before))) return true
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
    // A time to pay is let go only when a verification condition before it governs it: it opens its own clause and no other
    // clause comes in between. A request inside such a time ("once verified, 15 minutes to make the payment") goes with it;
    // inside any other time to pay it is judged on its own.
    const conditions = [...spans(VERIFIED_EN, s), ...spans(VERIFIED_HI, s)]
    const governed = (h: Span) => conditions.some((c) => c.end <= h.start && opensClause(s, c) && !TIME_BREAK.test(s.slice(c.end, h.start)))
    const times = spans(PAY_TIME, s)
    const hits = spans(PAY_ASK, s).filter((h) => !times.some((x) => h.start >= x.start && h.end <= x.end && governed(x)))
    // A bare "pay now" clause (between commas, or after "and").
    let pos = 0
    for (const part of s.split(/(\s*[,:]\s*|\s+(?:and|aur)\s+)/i)) {
      if (PAY_BARE.test(part)) hits.push({ start: pos, end: pos + part.length })
      pos += part.length
    }
    if (hits.some((h) => !excused(s, h))) return true
    if (times.some((h) => !excused(s, h) && !governed(h))) return true
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
