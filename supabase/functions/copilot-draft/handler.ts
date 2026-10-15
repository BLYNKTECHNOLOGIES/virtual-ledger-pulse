// deno-lint-ignore-file no-explicit-any
// Copilot v2 draft engine. For one order chat that an approver has open:
// 1) builds the context on the server, 2) looks for approved Playbook replies (no AI),
// 3) only if none fits (or the approver asks), drafts fresh replies with the configured models,
// 4) runs the safety checks, logs tokens and ₹, and caches the result so a chat state never pays twice.
// Nothing is sent to the client from here.
import {
  applyAddress, buildDraftMessages, costInr, detectLang, DRAFT_SCHEMA, guardDraft, INSTRUCTIONS, istLabel, maskPII,
  type ContactPurpose,
} from '../_shared/copilot-playbook.ts'
import { buildChatContext, contextSummary, orderFacts, type OrderHint } from '../_shared/copilot-context.ts'
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
const LABELS = ['A', 'B']

function playbookItem(m: MatchRow, lang: 'en' | 'hi', address: 'sir' | 'maam') {
  const own = lang === 'hi' ? m.reply_hi : m.reply_en
  const text = own ?? (lang === 'hi' ? m.reply_en : m.reply_hi) ?? ''
  return {
    entryId: m.entry_id,
    title: m.title,
    status: m.status,
    conflict: m.conflict_open,
    similarity: Math.round(m.similarity * 1000) / 1000,
    text: applyAddress(text, address),
    language: own ? lang : lang === 'hi' ? 'en' : 'hi',
    machineTranslated: own ? (lang === 'hi' ? m.reply_hi_auto : m.reply_en_auto) : false,
    missingLanguage: !own,
    risk: m.risk,
    note: m.internal_note,
    version: m.version,
  }
}

