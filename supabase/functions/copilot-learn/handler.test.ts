// deno-lint-ignore-file no-explicit-any
// Run: deno test supabase/functions/copilot-learn/handler.test.ts
import { handleLearn } from './handler.ts'
import { BLYNK, entry, eq, FakeAi, FakeStore, id, msg, OPERATOR, ok, SHUBHAM } from '../_shared/copilot-fakes.test-helpers.ts'

const NOW = new Date('2026-10-15T15:00:00Z')
const ORDER = '22944071217231917056'
const run = (store: FakeStore, ai: FakeAi, input: any, user = SHUBHAM) => handleLearn({ store, ai, now: () => NOW }, user, input)

async function withRequest(s: FakeStore, question = 'When will I get the TDS certificate?', extra: Record<string, unknown> = {}, matches: any[] = []) {
  const r = await s.insertRequest({
    user_id: SHUBHAM, order_number: ORDER, mode: 'suggest', request_key: 'k1', status: 'ready', question_text: question, question_language: 'en',
    context: { side: 'SELL', status: 'TRADING', category: 'regular', account_id: BLYNK, client_state: 'approved', ...extra }, matches,
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
  s.entryRows = [{ id: e.entry_id, topic_id: e.topic_id, scope: {}, status: 'approved', title: e.title, reply_en: e.reply_en, reply_hi: e.reply_hi }]
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
  eq(p.p_stage, null); eq(p.p_question_text, 'When will I get the TDS certificate?')
})

Deno.test('an edited AI draft goes to the judge; its relation, translation, title and scope are used; numbers become placeholders', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Do I need to pay TDS on this order?')
  const cand = entry({ similarity: 0.72, title: 'TDS on sell orders' })
  s.matchRows = [cand]
  s.questionRows = [{ topic_id: cand.topic_id, question_text: 'tds kitna katega' }]
  s.phones = [{ purpose: 'support', phone: '+91 98111 22233' }]
  a.replies['google/gemini-3-flash-preview'] = (_sys: string, user: string) => {
    ok(user.includes('Sir, 1% TDS applies on {amount}. For questions call {contact:support}.'), 'judge sees the generalised reply')
    ok(user.includes(cand.entry_id), 'judge sees the candidate')
    return { ok: true, usage: { input: 900, output: 120, reasoning: 0, estimated: false }, latencyMs: 400, data: {
      relation: 'update', target_entry_id: cand.entry_id, target_question_id: '', client_specific: false, generalized_reply: '', other_language_reply: 'Sir, {amount} par 1% TDS lagta hai.',
      title: 'TDS on sell orders', phrasing: 'Do I need to pay TDS on this order?', situation_specific: false,
      scope_sides: ['SELL'], scope_client_states: [], scope_categories: [], account_specific: true, reason: 'Clearer wording',
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
    relation: 'merge', target_entry_id: 'not-a-candidate', target_question_id: '', client_specific: true, generalized_reply: 'Sir, your payment of {amount} is being processed.',
    other_language_reply: 'Sir, call 9876543210', title: 'Payment processing', phrasing: 'payment kab aayega', situation_specific: false,
    scope_sides: [], scope_client_states: ['new'], scope_categories: [], account_specific: false, reason: 'x',
  } }
  await run(s, a, { action: 'learn', cause: 'approved', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, your payment of 4500 to Ravi is being processed.' })
  const p = s.learnCalls[0]
  eq(p.p_relation, 'new'); eq(p.p_target_entry_id, null)
  eq(p.p_reply_text, 'Sir, your payment of {amount} is being processed.')
  eq(p.p_reply_other, null, 'a translation with a phone number is dropped')
  eq(p.p_scope, { client_states: ['new'] })
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

// ─── Situations, phrasings, indexing and rewrites (CP-4) ─────────────────────────────────────────────

const judgeReply = (data: Record<string, unknown>) => ({ ok: true, usage: { input: 1, output: 1, reasoning: 0, estimated: false }, latencyMs: 1, data: {
  relation: 'new', target_entry_id: '', target_question_id: '', client_specific: false, generalized_reply: '', other_language_reply: '', title: 'T',
  phrasing: '', situation_specific: false, scope_sides: [], scope_client_states: [], scope_categories: [], account_specific: false, reason: 'r', ...data,
} })

Deno.test('a reply used unchanged in a situation it was not saved for widens it, without any AI', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'How much time?', { situation: 'sell.kyc.call' })
  const e = entry({ scope: { stages: ['sell.kyc.review'] }, reply_en: 'Please allow us a few minutes for verification, sir.' })
  s.entryRows = [{ id: e.entry_id, topic_id: e.topic_id, scope: e.scope, status: 'approved', title: 'How long', reply_en: e.reply_en, reply_hi: null }]
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, sourceEntryId: e.entry_id, finalText: e.reply_en })
  eq(a.chats.length, 0)
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_entry_id, p.p_stage], ['widen', e.entry_id, 'sell.kyc.call'])
  eq(s.matchCalls[0].stage, 'sell.kyc.call', 'candidates looked up for the same situation')
})

