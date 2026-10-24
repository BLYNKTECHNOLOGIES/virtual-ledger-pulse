// deno-lint-ignore-file no-explicit-any
// Copilot v2: everything the Copilot knows about one order chat, built on the server from the database
// (order, client panel, chat, our appeal case), with the live order values from the Terminal screen used only to fill
// gaps (open orders reach binance_order_history late) or, for Binance's deadlines and extra-KYC field, because they
// are fresher.
import {
  buildTranscript, chatBefore, clientFacts, clientTurn, contextText, decideAddress, decideLanguage, detectRisks, greetingFor, istLabel,
  normSide, normStatus, orderCategory, sideMeaning, statusMeaning, type ClientState, type LanguageDecision, type Msg, type Risk, type Side,
} from './copilot-playbook.ts'
import {
  beforeVerification, detectSituation, evidenceText, resolveSituation, situationDef, verifiedBy, type Mark, type OrderSignals, type Situation,
} from './copilot-situation.ts'
import type { AppealCase, CopilotConfig, Store } from './copilot-store.ts'
import { type PlanInput, waitingSince } from './copilot-steps.ts'

export interface OrderHint {
  tradeType?: string | null
  status?: string | null
  totalPrice?: number | string | null
  asset?: string | null
  payMethod?: string | null
  latest?: { id?: string | null; text?: string | null } | null
  /** From the live Binance order detail on the Terminal screen (additionalKycVerify, notifyPayEndTime, …). */
  kycVerify?: number | string | null
  payBy?: number | string | null
  releaseBy?: number | string | null
}

/** Binance's order data the Copilot uses: the extra-KYC field and the deadlines (ms). */
export interface BinanceFacts {
  /** Our sell orders: 0 no extra KYC, 1 required and not verified, 2 verified. Null when not known. */
  kycVerify: number | null
  /** The buyer must pay and mark the order as paid by then (notifyPayEndTime). */
  payBy: number | null
  /** The seller should release by then, once the order is marked as paid (confirmPayEndTime). */
  releaseBy: number | null
}

export interface ChatContext {
  orderNumber: string
  side: Side | null
  status: string
  amount: number | null
  asset: string | null
  payMethod: string | null
  accountId: string | null
  accountName: string | null
  category: 'small' | 'regular'
  transcript: Msg[]
  language: LanguageDecision
  address: 'sir' | 'maam'
  clientState: ClientState
  clientFacts: Record<string, unknown>
  risks: Risk[]
  turn: ReturnType<typeof clientTurn>
  greet: string | null
  /** What the client is waiting for now (detected from the chat, or set by an approver). */
  situation: Situation
  /** The chat before the client's question (masked) and the text embedded to compare it with replies' example chats. */
  before: Array<{ from: string; text: string }>
  contextText: string
  binance: BinanceFacts
  /** What the detector was given from Binance's order data (also used when simulating a reply). */
  signals: OrderSignals
  /** Our team's open appeal case for this order, if any. */
  appeal: AppealCase | null
}

/** A Binance time in ms (as number or text); anything else is not a time. */
export function binanceTime(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) && n > 1.5e12 && n < 4.1e12 ? Math.round(n) : null
}
const kycValue = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return n === 0 || n === 1 || n === 2 ? n : null
}

/**
 * The extra-KYC field only moves from "required" to "verified", so the highest value seen wins (a stale stored "required"
 * never hides "verified"). The screen sends Binance's live value as it is (nothing when it has none), so a 0 from it
 * means "no extra KYC" too. Deadlines: the screen's live value first, then the stored one.
 */
export function binanceFacts(order: any, hint: OrderHint | null | undefined): BinanceFacts {
  const seen = [kycValue(order?.kyc_detail), kycValue(order?.kyc_raw), kycValue(hint?.kycVerify)].filter((x): x is number => x !== null)
  return {
    kycVerify: seen.length ? Math.max(...seen) : null,
    payBy: binanceTime(hint?.payBy) ?? binanceTime(order?.pay_by),
    releaseBy: binanceTime(hint?.releaseBy) ?? binanceTime(order?.release_by),
  }
}

