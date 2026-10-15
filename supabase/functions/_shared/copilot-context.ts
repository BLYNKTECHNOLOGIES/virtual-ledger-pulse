// deno-lint-ignore-file no-explicit-any
// Copilot v2: everything the Copilot knows about one order chat, built on the server from the database
// (order, client panel, chat), with the live order values from the Terminal screen used only to fill gaps
// (open orders reach binance_order_history late).
import {
  buildTranscript, chatBefore, clientFacts, clientTurn, contextText, decideAddress, decideLanguage, detectRisks, greetingFor, normSide,
  normStatus, orderCategory, sideMeaning, statusMeaning, type ClientState, type LanguageDecision, type Msg, type Risk, type Side,
} from './copilot-playbook.ts'
import { detectSituation, evidenceText, resolveSituation, situationDef, type Situation } from './copilot-situation.ts'
import type { CopilotConfig, Store } from './copilot-store.ts'

export interface OrderHint {
  tradeType?: string | null
  status?: string | null
  totalPrice?: number | string | null
  asset?: string | null
  payMethod?: string | null
  latest?: { id?: string | null; text?: string | null } | null
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
}

export async function buildChatContext(
  store: Store, cfg: CopilotConfig, orderNumber: string, accountHint: string | null, hint: OrderHint | null | undefined, now: Date,
): Promise<ChatContext> {
  const [order, rows, ranges, panel, mark] = await Promise.all([
    store.order(orderNumber),
    store.messages(orderNumber),
    store.smallRanges(),
    store.clientPanel(orderNumber).catch(() => null),
    store.situationMark(orderNumber).catch(() => null),
  ])
  const side = normSide(order?.trade_type ?? hint?.tradeType)
  const status = normStatus(hint?.status ?? order?.order_status)
  const amountRaw = order?.total_price ?? hint?.totalPrice
  const amount = amountRaw === null || amountRaw === undefined || amountRaw === '' ? null : Number(amountRaw)
  const accountId = (order?.exchange_account_id as string | null) ?? accountHint ?? null
  const accountName = await store.accountName(accountId)
  const transcript = buildTranscript(rows, hint?.latest ?? null)
  const cf = clientFacts(side, panel)
  const situation = resolveSituation(side, detectSituation(side, status, transcript, now.getTime()), mark)
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
  }
}

/** Order facts for the AI (no personal data; the amount is a placeholder). */
export function orderFacts(c: ChatContext): Record<string, unknown> {
  const def = situationDef(c.situation.code)
  return {
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
}

/** Summary shown in the chat panel and stored on the request. */
export function contextSummary(c: ChatContext): Record<string, unknown> {
  return {
    side: c.side,
    status: c.status,
    category: c.category,
    account_id: c.accountId,
    account: c.accountName,
    client_state: c.clientState,
    kyc_status: (c.clientFacts as any).kyc_status ?? null,
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
  }
}
