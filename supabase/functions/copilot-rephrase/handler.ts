// deno-lint-ignore-file no-explicit-any
// Copilot · Rephrase, for approvers and the operators an approver picked (copilot_can_rephrase).
//  rephrase — the words typed in an order chat's message box, reworded as a proper reply: the same meaning and
//             decision, nothing added (checked in _shared/copilot-rephrase.ts). Personal values never reach the model.
//             Nothing is sent: the person puts the rewrite in the box, edits it if needed and sends it.
//  used     — an operator sent a rewrite: it waits in the Playbook inbox, with the client's question, the chat and the
//             typed words, for an approver to save or dismiss. (An approver's rewrite is saved through copilot-learn,
//             like a sent suggestion, with the typed words as its reason.)
import { chatTail, clientTurn, costInr, detectLang, generalize, guardDraft, maskPII, normText, type TemplateValues } from '../_shared/copilot-playbook.ts'
import { buildLightContext, type OrderHint } from '../_shared/copilot-context.ts'
import { situationDef } from '../_shared/copilot-situation.ts'
import { notAQuestion, turnNeedsAnswer, waitingBefore } from '../_shared/copilot-steps.ts'
import {
  addressFor, applyVerify, buildRephraseMessages, buildVerifyMessages, checkRephrase, istDayStart, protect, protectLike, readVerify,
  REPHRASE_SCHEMA, VERIFY_SCHEMA,
} from '../_shared/copilot-rephrase.ts'
import type { CopilotConfig, RephraseCall, Store } from '../_shared/copilot-store.ts'
import type { Ai } from '../_shared/copilot-ai.ts'

export interface RephraseInput {
  action?: 'rephrase' | 'used'
  orderNumber?: string
  exchangeAccountId?: string | null
  /** rephrase: the words typed (at most 600 characters). */
  text?: string
  /** rephrase: the reply's language; 'auto' (default) follows the chat (English unless the client keeps writing Hindi). */
  lang?: 'auto' | 'en' | 'hi'
  /** rephrase: earlier rewrites of the same words ("Another"). */
  avoid?: string[]
  hint?: OrderHint | null
  /** rephrase: how it was asked for. 'auto' (after a pause, on its own) is refused while automatic rewording is off. */
  mode?: 'auto' | 'manual' | 'another' | 'lang'
  /** used: the rewrite that was put in the box and the text actually sent (sentAt from the screen is not trusted: our
   *  sent message in the order's chat, or the server's own time, marks where the chat before the reply ends). */
  callId?: string
  /** used: for a rewrite of a rewrite, the call made on the words first typed (they are the reason behind the reply). */
  roughCallId?: string | null
  finalText?: string
  sentAt?: number
  templateValues?: TemplateValues | null
}
export interface Deps { store: Store; ai: Ai; now: () => Date }
export interface Out { status: number; body: any }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORDER_RE = /^[0-9A-Za-z_-]{6,40}$/
const uuidOrNull = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v : null)
export const MAX_TYPED = 600
const CHAT_LINES = 6
/** Words of two letters or more in any script (Devanagari vowel signs are marks, not letters). */
export const wordCount = (text: string) => (text.match(/\p{L}[\p{L}\p{M}]+/gu) ?? []).length
const NOT_YOURS: Out = { status: 403, body: { error: 'not_allowed', message: 'This order is not on a Binance account you work on.' } }

/** The order is on a Binance account this person may work on (our own records decide, never the screen). */
async function onYourAccount(store: Store, userId: string, accountId: string | null): Promise<boolean> {
  if (!accountId) return false
  return (await store.accountsFor(userId)).includes(accountId)
}

