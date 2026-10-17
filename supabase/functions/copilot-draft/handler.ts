// deno-lint-ignore-file no-explicit-any
// Copilot v2 draft engine. For one order chat that an approver has open:
// 1) builds the context on the server: the chat's situation (what the client is waiting for), Binance's deadlines and
//    extra-KYC field, and what we hold on the client,
// 2) looks for approved Playbook replies for that question and situation by meaning (no AI); below the match threshold
//    a question is still trusted when it is clearly ahead of the next one,
// 3) when that is unsure, a small model picks which approved question the client is asking ("AI picks, Playbook
//    speaks": what the approver gets is the approved reply, never generated text),
// 4) only if no approved reply fits (or the approver asks), drafts fresh replies with the configured models,
// 5) runs the safety checks, logs tokens and ₹, and caches the result so a chat state never pays twice.
// Nothing is sent to the client from here.
import {
  applyAddress, buildDraftMessages, buildRouteMessages, chatTail, contactCodes, costInr, detectLang, DRAFT_SCHEMA, guardDraft, INSTRUCTIONS,
  istLabel, maskPII, routeSchema, sideMeaning, statusMeaning, type ContactPurpose, type RouteCandidate,
} from '../_shared/copilot-playbook.ts'
import { buildChatContext, contextSummary, orderFacts, type ChatContext, type OrderHint } from '../_shared/copilot-context.ts'
import {
  alternativeSteps, beforeVerification, detectSituation, fitsOrder, invitesPayment, isSmallTalk, type OrderFit, scopeStages, situationDef,
  stageDepth,
} from '../_shared/copilot-situation.ts'
import type { Side } from '../_shared/copilot-playbook.ts'
import type { CopilotConfig, MatchRow, Store } from '../_shared/copilot-store.ts'
import type { Ai } from '../_shared/copilot-ai.ts'

export interface DraftInput {
  orderNumber: string
  exchangeAccountId?: string | null
  /** context: the order facts only (situation, deadlines, client records) for a chat with nothing to answer: no AI, nothing saved. */
  mode?: 'suggest' | 'redraft' | 'force' | 'context'
  instruction?: string | null
  hint?: OrderHint | null
}
export interface Deps { store: Store; ai: Ai; now: () => Date }
export interface Out { status: number; body: any }

const ORDER_RE = /^[0-9A-Za-z_-]{6,40}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// A suggestion being made (embedding, the AI's pick, drafts) is waited for this long before another request takes over.
const PENDING_FRESH_MS = 75_000
const PENDING_EMBED_LIMIT = 50
const LABELS = ['A', 'B']
/** Questions looked up per chat (each with all its live replies). */
const MATCH_LIMIT = 8
/** The AI picks among the questions for this side that score at least this, the best few. */
const ROUTE_FLOOR = 0.4
const ROUTE_MAX = 6
/**
 * Shown first without AI only when the best question for this side is clearly ahead: at least this score, and this far
 * ahead of the next one. On the saved client wordings (leave-one-out, per side) this was right 98.7% of the time, against
 * 80% for "78% or more" alone, whose misses were all two close questions (siblings such as "Can I pay now?" and "Payment
 * done, please release"); those now go to the AI.
 */
const LEAD_FLOOR = 0.6
const LEAD_MARGIN = 0.15

const situationLabels = (m: Pick<MatchRow, 'scope'>) => scopeStages(m.scope).map((c) => situationDef(c)?.label ?? c)

/**
 * The text to offer in the chat's language. An out-of-date copy (the other language was edited after it) is never
 * offered: the up-to-date language is shown instead, with a note for the approver.
 */
export function pickText(m: Pick<MatchRow, 'reply_en' | 'reply_hi' | 'reply_en_auto' | 'reply_hi_auto' | 'reply_en_stale' | 'reply_hi_stale'>, lang: 'en' | 'hi') {
  const en = m.reply_en && !m.reply_en_stale ? m.reply_en : null
  const hi = m.reply_hi && !m.reply_hi_stale ? m.reply_hi : null
  const own = lang === 'hi' ? hi : en
  const other = lang === 'hi' ? en : hi
  if (own) return { text: own, language: lang, auto: lang === 'hi' ? m.reply_hi_auto : m.reply_en_auto, note: null as string | null }
  const ownRaw = lang === 'hi' ? m.reply_hi : m.reply_en
  const otherLang: 'en' | 'hi' = lang === 'hi' ? 'en' : 'hi'
  if (other) return { text: other, language: otherLang, auto: otherLang === 'hi' ? m.reply_hi_auto : m.reply_en_auto, note: ownRaw ? `${lang === 'hi' ? 'hindi' : 'english'}_outdated` : `${lang === 'hi' ? 'hindi' : 'english'}_missing` }
  // Every copy it has is out of date: nothing to offer until an approver rewrites or confirms it.
  return { text: '', language: lang, auto: false, note: 'outdated' }
}

/** True when a reply has a copy that is not out of date (an outdated-only reply is never offered). */
export const usableReply = (m: Pick<MatchRow, 'reply_en' | 'reply_hi' | 'reply_en_stale' | 'reply_hi_stale'>) =>
  (!!m.reply_en && !m.reply_en_stale) || (!!m.reply_hi && !m.reply_hi_stale)

