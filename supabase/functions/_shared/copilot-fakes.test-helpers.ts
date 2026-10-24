// deno-lint-ignore-file no-explicit-any
// In-memory Store and AI fakes for the Copilot handler tests (not deployed with any function).
import type { ChatRow } from './copilot-playbook.ts'
import type { AppealCase, ContactPick, CopilotConfig, Example, InboxItem, MatchArgs, MatchRow, RephraseCall, RequestRow, Store, Team } from './copilot-store.ts'
import type { Mark } from './copilot-situation.ts'
import type { StepEntry } from './copilot-steps.ts'
import type { Ai, ChatOpts, ChatResult, EmbedResult } from './copilot-ai.ts'

export const SHUBHAM = 'd1a85fd5-f5a8-47af-ae42-e0b4683d82c9'
export const OPERATOR = '699c8623-8d56-49a9-ba53-4a572649497c'
export const BLYNK = '00000000-0000-0000-0000-000000000001'

export function config(over: Partial<CopilotConfig> = {}): CopilotConfig {
  return {
    approver_ids: [SHUBHAM], operators_enabled: false, draft_models: ['openai/gpt-6-astra', 'google/gemini-4-argon'],
    utility_model: 'google/gemini-3-flash-preview', embedding_model: 'openai/text-embedding-3-small', monthly_budget_inr: 25000,
    budget_alert_pcts: [50, 80], usd_inr: 88, hindi_switch_after: 2, match_threshold: 0.78, related_threshold: 0.55, learn_threshold: 0.5,
    tentative_days: 60, house_style: 'House style.', rephrase_user_ids: [OPERATOR], rephrase_auto: true, rephrase_daily_limit: 200,
    rephrase_model: 'google/gemini-3-flash-preview',
    model_prices: { 'openai/gpt-6-astra': { in: 10, out: 50 }, 'google/gemini-4-argon': { in: 2, out: 10 }, 'google/gemini-3-flash-preview': { in: 0.5, out: 3 }, 'openai/text-embedding-3-small': { in: 0.02, out: 0 } },
    ...over,
  }
}

let seq = 0
export const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

export class FakeStore implements Store {
  cfg: CopilotConfig | null = config()
  approvers = new Set([SHUBHAM])
  // A stored sell order from an ad without Binance's extra KYC (its field 0), unless a test says otherwise.
  orderRow: any = { order_number: '22944071217231917056', trade_type: 'SELL', order_status: 'TRADING', total_price: '4500', asset: 'USDT', pay_method_name: 'UPI', exchange_account_id: BLYNK, has_active_complaint: false, kyc_raw: '0' }
  rows: ChatRow[] = []
  panel: any = { status: 'linked', client: { kyc_status: 'VERIFIED', buyer_status: 'APPROVED' }, documents: { aadhaar: true } }
  spend = 0
  matchRows: MatchRow[] = []
  matchCalls: MatchArgs[] = []
  rejectionRows: Array<{ draft_text: string; reason: string | null }> = []
  contactRows: ContactPick[] = []
  phones: Array<{ purpose: string; phone: string }> = []
  requests = new Map<string, RequestRow>()
  calls: any[] = []
  entryRows: any[] = []
  questionRows: Array<{ topic_id: string; question_text: string }> = []
  /** The latest correction (a shortcut); `marks` (newest first) wins when set. */
  mark: Mark | null = null
  marks: Mark[] | null = null
  appeal: AppealCase | null = null
  learnCalls: any[] = []
  learnResult: any = { event_id: 'ev-1', action: 'created', entry_id: 'en-1', title: 'T' }
  undoCalls: any[] = []
  pending: Array<{ id: string; question_text: string }> = []
  embedded: Array<{ id: string; v: number[]; model: string }> = []
  pendingEx: Array<{ id: string; context_text: string }> = []
  embeddedEx: Array<{ id: string; v: number[]; model: string }> = []
  exampleRows: Example[] = []
  teamRows: Team[] = [
    { code: 'kyc', label: 'KYC team', description: 'KYC and the one-time verification call for new clients' },
    { code: 'rm', label: 'Relationship team', description: 'Clients whose KYC is done' },
    { code: 'support', label: 'Support', description: 'Anything else' },
  ]

