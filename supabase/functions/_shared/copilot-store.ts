// deno-lint-ignore-file no-explicit-any
// Copilot v2: database access for copilot-draft, copilot-learn and copilot-rephrase. The handlers only see the Store
// interface, so tests can replace it with an in-memory fake.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import type { ChatRow, Prices, SmallRange } from './copilot-playbook.ts'
import type { Mark } from './copilot-situation.ts'

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
  /** Rephrase (CP-7): operators who may reword their messages, automatic after a pause, a daily allowance, the model. */
  rephrase_user_ids?: string[]
  rephrase_auto?: boolean
  rephrase_daily_limit?: number
  rephrase_model?: string
  /** A second call checks every rewrite before it is offered (default on). */
  rephrase_verify?: boolean
}

export interface MatchArgs {
  embeddings: number[][]
  side: string | null
  category: string | null
  accountId: string | null
  status: string | null
  clientState: string | null
  /** The chat's situation code; replies limited to other situations come back with fits = false. */
  stage: string | null
  /** Embedding of the chat before the question; replies' example chats are compared with it. */
  contextEmbedding?: number[] | null
  includeTentative: boolean
  includeConflicts: boolean
  minSimilarity: number
  /** Number of questions (each with all its live replies). */
  limit: number
}

/** One live reply of a matched question (all replies of the question come back; fits tells which apply now). */
export interface MatchRow {
  entry_id: string
  topic_id: string
  question_id: string
  question_text: string
  input_index: number
  similarity: number
  status: 'approved' | 'tentative'
  kind: string
  step_key: string | null
  /** The question's title. */
  title: string
  scope: Record<string, string[]>
  reply_en: string | null
  reply_hi: string | null
  reply_en_auto: boolean
  reply_hi_auto: boolean
  reply_en_stale: boolean
  reply_hi_stale: boolean
  risk: string
  internal_note: string | null
  conflict_open: boolean
  version: number
  use_count: number
  /** Applies to this order now (side, size, account, client, status and situation). */
  fits: boolean
  /** How specific its situation is (0 = any situation, 2 = a group such as sell.kyc, 3 = one step); -1 when it does not fit. */
  specificity: number
  /** How closely this chat resembles the reply's example chats (null when it has none, or no chat was given). */
  context_similarity: number | null
}

export interface Team { code: string; label: string; description: string }
export interface AppealCase { status: string; responseDueAt: number | null }
export interface Example { entry_id: string; chat: Array<{ from: string; text: string }> }

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
  context_embedding?: string | null
  context: Record<string, any>
  matches: any[]
  top_entry_id: string | null
  top_similarity: number | null
  result: any
  error: string | null
  latency_ms: number | null
}

export interface DbError { message: string; code?: string }

/** A rewrite's log row, as "used" needs it (typed words and rewrite are stored masked). */
export interface RephraseCall {
  id: string
  user_id: string | null
  purpose: string
  status: string
  order_number: string | null
  input_text: string | null
  output_text: string | null
  feedback: string | null
  created_at: string | null
}
export interface InboxItem { id: string; kind: string; status: string; order_number: string | null; context: Record<string, any> }

