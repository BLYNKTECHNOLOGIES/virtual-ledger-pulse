// deno-lint-ignore-file no-explicit-any
// Copilot v2 auto-save ("use = approve"). Approvers only.
//  learn  — an approver sent or approved a suggestion, or tapped Save on their own reply: the reply is
//           generalised (placeholders, "sir"), compared with similar Playbook entries, and saved as a new
//           entry, a merge, an update, a promotion of a tentative entry, or a conflict for the inbox.
//  reject — a draft was rejected; kept with the reason as an example to avoid, never as SOP.
//  undo   — reverts a learning event (the toast's Undo).
import {
  applyAddress, buildJudgeMessages, clientTurn, costInr, detectLang, generalize, guardDraft, JUDGE_SCHEMA, maskPII, normText,
  type TemplateValues,
} from '../_shared/copilot-playbook.ts'
import { buildChatContext, type OrderHint } from '../_shared/copilot-context.ts'
import type { MatchRow, Store } from '../_shared/copilot-store.ts'
import type { Ai } from '../_shared/copilot-ai.ts'

export interface LearnInput {
  action?: 'learn' | 'reject' | 'undo'
  cause?: 'sent' | 'approved' | 'saved'
  orderNumber?: string
  exchangeAccountId?: string | null
  requestId?: string | null
  sourceEntryId?: string | null
  sourceCallId?: string | null
  insertedText?: string | null
  finalText?: string
  templateValues?: TemplateValues | null
  hint?: OrderHint | null
  /** Saving one of our earlier messages: only the chat before this time (ms) is used to find the question. */
  beforeAt?: number | null
  callId?: string
  reason?: string
  eventId?: string
}
export interface Deps { store: Store; ai: Ai; now: () => Date }
export interface Out { status: number; body: any }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORDER_RE = /^[0-9A-Za-z_-]{6,40}$/
const uuidOrNull = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v : null)

function dbErr(e: { message: string; code?: string }): Out {
  if (e.code === '42501') return { status: 403, body: { error: 'not_approver' } }
  if (e.code === 'P0002') return { status: 404, body: { error: 'not_found', message: e.message } }
  if (e.code === '22023') return { status: 409, body: { error: 'refused', message: e.message } }
  return { status: 500, body: { error: 'db_error' } }
}