Deno.test('the judge calling a reply for another situation a conflict saves a new situation reply instead', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.pending' })
  const cand = entry({ title: 'Can I pay now?', scope: { stages: ['sell.pay.ready'] }, fits: false, specificity: -1, reply_en: 'Yes, sir. Please pay to the details shared.' })
  s.matchRows = [cand]
  a.replies['google/gemini-3-flash-preview'] = (_sys: string, user: string) => {
    const u = JSON.parse(user)
    eq(u.order_context.situation, 'KYC pending')
    eq(u.candidates[0].replies[0].situations, ['Client can pay']); eq(u.candidates[0].replies[0].fits_now, false)
    return judgeReply({ relation: 'conflict', target_entry_id: cand.entry_id, situation_specific: true, phrasing: 'Can I pay now?' })
  }
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, please share the requested KYC details first.' })
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_entry_id, p.p_target_topic_id], ['variant', null, cand.topic_id])
  eq(p.p_scope, { stages: ['sell.kyc.pending'] })
  eq(p.p_context.situation, 'sell.kyc.pending'); eq(p.p_context.situation_label, 'KYC pending')
})

Deno.test('a conflict with a reply that applies now stays a conflict, with the chat kept for the inbox', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.review', chat_tail: [{ from: 'client', at: '15 Oct, 11:11', text: 'Can I pay now?' }] })
  const cand = entry({ title: 'Can I pay now?', scope: { stages: ['sell.kyc'] }, specificity: 2, reply_en: 'Please wait a moment, sir.' })
  s.matchRows = [cand]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'conflict', target_entry_id: cand.entry_id, situation_specific: true })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, our team is reviewing your documents; it takes about ten minutes.' })
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_entry_id], ['conflict', cand.entry_id])
  eq(p.p_scope, { stages: ['sell.kyc.review'] })
  eq(p.p_context.chat, [{ from: 'client', at: '15 Oct, 11:11', text: 'Can I pay now?' }])
})

Deno.test('judge "variant" adds a reply for this situation to that question; a general reply gets no situation', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'How much time?', { situation: 'buy.pay.cooling' })
  const cand = entry({ title: 'How long will it take?', scope: { stages: ['buy.pay.processing'] }, fits: false, specificity: -1 })
  s.matchRows = [cand]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'variant', target_question_id: cand.topic_id, situation_specific: false })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, the bank allows the first payment after its waiting period.' })
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_topic_id], ['variant', cand.topic_id])
  eq(p.p_scope, { stages: ['buy.pay.cooling'] }, 'a variant always belongs to the situation it was written for')
  s.learnCalls = []
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new', situation_specific: false })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, 1% TDS applies to this order.' })
  eq(s.learnCalls[0].p_scope, {}, 'not situation-specific: any situation')
})

Deno.test('the phrasing kept is the message that matched, not several client messages joined', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const e = entry({ reply_en: 'Please allow us a few minutes, sir.' })
  const reqId = await withRequest(s, 'hello / are you there / how much time', { inputs: ['hello / are you there / how much time', 'how much time'] },
    [{ entry_id: e.entry_id, topic_id: e.topic_id, similarity: 0.71, input_index: 0 }, { entry_id: e.entry_id, topic_id: e.topic_id, similarity: 0.93, input_index: 1 }])
  s.entryRows = [{ id: e.entry_id, topic_id: e.topic_id, scope: {}, status: 'approved', title: 'How long', reply_en: e.reply_en, reply_hi: null }]
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, sourceEntryId: e.entry_id, finalText: e.reply_en })
  const p = s.learnCalls[0]
  eq(p.p_question_text, 'how much time')
  ok(Array.isArray(p.p_question_embedding) && p.p_question_embedding.length === 1536, 'its own embedding')
  eq(a.embeds, [['how much time']])
})

Deno.test("the judge's quote is used only when it is really in the client's message", async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'ok / tds kyu kata', { inputs: ['ok / tds kyu kata', 'tds kyu kata'] })
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ phrasing: 'tds kyu kata' })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, 1% TDS is deducted as per law.' })
  eq(s.learnCalls[0].p_question_text, 'tds kyu kata')
  s.learnCalls = []
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ phrasing: 'Why was TDS deducted?' })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, 1% TDS is deducted as per law.' })
  eq(s.learnCalls[0].p_question_text, 'tds kyu kata', 'an invented quote falls back to the message that matched')
})

Deno.test('index makes waiting phrasings searchable right away (masked)', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.pending = [{ id: 'q1', question_text: 'Why TDS?' }, { id: 'q2', question_text: 'call 9876543210' }]
  const r = await run(s, a, { action: 'index' })
  eq(r.body, { indexed: 2, left: 0 })
  ok(!a.embeds[0].join(' ').includes('9876543210'))
  eq((await run(s, a, { action: 'index' })).body, { indexed: 0, left: 0 })
  a.embedFails = true
  s.pending = [{ id: 'q3', question_text: 'Why KYC?' }]
  eq((await run(s, a, { action: 'index' })).status, 502)
  eq((await run(s, a, { action: 'index' }, OPERATOR)).status, 403)
})

