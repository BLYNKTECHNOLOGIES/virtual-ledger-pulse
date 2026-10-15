// deno-lint-ignore-file no-explicit-any
// Copilot v2 draft engine. For one order chat that an approver has open:
// 1) builds the context on the server, including the chat's situation (what the client is waiting for),
// 2) looks for approved Playbook replies for that question and situation (no AI),
// 3) only if none fits (or the approver asks), drafts fresh replies with the configured models,
// 4) runs the safety checks, logs tokens and ₹, and caches the result so a chat state never pays twice.
// Nothing is sent to the client from here.
import {
  applyAddress, buildDraftMessages, chatTail, contactCodes, costInr, detectLang, DRAFT_SCHEMA, guardDraft, INSTRUCTIONS, istLabel, maskPII,
  type ContactPurpose,
} from '../_shared/copilot-playbook.ts'
import { buildChatContext, contextSummary, orderFacts, type OrderHint } from '../_shared/copilot-context.ts'
import { beforeVerification, invitesPayment, situationDef } from '../_shared/copilot-situation.ts'
import type { CopilotConfig, MatchRow, Store } from '../_shared/copilot-store.ts'
import type { Ai } from '../_shared/copilot-ai.ts'

export interface DraftInput {
  orderNumber: string
  exchangeAccountId?: string | null
  mode?: 'suggest' | 'redraft' | 'force'
  instruction?: string | null
  hint?: OrderHint | null
}
export interface Deps { store: Store; ai: Ai; now: () => Date }
export interface Out { status: number; body: any }

const ORDER_RE = /^[0-9A-Za-z_-]{6,40}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PENDING_FRESH_MS = 45_000
const PENDING_EMBED_LIMIT = 50
const LABELS = ['A', 'B']

const stagesOf = (m: Pick<MatchRow, 'scope'>): string[] => (Array.isArray(m.scope?.stages) ? m.scope.stages : [])
const situationLabels = (m: Pick<MatchRow, 'scope'>) => stagesOf(m).map((c) => situationDef(c)?.label ?? c)

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