const CLOSED_APPEALS = new Set(['resolved', 'closed', 'cancelled'])
const openAppeal = (a: AppealCase | null): AppealCase | null => (a && a.status && !CLOSED_APPEALS.has(a.status) ? a : null)

export async function buildChatContext(
  store: Store, cfg: CopilotConfig, orderNumber: string, accountHint: string | null, hint: OrderHint | null | undefined, now: Date,
): Promise<ChatContext> {
  const [order, rows, ranges, panel, marks, appeal] = await Promise.all([
    store.order(orderNumber),
    store.messages(orderNumber),
    store.smallRanges(),
    store.clientPanel(orderNumber).catch(() => null),
    store.situationMarks(orderNumber).catch((): Mark[] => []),
    store.appealCase(orderNumber).catch(() => null),
  ])
  const mark = marks[0] ?? null
  const side = normSide(order?.trade_type ?? hint?.tradeType)
  const status = normStatus(hint?.status ?? order?.order_status)
  const amountRaw = order?.total_price ?? hint?.totalPrice
  const amount = amountRaw === null || amountRaw === undefined || amountRaw === '' ? null : Number(amountRaw)
  const accountId = (order?.exchange_account_id as string | null) ?? accountHint ?? null
  const accountName = await store.accountName(accountId)
  const transcript = buildTranscript(rows, hint?.latest ?? null)
  const cf = clientFacts(side, panel)
  if (!order) {
    // The client panel reads the order's side from the stored order: without it, its counts for this side mean nothing.
    cf.facts.earlier_binance_orders_this_side = null
    cf.facts.other_orders_today_this_side = null
  }
  const binance = binanceFacts(order, hint)
  const signals: OrderSignals = {
    kycVerify: side === 'SELL' ? binance.kycVerify : null,
    createdAt: binanceTime(order?.create_time),
    verifiedBy: side === 'SELL' ? verifiedBy(marks) : null,
  }
  const situation = resolveSituation(side, detectSituation(side, status, transcript, now.getTime(), signals), mark)
  const before = chatBefore(transcript)
  return {
    orderNumber,
    side,
    status,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    asset: (order?.asset ?? hint?.asset ?? null) as string | null,
    payMethod: (order?.pay_method_name ?? hint?.payMethod ?? null) as string | null,
    accountId,
    accountName,
    category: orderCategory(side, amount, ranges.sales, ranges.buys),
    transcript,
    language: decideLanguage(transcript, cfg.hindi_switch_after),
    address: decideAddress(transcript),
    clientState: cf.state,
    clientFacts: cf.facts,
    risks: detectRisks(transcript, { hasComplaint: order?.has_active_complaint === true, status }),
    turn: clientTurn(transcript),
    greet: transcript.some((m) => m.who === 'us') ? null : greetingFor(now),
    situation,
    before,
    contextText: contextText(before, situation.label),
    binance,
    signals,
    appeal: openAppeal(appeal),
  }
}

/** What rewording a message needs to know about the chat: no client records, no appeal case, no AI. */
export type LightContext = Pick<ChatContext, 'orderNumber' | 'side' | 'status' | 'accountId' | 'transcript' | 'language' | 'address' | 'situation' | 'binance' | 'signals'> & {
  /** The order's Binance account from our own records (the stored order, else its stored chat), never from the screen. */
  knownAccountId: string | null
}

/**
 * The chat, its situation, language and form of address, built the same way as buildChatContext (keep the two in step)
 * from three reads: the stored order, the chat and approvers' situation corrections.
 */
