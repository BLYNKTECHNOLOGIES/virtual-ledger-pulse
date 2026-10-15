// deno-lint-ignore-file no-explicit-any
// In-memory Store and AI fakes for the Copilot handler tests (not deployed with any function).
import type { ChatRow } from './copilot-playbook.ts'
import type { ContactPick, CopilotConfig, Example, MatchArgs, MatchRow, RequestRow, Store, Team } from './copilot-store.ts'
import type { Mark } from './copilot-situation.ts'
import type { Ai, ChatResult, EmbedResult } from './copilot-ai.ts'

export const SHUBHAM = 'd1a85fd5-f5a8-47af-ae42-e0b4683d82c9'
export const OPERATOR = '699c8623-8d56-49a9-ba53-4a572649497c'
export const BLYNK = '00000000-0000-0000-0000-000000000001'

export function config(over: Partial<CopilotConfig> = {}): CopilotConfig {
  return {
    approver_ids: [SHUBHAM], operators_enabled: false, draft_models: ['openai/gpt-6-astra', 'google/gemini-4-argon'],
    utility_model: 'google/gemini-3-flash-preview', embedding_model: 'openai/text-embedding-3-small', monthly_budget_inr: 25000,
    budget_alert_pcts: [50, 80], usd_inr: 88, hindi_switch_after: 2, match_threshold: 0.78, related_threshold: 0.55, learn_threshold: 0.5,
    tentative_days: 60, house_style: 'House style.',
    model_prices: { 'openai/gpt-6-astra': { in: 10, out: 50 }, 'google/gemini-4-argon': { in: 2, out: 10 }, 'google/gemini-3-flash-preview': { in: 0.5, out: 3 }, 'openai/text-embedding-3-small': { in: 0.02, out: 0 } },
    ...over,
  }
}

let seq = 0
export const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

export class FakeStore implements Store {
  cfg: CopilotConfig | null = config()
  approvers = new Set([SHUBHAM])
  orderRow: any = { order_number: '22944071217231917056', trade_type: 'SELL', order_status: 'TRADING', total_price: '4500', asset: 'USDT', pay_method_name: 'UPI', exchange_account_id: BLYNK, has_active_complaint: false }
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
  mark: Mark | null = null
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
  messages() { return Promise.resolve(this.rows) }
  smallRanges() { return Promise.resolve({ sales: { min: 200, max: 4000, enabled: true }, buys: { min: 200, max: 5000, enabled: true } }) }
  accountName(i: string | null) { return Promise.resolve(i === BLYNK ? 'Blynk Binance' : null) }
  clientPanel() { return Promise.resolve(this.panel) }
  situationMark() { return Promise.resolve(this.mark) }
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
  learnApply(p: Record<string, unknown>) { this.learnCalls.push(p); return Promise.resolve({ data: { ...this.learnResult, action: this.learnResult.action ?? p.p_relation } }) }
  undo(u: string, e: string) {
    this.undoCalls.push([u, e])
    if (e === '00000000-0000-4000-8000-999999999999') return Promise.resolve({ error: { message: 'This entry changed after that save; edit it on the Playbook page instead', code: '22023' } })
    return Promise.resolve({ data: { event_id: e, undone: true, action: 'created' } })
  }
}

export class FakeAi implements Ai {
  chats: Array<{ model: string; system: string; user: string }> = []
  embeds: string[][] = []
  replies: Record<string, ChatResult | ((system: string, user: string) => ChatResult)> = {}
  embedFails = false
  embedFailsWhen: ((texts: string[]) => boolean) | null = null

  chatJson(model: string, system: string, user: string): Promise<ChatResult> {
    this.chats.push({ model, system, user })
    const r = this.replies[model]
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