Deno.test('translate rewrites a reply in natural Hinglish for review; no numbers; within the budget', async () => {
  const s = new FakeStore(), a = new FakeAi()
  a.replies['google/gemini-3-flash-preview'] = (system: string, user: string) => {
    ok(system.includes('Hinglish in English letters') && system.includes('not "kripya"'))
    eq(JSON.parse(user).reply, 'Sir, your payment is in progress.')
    return { ok: true, usage: { input: 10, output: 10, reasoning: 0, estimated: false }, latencyMs: 1, data: { text: "Ma'am, aapka payment process ho raha hai." } }
  }
  const r = await run(s, a, { action: 'translate', text: 'Sir, your payment is in progress.', to: 'hi' })
  eq(r.body, { text: 'Sir, aapka payment process ho raha hai.', language: 'hi' })
  ok(s.calls.some((c) => c.purpose === 'translate' && c.status === 'ok'))
  a.replies['google/gemini-3-flash-preview'] = { ok: true, usage: { input: 1, output: 1, reasoning: 0, estimated: false }, latencyMs: 1, data: { text: 'Sir, 9876543210 par call karein.' } }
  eq((await run(s, a, { action: 'translate', text: 'Sir, call our team.', to: 'hi' })).status, 422)
  s.spend = 25000
  eq((await run(s, a, { action: 'translate', text: 'Sir, call our team.', to: 'hi' })).status, 429)
  eq((await run(s, a, { action: 'translate', text: '', to: 'hi' })).status, 400)
})

Deno.test('the chat a reply was used in is saved with it as an example; the judge sees replies with their example chats', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'How much time?', {
    situation: 'sell.kyc.call', context_text: 'situation: Verification call\nus: our team will connect you soon',
    chat_tail: [{ from: 'us', at: '16 Oct, 11:13', text: 'our team will connect you soon' }, { from: 'client', at: '16 Oct, 11:20', text: 'How much time?' }],
    chat_before: [{ from: 'us', text: 'our team will connect you soon' }],
  })
  await s.updateRequest(reqId, { context_embedding: new Array(1536).fill(0.03) })
  const cand = entry({ title: 'How long will it take?', scope: { stages: ['sell.kyc.call'] }, specificity: 3 })
  s.matchRows = [cand]
  s.exampleRows = [{ entry_id: cand.entry_id, chat: [{ from: 'us', text: 'KYC call done, verifying' }, { from: 'client', text: 'how long?' }] }]
  a.replies['google/gemini-3-flash-preview'] = (_sys: string, user: string) => {
    const u = JSON.parse(user)
    eq(u.order_context.chat_before, [{ from: 'us', text: 'our team will connect you soon' }])
    eq(u.candidates[0].replies[0].example_chat[0].text, 'KYC call done, verifying')
    return judgeReply({ relation: 'variant', target_question_id: cand.topic_id, situation_specific: true })
  }
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, our KYC team will call you in a few minutes.' })
  const p = s.learnCalls[0]
  eq(p.p_relation, 'variant'); eq(p.p_scope, { stages: ['sell.kyc.call'] }, 'same situation, different earlier chat: a separate reply')
  eq(p.p_example_chat, [{ from: 'us', text: 'our team will connect you soon' }, { from: 'client', text: 'How much time?' }])
  eq(p.p_example_text, 'situation: Verification call\nus: our team will connect you soon')
  eq(p.p_example_embedding.length, 1536)
  eq(s.matchCalls[0].contextEmbedding?.length, 1536, 'candidates compared by the chat too')
})

Deno.test('index also makes seeded example chats searchable', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.pending = [{ id: 'q1', question_text: 'Why TDS?' }]
  s.pendingEx = [{ id: 'x1', context_text: 'situation: KYC pending\nus: please share Aadhaar' }]
  const r = await run(s, a, { action: 'index' })
  eq(r.body, { indexed: 2, left: 0 })
  eq(a.embeds[0].length, 2); eq(s.embeddedEx.map((e) => e.id), ['x1'])
})

// ─── Review fixes: the situation of an earlier message, full-scope fit, payment replies, masking ─────────

let sseq = 0
const sysRow = (type: string, afterRow: { binance_create_time?: number | string | null }) => ({
  binance_message_id: `sys${++sseq}`, message_type: 'system', is_system_message: true, message_text: JSON.stringify({ type }),
  binance_create_time: Number(afterRow.binance_create_time) + 100 + sseq,
})

Deno.test("saving an earlier message files it under the situation it was sent in, not today's", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, order_status: 'COMPLETED' }
  const ask = msg('us', 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')
  const q = msg('client', 'Can I pay now?')
  const r1 = msg('us', 'Sir, verification complete hote hi payment details share kar denge.')
  const upi = msg('us', 'pos.5307682@indus')
  s.rows = [sysRow('order_created_with_additional_kyc_maker_sell', { binance_create_time: Number(ask.binance_create_time) - 500 }), ask, q, r1,
    sysRow('maker_verified_additional_kyc_maker_sell', r1), upi, sysRow('seller_payed', upi), sysRow('seller_completed', upi)]
  await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, verification complete hote hi payment details share kar denge.', beforeAt: Number(r1.binance_create_time) + 1 })
  const p = s.learnCalls[0]
  eq(p.p_stage, 'sell.kyc.pending', 'the KYC wait it was sent in, not "Completed"')
  eq(p.p_context.situation_label, 'KYC pending')
  eq([s.matchCalls[0].stage, s.matchCalls[0].status], ['sell.kyc.pending', 'TRADING'], 'and the status it had then')
  eq(p.p_question_text, 'Can I pay now?')
  // the same save without beforeAt (the latest message) uses today's situation
  s.learnCalls = []; s.matchCalls = []
  s.rows = [...s.rows, msg('client', 'thanks'), msg('us', 'Thank you, sir.')]
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, finalText: 'Thank you, sir.' })
  eq(s.learnCalls[0].p_stage, 'done')
})