export async function buildLightContext(
  store: Store, cfg: CopilotConfig, orderNumber: string, accountHint: string | null, hint: OrderHint | null | undefined, now: Date,
): Promise<LightContext> {
  const [order, rows, marks] = await Promise.all([
    store.order(orderNumber),
    store.messages(orderNumber),
    store.situationMarks(orderNumber).catch((): Mark[] => []),
  ])
  const side = normSide(order?.trade_type ?? hint?.tradeType)
  const status = normStatus(hint?.status ?? order?.order_status)
  const transcript = buildTranscript(rows, hint?.latest ?? null)
  const binance = binanceFacts(order, hint)
  const signals: OrderSignals = {
    kycVerify: side === 'SELL' ? binance.kycVerify : null,
    createdAt: binanceTime(order?.create_time),
    verifiedBy: side === 'SELL' ? verifiedBy(marks) : null,
  }
  return {
    orderNumber,
    side,
    status,
    accountId: (order?.exchange_account_id as string | null) ?? accountHint ?? null,
    knownAccountId: (order?.exchange_account_id as string | null) ?? rows.find((r) => r.exchange_account_id)?.exchange_account_id ?? null,
    transcript,
    language: decideLanguage(transcript, cfg.hindi_switch_after),
    address: decideAddress(transcript),
    situation: resolveSituation(side, detectSituation(side, status, transcript, now.getTime(), signals), marks[0] ?? null),
    binance,
    signals,
  }
}

/**
 * The deadlines that matter at this status: paying while the order is open, releasing once it is marked paid. A paid
 * order without a release time shows none (never the pay deadline instead).
 */
export function liveDeadlines(c: Pick<ChatContext, 'status' | 'binance'>): { payBy: number | null; releaseBy: number | null } {
  return {
    payBy: c.status === 'TRADING' ? c.binance.payBy : null,
    releaseBy: c.status === 'BUYER_PAYED' ? c.binance.releaseBy : null,
  }
}

/** Whole minutes to go (rounded down, as the panel shows them), or since. */
const left = (at: number, now: number) => {
  const d = at - now
  const m = Math.floor(Math.abs(d) / 60_000)
  if (m >= 1440) return d >= 0 ? 'more than a day left' : 'passed more than a day ago'
  if (d >= 0) return m < 1 ? 'less than a minute left' : `${m} min left`
  return m < 1 ? 'just passed' : `passed ${m} min ago`
}

/** Order facts for the AI (no personal data; the amount is a placeholder). */
export function orderFacts(c: ChatContext, now: number = Date.now()): Record<string, unknown> {
  const def = situationDef(c.situation.code)
  const facts: Record<string, unknown> = {
    side: c.side ?? 'unknown',
    what_it_means: sideMeaning(c.side),
    status: c.status,
    status_means: statusMeaning(c.side, c.status),
    situation: def?.label ?? 'unknown',
    situation_means: def?.ai ?? 'Not known: read the chat to see what the client is waiting for.',
    situation_seen_from: evidenceText(c.situation.evidence) || 'nothing yet',
    category: c.category === 'small' ? 'small order' : 'regular order',
    binance_account: c.accountName ?? 'unknown',
    asset: c.asset ?? 'USDT',
    amount: c.amount !== null ? '{amount}' : 'unknown',
    payment_method: c.payMethod ?? 'unknown',
  }
  const kycStep = beforeVerification(c.side, c.situation.code)
  // Binance's own extra-KYC check, worded so it never reads as "no KYC needed" and never contradicts a KYC step.
  const akv = c.side === 'SELL' ? c.binance.kycVerify : null
  if (akv === 0) facts.binance_extra_kyc = 'not set by Binance for this order (our own KYC rules still apply)'
  else if (akv === 1 && kycStep) facts.binance_extra_kyc = 'required by Binance and not verified on Binance yet'
  else if (akv === 2 && !kycStep) facts.binance_extra_kyc = 'verified on Binance'
  const d = liveDeadlines(c)
  if (d.payBy && kycStep) {
    // Before verification the deadline is only a reason to hurry the KYC: never a time "left to pay".
    facts.order_expires = `${istLabel(d.payBy)} IST (${left(d.payBy, now)})`
    facts.order_expires_means = 'Binance cancels the order then if it is not marked paid. The client is not verified yet: never ask them to pay or mention time to pay; you may ask them to finish the KYC steps quickly.'
  } else if (d.payBy) {
    facts.pay_deadline = `${istLabel(d.payBy)} IST (${left(d.payBy, now)})`
    facts.pay_deadline_means = c.side === 'BUY'
      ? 'We must pay the client and mark the order as paid by then, or Binance cancels the order.'
      : 'The client must pay and mark the order as paid by then, or Binance cancels the order.'
  }
  if (d.releaseBy) {
    facts.release_deadline = `${istLabel(d.releaseBy)} IST (${left(d.releaseBy, now)})`
    facts.release_deadline_means = c.side === 'BUY' ? 'The client should release the crypto by then.' : 'We should check the payment and release by then.'
  }
  // Our team's appeal case stays on the panel: it is never the AI's to mention.
  return facts
}