export async function handleDraft(deps: Deps, userId: string, input: DraftInput): Promise<Out> {
  const { store, ai } = deps
  const t0 = Date.now()
  const now = deps.now()
  const orderNumber = String(input?.orderNumber ?? '')
  if (!ORDER_RE.test(orderNumber)) return { status: 400, body: { error: 'invalid', field: 'orderNumber' } }
  const mode = input?.mode === 'redraft' || input?.mode === 'force' ? input.mode : 'suggest'
  const accountHint = input?.exchangeAccountId && UUID_RE.test(String(input.exchangeAccountId)) ? String(input.exchangeAccountId) : null

  const cfg = await store.config()
  if (!cfg) return { status: 503, body: { error: 'not_configured' } }
  if (!(await store.isApprover(userId))) return { status: 403, body: { error: 'not_approver' } }

  const ctx = await buildChatContext(store, cfg, orderNumber, accountHint, input?.hint ?? null, now)
  const summary = contextSummary(ctx)
  const turn = ctx.turn
  const stage = ctx.situation.code
  if (mode === 'suggest' && !turn) {
    return { status: 200, body: { status: 'nothing_to_answer', context: summary, playbook: [], related: [], drafts: [], otherSituations: [], heldBack: [] } }
  }

  // One automatic suggestion per chat state (latest client message, order status and situation), shared by both approvers.
  let requestId: string | null = null
  const requestKey = mode === 'suggest' && turn ? `${turn.lastId}|${ctx.status}|${stage ?? '-'}` : null
  if (requestKey) {
    const existing = await store.findSuggestRequest(orderNumber, requestKey)
    if (existing) {
      const age = now.getTime() - new Date(existing.created_at).getTime()
      if (['ready', 'capped', 'skipped'].includes(existing.status) && existing.result) {
        const spent = await store.monthSpend()
        const purposes = new Set<ContactPurpose>((existing.result.contactPurposes ?? []) as ContactPurpose[])
        const { contacts, missing } = await contactsFor(store, purposes)
        return { status: 200, body: { ...existing.result, requestId: existing.id, cached: true, contacts, missingContacts: missing, budget: budgetInfo(cfg, spent) } }
      }
      if (existing.status === 'pending' && age < PENDING_FRESH_MS) return { status: 202, body: { status: 'pending', requestId: existing.id } }
      requestId = existing.id
      await store.updateRequest(requestId, { status: 'pending', error: null, user_id: userId })
    } else {
      const ins = await store.insertRequest({
        user_id: userId, order_number: orderNumber, exchange_account_id: ctx.accountId, mode, request_key: requestKey, status: 'pending', context: summary,
      })
      if (ins.conflict) {
        const again = await store.findSuggestRequest(orderNumber, requestKey)
        return { status: 202, body: { status: 'pending', requestId: again?.id ?? null } }
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
      matches = await store.match({
        embeddings: vectors, side: ctx.side, category: ctx.category, accountId: ctx.accountId, status: ctx.status,
        clientState: ctx.clientState, stage, contextEmbedding: contextVector, includeTentative: true, includeConflicts: true,
        minSimilarity: cfg.related_threshold, limit: 6,
      })
    }
    const lang = ctx.language.lang

    // A reply that asks the client to pay is never offered on our sell orders before KYC and verification are done,
    // whatever situations it was saved for.
    const heldBack: Array<{ entryId: string; title: string; reason: string }> = []
    const fitting = bestFitting(matches.filter(usableReply)).filter((m) => {
      if (beforeVerification(ctx.side, stage) && (invitesPayment(m.reply_en) || invitesPayment(m.reply_hi))) {
        heldBack.push({ entryId: m.entry_id, title: m.title, reason: 'It asks the client to pay, and this client is not verified yet.' })
        return false
      }
      return true
    })
    const strong = fitting.filter((m) => m.similarity >= cfg.match_threshold)
    const related = fitting.filter((m) => m.similarity < cfg.match_threshold)
    const playbook = strong.map((m) => playbookItem(m, lang, ctx.address))
    const relatedItems = related.map((m) => playbookItem(m, lang, ctx.address))

    // The question is known but has no reply for this situation: say so, and give the AI those answers as background.
    const fitTopics = new Set(fitting.map((m) => m.topic_id))
    const heldTopics = new Set(matches.filter((m) => heldBack.some((h) => h.entryId === m.entry_id)).map((m) => m.topic_id))
    const sideOk = (m: MatchRow) => !(m.scope?.sides?.length) || (!!ctx.side && m.scope.sides.includes(ctx.side))
    const otherByTopic = new Map<string, { topicId: string; title: string; similarity: number; situations: string[]; answers: MatchRow[] }>()
    for (const m of matches) {
      if (fitTopics.has(m.topic_id) || heldTopics.has(m.topic_id) || m.fits || !sideOk(m) || m.similarity < cfg.match_threshold || m.conflict_open || !usableReply(m)) continue
      const cur = otherByTopic.get(m.topic_id) ?? { topicId: m.topic_id, title: m.title, similarity: m.similarity, situations: [], answers: [] }
      for (const l of situationLabels(m)) if (!cur.situations.includes(l)) cur.situations.push(l)
      cur.answers.push(m)
      otherByTopic.set(m.topic_id, cur)
    }
    const otherSituations = [...otherByTopic.values()].filter((o) => o.situations.length > 0)

    const approvedFits = strong.some((m) => m.status === 'approved' && !m.conflict_open)
    const conflictFits = strong.some((m) => m.conflict_open)
    const needAi = mode !== 'suggest' || (!approvedFits && !conflictFits)

    // ── AI drafts (only when needed, within the monthly cap) ──
    let spent = await store.monthSpend()
    let status: 'ready' | 'capped' = 'ready'
    const drafts: any[] = []
    let aiFailed = 0
    let skippedReason: string | null = needAi ? null : (approvedFits ? 'approved_reply_found' : 'conflict_found')
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
        order: orderFacts(ctx),
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
    for (const p of [...playbook, ...relatedItems]) for (const c of contactCodes(p.text)) purposes.add(c)
    const { contacts, missing } = await contactsFor(store, purposes)

    const result = {
      status, skippedReason, context: summary,
      question: question ? { text: question, language: detectLang(question) === 'hi' ? 'hi' : 'en' } : null,
      playbook, related: relatedItems, drafts, contactPurposes: [...purposes],
      otherSituations: otherSituations.map((o) => ({ topicId: o.topicId, title: o.title, similarity: Math.round(o.similarity * 1000) / 1000, situations: o.situations })),
      heldBack,
      aiAvailable: status !== 'capped', aiFailed,
    }
    await store.updateRequest(requestId!, {
      status, question_text: question || null, question_language: question ? (detectLang(question) === 'hi' ? 'hi' : 'en') : null,
      question_embedding: vectors ? vectors[0] : null,
      context_embedding: contextVector,
      context: { ...summary, inputs, chat_tail: chatTail(ctx.transcript), chat_before: ctx.before, context_text: ctx.contextText },
      matches: matches.map((m) => ({
        entry_id: m.entry_id, topic_id: m.topic_id, similarity: m.similarity, status: m.status, conflict: m.conflict_open,
        fits: m.fits, input_index: m.input_index, context_similarity: m.context_similarity,
      })),
      top_entry_id: fitting[0]?.entry_id ?? matches[0]?.entry_id ?? null, top_similarity: fitting[0]?.similarity ?? matches[0]?.similarity ?? null,
      result, latency_ms: Date.now() - t0,
    })
    console.log(JSON.stringify({ fn: 'copilot-draft', outcome: status, mode, situation: stage, drafts: drafts.length, playbook: playbook.length, ms: Date.now() - t0 }))
    return { status: 200, body: { ...result, requestId, cached: false, contacts, missingContacts: missing, budget: budgetInfo(cfg, spent) } }
  } catch (e) {
    await store.updateRequest(requestId!, { status: 'error', error: String((e as Error)?.message ?? e).slice(0, 300), latency_ms: Date.now() - t0 })
    console.error(JSON.stringify({ fn: 'copilot-draft', outcome: 'error', ms: Date.now() - t0 }))
    return { status: 500, body: { error: 'draft_failed', requestId } }
  }
}