Deno.test('the judge "updating" a reply for another situation saves a reply for this situation instead', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'How much time?', { situation: 'sell.kyc.call' })
  const cand = entry({ title: 'How long will it take?', scope: { stages: ['sell.kyc.review'] }, fits: false, specificity: -1, reply_en: 'Please allow us a few minutes to verify your details, sir.' })
  s.matchRows = [cand]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'update', target_entry_id: cand.entry_id, situation_specific: true })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, our KYC team will call you in a few minutes for the one-time verification.' })
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_entry_id, p.p_target_topic_id], ['variant', null, cand.topic_id], 'the "Checking KYC" reply is left as it is')
  eq(p.p_scope, { stages: ['sell.kyc.call'] })
})

Deno.test('a reply for another kind of client is a variant, not a conflict: the judge sees the full fit', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Your contact number?', { situation: 'sell.kyc.pending', client_state: 'new' })
  const rmReply = entry({ title: 'Our contact number', scope: { client_states: ['approved'] }, fits: false, specificity: -1, reply_en: 'Sir, you can reach our relationship team at {contact:rm}.' })
  s.matchRows = [rmReply]
  a.replies['google/gemini-3-flash-preview'] = (_sys: string, user: string) => {
    eq(JSON.parse(user).candidates[0].replies[0].fits_now, false, 'a reply for approved clients does not apply to a new client')
    return judgeReply({ relation: 'conflict', target_entry_id: rmReply.entry_id, scope_client_states: ['new', 'linked'] })
  }
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, our KYC team will contact you for the verification.' })
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_topic_id], ['variant', rmReply.topic_id])
  eq(p.p_scope, { client_states: ['new', 'linked'], stages: ['sell.kyc.pending'] })
})