function playbookItem(m: MatchRow, lang: 'en' | 'hi', address: 'sir' | 'maam') {
  const p = pickText(m, lang)
  return {
    entryId: m.entry_id,
    topicId: m.topic_id,
    title: m.title,
    status: m.status,
    conflict: m.conflict_open,
    similarity: Math.round(m.similarity * 1000) / 1000,
    text: applyAddress(p.text, address),
    language: p.language,
    machineTranslated: p.auto,
    missingLanguage: p.language !== lang,
    languageNote: p.note,
    /** Situations this reply is limited to (empty = any situation). */
    situations: situationLabels(m),
    specific: m.specificity > 0,
    /** How closely this chat resembles the chats the reply was used in (null: no example yet). */
    contextSimilarity: m.context_similarity === null ? null : Math.round(m.context_similarity * 1000) / 1000,
    risk: m.risk,
    note: m.internal_note,
    version: m.version,
  }
}

async function contactsFor(store: Store, purposes: Set<ContactPurpose>) {
  if (!purposes.size) return { contacts: {}, missing: [] as string[] }
  // A team that is switched off gives no number.
  const [teams, rows] = await Promise.all([store.teams(), store.contacts([...purposes])])
  const active = new Set(teams.map((t) => t.code))
  const contacts: Record<string, { name: string; phone: string; availableNow: boolean }> = {}
  const missing: string[] = []
  for (const p of purposes) {
    const list = active.has(p) ? rows.filter((r) => r.purpose === p) : []
    const pick = list.find((r) => r.available_now) ?? list[0]
    if (pick) contacts[p] = { name: pick.person_name, phone: pick.phone, availableNow: pick.available_now }
    else missing.push(p)
  }
  return { contacts, missing }
}

function budgetInfo(cfg: CopilotConfig, spent: number) {
  const limit = Number(cfg.monthly_budget_inr)
  const pct = limit > 0 ? Math.round((spent / limit) * 1000) / 10 : 100
  const alert = [...(cfg.budget_alert_pcts ?? [])].sort((a, b) => b - a).find((a) => pct >= a) ?? null
  return { spentInr: Math.round(spent * 100) / 100, limitInr: limit, pct, alertPct: alert, capped: spent >= limit }
}

/**
 * Per question, the replies that fit now and are the most specific for this situation (a step beats a group beats
 * "any"). An approved reply is always offered over tentative ones; a tentative reply is added only when it is more
 * specific than every approved one (a proposal for exactly this situation).
 */
export function bestFitting(matches: MatchRow[], perQuestion = 2): MatchRow[] {
  const best = new Map<string, { approved: number; tentative: number }>()
  for (const m of matches) {
    if (!m.fits) continue
    const b = best.get(m.topic_id) ?? { approved: -1, tentative: -1 }
    if (m.status === 'approved') b.approved = Math.max(b.approved, m.specificity)
    else b.tentative = Math.max(b.tentative, m.specificity)
    best.set(m.topic_id, b)
  }
  const kept = matches.filter((m) => {
    if (!m.fits) return false
    const b = best.get(m.topic_id)!
    return m.status === 'approved' ? m.specificity === b.approved : m.specificity === b.tentative && b.tentative > b.approved
  })
  // Several replies for the same situation (learned in different chats): approved first, then the one used in the
  // most similar chat. Questions keep the matcher's order (best phrasing first).
  const ctx = (m: MatchRow) => m.context_similarity ?? -1
  const groups = new Map<string, MatchRow[]>()
  for (const m of kept) groups.set(m.topic_id, [...(groups.get(m.topic_id) ?? []), m])
  const out: MatchRow[] = []
  for (const list of groups.values()) {
    list.sort((a, b) => (a.status === b.status ? 0 : a.status === 'approved' ? -1 : 1) || ctx(b) - ctx(a))
    out.push(...list.slice(0, perQuestion))
  }
  return out
}

export interface StepOption { m: MatchRow; steps: string[] }

/**
 * The question's replies for the other steps the client could be at (alternativeSteps), for the approver to pick
 * from. Per step: the most specific reply for that step, approved before tentative, then the one used in the most
 * similar chat. When that reply also applies at the current step (the reply offered above, or one for any step), the
 * step has nothing different to offer and is left out: sending it would say nothing about the client's step. A step
 * whose most specific replies disagree offers nothing until the conflict is resolved. Outdated-only replies and
 * (before verification on our sell orders) replies that ask the client to pay never count. A reply that is the best
 * for two steps is offered once, for both. Steps with no reply of their own come back in `open`, for a one-tap switch.
 */
export function stepOptions(entries: MatchRow[], steps: string[], order: OrderFit, shown: Set<string>, current: string | null): { options: StepOption[]; open: string[] } {
  const options: StepOption[] = []
  const open: string[] = []
  const ctx = (m: MatchRow) => m.context_similarity ?? -1
  const alsoHere = (m: MatchRow) => shown.has(m.entry_id) || fitsOrder(m.scope, order, current)
  for (const step of steps) {
    const unsafe = (m: MatchRow) => beforeVerification(order.side as Side | null, step) && (invitesPayment(m.reply_en) || invitesPayment(m.reply_hi))
    const fitting = entries.filter((m) => usableReply(m) && fitsOrder(m.scope, order, step) && !unsafe(m))
    const top = fitting.reduce((n, m) => Math.max(n, stageDepth(m.scope, step)), -1)
    const disputed = fitting.filter((m) => m.conflict_open && stageDepth(m.scope, step) === top)
    if (disputed.length) { if (!disputed.some(alsoHere)) open.push(step); continue }
    const best = fitting.filter((m) => !m.conflict_open).sort((a, b) => stageDepth(b.scope, step) - stageDepth(a.scope, step)
      || (a.status === b.status ? 0 : a.status === 'approved' ? -1 : 1) || ctx(b) - ctx(a))[0]
    if (!best) { open.push(step); continue }
    if (alsoHere(best)) continue
    const same = options.find((o) => o.m.entry_id === best.entry_id)
    if (same) same.steps.push(step)
    else options.push({ m: best, steps: [step] })
  }
  return { options, open }
}

