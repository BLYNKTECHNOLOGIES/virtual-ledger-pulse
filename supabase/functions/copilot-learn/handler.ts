// deno-lint-ignore-file no-explicit-any
// Copilot v2 Playbook upkeep. Approvers only.
//  learn     — an approver sent or approved a suggestion, or tapped Save on their own reply ("use = approve"): the
//              reply is generalised (placeholders, "sir"), compared with similar questions and their situation replies,
//              and saved as a new question, a merge, an update, a wider situation, a reply for a new situation, a
//              promotion of a tentative reply, or a conflict for the inbox. The client's wording joins the question.
//  reject    — a draft was rejected; kept with the reason as an example to avoid, never as SOP.
//  undo      — reverts a learning event (the toast's Undo).
//  index     — makes phrasings added on the Playbook page searchable right away (one small embedding call).
//  translate — "Rewrite Hindi from English" (and back) for the Playbook page; the approver reviews before saving.
import {
  applyAddress, buildJudgeMessages, buildTranslateMessages, chatBefore, chatTail, clientTurn, contextText, costInr, detectLang, generalize,
  guardDraft, JUDGE_SCHEMA, maskPII, normText, TRANSLATE_SCHEMA, type JudgeCandidate, type TemplateValues,
} from '../_shared/copilot-playbook.ts'
import { buildChatContext, type OrderHint } from '../_shared/copilot-context.ts'
import {
  asksToPayNow, beforeVerification, covers, detectSituation, fitsOrder, fitsStage, invitesPayment, markable, resolveSituation, scopeStages,
  situationDef, STATUS_SITUATIONS, statusFromEvents,
} from '../_shared/copilot-situation.ts'
import type { Side } from '../_shared/copilot-playbook.ts'
import type { MatchRow, Store } from '../_shared/copilot-store.ts'
import type { Ai } from '../_shared/copilot-ai.ts'

export interface LearnInput {
  action?: 'learn' | 'reject' | 'undo' | 'index' | 'translate'
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
  /** The step the approver picked the reply for ("If: Checking KYC"): it is filed under that step, not the detected one. */
  situation?: string | null
  callId?: string
  reason?: string
  eventId?: string
  /** translate */
  text?: string
  to?: 'en' | 'hi'
}
export interface Deps { store: Store; ai: Ai; now: () => Date }
export interface Out { status: number; body: any }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORDER_RE = /^[0-9A-Za-z_-]{6,40}$/
const uuidOrNull = (v: unknown) => (typeof v === 'string' && UUID_RE.test(v) ? v : null)
const INDEX_LIMIT = 50

function dbErr(e: { message: string; code?: string }): Out {
  if (e.code === '42501') return { status: 403, body: { error: 'not_approver' } }
  if (e.code === 'P0002') return { status: 404, body: { error: 'not_found', message: e.message } }
  if (e.code === '22023') return { status: 409, body: { error: 'refused', message: e.message } }
  return { status: 500, body: { error: 'db_error' } }
}

const stagesOf = scopeStages
/** Same rule as the database's "fits" (shared with the draft engine). */
export { fitsOrder }