Deno.test('a reply asking the client to pay is filed under "Client can pay", never under KYC or any situation', async () => {
  // new question, judged situation-specific while the chat showed "Checking KYC"
  let s = new FakeStore(), a = new FakeAi()
  let reqId = await withRequest(s, 'Where do I pay?', { situation: 'sell.kyc.review' })
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new', situation_specific: true })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, please pay to the payment details shown in the order.' })
  eq(s.learnCalls[0].p_scope, { stages: ['sell.pay.ready'] })
  // a general one (no situation) too
  s = new FakeStore(); a = new FakeAi()
  reqId = await withRequest(s, 'Where do I pay?', { situation: 'sell.pay.ready' })
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new', situation_specific: false })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, payment kar dijiye.' })
  eq(s.learnCalls[0].p_scope, { stages: ['sell.pay.ready'] })
  // a conflict with the KYC reply becomes a reply for "Client can pay"
  s = new FakeStore(); a = new FakeAi()
  reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.review' })
  const kyc = entry({ title: 'Can I pay now?', scope: { stages: ['sell.kyc.review', 'sell.kyc.call'] }, specificity: 3, reply_en: 'Please wait a moment, sir.' })
  s.matchRows = [kyc]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'conflict', target_entry_id: kyc.entry_id, situation_specific: true })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Yes sir, please pay to {upi}.' })
  eq([s.learnCalls[0].p_relation, s.learnCalls[0].p_target_topic_id, s.learnCalls[0].p_target_entry_id], ['variant', kyc.topic_id, null])
  eq(s.learnCalls[0].p_scope, { stages: ['sell.pay.ready'] })
  // used unchanged during KYC: counted, but never widened into KYC
  s = new FakeStore(); a = new FakeAi()
  reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.pending' })
  const pay = entry({ scope: { stages: ['sell.pay.ready'] }, reply_en: 'Yes, sir. Please pay to the payment details shared in this order.' })
  s.entryRows = [{ id: pay.entry_id, topic_id: pay.topic_id, scope: pay.scope, status: 'approved', title: 'Can I pay now?', reply_en: pay.reply_en, reply_hi: null }]
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, sourceEntryId: pay.entry_id, finalText: pay.reply_en })
  eq(s.learnCalls[0].p_relation, 'merge')
  // a KYC reply that talks about paying after it stays a KYC reply
  s = new FakeStore(); a = new FakeAi()
  reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.pending' })
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new', situation_specific: true })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, please share your Aadhaar first, then you can make the payment.' })
  eq(s.learnCalls[0].p_scope, { stages: ['sell.kyc.pending'] })
  // never merged into a KYC reply (which would fill its empty or AI-written copy): a reply of its own
  s = new FakeStore(); a = new FakeAi()
  reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.pending' })
  const kycOnly = entry({ title: 'Can I pay now?', scope: { stages: ['sell.kyc'] }, specificity: 2, reply_en: null, reply_hi: 'Sir, pehle KYC details share kar dijiye.' })
  s.matchRows = [kycOnly]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'merge', target_entry_id: kycOnly.entry_id })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Yes sir, please pay to the details shown in the order.' })
  eq([s.learnCalls[0].p_relation, s.learnCalls[0].p_target_topic_id, s.learnCalls[0].p_target_entry_id], ['variant', kycOnly.topic_id, null])
  eq(s.learnCalls[0].p_scope, { stages: ['sell.pay.ready'] })
  // the same without the AI check (over the budget): an edited KYC reply that now asks to pay
  s = new FakeStore(); a = new FakeAi(); s.spend = 25000
  reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.pending' })
  const kycSrc = entry({ scope: { stages: ['sell.kyc.pending'] }, reply_en: 'Sir, please share the requested KYC details first.' })
  s.entryRows = [{ id: kycSrc.entry_id, topic_id: kycSrc.topic_id, scope: kycSrc.scope, status: 'approved', title: 'Can I pay now?', reply_en: kycSrc.reply_en, reply_hi: null }]
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, sourceEntryId: kycSrc.entry_id, finalText: 'Ji sir, payment kar dijiye.' })
  eq([s.learnCalls[0].p_relation, s.learnCalls[0].p_target_topic_id], ['variant', kycSrc.topic_id])
  eq(s.learnCalls[0].p_scope, { stages: ['sell.pay.ready'] })
  // "verification is complete, you can pay now" while the chat still showed KYC: not written into the KYC reply,
  // and filed under "Client can pay"
  s = new FakeStore(); a = new FakeAi()
  reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.review' })
  const waitReply = entry({ title: 'Can I pay now?', scope: { stages: ['sell.kyc.review', 'sell.kyc.call'] }, specificity: 3, reply_en: 'Please wait a moment, sir. We will share the payment details as soon as your verification is complete.' })
  s.matchRows = [waitReply]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'update', target_entry_id: waitReply.entry_id })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, your verification is complete, you can pay now.' })
  eq([s.learnCalls[0].p_relation, s.learnCalls[0].p_target_topic_id, s.learnCalls[0].p_target_entry_id], ['variant', waitReply.topic_id, null])
  eq(s.learnCalls[0].p_scope, { stages: ['sell.pay.ready'] })
  // a KYC request that also says "then you can pay" is kept out of the KYC reply but stays a KYC-time reply
  s = new FakeStore(); a = new FakeAi()
  reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.pending' })
  const ask = entry({ title: 'Can I pay now?', scope: { stages: ['sell.kyc.pending'] }, specificity: 3, reply_en: 'Sir, please share the requested KYC details first.' })
  s.matchRows = [ask]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'merge', target_entry_id: ask.entry_id })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, please share your Aadhaar first, then you can make the payment.' })
  eq([s.learnCalls[0].p_relation, s.learnCalls[0].p_target_topic_id], ['variant', ask.topic_id])
  eq(s.learnCalls[0].p_scope, { stages: ['sell.kyc.pending'] })
  // on our buy orders paying is ours: nothing changes
  s = new FakeStore(); a = new FakeAi()
  reqId = await withRequest(s, 'Have you paid?', { side: 'BUY', situation: 'buy.pay.processing' })
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new', situation_specific: false })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, we will transfer the amount in a few minutes.' })
  eq(s.learnCalls[0].p_scope, {})
})

Deno.test('the judge never sees personal data typed in the reply', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Who do I call?')
  s.matchRows = [entry({ similarity: 0.7 })]
  a.replies['google/gemini-3-flash-preview'] = (_sys: string, user: string) => {
    ok(!user.includes('9876543210') && !user.includes('ravi@okhdfc') && !user.includes('ABCDE1234F'), 'masked before the judge')
    ok(user.includes('[phone]') && user.includes('[upi]'), 'with placeholders for what was typed')
    return judgeReply({ relation: 'new' })
  }
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, call 9876543210 or write to ravi@okhdfc with PAN ABCDE1234F.' })
  eq(a.chats.length, 1)
  ok(!String(s.learnCalls[0].p_reply_text).includes('9876543210'))
})

// ─── A reply picked for another step (CP-5) ─────────────────────────────────────────────────────────

async function stepSetup(context: Record<string, unknown>) {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Shall I pay now?', {
    situation: 'sell.kyc.call', context_text: 'situation: Verification call\nus: Sir one time verification is needed.', chat_before: [{ from: 'us', text: 'Sir one time verification is needed.' }],
    chat_tail: [{ from: 'client', at: '20:30', text: 'Shall I pay now?' }], ...context,
  })
  await s.updateRequest(reqId, { context_embedding: new Array(1536).fill(0.03) })
  const e = entry({ title: 'Can I pay now?', scope: { stages: ['sell.kyc.pending'] }, fits: false, specificity: -1, reply_en: 'Sir, please share the requested KYC details first.', reply_hi: null })
  s.entryRows = [{ id: e.entry_id, topic_id: e.topic_id, scope: e.scope, status: 'approved', title: e.title, reply_en: e.reply_en, reply_hi: null }]
  s.matchRows = [e]
  const send = (situation: unknown, extra: Record<string, unknown> = {}) => run(s, a, {
    action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, sourceEntryId: e.entry_id, situation,
    insertedText: 'Sir, please share the requested KYC details first.', finalText: 'Sir, please share the requested KYC details first.', ...extra,
  })
  return { s, a, e, send }
}