  config() { return Promise.resolve(this.cfg) }
  isApprover(u: string) { return Promise.resolve(this.approvers.has(u)) }
  order() { return Promise.resolve(this.orderRow) }
  appealCase() { return Promise.resolve(this.appeal) }
  messages() { return Promise.resolve(this.rows) }
  smallRanges() { return Promise.resolve({ sales: { min: 200, max: 4000, enabled: true }, buys: { min: 200, max: 5000, enabled: true } }) }
  accountName(i: string | null) { return Promise.resolve(i === BLYNK ? 'Blynk Binance' : null) }
  clientPanel() { return Promise.resolve(this.panel) }
  situationMarks() { return Promise.resolve(this.marks ?? (this.mark ? [this.mark] : [])) }
  monthSpend() { return Promise.resolve(this.spend + this.calls.reduce((n, c) => n + Number(c.cost_inr ?? 0), 0)) }
  match(a: MatchArgs) { this.matchCalls.push(a); return Promise.resolve(this.matchRows.filter((m) => m.similarity >= a.minSimilarity)) }
  rejections() { return Promise.resolve(this.rejectionRows) }
  contacts(purposes: string[]) { return Promise.resolve(this.contactRows.filter((c) => purposes.includes(c.purpose))) }
  allContactPhones() { return Promise.resolve(this.phones) }
  findSuggestRequest(o: string, k: string) { return Promise.resolve([...this.requests.values()].find((r) => r.order_number === o && r.mode === 'suggest' && r.request_key === k) ?? null) }
  insertRequest(row: Record<string, unknown>): Promise<{ id?: string; conflict?: boolean; error?: string }> {
    if (row.mode === 'suggest' && [...this.requests.values()].some((r) => r.order_number === row.order_number && r.mode === 'suggest' && r.request_key === row.request_key)) return Promise.resolve({ conflict: true })
    const r = { id: id(), created_at: new Date().toISOString(), context: {}, matches: [], result: null, ...row } as any
    this.requests.set(r.id, r)
    return Promise.resolve({ id: r.id })
  }
  updateRequest(i: string, patch: Record<string, unknown>) {
    const r = this.requests.get(i)!
    const p: any = { ...patch }
    if (Array.isArray(p.question_embedding)) p.question_embedding = JSON.stringify(p.question_embedding)
    Object.assign(r, p)
    return Promise.resolve()
  }
  getRequest(i: string) { return Promise.resolve(this.requests.get(i) ?? null) }
  logCall(row: Record<string, unknown>) { const i = id(); this.calls.push({ id: i, ...row }); return Promise.resolve(i) }
  getCall(i: string) { return Promise.resolve(this.calls.find((c) => c.id === i) ?? null) }
  rejectCall(i: string, user: string, reason: string) {
    const c = this.calls.find((x) => x.id === i)
    if (!c || (c.feedback && c.feedback !== 'approved')) return Promise.resolve(false)
    Object.assign(c, { feedback: 'rejected', feedback_reason: reason, feedback_by: user })
    return Promise.resolve(true)
  }
  entries(ids: string[]) { return Promise.resolve(this.entryRows.filter((e) => ids.includes(e.id))) }
  pendingQuestions(limit: number) { return Promise.resolve(this.pending.filter((p) => !this.embedded.some((e) => e.id === p.id)).slice(0, limit)) }
  setQuestionEmbeddings(items: Array<{ id: string; v: number[] }>, model: string) {
    for (const i of items) this.embedded.push({ ...i, model })
    return Promise.resolve(items.length)
  }
  questionsFor(ids: string[]) { return Promise.resolve(this.questionRows.filter((q) => ids.includes(q.topic_id))) }
  pendingExamples(limit: number) { return Promise.resolve(this.pendingEx.filter((p) => !this.embeddedEx.some((e) => e.id === p.id)).slice(0, limit)) }
  setExampleEmbeddings(items: Array<{ id: string; v: number[] }>, model: string) {
    for (const i of items) this.embeddedEx.push({ ...i, model })
    return Promise.resolve(items.length)
  }
  examplesFor(ids: string[]) { return Promise.resolve(this.exampleRows.filter((x) => ids.includes(x.entry_id))) }
  teams() { return Promise.resolve(this.teamRows) }
  /** Operators an approver picked for rewording (approvers may anyway). */
  rephrasers = new Set([OPERATOR])
  inbox: any[] = []
  exampleNotes: Array<{ id: string; note: string }> = []
  canRephrase(u: string) { return Promise.resolve(this.approvers.has(u) || this.rephrasers.has(u)) }
  /** Binance accounts per person (default: everyone works on the order's account). */
  accounts: Record<string, string[]> | null = null
  accountsFor(u: string) { return Promise.resolve(this.accounts ? (this.accounts[u] ?? []) : [BLYNK]) }
  rephraseCount(u: string, since: string) {
    return Promise.resolve(this.calls.filter((c) => c.user_id === u && c.purpose === 'rephrase' && ['ok', 'blocked'].includes(c.status)
      && String(c.created_at ?? '9999') >= since).length)
  }
  rephraseCall(i: string): Promise<RephraseCall | null> {
    const c = this.calls.find((x) => x.id === i)
    return Promise.resolve(c ? { id: c.id, user_id: c.user_id ?? null, purpose: c.purpose, status: c.status, order_number: c.order_number ?? null, input_text: c.input_text ?? null, output_text: c.output_text ?? null, feedback: c.feedback ?? null, created_at: c.created_at ?? null } : null)
  }
  markRephraseUsed(i: string, u: string, edited: boolean) {
    const c = this.calls.find((x) => x.id === i && x.user_id === u && x.purpose === 'rephrase' && !x.feedback)
    if (!c) return Promise.resolve(false)
    Object.assign(c, { feedback: 'used', feedback_edited: edited, feedback_by: u })
    return Promise.resolve(true)
  }
  inboxFails = false
  addInboxItem(row: Record<string, any>): Promise<{ id?: string; duplicate?: boolean; error?: string }> {
    if (this.inboxFails) return Promise.resolve({ error: 'insert failed' })
    if (row.kind === 'operator_reply' && this.inbox.some((i) => i.kind === 'operator_reply' && i.status === 'open' && i.order_number === row.order_number && i.context?.reply_key === row.context?.reply_key)) {
      return Promise.resolve({ duplicate: true })
    }
    const r = { id: id(), status: 'open', ...row }
    this.inbox.push(r)
    return Promise.resolve({ id: r.id })
  }
  inboxItem(i: string): Promise<InboxItem | null> { return Promise.resolve(this.inbox.find((x) => x.id === i) ?? null) }
  claimInboxItem(i: string, u: string) {
    const x = this.inbox.find((y) => y.id === i && y.kind === 'operator_reply' && y.status === 'open')
    if (!x) return Promise.resolve(false)
    Object.assign(x, { status: 'resolved', resolved_by: u, resolution: 'saving' })
    return Promise.resolve(true)
  }
  finishInboxItem(i: string, context: Record<string, unknown>) {
    const x = this.inbox.find((y) => y.id === i && y.resolution === 'saving')
    if (x) Object.assign(x, { resolution: 'saved', context })
    return Promise.resolve()
  }
  reopenInboxItem(i: string) {
    const x = this.inbox.find((y) => y.id === i && y.status === 'resolved' && y.resolution === 'saving')
    if (x) Object.assign(x, { status: 'open', resolved_by: null, resolution: null })
    return Promise.resolve()
  }
  reopenSavedInboxItem(eventId: string) {
    const x = this.inbox.find((y) => y.kind === 'operator_reply' && y.status === 'resolved' && y.context?.saved_event_id === eventId)
    if (!x) return Promise.resolve(false)
    const { saved_entry_id: _e, saved_event_id: _v, ...context } = x.context
    Object.assign(x, { status: 'open', resolved_by: null, resolution: null, context })
    return Promise.resolve(true)
  }
  /** The Playbook's steps (kind 'step'). */
  stepRows: StepEntry[] = []
  steps() { return Promise.resolve(this.stepRows) }
  /** One save per press (copilot_learn_keys). */
  learnKeys = new Map<string, { user_id: string; order_number: string; result: any; token?: string }>()
  undoneEvents = new Set<string>()
  claimLearnKey(key: string, userId: string, orderNumber: string) {
    const k = this.learnKeys.get(key)
    if (k) return Promise.resolve({ claimed: false, token: null, result: k.result })
    const token = id()
    this.learnKeys.set(key, { user_id: userId, order_number: orderNumber, result: null, token })
    return Promise.resolve({ claimed: true, token, result: null })
  }
  reclaimLearnKey(key: string, userId: string, undoneEventId: string) {
    const k = this.learnKeys.get(key)
    if (!k || k.result?.eventId !== undoneEventId) return Promise.resolve(null)
    const token = id()
    Object.assign(k, { result: null, user_id: userId, token })
    return Promise.resolve(token)
  }
  finishLearnKey(key: string, token: string | null, result: any) { const k = this.learnKeys.get(key); if (k && token && k.token === token) k.result = result; return Promise.resolve() }
  releaseLearnKey(key: string, token: string | null) { const k = this.learnKeys.get(key); if (k && token && k.token === token) this.learnKeys.delete(key); return Promise.resolve() }
  eventUndone(e: string) { return Promise.resolve(this.undoneEvents.has(e)) }
  learnFails: { message: string; code?: string } | null = null
  setExampleNote(exampleId: string, note: string) { this.exampleNotes.push({ id: exampleId, note }); return Promise.resolve() }
  learnApply(p: Record<string, unknown>) {
    this.learnCalls.push(p)
    if (this.learnFails) return Promise.resolve({ error: this.learnFails })
    return Promise.resolve({ data: { ...this.learnResult, action: this.learnResult.action ?? p.p_relation } })
  }
  undo(u: string, e: string) {
    this.undoCalls.push([u, e])
    if (e === '00000000-0000-4000-8000-999999999999') return Promise.resolve({ error: { message: 'This entry changed after that save; edit it on the Playbook page instead', code: '22023' } })
    this.undoneEvents.add(e)
    return Promise.resolve({ data: { event_id: e, undone: true, action: 'created' } })
  }
}