export async function handleLearn(deps: Deps, userId: string, input: LearnInput): Promise<Out> {
  const { store, ai } = deps
  const action = input?.action ?? 'learn'
  const cfg = await store.config()
  if (!cfg) return { status: 503, body: { error: 'not_configured' } }
  if (!(await store.isApprover(userId))) return { status: 403, body: { error: 'not_approver' } }

  if (action === 'undo') {
    const eventId = uuidOrNull(input?.eventId)
    if (!eventId) return { status: 400, body: { error: 'invalid', field: 'eventId' } }
    const r = await store.undo(userId, eventId)
    return r.error ? dbErr(r.error) : { status: 200, body: r.data }
  }

  if (action === 'reject') {
    const callId = uuidOrNull(input?.callId)
    if (!callId) return { status: 400, body: { error: 'invalid', field: 'callId' } }
    const call = await store.getCall(callId)
    if (!call || !['draft', 'redraft'].includes(call.purpose)) return { status: 404, body: { error: 'not_found' } }
    if (call.feedback === 'used') return { status: 409, body: { error: 'already_sent' } }
    const ok = await store.rejectCall(callId, userId, maskPII(String(input?.reason ?? '')).slice(0, 500))
    return ok ? { status: 200, body: { rejected: true } } : { status: 409, body: { error: 'already_sent' } }
  }

  if (action !== 'learn') return { status: 400, body: { error: 'invalid', field: 'action' } }
  const cause = input?.cause
  if (cause !== 'sent' && cause !== 'approved' && cause !== 'saved') return { status: 400, body: { error: 'invalid', field: 'cause' } }
  const orderNumber = String(input?.orderNumber ?? '')
  if (!ORDER_RE.test(orderNumber)) return { status: 400, body: { error: 'invalid', field: 'orderNumber' } }
  const finalText = String(input?.finalText ?? '').trim()
  if (!finalText || finalText.length > 2000) return { status: 400, body: { error: 'invalid', field: 'finalText' } }
  const sourceEntryId = uuidOrNull(input?.sourceEntryId)
  const sourceCallId = uuidOrNull(input?.sourceCallId)
  const requestId = uuidOrNull(input?.requestId)
  const now = deps.now()

  // ── The client's question and the order context ──
  let question = ''
  let questionLang: 'en' | 'hi' = 'en'
  let embedding: number[] | null = null
  let useRequestEmbedding = false
  let ctxInfo: { side: string | null; status: string; category: string; accountId: string | null; clientState: string }
  const req = requestId && !input?.beforeAt ? await store.getRequest(requestId) : null
  if (req && req.order_number === orderNumber && req.question_text) {
    question = req.question_text
    questionLang = req.question_language === 'hi' ? 'hi' : 'en'
    useRequestEmbedding = !!req.question_embedding
    const c = req.context ?? {}
    ctxInfo = { side: c.side ?? null, status: c.status ?? 'UNKNOWN', category: c.category ?? 'regular', accountId: c.account_id ?? req.exchange_account_id ?? null, clientState: c.client_state ?? 'new' }
  } else {
    const accountHint = uuidOrNull(input?.exchangeAccountId)
    const ctx = await buildChatContext(store, cfg, orderNumber, accountHint, input?.hint ?? null, now)
    // The reply may already be in the chat: look at the client's messages before our latest replies.
    const before = Number(input?.beforeAt)
    let t = Number.isFinite(before) && before > 0 ? ctx.transcript.filter((m) => m.at < before) : ctx.transcript
    while (t.length && (t[t.length - 1].who === 'us' || t[t.length - 1].who === 'auto')) t = t.slice(0, -1)
    const turn = clientTurn(t)
    if (!turn) return { status: 422, body: { error: 'no_question', message: 'There is no client question to attach this reply to.' } }
    question = maskPII(turn.question)
    questionLang = detectLang(question) === 'hi' ? 'hi' : 'en'
    ctxInfo = { side: ctx.side, status: ctx.status, category: ctx.category, accountId: ctx.accountId, clientState: ctx.clientState }
    const e = await ai.embed([question], cfg.embedding_model)
    await store.logCall({
      user_id: userId, order_number: orderNumber, exchange_account_id: ctx.accountId, purpose: 'embed', model: cfg.embedding_model,
      status: e.vectors ? 'ok' : 'error', input_tokens: e.usage.input, output_tokens: 0, tokens_estimated: e.usage.estimated,
      cost_inr: costInr(cfg.embedding_model, e.usage, cfg.model_prices, cfg.usd_inr), latency_ms: e.latencyMs, error: e.error ?? null,
    })
    embedding = e.vectors?.[0] ?? null
  }

  // ── The reply, made reusable ──
  const phones = await store.allContactPhones()
  let stored = generalize(guardDraft(finalText).text, input?.templateValues ?? {}, phones)
  const replyLang: 'en' | 'hi' = detectLang(stored) === 'hi' ? 'hi' : detectLang(stored) === 'en' ? 'en' : questionLang
  const edited = input?.insertedText ? normText(input.insertedText) !== normText(finalText) : null

  // ── Candidates ──
  let candidates: MatchRow[] = []
  const emb = embedding ?? (useRequestEmbedding ? req!.question_embedding : null)
  if (emb) {
    candidates = await store.match({
      embeddings: [typeof emb === 'string' ? JSON.parse(emb) : emb], side: ctxInfo.side, category: ctxInfo.category, accountId: ctxInfo.accountId,
      status: ctxInfo.status, clientState: ctxInfo.clientState, includeTentative: true, includeConflicts: true,
      minSimilarity: cfg.learn_threshold, limit: 5,
    })
  }
  let source: any = null
  if (sourceEntryId) {
    source = (await store.entries([sourceEntryId]))[0] ?? null
    if (source && source.status === 'retired') source = null
  }

  let relation: 'new' | 'merge' | 'update' | 'conflict' = 'new'
  let target: string | null = null
  let title = question.slice(0, 60) || stored.slice(0, 60)
  let other: string | null = null
  let scope: Record<string, string[]> = {}
  let judged = false
  let reason = ''

  const sourceText = source ? applyAddress(String((replyLang === 'hi' ? source.reply_hi : source.reply_en) ?? ''), 'sir') : null
  if (source && sourceText && normText(sourceText) === normText(stored)) {
    relation = 'merge'
    target = source.id
    reason = 'Approved reply used unchanged'
  } else {
    const ids = new Set(candidates.map((c) => c.entry_id))
    const list = candidates.map((c) => ({ id: c.entry_id, title: c.title, status: c.status, similarity: c.similarity, answer: String((replyLang === 'hi' ? c.reply_hi ?? c.reply_en : c.reply_en ?? c.reply_hi) ?? '') }))
    if (source && !ids.has(source.id)) {
      list.unshift({ id: source.id, title: source.title, status: source.status, similarity: 1, answer: String((replyLang === 'hi' ? source.reply_hi ?? source.reply_en : source.reply_en ?? source.reply_hi) ?? '') })
    }
    const spent = await store.monthSpend()
    if (spent >= Number(cfg.monthly_budget_inr)) {
      // Over the cap: save without the AI check (cheap and still useful); an inserted entry is merged into.
      relation = source ? 'merge' : 'new'
      target = source?.id ?? null
      reason = 'Saved without AI review: monthly AI budget reached'
    } else {
      const qs = await store.questionsFor(list.map((c) => c.id))
      const { system, user } = buildJudgeMessages({
        question, reply: stored, replyLang,
        context: { side: ctxInfo.side, status: ctxInfo.status, category: ctxInfo.category, client_state: ctxInfo.clientState },
        candidates: list.map((c) => ({ ...c, questions: qs.filter((q) => q.entry_id === c.id).slice(0, 3).map((q) => maskPII(q.question_text)) })),
        houseStyle: cfg.house_style,
      })
      const r = await ai.chatJson(cfg.utility_model, system, user, JUDGE_SCHEMA, { timeoutMs: 25_000 })
      const cost = costInr(cfg.utility_model, r.usage, cfg.model_prices, cfg.usd_inr)
      await store.logCall({
        request_id: req?.id ?? null, user_id: userId, order_number: orderNumber, exchange_account_id: ctxInfo.accountId, purpose: 'judge',
        model: cfg.utility_model, status: r.ok ? 'ok' : 'error', input_tokens: r.usage.input, output_tokens: r.usage.output,
        reasoning_tokens: r.usage.reasoning, tokens_estimated: r.usage.estimated, cost_inr: cost, latency_ms: r.latencyMs,
        output_text: r.ok ? JSON.stringify({ relation: r.data.relation, target: r.data.target_entry_id, reason: r.data.reason }).slice(0, 500) : null,
        error: r.ok ? null : (r.error ?? 'failed'),
      })
      if (r.ok) {
        judged = true
        const d = r.data
        const validTarget = list.some((c) => c.id === d.target_entry_id)
        relation = ['merge', 'update', 'conflict'].includes(d.relation) && validTarget ? d.relation : 'new'
        target = relation === 'new' ? null : d.target_entry_id
        if (d.client_specific && typeof d.generalized_reply === 'string' && d.generalized_reply.trim()) {
          stored = generalize(guardDraft(d.generalized_reply).text, {}, phones)
        }
        if (typeof d.other_language_reply === 'string' && d.other_language_reply.trim()) {
          const o = guardDraft(d.other_language_reply).text
          if (maskPII(o) === o) other = applyAddress(o, 'sir')
        }
        if (typeof d.title === 'string' && d.title.trim()) title = d.title.trim().slice(0, 80)
        const statuses = (d.scope_statuses ?? []).flatMap((s: string) => (s === 'CANCELLED' ? ['CANCELLED', 'CANCELLED_BY_SYSTEM'] : [s]))
        scope = {
          sides: d.scope_sides ?? [], statuses, client_states: d.scope_client_states ?? [], categories: d.scope_categories ?? [],
          account_ids: d.account_specific && ctxInfo.accountId ? [ctxInfo.accountId] : [],
        }
        for (const k of Object.keys(scope)) if (!scope[k].length) delete scope[k]
        reason = String(d.reason ?? '').slice(0, 160)
      } else {
        relation = source ? 'merge' : 'new'
        target = source?.id ?? null
        reason = 'Saved without AI review: the check did not answer'
      }
    }
  }

  // Never store personal data in the Playbook.
  stored = maskPII(stored)
  const result = await store.learnApply({
    p_user_id: userId, p_cause: cause, p_relation: relation, p_target_entry_id: target,
    p_question_text: question || null, p_question_embedding: embedding, p_question_language: questionLang,
    p_reply_language: replyLang, p_reply_text: stored, p_reply_other: other, p_title: title, p_scope: scope,
    p_order_number: orderNumber, p_account_id: ctxInfo.accountId, p_request_id: req?.id ?? null,
    p_draft_call_id: sourceCallId, p_draft_edited: edited,
    p_context: { side: ctxInfo.side, status: ctxInfo.status, category: ctxInfo.category, client_state: ctxInfo.clientState },
  })
  if (result.error) return dbErr(result.error)
  const d = result.data ?? {}
  console.log(JSON.stringify({ fn: 'copilot-learn', outcome: d.action, judged }))
  return {
    status: 200,
    body: {
      eventId: d.event_id, action: d.action, entryId: d.entry_id, title: d.title, otherEntryId: d.other_entry_id ?? null,
      inboxItemId: d.inbox_item_id ?? null, stored, storedLanguage: replyLang, judged, reason,
    },
  }
}