Deno.test('a reply picked for another step is filed under that step ("use = approve"), with its example chat labelled for it', async () => {
  const { s, a, e, send } = await stepSetup({})
  const r = await send('sell.kyc.pending')
  eq(r.status, 200); eq(a.chats.length, 0, 'used unchanged: no judge')
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_entry_id, p.p_stage], ['merge', e.entry_id, 'sell.kyc.pending'], 'a merge for its own step, not a widening into the detected one')
  eq(p.p_context.situation, 'sell.kyc.pending'); eq(p.p_context.situation_label, 'KYC pending')
  ok(String(p.p_example_text).startsWith('situation: KYC pending'), 'the example chat says the step the approver picked')
  eq(p.p_example_embedding, null, 'its embedding is made at the next lookup, never the one labelled with the old step')
  eq(s.matchCalls[0].stage, 'sell.kyc.pending'); eq(r.body.situation, 'KYC pending')
})

Deno.test('a picked step is ignored when it is not a step for this order, would end KYC, or when Binance has the status', async () => {
  for (const bad of ['sell.kyc', 'buy.details', 'sell.pay.checking', 'sell.pay.ready', 'nonsense', 42]) {
    const { s, send } = await stepSetup({})
    await send(bad)
    eq([s.learnCalls[0].p_stage, s.learnCalls[0].p_relation], ['sell.kyc.call', 'widen'], `ignored: ${bad}`)
  }
  // Paid on Binance: the status situation stands whatever was picked.
  const paid = await stepSetup({ situation: 'sell.pay.checking', status: 'BUYER_PAYED' })
  await paid.send('sell.kyc.review')
  eq(paid.s.learnCalls[0].p_stage, 'sell.pay.checking')
})

Deno.test('saving an older message ignores a picked step: it is filed under the step it was sent in', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'When will I get the TDS certificate?'), msg('us', 'Sir, the TDS certificate is shared every quarter.')]
  const before = Number(s.rows[1].binance_create_time) + 1000
  const r = await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, the TDS certificate is shared every quarter.', beforeAt: before, situation: 'sell.kyc.review' })
  eq(r.status, 200)
  eq(s.learnCalls[0].p_stage, 'sell.pay.ready', 'the chat at that time had no KYC')
})

Deno.test('before verification a pay reply is never widened into KYC, even by a reply that asks nothing of the kind', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Can I pay now?', { situation: 'sell.kyc.review' })
  const pay = entry({ title: 'Can I pay now?', scope: { stages: ['sell.pay.ready'] }, fits: false, specificity: -1, reply_en: 'Yes, sir. Please pay to the payment details shared in this order.' })
  s.matchRows = [pay]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'merge', target_entry_id: pay.entry_id })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, we are checking your details. Please wait a few minutes.' })
  const p = s.learnCalls[0]
  eq([p.p_relation, p.p_target_topic_id, p.p_target_entry_id], ['variant', pay.topic_id, null], 'a reply of its own for this step, not a wider pay reply')
  eq(p.p_scope.stages, ['sell.kyc.review'])
})

Deno.test('a request to pay sent while the chat showed KYC is filed under "Client can pay", with its example chat there too', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const reqId = await withRequest(s, 'Where do I pay?', { situation: 'sell.kyc.review', context_text: 'situation: Checking KYC\nus: Please share your Aadhaar.' })
  await s.updateRequest(reqId, { context_embedding: new Array(1536).fill(0.03) })
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new', situation_specific: true })
  const r = await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, requestId: reqId, finalText: 'Sir, please pay to the payment details shown in the order.' })
  const p = s.learnCalls[0]
  eq(p.p_scope, { stages: ['sell.pay.ready'] }); eq(p.p_stage, 'sell.pay.ready')
  ok(String(p.p_example_text).startsWith('situation: Client can pay'), 'the example is labelled with the step the reply is filed under')
  eq(p.p_example_embedding, null); eq(p.p_context.situation, 'sell.kyc.review', 'the learning log keeps what the chat showed')
  eq(r.body.situation, 'Client can pay')
})

Deno.test("saving an earlier message: Binance's \"verified\" today does not file it under \"Client can pay\"", async () => {
  const s = new FakeStore(), a = new FakeAi()
  // No KYC notice synced in the chat; Binance's order data says extra KYC was required and is verified by now.
  s.orderRow = { ...s.orderRow, kyc_raw: '2', kyc_detail: '2' }
  const q = msg('client', 'Can I pay now?')
  const r1 = msg('us', 'Sir, verification complete hote hi payment details share kar denge.')
  s.rows = [q, r1]
  await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, verification complete hote hi payment details share kar denge.', beforeAt: Number(r1.binance_create_time) + 1 })
  eq(s.learnCalls[0].p_stage, 'sell.kyc.pending', 'KYC was still pending when it was sent')
  // the latest message, today: verified on Binance
  s.learnCalls = []
  s.rows = [q, r1, msg('client', 'thank you'), msg('us', 'Thank you, sir.')]
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, finalText: 'Thank you, sir.' })
  eq(s.learnCalls[0].p_stage, 'sell.pay.ready')
})