async function contactsFor(store: Store, purposes: Set<ContactPurpose>) {
  if (!purposes.size) return { contacts: {}, missing: [] as string[] }
  const rows = await store.contacts([...purposes])
  const contacts: Record<string, { name: string; phone: string; availableNow: boolean }> = {}
  const missing: string[] = []
  for (const p of purposes) {
    const list = rows.filter((r) => r.purpose === p)
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
  if (mode === 'suggest' && !turn) {
    return { status: 200, body: { status: 'nothing_to_answer', context: summary, playbook: [], related: [], drafts: [] } }
  }

  // One automatic suggestion per chat state (latest client message + order status), shared by both approvers.
  let requestId: string | null = null
  const requestKey = mode === 'suggest' && turn ? `${turn.lastId}|${ctx.status}` : null
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
    if (inputs.length) {
      const e = await ai.embed(inputs, cfg.embedding_model)
      await store.logCall({
        ...logBase, purpose: 'embed', model: cfg.embedding_model, status: e.vectors ? 'ok' : 'error',
        input_tokens: e.usage.input, output_tokens: 0, tokens_estimated: e.usage.estimated,
        cost_inr: costInr(cfg.embedding_model, e.usage, cfg.model_prices, cfg.usd_inr), latency_ms: e.latencyMs, error: e.error ?? null,
      })
      vectors = e.vectors
    }
    let matches: MatchRow[] = []
    if (vectors) {
      matches = await store.match({
        embeddings: vectors, side: ctx.side, category: ctx.category, accountId: ctx.accountId, status: ctx.status,
        clientState: ctx.clientState, includeTentative: true, includeConflicts: true, minSimilarity: cfg.related_threshold, limit: 6,
      })
    }
    const strong = matches.filter((m) => m.similarity >= cfg.match_threshold)
    const related = matches.filter((m) => m.similarity < cfg.match_threshold)
    const lang = ctx.language.lang
    const playbook = strong.map((m) => playbookItem(m, lang, ctx.address))
    const relatedItems = related.map((m) => playbookItem(m, lang, ctx.address))
    const approvedFits = strong.some((m) => m.status === 'approved' && !m.conflict_open)
    const conflictFits = strong.some((m) => m.conflict_open)
    const needAi = mode !== 'suggest' || (!approvedFits && !conflictFits)

    // ── AI drafts (only when needed, within the monthly cap) ──
    let spent = await store.monthSpend()
    let status: 'ready' | 'capped' = 'ready'
    const drafts: any[] = []
    let skippedReason: string | null = needAi ? null : (approvedFits ? 'approved_reply_found' : 'conflict_found')
    if (needAi) {
      const avoid = vectors ? await store.rejections(vectors[0], 0.75, 3) : []
      const custom = input?.instruction && !INSTRUCTIONS[input.instruction] ? maskPII(String(input.instruction)).slice(0, 200) : null
      const instruction = input?.instruction ? (INSTRUCTIONS[input.instruction] ?? custom) : null
      const forcedLang = input?.instruction === 'hindi' ? 'hi' : input?.instruction === 'english' ? 'en' : lang
      const { system, user } = buildDraftMessages({
        houseStyle: cfg.house_style,
        lang: forcedLang,
        address: ctx.address,
        greet: ctx.greet,
        order: orderFacts(ctx),
        client: ctx.clientFacts,
        approved: matches.map((m) => ({
          title: m.title, status: m.status, similarity: m.similarity, examples: [maskPII(m.question_text)],
          answer: (forcedLang === 'hi' ? (m.reply_hi ?? m.reply_en) : (m.reply_en ?? m.reply_hi)) ?? '',
        })),
        avoid: avoid.map((a) => ({ draft: maskPII(a.draft_text), why: a.reason ?? 'not given' })),
        chat: ctx.transcript.slice(-24).map((m) => ({
          from: m.who === 'client' ? 'client' : m.who === 'us' ? 'us' : m.who === 'auto' ? 'us (auto-reply)' : 'system',
          at: istLabel(m.at), text: maskPII(m.text).slice(0, 700),
        })),
        answerThis: question || null,
        instruction,
        risks: ctx.risks,
        now: istLabel(now),
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
            await store.logCall({
              ...logBase, purpose: mode === 'redraft' ? 'redraft' : 'draft', model, variant: LABELS[i], status: 'error',
              input_tokens: r.usage.input, output_tokens: r.usage.output, reasoning_tokens: r.usage.reasoning, tokens_estimated: r.usage.estimated,
              cost_inr: cost, latency_ms: r.latencyMs, error: r.error ?? 'failed',
            })
            continue
          }
          const g = guardDraft(String(r.data?.reply ?? ''))
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
    for (const p of [...playbook, ...relatedItems]) for (const c of ['rm', 'kyc', 'support'] as ContactPurpose[]) if (p.text.includes(`{contact:${c}}`)) purposes.add(c)
    const { contacts, missing } = await contactsFor(store, purposes)

    const result = {
      status, skippedReason, context: summary,
      question: question ? { text: question, language: detectLang(question) === 'hi' ? 'hi' : 'en' } : null,
      playbook, related: relatedItems, drafts, contactPurposes: [...purposes],
      aiAvailable: status !== 'capped',
    }
    await store.updateRequest(requestId!, {
      status, question_text: question || null, question_language: question ? (detectLang(question) === 'hi' ? 'hi' : 'en') : null,
      question_embedding: vectors ? vectors[0] : null,
      matches: matches.map((m) => ({ entry_id: m.entry_id, similarity: m.similarity, status: m.status, conflict: m.conflict_open })),
      top_entry_id: matches[0]?.entry_id ?? null, top_similarity: matches[0]?.similarity ?? null,
      result, latency_ms: Date.now() - t0,
    })
    console.log(JSON.stringify({ fn: 'copilot-draft', outcome: status, mode, drafts: drafts.length, playbook: playbook.length, ms: Date.now() - t0 }))
    return { status: 200, body: { ...result, requestId, cached: false, contacts, missingContacts: missing, budget: budgetInfo(cfg, spent) } }
  } catch (e) {
    await store.updateRequest(requestId!, { status: 'error', error: String((e as Error)?.message ?? e).slice(0, 300), latency_ms: Date.now() - t0 })
    console.error(JSON.stringify({ fn: 'copilot-draft', outcome: 'error', ms: Date.now() - t0 }))
    return { status: 500, body: { error: 'draft_failed', requestId } }
  }
}