export interface Store {
  config(): Promise<CopilotConfig | null>
  isApprover(userId: string): Promise<boolean>
  order(orderNumber: string): Promise<any | null>
  /** Our team's latest appeal case for the order (status and the response timer), if any. */
  appealCase(orderNumber: string): Promise<AppealCase | null>
  /** The chat's last 80 messages, plus Binance's KYC notices from before them. */
  messages(orderNumber: string): Promise<ChatRow[]>
  smallRanges(): Promise<{ sales: SmallRange | null; buys: SmallRange | null }>
  accountName(id: string | null): Promise<string | null>
  clientPanel(orderNumber: string): Promise<any>
  /** Approvers' corrections of this chat's situation, newest first (null code = back to the detected one). */
  situationMarks(orderNumber: string): Promise<Mark[]>
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
  /** Recent phrasings of these questions (topic ids). */
  questionsFor(topicIds: string[]): Promise<Array<{ topic_id: string; question_text: string }>>
  learnApply(params: Record<string, unknown>): Promise<{ data?: any; error?: DbError }>
  undo(userId: string, eventId: string): Promise<{ data?: any; error?: DbError }>
  /** Phrasings without an embedding yet (seeded, or added on the Playbook page). */
  pendingQuestions(limit: number): Promise<Array<{ id: string; question_text: string }>>
  setQuestionEmbeddings(items: Array<{ id: string; v: number[] }>, model: string): Promise<number>
  /** Example chats without an embedding yet (seeded). */
  pendingExamples(limit: number): Promise<Array<{ id: string; context_text: string }>>
  setExampleEmbeddings(items: Array<{ id: string; v: number[] }>, model: string): Promise<number>
  /** The latest example chat of each reply (for the judge). */
  examplesFor(entryIds: string[]): Promise<Example[]>
  /** Active company teams whose numbers replies may give. */
  teams(): Promise<Team[]>
  /** An approver, or an operator an approver picked who can read order chats (copilot_can_rephrase). */
  canRephrase(userId: string): Promise<boolean>
  /** The Binance accounts this person may work on (binance_accounts_for_user: the same answer the screens get). */
  accountsFor(userId: string): Promise<string[]>
  /** Rewrites this person was given or held back since then (calls that failed do not count). */
  rephraseCount(userId: string, sinceIso: string): Promise<number>
  rephraseCall(id: string): Promise<RephraseCall | null>
  /** Marks this person's rewrite as sent, once; false when it was not theirs or already marked. */
  markRephraseUsed(id: string, userId: string, edited: boolean): Promise<boolean>
  /** A new inbox item; `duplicate` when the same one is already open. */
  addInboxItem(row: Record<string, unknown>): Promise<{ id?: string; duplicate?: boolean; error?: string }>
  inboxItem(id: string): Promise<InboxItem | null>
  /** Takes an open operator reply for saving (false when it was already saved, being saved or dismissed). */
  claimInboxItem(id: string, userId: string): Promise<boolean>
  /** Marks a taken operator reply as saved, with the reply and the learning event it became (for Undo). */
  finishInboxItem(id: string, context: Record<string, unknown>): Promise<void>
  /** Gives a taken operator reply back to the inbox (saving failed). */
  reopenInboxItem(id: string): Promise<void>
  /** Undo of a save from the inbox: the operator reply is open again. */
  reopenSavedInboxItem(eventId: string): Promise<boolean>
  /** The typed words behind a saved reply, kept on its example chat (masked by the caller). */
  setExampleNote(exampleId: string, note: string): Promise<void>
}

const vec = (v: number[] | string) => (typeof v === 'string' ? v : `[${v.join(',')}]`)