Deno.test("an approver's re-check after Binance-only \"verified\": our hand-typed KYC request is filed under KYC, not \"Client can pay\"", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, kyc_raw: '2', kyc_detail: '2' }
  const ask = msg('us', 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')
  const rows = [sysRow('order_created_with_additional_kyc_maker_sell', { binance_create_time: Number(ask.binance_create_time) - 500 }), ask,
    msg('client', 'img', 'image'), msg('us', 'Sir one time verification is needed, our team will connect you soon.'), msg('client', 'ok')]
  const markAt = Number(rows[rows.length - 1].binance_create_time) + 500
  const q = msg('client', 'Can I pay now?')
  const reply = msg('us', 'Sir, the Aadhar image is not clear. Please share your Aadhar card again')
  s.rows = [...rows, q, reply]
  s.mark = { code: 'sell.kyc.pending', at: markAt, by: SHUBHAM, detected: 'sell.pay.ready' }
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, finalText: 'Sir, the Aadhar image is not clear. Please share your Aadhar card again' })
  eq(s.learnCalls[0].p_stage, 'sell.kyc.pending')
})

Deno.test("Binance-only \"verified\": our KYC request after an approver's \"Client can pay\" is filed under KYC", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, kyc_raw: '2', kyc_detail: '2' }
  const ask = msg('us', 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')
  const rows = [sysRow('order_created_with_additional_kyc_maker_sell', { binance_create_time: Number(ask.binance_create_time) - 500 }), ask,
    msg('client', 'img', 'image'), msg('us', 'Sir one time verification is needed, our team will connect you soon.'), msg('client', 'ok')]
  const t = Number(rows[rows.length - 1].binance_create_time)
  s.marks = [{ code: 'sell.pay.ready', at: t + 500, by: SHUBHAM, detected: 'sell.pay.ready' }]
  s.rows = [...rows, msg('client', 'Can I pay now?'), msg('us', 'Sir, please share your Aadhar card again, the photo is cut')]
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, finalText: 'Sir, please share your Aadhar card again, the photo is cut' })
  eq(s.learnCalls[0].p_stage, 'sell.kyc.pending')
})

// ── CP-7: the words typed before a rewrite, and operators' replies from the inbox ──

Deno.test('a rewrite an approver sent: the typed words stay with the example chat (masked) and with a conflict, never with the judge', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.learnResult = { event_id: 'ev-1', action: 'conflict', entry_id: 'en-2', example_id: 'ex-9', title: 'Bank details' }
  s.rows = [msg('client', 'can you give bank details instead of upi?'), msg('us', 'Sir, IMPS is not available at the moment. Kindly pay via UPI.')]
  const cand = entry({ title: 'Bank details', reply_en: 'Sir, please find our bank details on the order.' })
  s.matchRows = [cand]
  a.replies['google/gemini-3-flash-preview'] = (system: string, user: string) => {
    ok(!system.includes('desk_note') && !user.includes('imps abhi'), 'the judge never sees the typed words')
    return judgeReply({ relation: 'conflict', target_entry_id: cand.entry_id, situation_specific: true })
  }
  const r = await run(s, a, {
    action: 'learn', cause: 'sent', orderNumber: ORDER, sourceCallId: id(), insertedText: 'Sir, IMPS is not available at the moment. Kindly pay via UPI.',
    finalText: 'Sir, IMPS is not available at the moment. Kindly pay via UPI.', note: '  imps abhi nahi milega, upi pe karo blynk@ybl ',
  })
  eq(r.status, 200); eq(s.learnCalls[0].p_relation, 'conflict', 'a decision does not turn a conflict into a variant')
  eq(s.learnCalls[0].p_context.note, 'imps abhi nahi milega, upi pe karo [upi]', 'the approver sees the reason with the conflict')
  eq(s.exampleNotes, [{ id: 'ex-9', note: 'imps abhi nahi milega, upi pe karo [upi]' }])
  eq(r.body.inboxItemClosed, false)
})

Deno.test("the typed words are kept like the reply: the order's values as placeholders", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.learnResult = { event_id: 'ev-1', action: 'created', entry_id: 'en-1', example_id: 'ex-1', title: 'T' }
  s.rows = [msg('client', 'how much should I pay?'), msg('us', 'Sir, please pay 4,500.00 via UPI.')]
  s.matchRows = [entry()]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new' })
  await run(s, a, {
    action: 'learn', cause: 'sent', orderNumber: ORDER, sourceCallId: id(), finalText: 'Sir, please pay 4,500.00 via UPI.',
    note: 'rahul sharma 4500 upi pe bhejo', templateValues: { amount: 4500, name: 'Rahul Sharma' },
  })
  eq(s.exampleNotes, [{ id: 'ex-1', note: '{name} {amount} upi pe bhejo' }])
})