export interface TopicRank { topicId: string; title: string; similarity: number }

/** Every matched question with whether it has a reply for this side (or for any side), best first. */
function allTopics(matches: MatchRow[], side: Side | null): Array<TopicRank & { ok: boolean }> {
  const byTopic = new Map<string, TopicRank & { ok: boolean }>()
  for (const m of matches) {
    const ok = !(m.scope?.sides?.length) || (!!side && m.scope.sides.includes(side))
    const t = byTopic.get(m.topic_id) ?? { topicId: m.topic_id, title: m.title, similarity: m.similarity, ok: false }
    t.similarity = Math.max(t.similarity, m.similarity)
    t.ok = t.ok || ok
    byTopic.set(m.topic_id, t)
  }
  return [...byTopic.values()].sort((a, b) => b.similarity - a.similarity)
}

/** The matched questions that have a reply for this side (or for any side), best first. */
export function rankTopics(matches: MatchRow[], side: Side | null): TopicRank[] {
  return allTopics(matches, side).filter((t) => t.ok).map((t) => ({ topicId: t.topicId, title: t.title, similarity: t.similarity }))
}

/**
 * What the best question for this side must be clearly ahead of besides the next one for this side: the best question for
 * the other side (the message may be about something we don't answer on this side), and, when the lookup hit its limit,
 * the lowest score it returned (a question for this side may have been cut off just below it).
 */
export function rivals(matches: MatchRow[], side: Side | null, limit: number, minSimilarity: number): { otherSide: number | null; runnerUpCap: number } {
  const all = allTopics(matches, side)
  const other = all.filter((t) => !t.ok)
  return {
    otherSide: other.length ? other[0].similarity : null,
    runnerUpCap: all.length >= limit ? all[all.length - 1].similarity : minSimilarity,
  }
}

/**
 * How a question was recognised: by meaning (at the match threshold, clearly ahead), as a clear best match below the
 * threshold, or picked by the AI.
 */
export type PickedBy = 'meaning' | 'lead' | 'ai'

/**
 * The question the lookup is sure of without AI: the best one for this side when it scores at least 0.60 and is at least
 * 0.15 ahead of the next question, for this side or the other ('meaning' at the match threshold, 'lead' below it). Two
 * close questions, however high they score, are left to the AI.
 */
export function confidentTopics(
  ranked: TopicRank[], matchThreshold: number, r: { otherSide: number | null; runnerUpCap: number } = { otherSide: null, runnerUpCap: 0 },
): Map<string, PickedBy> {
  const out = new Map<string, PickedBy>()
  const [a, b] = ranked
  if (!a) return out
  const runnerUp = Math.max(b?.similarity ?? r.runnerUpCap, r.otherSide ?? -Infinity)
  if (a.similarity >= LEAD_FLOOR && a.similarity - runnerUp >= LEAD_MARGIN - 1e-9) {
    out.set(a.topicId, a.similarity >= matchThreshold ? 'meaning' : 'lead')
  }
  return out
}

/** When the AI cannot be asked (over the budget, it failed, or there is no real question): every question at the match threshold, as before CP-6. */
export function thresholdTopics(ranked: TopicRank[], matchThreshold: number): Map<string, PickedBy> {
  return new Map(ranked.filter((t) => t.similarity >= matchThreshold).map((t) => [t.topicId, 'meaning' as PickedBy]))
}

export interface RouteResult {
  /** picked: the AI is sure enough (high or medium); unsure: it named a question with low confidence; none: no question. */
  result: 'picked' | 'unsure' | 'none' | 'failed' | 'capped'
  topicId?: string
  title?: string
  confidence?: 'high' | 'medium' | 'low'
  reason?: string
}

/**
 * "AI picks, Playbook speaks": a small model reads the chat and chooses which of the candidate questions the client is
 * asking, or none. Masked text only; within the monthly cap; logged with its cost (as a "judge" call, variant "route").
 */
