// deno-lint-ignore-file no-explicit-any
// Copilot v2: database access for copilot-draft and copilot-learn. The handlers only see the Store
// interface, so tests can replace it with an in-memory fake.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import type { ChatRow, Prices, SmallRange } from './copilot-playbook.ts'

export interface CopilotConfig {
  approver_ids: string[]
  operators_enabled: boolean
  draft_models: string[]
  utility_model: string
  embedding_model: string
  monthly_budget_inr: number
  budget_alert_pcts: number[]
  usd_inr: number
  hindi_switch_after: number
  match_threshold: number
  related_threshold: number
  learn_threshold: number
  tentative_days: number
  model_prices: Prices
  house_style: string
}

export interface MatchArgs {
  embeddings: number[][]
  side: string | null
  category: string | null
  accountId: string | null
  status: string | null
  clientState: string | null
  includeTentative: boolean
  includeConflicts: boolean
  minSimilarity: number
  limit: number
}

export interface MatchRow {
  entry_id: string
  question_id: string
  question_text: string
  input_index: number
  similarity: number
  status: 'approved' | 'tentative'
  kind: string
  step_key: string | null
  title: string
  scope: Record<string, string[]>
  reply_en: string | null
  reply_hi: string | null
  reply_en_auto: boolean
  reply_hi_auto: boolean
  risk: string
  internal_note: string | null
  conflict_open: boolean
  version: number
  use_count: number
}

export interface ContactPick { id: string; purpose: string; person_name: string; phone: string; available_now: boolean; priority: number }

export interface RequestRow {
  id: string
  created_at: string
  user_id: string
  order_number: string
  exchange_account_id: string | null
  mode: string
  request_key: string | null
  status: string
  question_text: string | null
  question_language: string | null
  question_embedding: string | null
  context: Record<string, any>
  matches: any[]
  top_entry_id: string | null
  top_similarity: number | null
  result: any
  error: string | null
  latency_ms: number | null
}

export interface DbError { message: string; code?: string }

export interface Store {
  config(): Promise<CopilotConfig | null>
  isApprover(userId: string): Promise<boolean>
  order(orderNumber: string): Promise<any | null>
  messages(orderNumber: string): Promise<ChatRow[]>
  smallRanges(): Promise<{ sales: SmallRange | null; buys: SmallRange | null }>
  accountName(id: string | null): Promise<string | null>
  clientPanel(orderNumber: string): Promise<any>
  monthSpend(): Promise<number>
  match(a: MatchArgs): Promise<MatchRow[]>
  rejections(embedding: number[] | string, min: number, limit: number): Promise<Array<{ draft_text: string; reason: string | null }>>
  contacts(purposes: string[]): Promise<ContactPick[]>
  allContactPhones(): Promise<Array<{ purpose: string; phone: string }>>
  findSuggestRequest(orderNumber: string, key: string): Promise<RequestRow | null>
  insertRequest(row: Record<string, unknown>): Promise<{ id?: string; conflict?: boolean; error?: string }>
  updateRequest(id: string, patch: Record<string, unknown>): Promise<void>
  getRequest(id: string): Promise<RequestRow | null>
  logCall(row: Record<string, unknown>): Promise<string | null>
  getCall(id: string): Promise<any | null>
  rejectCall(id: string, userId: string, reason: string): Promise<boolean>
  entries(ids: string[]): Promise<any[]>
  questionsFor(ids: string[]): Promise<Array<{ entry_id: string; question_text: string }>>
  learnApply(params: Record<string, unknown>): Promise<{ data?: any; error?: DbError }>
  undo(userId: string, eventId: string): Promise<{ data?: any; error?: DbError }>
}

const vec = (v: number[] | string) => (typeof v === 'string' ? v : `[${v.join(',')}]`)

