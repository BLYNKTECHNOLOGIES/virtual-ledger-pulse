// deno-lint-ignore-file no-explicit-any
// Run: deno test supabase/functions/copilot-learn/handler.test.ts
import { handleLearn } from './handler.ts'
import { BLYNK, entry, eq, FakeAi, FakeStore, id, msg, OPERATOR, ok, SHUBHAM } from '../_shared/copilot-fakes.test-helpers.ts'

const NOW = new Date('2026-10-15T15:00:00Z')
const ORDER = '22944071217231917056'
const run = (store: FakeStore, ai: FakeAi, input: any, user = SHUBHAM) => handleLearn({ store, ai, now: () => NOW }, user, input)

async function withRequest(s: FakeStore, question = 'When will I get the TDS certificate?') {
  const r = await s.insertRequest({
    user_id: SHUBHAM, order_number: ORDER, mode: 'suggest', request_key: 'k1', status: 'ready', question_text: question, question_language: 'en',
    context: { side: 'SELL', status: 'TRADING', category: 'regular', account_id: BLYNK, client_state: 'approved' },
  })
  await s.updateRequest(r.id!, { question_embedding: new Array(1536).fill(0.02) })
  return r.id!
}

Deno.test('only approvers can teach, reject or undo', async () => {
  const s = new FakeStore(), a = new FakeAi()
  eq((await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, finalText: 'x' }, OPERATOR)).status, 403)
  eq((await run(s, a, { action: 'undo', eventId: id() }, OPERATOR)).status, 403)
  eq(s.learnCalls.length + s.undoCalls.length, 0)
})

Deno.test('an approved reply sent unchanged is merged without any AI check', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s)
  const e = entry({ similarity: 0.93 })
  s.entryRows = [{ id: e.entry_id, status: 'approved', title: e.title, reply_en: e.reply_en, reply_hi: e.reply_hi }]
  const r = await run(s, a, {
    action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, sourceEntryId: e.entry_id,
    insertedText: "Ma'am, the TDS certificate is shared every quarter.", finalText: "Ma'am, the TDS certificate is shared every quarter.",
  })
  eq(r.status, 200)
  eq(a.chats.length, 0, 'no judge call')
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_entry_id, p.p_reply_text, p.p_cause], ['merge', e.entry_id, 'Sir, the TDS certificate is shared every quarter.', 'sent'])
  eq(p.p_question_embedding, null, 'the SQL takes the stored request embedding')
  eq(p.p_request_id, reqId); eq(p.p_draft_edited, false)
})

Deno.test('an edited AI draft goes to the judge; its relation, translation, title and scope are used; numbers become placeholders', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Do I need to pay TDS on this order?')
  const cand = entry({ similarity: 0.72, title: 'TDS on sell orders' })
  s.matchRows = [cand]
  s.questionRows = [{ entry_id: cand.entry_id, question_text: 'tds kitna katega' }]
  s.phones = [{ purpose: 'support', phone: '+91 98111 22233' }]
  a.replies['google/gemini-3-flash-preview'] = (_sys: string, user: string) => {
    ok(user.includes('Sir, 1% TDS applies on {amount}. For questions call {contact:support}.'), 'judge sees the generalised reply')
    ok(user.includes(cand.entry_id), 'judge sees the candidate')
    return { ok: true, usage: { input: 900, output: 120, reasoning: 0, estimated: false }, latencyMs: 400, data: {
      relation: 'update', target_entry_id: cand.entry_id, client_specific: false, generalized_reply: '', other_language_reply: 'Sir, {amount} par 1% TDS lagta hai.',
      title: 'TDS on sell orders', scope_sides: ['SELL'], scope_statuses: [], scope_client_states: [], scope_categories: [], account_specific: true, reason: 'Clearer wording',
    } }
  }
  const r = await run(s, a, {
    action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, sourceCallId: id(),
    insertedText: 'Sir, TDS applies.', finalText: 'Sir, 1% TDS applies on 4,500.00. For questions call 98111 22233.',
    templateValues: { amount: 4500, orderNo: ORDER },
  })
  eq(r.status, 200); eq(r.body.judged, true)
  const p = s.learnCalls[0]
  eq(p.p_relation, 'update'); eq(p.p_target_entry_id, cand.entry_id)
  eq(p.p_reply_text, 'Sir, 1% TDS applies on {amount}. For questions call {contact:support}.')
  eq(p.p_reply_other, 'Sir, {amount} par 1% TDS lagta hai.')
  eq(p.p_scope, { sides: ['SELL'], account_ids: [BLYNK] })
  eq(p.p_draft_edited, true)
  eq(s.matchCalls[0].minSimilarity, 0.5, 'candidates from the learn threshold')
  ok(s.calls.some((c) => c.purpose === 'judge' && c.status === 'ok'), 'judge call logged')
})