async function digest(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

export async function handleRephrase(deps: Deps, userId: string, input: RephraseInput): Promise<Out> {
  const { store, ai } = deps
  const cfg = await store.config()
  if (!cfg) return { status: 503, body: { error: 'not_configured' } }
  if (!(await store.canRephrase(userId))) return { status: 403, body: { error: 'not_allowed' } }
  const action = input?.action ?? 'rephrase'
  if (action === 'used') return used(deps, cfg, userId, input)
  if (action !== 'rephrase') return { status: 400, body: { error: 'invalid', field: 'action' } }

  const orderNumber = String(input?.orderNumber ?? '')
  if (!ORDER_RE.test(orderNumber)) return { status: 400, body: { error: 'invalid', field: 'orderNumber' } }
  const text = String(input?.text ?? '').trim()
  if (!text || text.length > MAX_TYPED) return { status: 400, body: { error: 'invalid', field: 'text' } }
  if (wordCount(text) < 2) return { status: 422, body: { error: 'too_short', message: 'Type a few words first.' } }
  const lang = input?.lang === 'en' || input?.lang === 'hi' ? input.lang : null
  const avoid = (Array.isArray(input?.avoid) ? input.avoid : [])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(-3).map((x) => x.slice(0, 800))
  // Automatic rewording switched off in Settings: a request made on its own after a pause is refused before any cost (the
  // ✨ button, "Another" and the language button still work; a screen that sends no mode counts as asked).
  if (input?.mode === 'auto' && cfg.rephrase_auto === false) {
    return { status: 409, body: { error: 'auto_off', message: 'Automatic rewording is switched off; use the ✨ button.' } }
  }

  // Allowances: the month's budget (shared with everything else) and this person's rewrites today.
  const now = deps.now()
  const limit = Number(cfg.rephrase_daily_limit ?? 200)
  const [spent, today] = await Promise.all([store.monthSpend(), store.rephraseCount(userId, istDayStart(now))])
  if (spent >= Number(cfg.monthly_budget_inr)) return { status: 429, body: { error: 'monthly_cap', message: "This month's AI budget is used up." } }
  if (today >= limit) return { status: 429, body: { error: 'daily_limit', message: `Today's ${limit} rewrites are used up; more tomorrow.` } }

  const ctx = await buildLightContext(store, cfg, orderNumber, uuidOrNull(input?.exchangeAccountId), input?.hint ?? null, now)
  // Only for chats the person can open in the Terminal: the same accounts the screens offer them.
  if (!(await onYourAccount(store, userId, ctx.knownAccountId))) return NOT_YOURS
  const replyLang = lang ?? ctx.language.lang
  const address = addressFor(text, ctx.address)
  const typed = protect(text)
  const chat = ctx.transcript.filter((m) => m.who !== 'system').slice(-CHAT_LINES)
    .map((m) => ({ from: m.who === 'client' ? 'client' : 'us', text: maskPII(m.text).slice(0, 200) }))
  const model = cfg.rephrase_model || cfg.utility_model
  const { system, user } = buildRephraseMessages({
    text: typed.text, lang: replyLang, address, houseStyle: cfg.house_style, side: ctx.side,
    situationLabel: situationDef(ctx.situation.code)?.label ?? null, chat, avoid: avoid.map((x) => protectLike(x, typed.values)),
  })
  const r = await ai.chatJson(model, system, user, REPHRASE_SCHEMA, { timeoutMs: 15_000, effort: 'none' })
  let check = r.ok ? checkRephrase({ input: typed, raw: text, output: r.data, side: ctx.side, situation: ctx.situation.code, address }) : null
  const rawReply = r.ok && typeof r.data?.reply === 'string' ? r.data.reply : ''
  // The second check (copilot-rephrase.ts): a separate call reads a rewrite that passed the checks against the typed words,
  // both with values as tokens. Anything it finds, or no usable answer, and nothing is offered. Logged as a "judge" call.
  let checkError: string | null = null
  if (check?.status === 'ok' && check.text && cfg.rephrase_verify !== false) {
    const vModel = cfg.utility_model || model
    const vm = buildVerifyMessages({ typed: typed.text, rewrite: protectLike(check.text, typed.values) })
    const vr = await ai.chatJson(vModel, vm.system, vm.user, VERIFY_SCHEMA, { timeoutMs: 10_000, effort: 'none' })
    const v = vr.ok ? readVerify(vr.data) : null
    await store.logCall({
      user_id: userId, order_number: orderNumber, exchange_account_id: ctx.accountId, purpose: 'judge', variant: 'rephrase_check', model: vModel,
      status: v ? 'ok' : 'error',
      input_tokens: vr.usage.input, output_tokens: vr.usage.output, reasoning_tokens: vr.usage.reasoning, tokens_estimated: vr.usage.estimated,
      cost_inr: costInr(vModel, vr.usage, cfg.model_prices, cfg.usd_inr), latency_ms: vr.latencyMs,
      output_text: v?.issues.length ? maskPII(JSON.stringify(v.issues)).slice(0, 2000) : null,
      guardrail_flags: v?.issues.length ? [...new Set(v.issues.map((i) => `check_${i.kind}`))] : null,
      error: v ? null : (vr.ok ? 'invalid_answer' : (vr.error ?? 'failed')),
    })
    if (!v) checkError = vr.ok ? 'invalid_answer' : (vr.error ?? 'failed')
    else check = applyVerify(check, v)
  }
  const callId = await store.logCall({
    user_id: userId, order_number: orderNumber, exchange_account_id: ctx.accountId, purpose: 'rephrase', model,
    status: !check || checkError ? 'error' : check.status === 'blocked' ? 'blocked' : 'ok',
    input_tokens: r.usage.input, output_tokens: r.usage.output, reasoning_tokens: r.usage.reasoning, tokens_estimated: r.usage.estimated,
    cost_inr: costInr(model, r.usage, cfg.model_prices, cfg.usd_inr), latency_ms: r.latencyMs,
    input_text: maskPII(text).slice(0, 1000),
    // What the person was offered (masked); for a held-back rewrite, what the model wrote, for review (its tokens are not
    // values). Nothing for "same" or "unclear": nothing was offered, so nothing can be reported as used.
    output_text: (check?.status === 'ok' && check.masked && !checkError ? check.masked : check?.status === 'blocked' || checkError ? maskPII(rawReply) : '').slice(0, 2000) || null,
    guardrail_flags: check?.flags.length ? check.flags : null,
    error: !r.ok ? (r.error ?? 'failed') : checkError ? `check_failed:${checkError}` : null,
  })
  if (!check) return { status: 502, body: { error: 'rephrase_failed', message: 'The AI did not answer. Try again.' } }
  if (checkError) return { status: 502, body: { error: 'rephrase_failed', message: 'The second check did not answer. Try again.' } }
  console.log(JSON.stringify({ fn: 'copilot-rephrase', outcome: check.status, flags: check.flags, situation: ctx.situation.code }))
  return {
    status: 200,
    body: {
      callId, status: check.status, text: check.text, language: replyLang, warnings: check.warnings, reason: check.reason,
      left: Math.max(0, limit - today - 1),
    },
  }
}

/** An operator sent a rewrite: it goes to the Playbook inbox (once per order and reply) for an approver to save or dismiss. */
async function used(deps: Deps, cfg: CopilotConfig, userId: string, input: RephraseInput): Promise<Out> {
  const { store } = deps
  const callId = uuidOrNull(input?.callId)
  if (!callId) return { status: 400, body: { error: 'invalid', field: 'callId' } }
  const orderNumber = String(input?.orderNumber ?? '')
  if (!ORDER_RE.test(orderNumber)) return { status: 400, body: { error: 'invalid', field: 'orderNumber' } }
  const finalText = String(input?.finalText ?? '').trim()
  if (!finalText || finalText.length > 2000) return { status: 400, body: { error: 'invalid', field: 'finalText' } }
  const now = deps.now()
  const call = await store.rephraseCall(callId)
  if (!call || call.purpose !== 'rephrase' || call.user_id !== userId || call.order_number !== orderNumber) {
    return { status: 404, body: { error: 'not_found' } }
  }
  if (call.feedback === 'used') return { status: 200, body: { queued: false, reason: 'already_sent' } }
  // Only a rewrite that was offered can have been used (not a held-back or unclear one).
  if (call.status !== 'ok' || !call.output_text) return { status: 409, body: { error: 'not_offered' } }
  const edited = normText(maskPII(finalText)) !== normText(call.output_text ?? '')
  // An approver's send is saved through copilot-learn instead (their screen does that).
  if (await store.isApprover(userId)) {
    await store.markRephraseUsed(callId, userId, edited)
    return { status: 200, body: { queued: false, reason: 'approver' } }
  }

  const ctx = await buildLightContext(store, cfg, orderNumber, uuidOrNull(input?.exchangeAccountId), null, now)
  if (!(await onYourAccount(store, userId, ctx.knownAccountId))) return NOT_YOURS
  // Where the chat before the reply ends: our message with the sent text once the order's chat has it (sent after the
  // rewrite was made, so a client message that came in meanwhile is not taken for the question); until then, now (this call
  // follows the send; an operator's computer clock may be minutes off, so the screen's time is not used).
  const sentAt = sentMessageAt(ctx.transcript, finalText, call.created_at) ?? now.getTime()
  // The client's question is what came before this reply.
  let t = ctx.transcript.filter((m) => m.at < sentAt)
  while (t.length && (t[t.length - 1].who === 'us' || t[t.length - 1].who === 'auto')) t = t.slice(0, -1)
  const turn = clientTurn(t)
  // A reply to a message that asks nothing (pictures, values, "ok", a plain answer to our last question) is the next step
  // of the script, not an answer for the Playbook: it does not go to the inbox (the same rule as the suggestions).
  const awaited = turn
    ? waitingBefore({ side: ctx.side, status: ctx.status, stage: ctx.situation.code, clientState: 'new', transcript: t, now: sentAt }, turn.messages)
    : null
  if (!turn || notAQuestion(maskPII(turn.question)) || !turnNeedsAnswer(turn.messages, awaited)) {
    await store.markRephraseUsed(callId, userId, edited)
    return { status: 200, body: { queued: false, reason: 'no_question' } }
  }
  // Stored the way the Playbook keeps replies: the order's values as placeholders (the amount after TDS only on our buy
  // orders), our team numbers as {contact:x}, any other personal value masked. The typed words are kept the same way.
  const values: TemplateValues = { ...(input?.templateValues ?? {}), side: ctx.side }
  const sent = maskPII(generalize(guardDraft(finalText).text, values, await store.allContactPhones()))
  const rough = generalize(await typedWords(store, userId, orderNumber, call, input?.roughCallId) ?? '', values, []) || null
  const row = {
    kind: 'operator_reply',
    order_number: orderNumber,
    exchange_account_id: ctx.accountId,
    question_text: maskPII(turn.question).slice(0, 1000),
    context: {
      v: 1,
      call_id: callId,
      reply_key: await digest(normText(sent)),
      rough,
      suggestion: call.output_text,
      sent,
      edited,
      sent_at: sentAt,
      language: detectLang(sent) === 'hi' ? 'hi' : 'en',
      side: ctx.side,
      situation: ctx.situation.code,
      situation_label: ctx.situation.label,
      chat: chatTail(t),
    },
    created_by: userId,
  }
  // Queued first, then marked as sent: if queueing fails, a retry can still queue it.
  const r = await store.addInboxItem(row)
  if (!r.id && !r.duplicate) return { status: 500, body: { error: 'db_error' } }
  await store.markRephraseUsed(callId, userId, edited)
  if (r.duplicate) return { status: 200, body: { queued: false, reason: 'duplicate' } }
  console.log(JSON.stringify({ fn: 'copilot-rephrase', outcome: 'queued', situation: ctx.situation.code }))
  return { status: 200, body: { queued: true, inboxItemId: r.id } }
}

/** When our message with the sent text reached the order's chat, if it has (at or after the rewrite was made). */
export function sentMessageAt(transcript: Array<{ who: string; at: number; text: string }>, finalText: string, madeAt: string | null | undefined): number | null {
  const want = normText(finalText)
  // A minute's slack for the gap between Binance's clock and ours.
  const from = madeAt ? Date.parse(madeAt) - 60_000 : -Infinity
  const ours = transcript.find((m) => m.who === 'us' && m.at >= from && normText(m.text) === want)
  return ours ? ours.at : null
}

/** The words typed (masked): for a rewrite of a rewrite, those of the first call, when it is this person's, in this order,
 *  and its rewrite is what the second call reworded; otherwise this call's. */
async function typedWords(store: Store, userId: string, orderNumber: string, call: RephraseCall, roughCallId: unknown): Promise<string | null> {
  const firstId = uuidOrNull(roughCallId)
  if (!firstId || firstId === call.id) return call.input_text
  const first = await store.rephraseCall(firstId)
  const chained = !!first && first.purpose === 'rephrase' && first.user_id === userId && first.order_number === orderNumber
    && first.status === 'ok' && !!first.output_text && normText(first.output_text) === normText(call.input_text)
  return chained ? first!.input_text : call.input_text
}