/** admin: service-role client. user: client carrying the caller's JWT (for get_terminal_order_client). */
export function makeStore(admin: SupabaseClient, user: SupabaseClient): Store {
  const db = admin as any
  return {
    async config() {
      const { data } = await db.from('copilot_config').select('*').eq('id', true).maybeSingle()
      if (!data) return null
      return {
        ...data,
        monthly_budget_inr: Number(data.monthly_budget_inr),
        usd_inr: Number(data.usd_inr),
        match_threshold: Number(data.match_threshold),
        related_threshold: Number(data.related_threshold),
        learn_threshold: Number(data.learn_threshold),
      } as CopilotConfig
    },
    async isApprover(userId) {
      const { data } = await db.rpc('copilot_is_approver', { p_user_id: userId })
      return data === true
    },
    async order(orderNumber) {
      const { data } = await db.from('binance_order_history')
        .select('order_number, trade_type, order_status, total_price, amount, asset, fiat_unit, pay_method_name, exchange_account_id, has_active_complaint, create_time')
        .eq('order_number', orderNumber).limit(1).maybeSingle()
      return data ?? null
    },
    async messages(orderNumber) {
      const { data } = await db.from('binance_order_chat_messages')
        .select('id, binance_message_id, dedupe_key, message_type, sender_is_self, is_system_message, is_recall, message_text, binance_create_time')
        .eq('order_number', orderNumber).order('binance_create_time', { ascending: false }).limit(80)
      return [...(data ?? [])].reverse()
    },
    async smallRanges() {
      const [s, b] = await Promise.all([
        db.from('small_sales_config').select('min_amount, max_amount, is_enabled').limit(1).maybeSingle(),
        db.from('small_buys_config').select('min_amount, max_amount, is_enabled').limit(1).maybeSingle(),
      ])
      const r = (x: any): SmallRange | null => (x?.data ? { min: Number(x.data.min_amount), max: Number(x.data.max_amount), enabled: x.data.is_enabled !== false } : null)
      return { sales: r(s), buys: r(b) }
    },
    async accountName(id) {
      if (!id) return null
      const { data } = await db.from('terminal_exchange_accounts').select('account_name').eq('id', id).maybeSingle()
      return data?.account_name ?? null
    },
    async clientPanel(orderNumber) {
      const { data, error } = await (user as any).rpc('get_terminal_order_client', { p_order_number: orderNumber })
      if (error) return null
      return data
    },
    async monthSpend() {
      const { data } = await db.rpc('copilot_month_spend_inr')
      return Number(data ?? 0)
    },
    async match(a) {
      const { data, error } = await db.rpc('copilot_match_playbook', {
        p_embeddings: a.embeddings,
        p_side: a.side, p_category: a.category, p_account_id: a.accountId, p_status: a.status, p_client_state: a.clientState,
        p_include_tentative: a.includeTentative, p_include_conflicts: a.includeConflicts,
        p_min_similarity: a.minSimilarity, p_limit: a.limit,
      })
      if (error) throw new Error(`match: ${error.message}`)
      return (data ?? []).map((r: any) => ({ ...r, similarity: Number(r.similarity) }))
    },
    async rejections(embedding, min, limit) {
      const { data } = await db.rpc('copilot_similar_rejections', { p_embedding: typeof embedding === 'string' ? embedding : embedding, p_min_similarity: min, p_limit: limit })
      return (data ?? []).map((r: any) => ({ draft_text: String(r.draft_text ?? ''), reason: r.reason ?? null }))
    },
    async contacts(purposes) {
      const out: ContactPick[] = []
      await Promise.all(purposes.map(async (p) => {
        const { data } = await db.rpc('copilot_pick_contacts', { p_purpose: p })
        for (const r of data ?? []) out.push({ ...r, purpose: p })
      }))
      return out
    },
    async allContactPhones() {
      const { data } = await db.from('copilot_contacts').select('purpose, phone')
      return (data ?? []).map((r: any) => ({ purpose: String(r.purpose), phone: String(r.phone) }))
    },
    async findSuggestRequest(orderNumber, key) {
      const { data } = await db.from('copilot_requests').select('*').eq('order_number', orderNumber).eq('mode', 'suggest').eq('request_key', key).maybeSingle()
      return data ?? null
    },
    async insertRequest(row) {
      const { data, error } = await db.from('copilot_requests').insert(row).select('id').single()
      if (error) return error.code === '23505' ? { conflict: true } : { error: error.message }
      return { id: data.id }
    },
    async updateRequest(id, patch) {
      const p: Record<string, unknown> = { ...patch }
      if (Array.isArray(p.question_embedding)) p.question_embedding = vec(p.question_embedding as number[])
      await db.from('copilot_requests').update(p).eq('id', id)
    },
    async getRequest(id) {
      const { data } = await db.from('copilot_requests').select('*').eq('id', id).maybeSingle()
      return data ?? null
    },
    async logCall(row) {
      const { data, error } = await db.from('copilot_ai_calls').insert(row).select('id').single()
      if (error) { console.error(JSON.stringify({ fn: 'copilot', outcome: 'log_call_failed', code: error.code })); return null }
      return data.id
    },
    async getCall(id) {
      const { data } = await db.from('copilot_ai_calls').select('id, purpose, feedback, order_number, request_id').eq('id', id).maybeSingle()
      return data ?? null
    },
    async rejectCall(id, userId, reason) {
      const { data } = await db.from('copilot_ai_calls')
        .update({ feedback: 'rejected', feedback_reason: reason || null, feedback_by: userId, feedback_at: new Date().toISOString() })
        .eq('id', id).or('feedback.is.null,feedback.eq.approved').select('id')
      return (data ?? []).length > 0
    },
    async entries(ids) {
      if (!ids.length) return []
      const { data } = await db.from('copilot_playbook_entries').select('*').in('id', ids)
      return data ?? []
    },
    async questionsFor(ids) {
      if (!ids.length) return []
      const { data } = await db.from('copilot_playbook_questions').select('entry_id, question_text, created_at').in('entry_id', ids).order('created_at', { ascending: false }).limit(60)
      return (data ?? []).map((r: any) => ({ entry_id: r.entry_id, question_text: r.question_text }))
    },
    async learnApply(params) {
      const { data, error } = await db.rpc('copilot_learn_apply', params)
      return error ? { error: { message: error.message, code: error.code } } : { data }
    },
    async undo(userId, eventId) {
      const { data, error } = await db.rpc('copilot_undo_learning', { p_user_id: userId, p_event_id: eventId })
      return error ? { error: { message: error.message, code: error.code } } : { data }
    },
  }
}