async function routeQuestion(
  deps: Deps, cfg: CopilotConfig, ctx: ChatContext, logBase: Record<string, unknown>, question: string,
  candidates: TopicRank[], matches: MatchRow[], replies: MatchRow[], spent: number, now: Date,
): Promise<{ route: RouteResult; cost: number }> {
  const { store, ai } = deps
  const lang = ctx.language.lang
  const recent = await store.questionsFor(candidates.map((c) => c.topicId))
  const list: Array<RouteCandidate & { topic: TopicRank }> = candidates.map((t, i) => {
    const wordings = [
      ...matches.filter((m) => m.topic_id === t.topicId).map((m) => m.question_text),
      ...recent.filter((q) => q.topic_id === t.topicId).map((q) => q.question_text),
    ].map((w) => maskPII(w).slice(0, 160)).filter((w) => w.trim())
    const reply = replies.find((m) => m.topic_id === t.topicId)
    const text = reply ? maskPII(pickText(reply, lang).text).slice(0, 220) : ''
    return { id: `Q${i + 1}`, title: t.title, wordings: [...new Set(wordings)].slice(0, 3), replyNow: text || null, topic: t }
  })
  const def = situationDef(ctx.situation.code)
  const { system, user } = buildRouteMessages({
    now: istLabel(now),
    order: {
      side: ctx.side ?? 'unknown', what_it_means: sideMeaning(ctx.side), status_means: statusMeaning(ctx.side, ctx.status),
      situation: def?.label ?? 'unknown', situation_means: def?.ai ?? 'Not known.',
    },
    chat: ctx.transcript.slice(-8).map((m) => ({
      from: m.who === 'client' ? 'client' : m.who === 'us' ? 'us' : m.who === 'auto' ? 'us (auto-reply)' : 'system',
      at: istLabel(m.at), text: maskPII(m.text).slice(0, 240),
    })),
    message: question,
    candidates: list.map(({ topic: _t, ...c }) => c),
  })
  const estimate = costInr(cfg.utility_model, { input: Math.ceil((system.length + user.length) / 3.5), output: 300, reasoning: 0, estimated: true }, cfg.model_prices, cfg.usd_inr)
  if (spent + estimate > Number(cfg.monthly_budget_inr)) return { route: { result: 'capped' }, cost: 0 }
  // A quick pick or none: drafting still has to follow within the request's waiting time.
  const r = await ai.chatJson(cfg.utility_model, system, user, routeSchema(list.map((c) => c.id)), { timeoutMs: 8_000 })
  const cost = costInr(cfg.utility_model, r.usage, cfg.model_prices, cfg.usd_inr)
  let route: RouteResult = { result: 'failed' }
  let error: string | null = r.ok ? null : (r.error ?? 'failed')
  if (r.ok) {
    const pick = r.data?.pick
    const hit = list.find((c) => c.id === pick)
    const confidence = (['high', 'medium', 'low'] as const).find((x) => x === r.data?.confidence)
    const reason = maskPII(String(r.data?.reason ?? '')).replace(/\s+/g, ' ').trim().slice(0, 120)
    if (pick === 'none') route = { result: 'none', reason }
    else if (hit) route = { result: confidence && confidence !== 'low' ? 'picked' : 'unsure', topicId: hit.topic.topicId, title: hit.topic.title, confidence: confidence ?? 'low', reason }
    // An answer outside the candidates is no answer: the old rule applies.
    else error = 'invalid_pick'
  }
  await store.logCall({
    ...logBase, purpose: 'judge', variant: 'route', model: cfg.utility_model, status: error ? 'error' : 'ok',
    input_tokens: r.usage.input, output_tokens: r.usage.output, reasoning_tokens: r.usage.reasoning, tokens_estimated: r.usage.estimated,
    cost_inr: cost, latency_ms: r.latencyMs,
    output_text: !error ? JSON.stringify({ result: route.result, topic: route.topicId ?? null, title: route.title ?? null, confidence: route.confidence ?? null, reason: route.reason ?? '' }).slice(0, 500) : null,
    error,
  })
  return { route, cost }
}