Deno.test('a judge pointing at an unknown entry falls back to a new entry; client-specific details are generalised', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'payment kab aayega')
  a.replies['google/gemini-3-flash-preview'] = { ok: true, usage: { input: 1, output: 1, reasoning: 0, estimated: false }, latencyMs: 1, data: {
    relation: 'merge', target_entry_id: 'not-a-candidate', client_specific: true, generalized_reply: 'Sir, your payment of {amount} is being processed.',
    other_language_reply: 'Sir, call 9876543210', title: 'Payment processing', scope_sides: [], scope_statuses: ['CANCELLED'], scope_client_states: [], scope_categories: [], account_specific: false, reason: 'x',
  } }
  await run(s, a, { action: 'learn', cause: 'approved', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, your payment of 4500 to Ravi is being processed.' })
  const p = s.learnCalls[0]
  eq(p.p_relation, 'new'); eq(p.p_target_entry_id, null)
  eq(p.p_reply_text, 'Sir, your payment of {amount} is being processed.')
  eq(p.p_reply_other, null, 'a translation with a phone number is dropped')
  eq(p.p_scope, { statuses: ['CANCELLED', 'CANCELLED_BY_SYSTEM'] })
})

Deno.test('over the monthly cap: saved without the AI check', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.spend = 25000
  const reqId = await withRequest(s)
  const r = await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, it is shared every quarter on email.' })
  eq(a.chats.length, 0); eq(s.learnCalls[0].p_relation, 'new'); ok(r.body.reason.includes('budget'))
})

Deno.test('without a stored request the question is rebuilt from the chat, skipping our just-sent reply', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'kyc ke liye kya bhejna hai'), msg('us', 'Sir, please share your Aadhaar card (front and back).')]
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, finalText: 'Sir, please share your Aadhaar card (front and back).' })
  const p = s.learnCalls[0]
  eq(p.p_question_text, 'kyc ke liye kya bhejna hai'); eq(p.p_question_language, 'hi')
  ok(Array.isArray(p.p_question_embedding) && p.p_question_embedding.length === 1536, 'fresh embedding passed')
  s.rows = [msg('us', 'Good evening, sir.')]
  eq((await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Hello' })).status, 422)
})

Deno.test('saving an earlier message of ours uses the client question before that message', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const q1 = msg('client', 'TDS certificate kab milega?'), r1 = msg('us', 'Sir, it is emailed every quarter.')
  const q2 = msg('client', 'ok and the rate?'), r2 = msg('us', 'Sir, the rate is shown on the order.')
  s.rows = [q1, r1, q2, r2]
  await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, it is emailed every quarter.', beforeAt: Number(r1.binance_create_time) + 1, requestId: id() })
  eq(s.learnCalls[0].p_question_text, 'TDS certificate kab milega?')
  eq(s.learnCalls[0].p_request_id, null, 'a stored request for the latest message is not used for an earlier one')
})

Deno.test('personal data never reaches the Playbook', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.spend = 25000
  const reqId = await withRequest(s)
  await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, we received UTR 412345678901 from ravi@okhdfc.' })
  eq(s.learnCalls[0].p_reply_text, 'Sir, we received UTR [number] from [upi].')
})

Deno.test('reject keeps the draft as an example to avoid; a sent draft cannot be rejected', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const draft = await s.logCall({ purpose: 'draft', model: 'm', status: 'ok' })
  const sent = await s.logCall({ purpose: 'draft', model: 'm', status: 'ok', feedback: 'used' })
  const emb = await s.logCall({ purpose: 'embed', model: 'm', status: 'ok' })
  eq((await run(s, a, { action: 'reject', callId: draft, reason: 'Promised release; client 9876543210' })).body, { rejected: true })
  eq(s.calls.find((c) => c.id === draft).feedback_reason, 'Promised release; client [phone]')
  eq((await run(s, a, { action: 'reject', callId: sent })).status, 409)
  eq((await run(s, a, { action: 'reject', callId: emb })).status, 404)
})

Deno.test('undo passes through, with clear refusals', async () => {
  const s = new FakeStore(), a = new FakeAi()
  eq((await run(s, a, { action: 'undo', eventId: id() })).body.undone, true)
  const refused = await run(s, a, { action: 'undo', eventId: '00000000-0000-4000-8000-999999999999' })
  eq(refused.status, 409); ok(refused.body.message.includes('changed after that save'))
  eq((await run(s, a, { action: 'undo', eventId: 'nope' })).status, 400)
})