/** The chat's latest messages (oldest first) with Binance's KYC notices from before them, each message once. */
export function withNotices(recent: ChatRow[], notices: ChatRow[]): ChatRow[] {
  const ids = new Set(recent.map((r) => r.id ?? r.binance_message_id ?? r.dedupe_key))
  return [...notices.filter((r) => !ids.has(r.id ?? r.binance_message_id ?? r.dedupe_key)), ...recent]
}

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
        ...(data.rephrase_daily_limit !== undefined ? { rephrase_daily_limit: Number(data.rephrase_daily_limit) } : {}),
      } as CopilotConfig
    },
    async isApprover(userId) {
      const { data } = await db.rpc('copilot_is_approver', { p_user_id: userId })
      return data === true
    },
    async order(orderNumber) {
      // Binance's extra-KYC field and deadlines are read one by one: the stored order payloads also hold personal data
      // (names, payment accounts), which never leave the database.
      const { data, error } = await db.from('binance_order_history')
        .select('order_number, trade_type, order_status, total_price, amount, asset, fiat_unit, pay_method_name, exchange_account_id, has_active_complaint, create_time, '
          + 'kyc_raw:raw_data->>additionalKycVerify, kyc_detail:order_detail_raw->>additionalKycVerify, pay_by:order_detail_raw->>notifyPayEndTime, '
          + 'release_by:order_detail_raw->>confirmPayEndTime')
        .eq('order_number', orderNumber).limit(1).maybeSingle()
      // Without the stored order, side, status and amount come from the screen only: say so in the logs.
      if (error) console.error(JSON.stringify({ fn: 'copilot', outcome: 'order_read_failed', code: error.code }))
      return data ?? null
    },
    async appealCase(orderNumber) {
      const { data, error } = await db.from('terminal_appeal_cases').select('status, response_due_at, created_at')
        .eq('order_number', orderNumber).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error || !data) return null
      return { status: String(data.status ?? ''), responseDueAt: data.response_due_at ? Date.parse(data.response_due_at) : null }
    },
    async messages(orderNumber) {
      const cols = 'id, binance_message_id, dedupe_key, message_type, sender_is_self, is_system_message, is_recall, message_text, binance_create_time, exchange_account_id'
      // Binance's KYC notices (extra KYC required, client verified) decide the KYC steps: in a long chat they can be older
      // than the last 80 messages, so they are read on their own too (two short rows, merged by id).
      const [recent, notices] = await Promise.all([
        db.from('binance_order_chat_messages').select(cols)
          .eq('order_number', orderNumber).order('binance_create_time', { ascending: false }).limit(80),
        db.from('binance_order_chat_messages').select(cols)
          .eq('order_number', orderNumber).eq('is_system_message', true).like('message_text', '%additional_kyc_maker_sell%')
          .order('binance_create_time', { ascending: true }).limit(4),
      ])
      return withNotices([...(recent.data ?? [])].reverse(), notices.data ?? [])
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
    async situationMarks(orderNumber) {
      const { data } = await db.from('copilot_situation_marks').select('code, detected_code, created_by, created_at')
        .eq('order_number', orderNumber).order('created_at', { ascending: false }).limit(20)
      return (data ?? []).map((r: any) => ({ code: r.code ?? null, at: Date.parse(r.created_at), by: r.created_by ?? null, detected: r.detected_code ?? null }))
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
        p_min_similarity: a.minSimilarity, p_limit: a.limit, p_stage: a.stage,
        p_context_embedding: a.contextEmbedding ?? null,
      })
      if (error) throw new Error(`match: ${error.message}`)
      return (data ?? []).map((r: any) => ({
        ...r, similarity: Number(r.similarity), specificity: Number(r.specificity ?? 0), fits: r.fits === true,
        context_similarity: r.context_similarity === null || r.context_similarity === undefined ? null : Number(r.context_similarity),
      }))
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
      if (Array.isArray(p.context_embedding)) p.context_embedding = vec(p.context_embedding as number[])
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
    async questionsFor(topicIds) {
      if (!topicIds.length) return []
      const { data } = await db.from('copilot_playbook_questions').select('topic_id, question_text, created_at').in('topic_id', topicIds).order('created_at', { ascending: false }).limit(60)
      return (data ?? []).map((r: any) => ({ topic_id: r.topic_id, question_text: r.question_text }))
    },
    async learnApply(params) {
      const { data, error } = await db.rpc('copilot_learn_apply', params)
      return error ? { error: { message: error.message, code: error.code } } : { data }
    },
    async undo(userId, eventId) {
      const { data, error } = await db.rpc('copilot_undo_learning', { p_user_id: userId, p_event_id: eventId })
      return error ? { error: { message: error.message, code: error.code } } : { data }
    },
    async pendingQuestions(limit) {
      const { data, error } = await db.rpc('copilot_pending_questions', { p_limit: limit })
      if (error) return []
      return (data ?? []).map((r: any) => ({ id: String(r.id), question_text: String(r.question_text ?? '') }))
    },
    async pendingExamples(limit) {
      const { data, error } = await db.rpc('copilot_pending_examples', { p_limit: limit })
      if (error) return []
      return (data ?? []).map((r: any) => ({ id: String(r.id), context_text: String(r.context_text ?? '') }))
    },
    async setExampleEmbeddings(items, model) {
      let n = 0
      for (let i = 0; i < items.length; i += 25) {
        const { data, error } = await db.rpc('copilot_set_example_embeddings', { p_items: items.slice(i, i + 25), p_model: model })
        if (error) { console.error(JSON.stringify({ fn: 'copilot', outcome: 'set_example_embeddings_failed', code: error.code })); break }
        n += Number(data ?? 0)
      }
      return n
    },
    async examplesFor(entryIds) {
      if (!entryIds.length) return []
      const { data } = await db.from('copilot_playbook_examples').select('entry_id, chat, created_at').in('entry_id', entryIds)
        .order('created_at', { ascending: false }).limit(60)
      const seen = new Set<string>()
      const out: Example[] = []
      for (const r of data ?? []) {
        if (seen.has(r.entry_id)) continue
        seen.add(r.entry_id)
        out.push({ entry_id: r.entry_id, chat: Array.isArray(r.chat) ? r.chat : [] })
      }
      return out
    },
    async teams() {
      const { data } = await db.from('copilot_teams').select('code, label, description').eq('active', true).order('sort').order('code')
      return (data ?? []).map((r: any) => ({ code: String(r.code), label: String(r.label), description: String(r.description ?? '') }))
    },
    async canRephrase(userId) {
      const { data } = await db.rpc('copilot_can_rephrase', { p_user_id: userId })
      return data === true
    },
    async accountsFor(userId) {
      const { data, error } = await db.rpc('binance_accounts_for_user', { p_user_id: userId })
      if (error) { console.error(JSON.stringify({ fn: 'copilot', outcome: 'accounts_failed', code: error.code })); return [] }
      return Array.isArray(data) ? data.map(String) : []
    },
    async rephraseCount(userId, sinceIso) {
      const { count } = await db.from('copilot_ai_calls').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('purpose', 'rephrase').in('status', ['ok', 'blocked']).gte('created_at', sinceIso)
      return Number(count ?? 0)
    },
    async rephraseCall(id) {
      const { data } = await db.from('copilot_ai_calls').select('id, user_id, purpose, status, order_number, input_text, output_text, feedback, created_at')
        .eq('id', id).maybeSingle()
      return data ?? null
    },
    async markRephraseUsed(id, userId, edited) {
      const { data } = await db.from('copilot_ai_calls')
        .update({ feedback: 'used', feedback_edited: edited, feedback_by: userId, feedback_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId).eq('purpose', 'rephrase').is('feedback', null).select('id')
      return (data ?? []).length > 0
    },
    async addInboxItem(row) {
      const { data, error } = await db.from('copilot_inbox_items').insert(row).select('id').single()
      if (error) return error.code === '23505' ? { duplicate: true } : { error: error.message }
      return { id: data.id }
    },
    async inboxItem(id) {
      const { data } = await db.from('copilot_inbox_items').select('id, kind, status, order_number, context').eq('id', id).maybeSingle()
      return data ?? null
    },
    async claimInboxItem(id, userId) {
      const { data } = await db.from('copilot_inbox_items')
        .update({ status: 'resolved', resolved_by: userId, resolved_at: new Date().toISOString(), resolution: 'saving' })
        .eq('id', id).eq('kind', 'operator_reply').eq('status', 'open').select('id')
      return (data ?? []).length > 0
    },
    async finishInboxItem(id, context) {
      // The saved reply's id lives in the context, not in entry_id: that column cascades, and an Undo deletes the reply.
      const { error } = await db.from('copilot_inbox_items').update({ resolution: 'saved', context }).eq('id', id).eq('resolution', 'saving')
      if (error) console.error(JSON.stringify({ fn: 'copilot', outcome: 'inbox_finish_failed', code: error.code }))
    },
    async reopenInboxItem(id) {
      const { error } = await db.from('copilot_inbox_items').update({ status: 'open', resolved_by: null, resolved_at: null, resolution: null })
        .eq('id', id).eq('kind', 'operator_reply').eq('status', 'resolved').eq('resolution', 'saving')
      if (error) console.error(JSON.stringify({ fn: 'copilot', outcome: 'inbox_reopen_failed', code: error.code }))
    },
    async reopenSavedInboxItem(eventId) {
      const { data } = await db.from('copilot_inbox_items').select('id, context')
        .eq('kind', 'operator_reply').eq('status', 'resolved').eq('context->>saved_event_id', eventId).limit(1).maybeSingle()
      if (!data) return false
      const { saved_entry_id: _e, saved_event_id: _v, ...context } = (data.context ?? {}) as Record<string, unknown>
      const { error } = await db.from('copilot_inbox_items')
        .update({ status: 'open', resolved_by: null, resolved_at: null, resolution: null, context }).eq('id', data.id).eq('status', 'resolved')
      return !error
    },
    async setExampleNote(exampleId, note) {
      const { error } = await db.from('copilot_playbook_examples').update({ note }).eq('id', exampleId)
      if (error) console.error(JSON.stringify({ fn: 'copilot', outcome: 'example_note_failed', code: error.code }))
    },
    async setQuestionEmbeddings(items, model) {
      let n = 0
      // Small batches keep each request well under the API's body limit (1536 numbers per phrasing).
      for (let i = 0; i < items.length; i += 25) {
        const { data, error } = await db.rpc('copilot_set_question_embeddings', { p_items: items.slice(i, i + 25), p_model: model })
        if (error) { console.error(JSON.stringify({ fn: 'copilot', outcome: 'set_embeddings_failed', code: error.code })); break }
        n += Number(data ?? 0)
      }
      return n
    },
  }
}