export async function handleDraft(deps: Deps, userId: string, input: DraftInput): Promise<Out> {
  const { store, ai } = deps
  const t0 = Date.now()
  const now = deps.now()
  const orderNumber = String(input?.orderNumber ?? '')
  if (!ORDER_RE.test(orderNumber)) return { status: 400, body: { error: 'invalid', field: 'orderNumber' } }
  const mode = input?.mode === 'redraft' || input?.mode === 'force' || input?.mode === 'context' ? input.mode : 'suggest'
  const accountHint = input?.exchangeAccountId && UUID_RE.test(String(input.exchangeAccountId)) ? String(input.exchangeAccountId) : null

  const cfg = await store.config()
  if (!cfg) return { status: 503, body: { error: 'not_configured' } }
  if (!(await store.isApprover(userId))) return { status: 403, body: { error: 'not_approver' } }

  const ctx = await buildChatContext(store, cfg, orderNumber, accountHint, input?.hint ?? null, now)
  const summary = contextSummary(ctx)
  const turn = ctx.turn
  const stage = ctx.situation.code
  if (mode === 'context' || (mode === 'suggest' && !turn)) {
    return { status: 200, body: { status: 'nothing_to_answer', context: summary, playbook: [], related: [], drafts: [], otherSituations: [], heldBack: [], alternatives: [], otherSteps: [] } }
  }

  // One automatic suggestion per chat state (latest client message, order status and situation), shared by both approvers.
  let requestId: string | null = null
  const stateKey = turn ? `${turn.lastId}|${ctx.status}|${stage ?? '-'}` : null
  const requestKey = mode === 'suggest' ? stateKey : null
  // Drafting again for the same chat state keeps the AI's answer for it (never paid twice).
  let priorRoute: RouteResult | null = null
  if (mode !== 'suggest' && stateKey) {
    const prev = await store.findSuggestRequest(orderNumber, stateKey)
    const r = prev?.result?.route
    if (r && (r.result === 'none' || r.result === 'unsure' || (r.result === 'picked' && typeof r.topicId === 'string'))) priorRoute = r as RouteResult
  }
  if (requestKey) {
    const existing = await store.findSuggestRequest(orderNumber, requestKey)
    if (existing) {
      const age = now.getTime() - new Date(existing.created_at).getTime()
      if (['ready', 'capped', 'skipped'].includes(existing.status) && existing.result) {
        const spent = await store.monthSpend()
        const purposes = new Set<ContactPurpose>((existing.result.contactPurposes ?? []) as ContactPurpose[])
        const { contacts, missing } = await contactsFor(store, purposes)
        // The suggestions are the cached ones (same message, status and situation); the order facts are today's
        // (deadlines, appeal case, client records).
        return { status: 200, body: { ...existing.result, context: summary, requestId: existing.id, cached: true, contacts, missingContacts: missing, budget: budgetInfo(cfg, spent) } }
      }
      // retryAfterMs: when this request may be taken over, so a waiting approver keeps asking until then.
      if (existing.status === 'pending' && age < PENDING_FRESH_MS) return { status: 202, body: { status: 'pending', requestId: existing.id, retryAfterMs: PENDING_FRESH_MS - Math.max(0, age) } }
      requestId = existing.id
      // Taking over a stale request restarts its clock, so the next approver waits for this one instead of paying again.
      await store.updateRequest(requestId, { status: 'pending', error: null, user_id: userId, created_at: now.toISOString() })
    } else {
      const ins = await store.insertRequest({
        user_id: userId, order_number: orderNumber, exchange_account_id: ctx.accountId, mode, request_key: requestKey, status: 'pending', context: summary,
      })
      if (ins.conflict) {
        const again = await store.findSuggestRequest(orderNumber, requestKey)
        return { status: 202, body: { status: 'pending', requestId: again?.id ?? null, retryAfterMs: PENDING_FRESH_MS } }
      }
      if (!ins.id) return { status: 500, body: { error: 'db_error' } }
      requestId = ins.id
    }
  } else {
    const ins = await store.insertRequest({ user_id: userId, order_number: orderNumber, exchange_account_id: ctx.accountId, mode, status: 'pending', context: summary })
    if (!ins.id) return { status: 500, body: { error: 'db_error' } }
    requestId = ins.id
  }

  const logBase = { request_id: requestId, user_id: userId, order_number: orderNumber, exchange_account_id: ctx.accountId }
  try {
    // ── Playbook lookup (no AI) ──
    const question = turn ? maskPII(turn.question) : ''
    const lastClientText = turn ? maskPII([...turn.messages].reverse().find((m) => m.kind === 'text')?.text ?? '') : ''
    const inputs = [...new Set([question, lastClientText].filter((s) => s.trim().length > 0))]
    let vectors: number[][] | null = null
    let contextVector: number[] | null = null
    if (inputs.length) {
      const embedLogged = async (texts: string[]) => {
        const e = await ai.embed(texts, cfg.embedding_model)
        await store.logCall({
          ...logBase, purpose: 'embed', model: cfg.embedding_model, status: e.vectors ? 'ok' : 'error',
          input_tokens: e.usage.input, output_tokens: 0, tokens_estimated: e.usage.estimated,
          cost_inr: costInr(cfg.embedding_model, e.usage, cfg.model_prices, cfg.usd_inr), latency_ms: e.latencyMs, error: e.error ?? null,
        })
        return e.vectors
      }
      // The chat before the question is embedded in the same call (to compare it with replies' example chats).
      // Phrasings and example chats that are not searchable yet are embedded alongside, in a separate call so a
      // failure there never costs this chat its lookup, and in parallel so it adds no waiting.
      const [pending, pendingEx] = await Promise.all([store.pendingQuestions(PENDING_EMBED_LIMIT), store.pendingExamples(PENDING_EMBED_LIMIT)])
      const own = ctx.contextText ? [...inputs, ctx.contextText] : inputs
      const extraTexts = [...pending.map((p) => maskPII(p.question_text)), ...pendingEx.map((x) => maskPII(x.context_text))]
      const [mine, extra] = await Promise.all([
        embedLogged(own),
        extraTexts.length ? embedLogged(extraTexts) : Promise.resolve(null),
      ])
      vectors = mine ? mine.slice(0, inputs.length) : null
      contextVector = mine && ctx.contextText ? mine[inputs.length] ?? null : null
      if (extra) {
        if (pending.length) await store.setQuestionEmbeddings(pending.map((p, i) => ({ id: p.id, v: extra[i] })), cfg.embedding_model)
        if (pendingEx.length) await store.setExampleEmbeddings(pendingEx.map((x, i) => ({ id: x.id, v: extra[pending.length + i] })), cfg.embedding_model)
      }
    }
    let matches: MatchRow[] = []
    if (vectors) {
      // Weaker matches come back too: the AI may pick among them; only those at the related threshold are shown as such.
      matches = await store.match({
        embeddings: vectors, side: ctx.side, category: ctx.category, accountId: ctx.accountId, status: ctx.status,
        clientState: ctx.clientState, stage, contextEmbedding: contextVector, includeTentative: true, includeConflicts: true,
        minSimilarity: Math.min(ROUTE_FLOOR, cfg.related_threshold), limit: MATCH_LIMIT,
      })
    }
    const lang = ctx.language.lang
    const order: OrderFit = { side: ctx.side, category: ctx.category, accountId: ctx.accountId, status: ctx.status, clientState: ctx.clientState }
    /** The reply applies to this order apart from its situations (side, size, account, status, client). */
    const fitsApartFromStep = (m: MatchRow) => fitsOrder({ ...m.scope, stages: [] }, order, stage)

    // A reply that asks the client to pay is never offered on our sell orders before KYC and verification are done,
    // whatever situations it was saved for.
    const replies = bestFitting(matches.filter(usableReply))
    const held: MatchRow[] = []
    const fittingAll = replies.filter((m) => {
      if (beforeVerification(ctx.side, stage) && (invitesPayment(m.reply_en) || invitesPayment(m.reply_hi))) { held.push(m); return false }
      return true
    })

    // ── Which question the client asked: by meaning, as a clear best match, or (when unsure) picked by the AI ──
    let spent = await store.monthSpend()
    const ranked = rankTopics(matches, ctx.side)
    const minSimilarity = Math.min(ROUTE_FLOOR, cfg.related_threshold)
    const rival = rivals(matches, ctx.side, MATCH_LIMIT, minSimilarity)
    const confident = new Map<string, PickedBy>(confidentTopics(ranked, cfg.match_threshold, rival))
    let route: RouteResult | null = null
    const texts = turn ? turn.messages.filter((m) => m.kind === 'text') : []
    const askable = texts.length > 0 && !texts.every((m) => isSmallTalk(m.text))
    const candidates = ranked.filter((t) => t.similarity >= ROUTE_FLOOR).slice(0, ROUTE_MAX)
    // Worth asking only if a pick could change something: a candidate with a reply for this order (now, or for another
    // step as background; never one for other clients, sizes, accounts or statuses). All candidates stay in the
    // question, so the AI can still say which one it really is.
    const usefulPick = candidates.some((t) => matches.some((m) => m.topic_id === t.topicId && usableReply(m) && (m.fits || (scopeStages(m.scope).length > 0 && fitsApartFromStep(m)))))
    if (!confident.size) {
      if (askable && candidates.length && usefulPick) {
        if (mode === 'suggest') {
          // The AI sees each question's reply for this step as offered (a reply held back before verification is not).
          // Whatever happens to the pick, drafting goes on.
          let r: { route: RouteResult; cost: number }
          try {
            r = await routeQuestion(deps, cfg, ctx, logBase, question, candidates, matches, fittingAll, spent, now)
          } catch (e) {
            console.error(JSON.stringify({ fn: 'copilot-draft', outcome: 'route_failed', error: String((e as Error)?.message ?? e).slice(0, 120) }))
            r = { route: { result: 'failed' }, cost: 0 }
          }
          route = r.route
          spent += r.cost
        } else if (priorRoute && (priorRoute.result !== 'picked' || candidates.some((c) => c.topicId === priorRoute!.topicId))) {
          route = priorRoute
        }
      }
      // The AI's pick is shown first; its "none" or "unsure" stands. Without an answer from it, the old rule applies.
      if (route?.result === 'picked' && route.topicId) confident.set(route.topicId, 'ai')
      else if (!route || route.result === 'failed' || route.result === 'capped') for (const [k, v] of thresholdTopics(ranked, cfg.match_threshold)) confident.set(k, v)
    }
    const isConfident = (topicId: string) => confident.has(topicId)
    const shown = (m: MatchRow) => isConfident(m.topic_id) || m.similarity >= cfg.related_threshold

    const heldBack = held.filter(shown).map((m) => ({ entryId: m.entry_id, title: m.title, reason: 'It asks the client to pay, and this client is not verified yet.' }))
    const fitting = fittingAll.filter(shown)
    const strong = fitting.filter((m) => isConfident(m.topic_id))
    const related = fitting.filter((m) => !isConfident(m.topic_id))
    const playbook = strong.map((m) => {
      const by = confident.get(m.topic_id)
      return by && by !== 'meaning' ? { ...playbookItem(m, lang, ctx.address), pickedBy: by } : playbookItem(m, lang, ctx.address)
    })
    const relatedItems = related.map((m) => playbookItem(m, lang, ctx.address))
    const leadTopic = [...confident].find(([, by]) => by === 'lead')?.[0] ?? null
    // next: the closest other question, for this side or the other (what the lead was measured against).
    const nextScore = Math.max(ranked[1]?.similarity ?? -1, rival.otherSide ?? -1)
    const lead = leadTopic ? { topicId: leadTopic, similarity: ranked[0].similarity, next: nextScore >= 0 ? nextScore : null } : null

    // The question is known but has no reply for this situation: say so, and give the AI those answers as background
    // (only replies that would apply to this order in another situation).
    const fitTopics = new Set(fitting.map((m) => m.topic_id))
    const heldTopics = new Set(held.map((m) => m.topic_id))
    const otherByTopic = new Map<string, { topicId: string; title: string; similarity: number; situations: string[]; answers: MatchRow[] }>()
    for (const m of matches) {
      if (fitTopics.has(m.topic_id) || heldTopics.has(m.topic_id) || m.fits || !fitsApartFromStep(m) || !isConfident(m.topic_id) || m.conflict_open || !usableReply(m)) continue
      const cur = otherByTopic.get(m.topic_id) ?? { topicId: m.topic_id, title: m.title, similarity: m.similarity, situations: [], answers: [] }
      for (const l of situationLabels(m)) if (!cur.situations.includes(l)) cur.situations.push(l)
      cur.answers.push(m)
      otherByTopic.set(m.topic_id, cur)
    }
    const otherSituations = [...otherByTopic.values()].filter((o) => o.situations.length > 0)

    // ── Other steps the client could be at. KYC happens outside the chat, so a step worked out from our messages is a
    // best guess: the question's replies for the neighbouring steps are offered too, and the approver picks. ──
    const steps = alternativeSteps(ctx.side, ctx.situation, ctx.clientState)
    // The question the client asked: the one whose reply is shown, else the best match whose reply for this step was
    // held back or that has replies only for other steps.
    const mainTopic = strong[0]?.topic_id
      ?? matches.find((m) => isConfident(m.topic_id) && (heldTopics.has(m.topic_id) || otherSituations.some((o) => o.topicId === m.topic_id)))?.topic_id
      ?? null
    const picked = stepOptions(mainTopic ? matches.filter((m) => m.topic_id === mainTopic) : [], steps, order, new Set(strong.map((m) => m.entry_id)), stage)
    // What the chat will show once the reply is sent (the chat alone, as the detector reads it). The step to set is that
    // one when it is one of the reply's steps. A reply that would itself end KYC before verification is never offered.
    const lastAt = ctx.transcript.reduce((n, m) => Math.max(n, m.at), 0)
    const sentAt = Math.max(now.getTime(), lastAt + 1)
    const afterSending = (text: string) => detectSituation(ctx.side, ctx.status,
      [...ctx.transcript, { id: 'copilot-step-check', at: sentAt, who: 'us', kind: 'text', text }], sentAt, ctx.signals).code
    const open = [...picked.open]
    const alternatives = picked.options.flatMap((o) => {
      const item = playbookItem(o.m, lang, ctx.address)
      const next = afterSending(item.text)
      if (beforeVerification(ctx.side, ctx.situation.detectedCode) && !beforeVerification(ctx.side, next)) {
        for (const c of o.steps) if (!open.includes(c)) open.push(c)
        return []
      }
      const stepsFirst = next && o.steps.includes(next) ? [next, ...o.steps.filter((c) => c !== next)] : o.steps
      return [{ ...item, steps: stepsFirst, stepLabels: stepsFirst.map((c) => situationDef(c)?.label ?? c) }]
    })
    const otherSteps = open.map((c) => ({ code: c, label: situationDef(c)?.label ?? c }))

    const approvedFits = strong.some((m) => m.status === 'approved' && !m.conflict_open)
    const conflictFits = strong.some((m) => m.conflict_open)
    const needAi = mode !== 'suggest' || (!approvedFits && !conflictFits)

    // ── AI drafts (only when needed, within the monthly cap) ──
    let status: 'ready' | 'capped' = 'ready'
    const drafts: any[] = []
    let aiFailed = 0
    const aiPickedFits = strong.some((m) => m.status === 'approved' && !m.conflict_open && confident.get(m.topic_id) === 'ai')
    let skippedReason: string | null = needAi ? null : approvedFits ? (aiPickedFits ? 'ai_picked_reply' : 'approved_reply_found') : 'conflict_found'
    if (needAi) {
      const avoid = vectors ? await store.rejections(vectors[0], 0.75, 3) : []
      const custom = input?.instruction && !INSTRUCTIONS[input.instruction] ? maskPII(String(input.instruction)).slice(0, 200) : null
      const instruction = input?.instruction ? (INSTRUCTIONS[input.instruction] ?? custom) : null
      const forcedLang = input?.instruction === 'hindi' ? 'hi' : input?.instruction === 'english' ? 'en' : lang
      const answerText = (m: MatchRow) => pickText(m, forcedLang).text
      const teams = await store.teams()
      const { system, user } = buildDraftMessages({
        houseStyle: cfg.house_style,
        lang: forcedLang,
        address: ctx.address,
        greet: ctx.greet,
        order: orderFacts(ctx, now.getTime()),
        client: ctx.clientFacts,
        approved: fitting.map((m) => ({
          title: m.title, status: m.status, similarity: m.similarity, examples: [maskPII(m.question_text)], answer: answerText(m),
        })),
        otherSituations: otherSituations.flatMap((o) => o.answers.slice(0, 2).map((m) => ({ title: o.title, situations: situationLabels(m), answer: answerText(m) }))).slice(0, 3),
        avoid: avoid.map((a) => ({ draft: maskPII(a.draft_text), why: a.reason ?? 'not given' })),
        chat: ctx.transcript.slice(-24).map((m) => ({
          from: m.who === 'client' ? 'client' : m.who === 'us' ? 'us' : m.who === 'auto' ? 'us (auto-reply)' : 'system',
          at: istLabel(m.at), text: maskPII(m.text).slice(0, 700),
        })),
        answerThis: question || null,
        instruction,
        risks: ctx.risks,
        now: istLabel(now),
        teams,
      })
      const models = (cfg.draft_models ?? []).slice(0, 2)
      const estimate = models.reduce((n, m) => n + costInr(m, { input: Math.ceil((system.length + user.length) / 3.5), output: 600, reasoning: 0, estimated: true }, cfg.model_prices, cfg.usd_inr), 0)
      if (spent + estimate > Number(cfg.monthly_budget_inr)) {
        status = 'capped'
        skippedReason = 'monthly_cap'
      } else {
        const results = await Promise.all(models.map((m) => ai.chatJson(m, system, user, DRAFT_SCHEMA, { timeoutMs: 40_000 })))
        for (let i = 0; i < results.length; i++) {
          const r = results[i]
          const model = models[i]
          const cost = costInr(model, r.usage, cfg.model_prices, cfg.usd_inr)
          spent += cost
          if (!r.ok) {
            aiFailed++
            await store.logCall({
              ...logBase, purpose: mode === 'redraft' ? 'redraft' : 'draft', model, variant: LABELS[i], status: 'error',
              input_tokens: r.usage.input, output_tokens: r.usage.output, reasoning_tokens: r.usage.reasoning, tokens_estimated: r.usage.estimated,
              cost_inr: cost, latency_ms: r.latencyMs, error: r.error ?? 'failed',
            })
            continue
          }
          const g = guardDraft(String(r.data?.reply ?? ''), { side: ctx.side, situation: stage })
          const callId = await store.logCall({
            ...logBase, purpose: mode === 'redraft' ? 'redraft' : 'draft', model, variant: LABELS[i], status: g.blocked ? 'blocked' : 'ok',
            input_tokens: r.usage.input, output_tokens: r.usage.output, reasoning_tokens: r.usage.reasoning, tokens_estimated: r.usage.estimated,
            cost_inr: cost, latency_ms: r.latencyMs, output_text: maskPII(g.text), new_policy: r.data?.new_policy === true,
            guardrail_flags: g.flags.length ? g.flags : null,
          })
          drafts.push({
            callId, model, label: LABELS[i], text: g.text, newPolicy: r.data?.new_policy === true,
            note: String(r.data?.note ?? '').slice(0, 140), flags: g.flags, blocked: g.blocked, blockedReasons: g.reasons,
            contacts: g.contacts, language: detectLang(g.text) === 'hi' ? 'hi' : 'en',
          })
        }
      }
    }

    const purposes = new Set<ContactPurpose>()
    for (const d of drafts) for (const p of d.contacts as ContactPurpose[]) purposes.add(p)
    for (const p of [...playbook, ...relatedItems, ...alternatives]) for (const c of contactCodes(p.text)) purposes.add(c)
    const { contacts, missing } = await contactsFor(store, purposes)

    const result = {
      status, skippedReason, context: summary,
      question: question ? { text: question, language: detectLang(question) === 'hi' ? 'hi' : 'en' } : null,
      playbook, related: relatedItems, drafts, contactPurposes: [...purposes],
      otherSituations: otherSituations.map((o) => ({ topicId: o.topicId, title: o.title, similarity: Math.round(o.similarity * 1000) / 1000, situations: o.situations })),
      heldBack,
      alternatives, otherSteps,
      // How the question was recognised when it was not by meaning alone: the AI's pick, or a clear best match.
      route: route ? { result: route.result, topicId: route.topicId ?? null, title: route.title ?? null, confidence: route.confidence ?? null, reason: route.reason ?? null } : null,
      lead: lead ? { topicId: lead.topicId, similarity: Math.round(lead.similarity * 1000) / 1000, next: lead.next === null ? null : Math.round(lead.next * 1000) / 1000 } : null,
      aiAvailable: status !== 'capped', aiFailed,
    }
    await store.updateRequest(requestId!, {
      status, question_text: question || null, question_language: question ? (detectLang(question) === 'hi' ? 'hi' : 'en') : null,
      question_embedding: vectors ? vectors[0] : null,
      context_embedding: contextVector,
      context: { ...summary, inputs, chat_tail: chatTail(ctx.transcript), chat_before: ctx.before, context_text: ctx.contextText },
      // picked_by: how the question was recognised (meaning, lead or ai), kept for the scorecard.
      matches: matches.map((m) => ({
        entry_id: m.entry_id, topic_id: m.topic_id, similarity: m.similarity, status: m.status, conflict: m.conflict_open,
        fits: m.fits, input_index: m.input_index, context_similarity: m.context_similarity, picked_by: confident.get(m.topic_id) ?? null,
      })),
      top_entry_id: fitting[0]?.entry_id ?? matches.find(shown)?.entry_id ?? null, top_similarity: fitting[0]?.similarity ?? matches.find(shown)?.similarity ?? null,
      result, latency_ms: Date.now() - t0,
    })
    console.log(JSON.stringify({ fn: 'copilot-draft', outcome: status, mode, situation: stage, drafts: drafts.length, playbook: playbook.length, route: route?.result ?? null, lead: !!lead, ms: Date.now() - t0 }))
    return { status: 200, body: { ...result, requestId, cached: false, contacts, missingContacts: missing, budget: budgetInfo(cfg, spent) } }
  } catch (e) {
    await store.updateRequest(requestId!, { status: 'error', error: String((e as Error)?.message ?? e).slice(0, 300), latency_ms: Date.now() - t0 })
    console.error(JSON.stringify({ fn: 'copilot-draft', outcome: 'error', ms: Date.now() - t0 }))
    return { status: 500, body: { error: 'draft_failed', requestId } }
  }
}