export class FakeAi implements Ai {
  chats: Array<{ model: string; system: string; user: string; opts?: ChatOpts; check?: true }> = []
  embeds: string[][] = []
  replies: Record<string, ChatResult | ((system: string, user: string) => ChatResult)> = {}
  /** The second check of a rewrite (a schema with "issues"): nothing found unless a test says otherwise. */
  checkReply: ChatResult | ((system: string, user: string) => ChatResult) = {
    ok: true, data: { issues: [] }, usage: { input: 400, output: 8, reasoning: 0, estimated: false }, latencyMs: 4,
  }
  embedFails = false
  embedFailsWhen: ((texts: string[]) => boolean) | null = null

  chatJson(model: string, system: string, user: string, schema?: Record<string, unknown>, opts?: ChatOpts): Promise<ChatResult> {
    const check = !!(schema as { properties?: Record<string, unknown> } | undefined)?.properties?.issues
    this.chats.push({ model, system, user, ...(opts ? { opts } : {}), ...(check ? { check: true as const } : {}) })
    const r = check ? this.checkReply : this.replies[model]
    const out = typeof r === 'function' ? r(system, user) : r
    return Promise.resolve(out ?? { ok: true, data: { reply: `Draft from ${model}`, new_policy: false, note: '' }, usage: { input: 1000, output: 100, reasoning: 0, estimated: false }, latencyMs: 5 })
  }
  embed(texts: string[]): Promise<EmbedResult> {
    this.embeds.push(texts)
    if (this.embedFails || this.embedFailsWhen?.(texts)) return Promise.resolve({ vectors: null, usage: { input: 10, output: 0, reasoning: 0, estimated: true }, latencyMs: 1, error: 'down' })
    return Promise.resolve({ vectors: texts.map(() => new Array(1536).fill(0.01)), usage: { input: 12, output: 0, reasoning: 0, estimated: false }, latencyMs: 1 })
  }
}

let mseq = 0
export const msg = (who: 'client' | 'us', text: string, type = 'text'): ChatRow => ({
  binance_message_id: `msg${++mseq}`, message_type: type, sender_is_self: who === 'us', is_system_message: false, message_text: text, binance_create_time: 1_792_000_000_000 + mseq * 1000,
})

export function entry(over: Partial<MatchRow> = {}): MatchRow {
  return {
    entry_id: id(), topic_id: id(), question_id: id(), question_text: 'When will I get the TDS certificate?', input_index: 0, similarity: 0.9, status: 'approved',
    kind: 'reply', step_key: null, title: 'TDS certificate timing', scope: {}, reply_en: 'Sir, the TDS certificate is shared every quarter.',
    reply_hi: 'Sir, TDS certificate har quarter bheja jata hai.', reply_en_auto: false, reply_hi_auto: true, reply_en_stale: false, reply_hi_stale: false,
    risk: 'none', internal_note: null, conflict_open: false, version: 1, use_count: 3, fits: true, specificity: 0, context_similarity: null, ...over,
  }
}

export function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`)
}
export function ok(cond: unknown, msg = '') { if (!cond) throw new Error(msg || 'assertion failed') }