Deno.test('without a note nothing changes: none kept, none shown', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.learnResult = { event_id: 'ev-1', action: 'created', entry_id: 'en-1', example_id: 'ex-1', title: 'T' }
  s.rows = [msg('client', 'tds certificate kab milega'), msg('us', 'Sir, it is emailed every quarter.')]
  s.matchRows = [entry()]
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new' })
  await run(s, a, { action: 'learn', cause: 'sent', orderNumber: ORDER, finalText: 'Sir, it is emailed every quarter.', note: '   ' })
  eq(s.exampleNotes, []); ok(!('note' in s.learnCalls[0].p_context))
})

Deno.test("saving an operator's reply from the inbox: the chat before it, the operator's typed words as the note, the item closed", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.learnResult = { event_id: 'ev-3', action: 'created', entry_id: 'en-7', example_id: 'ex-7', title: 'Bank details' }
  const q = msg('client', 'can you give bank details instead of upi?'), sent = msg('us', 'Sir, IMPS is not available. Kindly pay via UPI.')
  s.rows = [q, sent, msg('client', 'ok')]
  const item = { id: id(), kind: 'operator_reply', status: 'open', order_number: ORDER, context: { rough: 'imps nahi, upi pe karo' }, created_by: OPERATOR }
  s.inbox.push(item)
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new' })
  const r = await run(s, a, {
    action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, IMPS is not available. Kindly pay via UPI.',
    beforeAt: Number(sent.binance_create_time), inboxItemId: item.id,
  })
  eq(r.status, 200)
  eq(s.learnCalls[0].p_question_text, 'can you give bank details instead of upi?'); eq(s.learnCalls[0].p_cause, 'saved')
  eq(s.exampleNotes, [{ id: 'ex-7', note: 'imps nahi, upi pe karo' }])
  eq([item.status, (item as any).resolution, (item as any).resolved_by], ['resolved', 'saved', SHUBHAM]); eq(r.body.inboxItemClosed, true)
  eq([(item as any).entry_id, (item.context as any).saved_entry_id, (item.context as any).saved_event_id], [undefined, 'en-7', 'ev-3'],
    'the saved reply is kept in the context (entry_id cascades: an Undo would delete the item)')
  const again = await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'x y', beforeAt: Number(sent.binance_create_time), inboxItemId: item.id })
  eq([again.status, again.body.error], [409, 'already_resolved']); eq(s.learnCalls.length, 1, 'not saved twice')
})

Deno.test('an inbox item that is not an operator reply, or is for another order, is refused before anything is saved', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'hello?'), msg('us', 'Sir, yes.')]
  const conflict = { id: id(), kind: 'conflict', status: 'open', order_number: ORDER, context: {} }
  const other = { id: id(), kind: 'operator_reply', status: 'open', order_number: '99944071217231917056', context: {} }
  s.inbox.push(conflict, other)
  for (const inboxItemId of [conflict.id, other.id, id()]) {
    eq((await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, yes.', inboxItemId })).status, 404)
  }
  eq((await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, yes.', inboxItemId: 'nope' })).body.field, 'inboxItemId')
  eq(s.learnCalls.length, 0)
  eq((await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, yes.', inboxItemId: other.id }, OPERATOR)).status, 403, 'operators cannot save')
})

Deno.test('saving an operator reply that fails gives it back to the inbox; Undo of a save reopens it', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const q = msg('client', 'can you give bank details instead of upi?'), sent = msg('us', 'Sir, IMPS is not available. Kindly pay via UPI.')
  s.rows = [q, sent]
  const item = { id: id(), kind: 'operator_reply', status: 'open', order_number: ORDER, context: { rough: 'imps nahi, upi pe karo' }, created_by: OPERATOR }
  s.inbox.push(item)
  a.replies['google/gemini-3-flash-preview'] = judgeReply({ relation: 'new' })
  s.learnFails = { message: 'boom' }
  const failed = await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, IMPS is not available. Kindly pay via UPI.', beforeAt: Number(sent.binance_create_time), inboxItemId: item.id })
  eq(failed.status, 500); eq([item.status, (item as any).resolution], ['open', null], 'back in the inbox')
  s.learnFails = null
  s.learnResult = { event_id: 'ev-5', action: 'created', entry_id: 'en-5', example_id: 'ex-5', title: 'Bank details' }
  const saved = await run(s, a, { action: 'learn', cause: 'saved', orderNumber: ORDER, finalText: 'Sir, IMPS is not available. Kindly pay via UPI.', beforeAt: Number(sent.binance_create_time), inboxItemId: item.id })
  eq(saved.status, 200); eq(item.status, 'resolved')
  const undone = await run(s, a, { action: 'undo', eventId: '00000000-0000-4000-8000-000000000555' })
  eq(undone.body.inboxItemReopened, false, 'another event: nothing reopened')
  ;(item.context as any).saved_event_id = '00000000-0000-4000-8000-000000000556'
  const undo2 = await run(s, a, { action: 'undo', eventId: '00000000-0000-4000-8000-000000000556' })
  eq([undo2.body.inboxItemReopened, item.status, (item.context as any).saved_event_id], [true, 'open', undefined])
})