/** The client's wording to keep: the part the judge quoted (if it is really in the question), else the message that matched. */
export function pickPhrasing(question: string, quoted: string | null | undefined, matchedInput: string | null | undefined): string {
  const q = normText(question)
  const cleaned = String(quoted ?? '').trim().replace(/^["“']|["”']$/g, '').slice(0, 300)
  if (cleaned.length >= 2 && q.includes(normText(cleaned))) return cleaned
  const m = String(matchedInput ?? '').trim()
  if (m.length >= 2) return m.slice(0, 300)
  return question
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

  if (action === 'index') {
    const [pending, examples] = await Promise.all([store.pendingQuestions(INDEX_LIMIT), store.pendingExamples(INDEX_LIMIT)])
    if (!pending.length && !examples.length) return { status: 200, body: { indexed: 0, left: 0 } }
    const e = await ai.embed([...pending.map((p) => maskPII(p.question_text)), ...examples.map((x) => maskPII(x.context_text))], cfg.embedding_model)
    await store.logCall({
      user_id: userId, purpose: 'embed', model: cfg.embedding_model, status: e.vectors ? 'ok' : 'error',
      input_tokens: e.usage.input, output_tokens: 0, tokens_estimated: e.usage.estimated,
      cost_inr: costInr(cfg.embedding_model, e.usage, cfg.model_prices, cfg.usd_inr), latency_ms: e.latencyMs, error: e.error ?? null,
    })
    if (!e.vectors) return { status: 502, body: { error: 'embed_failed', message: 'Could not make the phrasings searchable. Try again.' } }
    const v = e.vectors
    const indexed = (pending.length ? await store.setQuestionEmbeddings(pending.map((p, i) => ({ id: p.id, v: v[i] })), cfg.embedding_model) : 0)
      + (examples.length ? await store.setExampleEmbeddings(examples.map((x, i) => ({ id: x.id, v: v[pending.length + i] })), cfg.embedding_model) : 0)
    const left = (await store.pendingQuestions(1)).length + (await store.pendingExamples(1)).length
    return { status: 200, body: { indexed, left } }
  }

  if (action === 'translate') {
    const to: 'en' | 'hi' = input?.to === 'en' ? 'en' : 'hi'
    const text = String(input?.text ?? '').trim()
    if (!text || text.length > 2000) return { status: 400, body: { error: 'invalid', field: 'text' } }
    if ((await store.monthSpend()) >= Number(cfg.monthly_budget_inr)) {
      return { status: 429, body: { error: 'monthly_cap', message: "This month's AI budget is used up." } }
    }
    const { system, user } = buildTranslateMessages(maskPII(text), to, cfg.house_style)
    const r = await ai.chatJson(cfg.utility_model, system, user, TRANSLATE_SCHEMA, { timeoutMs: 25_000 })
    await store.logCall({
      user_id: userId, purpose: 'translate', model: cfg.utility_model, status: r.ok ? 'ok' : 'error',
      input_tokens: r.usage.input, output_tokens: r.usage.output, reasoning_tokens: r.usage.reasoning, tokens_estimated: r.usage.estimated,
      cost_inr: costInr(cfg.utility_model, r.usage, cfg.model_prices, cfg.usd_inr), latency_ms: r.latencyMs,
      output_text: r.ok ? maskPII(String(r.data?.text ?? '')).slice(0, 2000) : null, error: r.ok ? null : (r.error ?? 'failed'),
    })
    if (!r.ok) return { status: 502, body: { error: 'translate_failed', message: 'The AI did not answer. Try again.' } }
    const out = applyAddress(guardDraft(String(r.data?.text ?? '')).text, 'sir')
    if (!out) return { status: 502, body: { error: 'translate_failed', message: 'The AI returned nothing. Try again.' } }
    if (maskPII(out) !== out) return { status: 422, body: { error: 'personal_data', message: 'The rewrite contained a number; write it yourself instead.' } }
    return { status: 200, body: { text: out, language: to } }
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

  // ── The client's question, the order context and the chat's situation ──
  let question = ''
  let questionLang: 'en' | 'hi' = 'en'
  let embedding: number[] | null = null
  let requestEmbedding: number[] | null = null
  let inputs: string[] = []
  let tail: Array<{ from: string; at: string; text: string }> = []
  let prior: Array<{ from: string; text: string }> = []
  let ctxText = ''
  let ctxEmbedding: number[] | null = null
  let ctxInfo: { side: string | null; status: string; category: string; accountId: string | null; clientState: string; stage: string | null }
  const req = requestId && !input?.beforeAt ? await store.getRequest(requestId) : null
  if (req && req.order_number === orderNumber && req.question_text) {
    question = req.question_text
    questionLang = req.question_language === 'hi' ? 'hi' : 'en'
    const qe = req.question_embedding as any
    requestEmbedding = qe ? (typeof qe === 'string' ? JSON.parse(qe) : qe) : null
    const c = req.context ?? {}
    inputs = Array.isArray(c.inputs) ? c.inputs.map((x: unknown) => String(x)) : [question]
    tail = Array.isArray(c.chat_tail) ? c.chat_tail : []
    prior = Array.isArray(c.chat_before) ? c.chat_before : []
    ctxText = typeof c.context_text === 'string' ? c.context_text : ''
    const ce = req.context_embedding as any
    ctxEmbedding = ce ? (typeof ce === 'string' ? JSON.parse(ce) : ce) : null
    ctxInfo = {
      side: c.side ?? null, status: c.status ?? 'UNKNOWN', category: c.category ?? 'regular', accountId: c.account_id ?? req.exchange_account_id ?? null,
      clientState: c.client_state ?? 'new', stage: typeof c.situation === 'string' ? c.situation : null,
    }
  } else {
    const accountHint = uuidOrNull(input?.exchangeAccountId)
    const ctx = await buildChatContext(store, cfg, orderNumber, accountHint, input?.hint ?? null, now)
    // The reply may already be in the chat: look at the client's messages before our latest replies.
    const before = Number(input?.beforeAt)
    const cut = Number.isFinite(before) && before > 0
    let t = cut ? ctx.transcript.filter((m) => m.at < before) : ctx.transcript
    // Saving one of our earlier messages: it is filed under the situation it was sent in, worked out from the chat
    // before it (status from Binance's notices in it; an approver's correction only if made before it), not today's.
    let situation: { code: string | null; label: string | null } = { code: ctx.situation.code, label: ctx.situation.label }
    let status = ctx.status
    if (cut) {
      const lastOurs = t.map((m) => m.who === 'us' || m.who === 'auto').lastIndexOf(true)
      const upTo = lastOurs >= 0 ? t.slice(0, lastOurs) : t
      status = statusFromEvents(upTo)
      const mk = ctx.situation.marked && ctx.situation.marked.at < before ? { code: ctx.situation.code, at: ctx.situation.marked.at, by: ctx.situation.marked.by } : null
      const r = resolveSituation(ctx.side, detectSituation(ctx.side, status, upTo, before), mk)
      situation = { code: r.code, label: r.label }
    }
    while (t.length && (t[t.length - 1].who === 'us' || t[t.length - 1].who === 'auto')) t = t.slice(0, -1)
    const turn = clientTurn(t)
    if (!turn) return { status: 422, body: { error: 'no_question', message: 'There is no client question to attach this reply to.' } }
    question = maskPII(turn.question)
    questionLang = detectLang(question) === 'hi' ? 'hi' : 'en'
    const lastText = maskPII([...turn.messages].reverse().find((m) => m.kind === 'text')?.text ?? '')
    inputs = [...new Set([question, lastText].filter((s) => s.trim().length > 0))]
    tail = chatTail(t)
    prior = chatBefore(t)
    ctxText = contextText(prior, situation.label)
    ctxInfo = { side: ctx.side, status, category: ctx.category, accountId: ctx.accountId, clientState: ctx.clientState, stage: situation.code }
    const e = await ai.embed(ctxText ? [question, ctxText] : [question], cfg.embedding_model)
    await store.logCall({
      user_id: userId, order_number: orderNumber, exchange_account_id: ctx.accountId, purpose: 'embed', model: cfg.embedding_model,
      status: e.vectors ? 'ok' : 'error', input_tokens: e.usage.input, output_tokens: 0, tokens_estimated: e.usage.estimated,
      cost_inr: costInr(cfg.embedding_model, e.usage, cfg.model_prices, cfg.usd_inr), latency_ms: e.latencyMs, error: e.error ?? null,
    })
    embedding = e.vectors?.[0] ?? null
    ctxEmbedding = ctxText ? e.vectors?.[1] ?? null : null
  }
  // A reply the approver picked for another step ("If: Checking KYC") tells us the client's real step: it is filed
  // there. Never over Binance's own status (paid, completed, cancelled, appeal), never out of KYC on a sell order (only
  // Binance's Verified notice or our payment details end it), and not when saving an older message.
  const picked = typeof input?.situation === 'string' ? input.situation : null
  const pickSide = ctxInfo.side as Side | null
  if (picked && picked !== ctxInfo.stage && !input?.beforeAt && markable(picked, pickSide)
    && !(ctxInfo.stage && STATUS_SITUATIONS.has(ctxInfo.stage))
    && !(beforeVerification(pickSide, ctxInfo.stage) && !beforeVerification(pickSide, picked))) {
    ctxInfo = { ...ctxInfo, stage: picked }
    // The example chat is labelled with the picked step; its embedding is made at the next lookup, never mislabelled.
    ctxText = contextText(prior, situationDef(picked)?.label ?? null)
    ctxEmbedding = null
  }
  const stage = ctxInfo.stage && situationDef(ctxInfo.stage) ? ctxInfo.stage : null

  // ── The reply, made reusable ──
  const phones = await store.allContactPhones()
  // Placeholders first (the order's values and our team numbers), then personal data masked before the judge sees it.
  let stored = maskPII(generalize(guardDraft(finalText).text, input?.templateValues ?? {}, phones))
  const replyLang: 'en' | 'hi' = detectLang(stored) === 'hi' ? 'hi' : detectLang(stored) === 'en' ? 'en' : questionLang
  const edited = input?.insertedText ? normText(input.insertedText) !== normText(finalText) : null

  // ── Candidate questions with all their live replies ──
  let candidates: MatchRow[] = []
  const emb = embedding ?? requestEmbedding
  if (emb) {
    candidates = await store.match({
      embeddings: [emb], side: ctxInfo.side, category: ctxInfo.category, accountId: ctxInfo.accountId,
      status: ctxInfo.status, clientState: ctxInfo.clientState, stage, contextEmbedding: ctxEmbedding, includeTentative: true, includeConflicts: true,
      minSimilarity: cfg.learn_threshold, limit: 5,
    })
  }
  let source: any = null
  if (sourceEntryId) {
    source = (await store.entries([sourceEntryId]))[0] ?? null
    if (source && source.status === 'retired') source = null
  }
  // The client message that matched the question best (from the suggestion request), for a clean phrasing.
  const matchedInput = (topicId: string | null) => {
    const rows = (req?.matches ?? []).filter((m: any) => m.topic_id === topicId && typeof m.input_index === 'number')
    const best = rows.sort((a: any, b: any) => Number(b.similarity) - Number(a.similarity))[0]
    return best ? inputs[best.input_index] ?? null : (inputs[inputs.length - 1] ?? null)
  }

  let relation: 'new' | 'merge' | 'update' | 'widen' | 'variant' | 'conflict' = 'new'
  let target: string | null = null
  let targetTopic: string | null = null
  let title = question.slice(0, 60) || stored.slice(0, 60)
  let other: string | null = null
  let scope: Record<string, string[]> = {}
  let judged = false
  let reason = ''
  let phrasing = question
  let situationSpecific = false

  const sourceText = source ? applyAddress(String((replyLang === 'hi' ? source.reply_hi : source.reply_en) ?? ''), 'sir') : null
  if (source && sourceText && normText(sourceText) === normText(stored)) {
    // Used unchanged: the same reply, now also proven in this situation.
    target = source.id
    relation = fitsStage(source.scope, stage) || !stage ? 'merge' : 'widen'
    reason = relation === 'merge' ? 'Approved reply used unchanged' : 'Approved reply used unchanged in another situation'
    phrasing = pickPhrasing(question, null, matchedInput(source.topic_id))
  } else {
    // Group the candidates by question for the judge.
    const groups = new Map<string, JudgeCandidate>()
    const scopes = new Map<string, any>()
    const add = (topicId: string, title: string, similarity: number, r: { entryId: string; status: string; scope: any; fits: boolean; en: string | null; hi: string | null }) => {
      const g = groups.get(topicId) ?? { questionId: topicId, title, similarity, questions: [], replies: [] }
      g.similarity = Math.max(g.similarity, similarity)
      if (!g.replies.some((x) => x.entryId === r.entryId)) {
        // fitsNow: the database's full rule (side, client, size, account and situation), so a reply for another kind
        // of client is a variant, not a conflict.
        g.replies.push({
          entryId: r.entryId, status: r.status, fitsNow: r.fits,
          situations: stagesOf(r.scope).map((c) => situationDef(c)?.label ?? c),
          answer: String((replyLang === 'hi' ? r.hi ?? r.en : r.en ?? r.hi) ?? ''),
        })
        scopes.set(r.entryId, r.scope)
      }
      groups.set(topicId, g)
    }
    for (const c of candidates) add(c.topic_id, c.title, c.similarity, { entryId: c.entry_id, status: c.status, scope: c.scope, fits: c.fits, en: c.reply_en, hi: c.reply_hi })
    if (source && source.topic_id) {
      add(source.topic_id, source.title, 1, { entryId: source.id, status: source.status, scope: source.scope, fits: fitsOrder(source.scope, ctxInfo, stage), en: source.reply_en, hi: source.reply_hi })
    }
    const list = [...groups.values()]
    const replyById = new Map(list.flatMap((g) => g.replies.map((r) => [r.entryId, { ...r, topicId: g.questionId, stageFits: fitsStage(scopes.get(r.entryId), stage) }] as const)))

    const spent = await store.monthSpend()
    if (spent >= Number(cfg.monthly_budget_inr)) {
      // Over the cap: save without the AI check (cheap and still useful); an inserted reply is merged into.
      relation = source ? (fitsStage(source.scope, stage) || !stage ? 'merge' : 'widen') : 'new'
      target = source?.id ?? null
      reason = 'Saved without AI review: monthly AI budget reached'
      phrasing = pickPhrasing(question, null, matchedInput(source?.topic_id ?? null))
    } else {
      const [qs, examples] = await Promise.all([
        store.questionsFor(list.map((c) => c.questionId)),
        store.examplesFor(list.flatMap((c) => c.replies.map((r) => r.entryId))),
      ])
      const exampleOf = new Map(examples.map((x) => [x.entry_id, x.chat.slice(-4).map((l) => ({ from: l.from, text: maskPII(l.text).slice(0, 160) }))]))
      const { system, user } = buildJudgeMessages({
        question, reply: stored, replyLang,
        context: {
          side: ctxInfo.side, situation: situationDef(stage)?.label ?? 'unknown', category: ctxInfo.category, client_state: ctxInfo.clientState,
          chat_before: prior.slice(-4),
        },
        candidates: list.map((c) => ({
          ...c,
          questions: qs.filter((q) => q.topic_id === c.questionId).slice(0, 3).map((q) => maskPII(q.question_text)),
          replies: c.replies.map((r) => ({ ...r, exampleChat: exampleOf.get(r.entryId) ?? [] })),
        })),
        houseStyle: cfg.house_style,
      })
      const r = await ai.chatJson(cfg.utility_model, system, user, JUDGE_SCHEMA, { timeoutMs: 25_000 })
      const cost = costInr(cfg.utility_model, r.usage, cfg.model_prices, cfg.usd_inr)
      await store.logCall({
        request_id: req?.id ?? null, user_id: userId, order_number: orderNumber, exchange_account_id: ctxInfo.accountId, purpose: 'judge',
        model: cfg.utility_model, status: r.ok ? 'ok' : 'error', input_tokens: r.usage.input, output_tokens: r.usage.output,
        reasoning_tokens: r.usage.reasoning, tokens_estimated: r.usage.estimated, cost_inr: cost, latency_ms: r.latencyMs,
        output_text: r.ok ? JSON.stringify({ relation: r.data.relation, target: r.data.target_entry_id, question: r.data.target_question_id, reason: r.data.reason }).slice(0, 500) : null,
        error: r.ok ? null : (r.error ?? 'failed'),
      })
      if (r.ok) {
        judged = true
        const d = r.data
        const t = replyById.get(d.target_entry_id)
        relation = ['merge', 'update', 'widen', 'variant', 'conflict'].includes(d.relation) ? d.relation : 'new'
        if (relation === 'variant') {
          targetTopic = groups.has(d.target_question_id) ? d.target_question_id : (t?.topicId ?? null)
          if (!targetTopic) relation = 'new'
        } else if (relation !== 'new') {
          if (!t) relation = 'new'
          else {
            target = d.target_entry_id
            // The rule: a different answer (or new wording) for a reply that does not apply here is a new reply for
            // this situation, never a change to the other one; the same answer is a merge where the reply already
            // applies, otherwise a wider situation.
            if (relation === 'conflict' && !t.fitsNow) { relation = 'variant'; targetTopic = t.topicId; target = null }
            else if (relation === 'update' && !t.fitsNow && stage) { relation = 'variant'; targetTopic = t.topicId; target = null }
            else if (relation === 'merge' && !t.stageFits && stage) relation = 'widen'
            else if (relation === 'widen' && (t.stageFits || !stage)) relation = 'merge'
          }
        }
        if (relation === 'new') { target = null; targetTopic = null }
        if (d.client_specific && typeof d.generalized_reply === 'string' && d.generalized_reply.trim()) {
          stored = maskPII(generalize(guardDraft(d.generalized_reply).text, {}, phones))
        }
        if (typeof d.other_language_reply === 'string' && d.other_language_reply.trim()) {
          const o = guardDraft(d.other_language_reply).text
          if (maskPII(o) === o) other = applyAddress(o, 'sir')
        }
        if (typeof d.title === 'string' && d.title.trim()) title = d.title.trim().slice(0, 80)
        situationSpecific = d.situation_specific === true
        scope = {
          sides: d.scope_sides ?? [], client_states: d.scope_client_states ?? [], categories: d.scope_categories ?? [],
          account_ids: d.account_specific && ctxInfo.accountId ? [ctxInfo.accountId] : [],
          stages: (relation === 'new' || relation === 'variant' || relation === 'conflict') && stage && (situationSpecific || relation === 'variant') ? [stage] : [],
        }
        for (const k of Object.keys(scope)) if (!scope[k].length) delete scope[k]
        reason = String(d.reason ?? '').slice(0, 160)
        const topicForPhrasing = relation === 'variant' ? targetTopic : (t?.topicId ?? null)
        phrasing = pickPhrasing(question, d.phrasing, matchedInput(topicForPhrasing))
      } else {
        relation = source ? (fitsStage(source.scope, stage) || !stage ? 'merge' : 'widen') : 'new'
        target = source?.id ?? null
        reason = 'Saved without AI review: the check did not answer'
        phrasing = pickPhrasing(question, null, matchedInput(source?.topic_id ?? null))
      }
    }
  }

  // A reply that asks the client to pay belongs to the payment step of our sell orders. It is never written into a
  // reply that applies before verification (a merge would fill its empty or AI-written copy, an update replace its
  // wording): it becomes a reply of its own in that question. And a reply that plainly asks to pay (no KYC request in
  // it) is filed under "Client can pay", never under KYC or "any situation", whatever the chat showed (it may be out
  // of date: the approver who sent it saw that the client could pay).
  if (ctxInfo.side === 'SELL' && (invitesPayment(stored) || invitesPayment(other))) {
    if (beforeVerification('SELL', stage) && target && relation !== 'new' && relation !== 'variant') {
      const tgt: any = candidates.find((c) => c.entry_id === target) ?? (source && source.id === target ? source : null)
      if (tgt && (invitesPayment(tgt.reply_en) || invitesPayment(tgt.reply_hi))) {
        // The same payment reply, used while the chat looked like KYC: counted, never widened into KYC.
        if (relation === 'widen') relation = 'merge'
      } else if (tgt?.topic_id) {
        // A variant always belongs to the situation it was written for (moved below if it plainly asks to pay).
        relation = 'variant'; targetTopic = tgt.topic_id; target = null
        scope = { ...scope, stages: stage ? [stage] : [] }
        if (!scope.stages.length) delete scope.stages
      }
    }
    if ((asksToPayNow(stored) || asksToPayNow(other)) && (relation === 'new' || relation === 'variant' || relation === 'conflict')) {
      const st = scope.stages ?? []
      if (!st.length || st.some((c) => covers('sell.kyc', c))) scope = { ...scope, stages: [stage && covers('sell.pay', stage) ? stage : 'sell.pay.ready'] }
    }
  } else if (ctxInfo.side === 'SELL' && beforeVerification('SELL', stage) && target && relation === 'widen') {
    // A pay reply is never widened into a step before verification. A reply with no request to pay that the judge took
    // for "the same answer" as a pay reply is this step's own reply in that question.
    const tgt: any = candidates.find((c) => c.entry_id === target) ?? (source && source.id === target ? source : null)
    if (tgt?.topic_id && (invitesPayment(tgt.reply_en) || invitesPayment(tgt.reply_hi))) {
      relation = 'variant'; targetTopic = tgt.topic_id; target = null
      scope = { ...scope, stages: stage ? [stage] : [] }
      if (!scope.stages.length) delete scope.stages
    }
  }

  // A reply filed under another step than the chat showed (a request to pay sent while the chat looked like KYC) keeps
  // its example chat under that step, labelled for it.
  let exampleStage = stage
  const filedAt = scope.stages?.length === 1 ? scope.stages[0] : null
  if (filedAt && filedAt !== stage && (relation === 'new' || relation === 'variant' || relation === 'conflict')) {
    exampleStage = filedAt
    ctxText = contextText(prior, situationDef(filedAt)?.label ?? null)
    ctxEmbedding = null
  }

  // The phrasing's own embedding. For the whole question the fresh one is used, or (null) the database takes the
  // embedding stored with the suggestion request; a shorter phrasing gets its own (a fraction of a paisa).
  let phrasingEmbedding: number[] | null = embedding
  phrasing = maskPII(phrasing)
  if (normText(phrasing) !== normText(question)) {
    const e = await ai.embed([phrasing], cfg.embedding_model)
    await store.logCall({
      request_id: req?.id ?? null, user_id: userId, order_number: orderNumber, exchange_account_id: ctxInfo.accountId, purpose: 'embed',
      model: cfg.embedding_model, status: e.vectors ? 'ok' : 'error', input_tokens: e.usage.input, output_tokens: 0,
      tokens_estimated: e.usage.estimated, cost_inr: costInr(cfg.embedding_model, e.usage, cfg.model_prices, cfg.usd_inr), latency_ms: e.latencyMs, error: e.error ?? null,
    })
    phrasingEmbedding = e.vectors?.[0] ?? null
  }

  // Never store personal data in the Playbook.
  stored = maskPII(stored)
  const result = await store.learnApply({
    p_user_id: userId, p_cause: cause, p_relation: relation, p_target_entry_id: target,
    p_question_text: phrasing || null, p_question_embedding: phrasingEmbedding, p_question_language: detectLang(phrasing) === 'hi' ? 'hi' : questionLang,
    p_reply_language: replyLang, p_reply_text: stored, p_reply_other: other, p_title: title, p_scope: scope,
    p_order_number: orderNumber, p_account_id: ctxInfo.accountId, p_request_id: req?.id ?? null,
    p_draft_call_id: sourceCallId, p_draft_edited: edited,
    p_context: {
      side: ctxInfo.side, status: ctxInfo.status, category: ctxInfo.category, client_state: ctxInfo.clientState,
      situation: stage, situation_label: situationDef(stage)?.label ?? null, chat: tail,
    },
    p_target_topic_id: targetTopic, p_stage: exampleStage,
    // The chat this reply was used in, kept as an example: later chats like it bring this reply up first.
    p_example_chat: tail.length ? tail.map((l) => ({ from: l.from, text: maskPII(l.text).slice(0, 220) })) : null,
    p_example_text: ctxText || null,
    p_example_embedding: ctxText ? ctxEmbedding : null,
  })
  if (result.error) return dbErr(result.error)
  const d = result.data ?? {}
  console.log(JSON.stringify({ fn: 'copilot-learn', outcome: d.action, judged, situation: stage }))
  return {
    status: 200,
    body: {
      eventId: d.event_id, action: d.action, entryId: d.entry_id, topicId: d.topic_id ?? null, title: d.title, otherEntryId: d.other_entry_id ?? null,
      inboxItemId: d.inbox_item_id ?? null, stored, storedLanguage: replyLang, judged, reason,
      phrasing: d.phrasing ?? null, situation: exampleStage ? (situationDef(exampleStage)?.label ?? exampleStage) : null,
    },
  }
}