const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : null)

/** Summary shown in the chat panel and stored on the request. */
export function contextSummary(c: ChatContext): Record<string, unknown> {
  const d = liveDeadlines(c)
  const f = c.clientFacts as Record<string, any>
  return {
    side: c.side,
    status: c.status,
    category: c.category,
    account_id: c.accountId,
    account: c.accountName,
    client_state: c.clientState,
    kyc_status: f.kyc_status ?? null,
    address: c.address,
    language: c.language.lang,
    language_reason: c.language.reason,
    risks: c.risks,
    situation: c.situation.code,
    situation_label: c.situation.label,
    situation_evidence: evidenceText(c.situation.evidence),
    situation_detected: c.situation.detectedCode,
    situation_detected_label: situationDef(c.situation.detectedCode)?.label ?? null,
    situation_marked: c.situation.marked ? { by: c.situation.marked.by, at: new Date(c.situation.marked.at).toISOString() } : null,
    situation_ready_at: c.situation.readyAt ? new Date(c.situation.readyAt).toISOString() : null,
    // The step decision the drafts follow (the panel's deadline chip uses it too): a sell order whose client is not verified.
    before_verification: c.side === 'SELL' ? beforeVerification(c.side, c.situation.code) : null,
    // Binance says the extra KYC is not verified and the chat shows neither its notice nor our payment details: "Client can
    // pay" cannot be set by hand.
    binance_kyc_open: c.situation.kycRequired === true,
    binance_kyc: c.side === 'SELL' ? c.binance.kycVerify : null,
    pay_by: iso(d.payBy),
    release_by: iso(d.releaseBy),
    appeal_case: c.appeal ? { status: c.appeal.status, response_due: iso(c.appeal.responseDueAt) } : null,
    // Since when the client has been waiting for us (their first message after our last one), for the panel's clock.
    client_waiting_since: iso(waitingSince(c.transcript)),
    // What we hold on this client, as counts and yes/no (for the panel's client line).
    client: c.clientState === 'new' ? null : {
      on_file: onFileOf(c),
      earlier_orders: earlierOrders(c.side, f),
      // Appeal cases on the client's orders, this one included (as the client card counts them).
      appeals: f.appeals_on_this_clients_orders ?? null,
      name_check: f.binance_name_vs_client_record ?? null,
      limit_request_pending: f.limit_request_pending === true,
    },
  }
}

/** What we hold on the client ('aadhaar', 'pan', 'vkyc', 'bank_statement', 'source_of_fund', 'phone'); empty for a new client. */
export function onFileOf(c: Pick<ChatContext, 'clientState' | 'clientFacts'>): string[] {
  if (c.clientState === 'new') return []
  const f = c.clientFacts as Record<string, any>
  return [...(Array.isArray(f.documents_on_file) ? f.documents_on_file : []), ...(f.phone_on_file ? ['phone'] : [])]
}

/** The order as the next-step plan reads it (copilot-steps.ts): side, status, step, client, the chat and the pay deadline. */
export function stepInput(c: ChatContext, now: Date, over: Partial<PlanInput> = {}): PlanInput {
  return {
    side: c.side, status: c.status, stage: c.situation.code, clientState: c.clientState, onFile: onFileOf(c),
    transcript: c.transcript, now: now.getTime(), payBy: liveDeadlines(c).payBy, ...over,
  }
}

/**
 * Earlier orders on this order's side: the larger of the Binance orders we matched to the client and the ERP's own
 * orders (as the client card counts them), so a known client is never shown as a first-timer.
 */
function earlierOrders(side: Side | null, f: Record<string, any>): number | null {
  const erp = side === 'SELL' ? f.completed_buys_with_us : side === 'BUY' ? f.completed_sells_to_us : null
  const counts = [f.earlier_binance_orders_this_side, erp].map((v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v)))
    .filter((v): v is number => v !== null)
  return counts.length ? Math.max(...counts) : null
}
