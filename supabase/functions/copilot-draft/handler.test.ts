// deno-lint-ignore-file no-explicit-any
// Run: deno test supabase/functions/copilot-draft/handler.test.ts
import { handleDraft } from './handler.ts'
import { BLYNK, entry, eq, FakeAi, FakeStore, id, msg, OPERATOR, ok, SHUBHAM } from '../_shared/copilot-fakes.test-helpers.ts'
import type { ChatRow } from '../_shared/copilot-playbook.ts'

const NOW = new Date('2026-10-15T15:00:00Z') // 20:30 IST
const ORDER = '22944071217231917056'
const run = (store: FakeStore, ai: FakeAi, input: any = {}, user = SHUBHAM) =>
  handleDraft({ store, ai, now: () => NOW }, user, { orderNumber: ORDER, ...input })

Deno.test('only approvers get suggestions; bad input is refused', async () => {
  const s = new FakeStore(), a = new FakeAi()
  eq((await run(s, a, {}, OPERATOR)).status, 403)
  eq((await run(s, a, { orderNumber: 'x;drop' })).status, 400)
  eq(a.chats.length + a.embeds.length, 0, 'no AI for refused requests')
})

Deno.test('nothing to answer when we spoke last: no request, no AI', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'hi'), msg('us', 'Good evening, sir.')]
  const r = await run(s, a)
  eq(r.body.status, 'nothing_to_answer'); eq(s.requests.size, 0); eq(a.chats.length + a.embeds.length, 0)
})

Deno.test('an approved Playbook reply fits: shown first, no drafting call, address and language applied', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [
    msg('client', 'main tds certificate ke baare me puchna chahti hoon'), msg('us', 'Sure, sir.'),
    msg('client', 'tds certificate kab milega'), msg('us', 'Please allow me a moment, sir.'),
    msg('client', 'bataiye na kab milega'),
  ]
  s.matchRows = [entry({ similarity: 0.91 })]
  const r = await run(s, a)
  eq(r.status, 200)
  eq(a.chats.length, 0, 'no drafting model called')
  eq(a.embeds.length, 1, 'one embedding call for matching')
  eq(r.body.skippedReason, 'approved_reply_found')
  eq(r.body.context.address, 'maam'); eq(r.body.context.language, 'hi')
  eq(r.body.playbook[0].text, "Ma'am, TDS certificate har quarter bheja jata hai.")
  eq(r.body.playbook[0].machineTranslated, true)
  eq(s.calls.map((c) => c.purpose), ['embed'])
  const req = [...s.requests.values()][0]
  eq(req.status, 'ready'); ok(req.question_embedding, 'question embedding stored for learning')
})

Deno.test('no fitting reply: both models draft, safety checks run, contacts resolved, cost logged', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'I have paid. When will you release?')]
  s.contactRows = [
    { id: 'c1', purpose: 'kyc', person_name: 'Asha', phone: '+919876543210', available_now: false, priority: 1 },
    { id: 'c2', purpose: 'kyc', person_name: 'Chirag', phone: '9800011122', available_now: true, priority: 50 },
  ]
  a.replies['openai/gpt-6-astra'] = { ok: true, data: { reply: 'Sir, we will release your USDT right away.', new_policy: false, note: '' }, usage: { input: 2000, output: 150, reasoning: 100, estimated: false }, latencyMs: 900 }
  a.replies['google/gemini-4-argon'] = { ok: true, data: { reply: 'Sir, we are verifying your payment. For KYC help call {contact:kyc}.', new_policy: true, note: 'Assumed KYC done' }, usage: { input: 2000, output: 80, reasoning: 0, estimated: false }, latencyMs: 700 }
  const r = await run(s, a)
  eq(r.status, 200)
  eq(r.body.drafts.length, 2)
  eq(r.body.drafts[0].blocked, true); eq(r.body.drafts[0].flags, ['release_promise'])
  eq(r.body.drafts[1].blocked, false); eq(r.body.drafts[1].newPolicy, true)
  eq(r.body.contacts.kyc, { name: 'Chirag', phone: '9800011122', availableNow: true }, 'available contact first')
  eq(s.calls.map((c) => `${c.purpose}:${c.status}`), ['embed:ok', 'draft:blocked', 'draft:ok'])
  eq(s.calls[1].cost_inr, 2.42, 'GPT-6 Astra: 2000 in + 150 out at $10/$50 per million, ₹88 per $') // (2000*10 + 150*50)/1e6*88
  ok(a.chats[0].system.includes('Good evening, sir'), 'greets on our first message')
  ok(a.chats[0].user.includes('"answer_this":"I have paid. When will you release?"'))
  eq(r.body.budget.limitInr, 25000)
})

Deno.test('the same chat state is drafted once: cached for both approvers; a fresh pending request returns 202', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'kya rate hai aaj')]
  const first = await run(s, a)
  const second = await run(s, a)
  eq(second.body.cached, true); eq(second.body.requestId, first.body.requestId)
  eq(a.chats.length, 2, 'no new drafting calls for the cached state')
  s.rows.push(msg('client', 'aur kitna time?'))
  const key = `${s.rows[s.rows.length - 1].binance_message_id}|TRADING|sell.pay.ready`
  await s.insertRequest({ user_id: SHUBHAM, order_number: ORDER, mode: 'suggest', request_key: key, status: 'pending' })
  const third = await run(s, a)
  eq(third.status, 202); eq(third.body.status, 'pending')
})

Deno.test('monthly cap: no drafting, approved replies still work', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.spend = 24999
  s.rows = [msg('client', 'Is TDS deducted?')]
  s.matchRows = [entry({ similarity: 0.6, title: 'TDS rate' })]
  const r = await run(s, a)
  eq(r.body.status, 'capped'); eq(r.body.skippedReason, 'monthly_cap'); eq(a.chats.length, 0)
  eq(r.body.related.length, 1, 'related approved reply still offered')
  eq(r.body.budget.alertPct, 80)
})

Deno.test('redraft with an instruction always drafts (even with an approved match) and forces the language', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'When will I get the TDS certificate?')]
  s.matchRows = [entry({ similarity: 0.95 })]
  const r = await run(s, a, { mode: 'redraft', instruction: 'hindi' })
  eq(a.chats.length, 2)
  ok(a.chats[0].system.includes('Hinglish in English letters'))
  ok(a.chats[0].system.includes("Manager's instruction for this draft: Write it in Hindi"))
  eq(s.calls.filter((c) => c.purpose === 'redraft').length, 2)
  eq(r.body.playbook.length, 1, 'approved reply still listed')
})

Deno.test('one model failing still returns the other draft; the failure is logged', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'Can I pay by IMPS?')]
  a.replies['google/gemini-4-argon'] = { ok: false, usage: { input: 0, output: 0, reasoning: 0, estimated: true }, latencyMs: 30000, status: 0, error: 'timeout' }
  const r = await run(s, a)
  eq(r.body.drafts.length, 1); eq(r.body.drafts[0].model, 'openai/gpt-6-astra')
  eq(r.body.aiFailed, 1)
  ok(s.calls.some((c) => c.status === 'error' && c.error === 'timeout'))
})

Deno.test('both models failing: no drafts, the failure count tells the screen to offer a retry', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'Can I pay by IMPS?')]
  const fail = { ok: false, usage: { input: 0, output: 0, reasoning: 0, estimated: true }, latencyMs: 30000, status: 0, error: 'timeout' }
  a.replies['google/gemini-4-argon'] = fail
  a.replies['openai/gpt-6-astra'] = fail
  const r = await run(s, a)
  eq(r.status, 200); eq(r.body.status, 'ready'); eq(r.body.drafts.length, 0); eq(r.body.aiFailed, 2)
  eq(s.calls.filter((c) => c.status === 'error').length, 2)
})

Deno.test('personal numbers in the chat are masked before reaching any model; Playbook lookup uses the live order', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = null
  s.rows = [msg('client', 'paid from ravi@okaxis, UTR 412345678901, call me 9876543210')]
  await run(s, a, { exchangeAccountId: BLYNK, hint: { tradeType: 'BUY', status: 'BUYER_PAYED', totalPrice: 3000 } })
  const sent = a.chats.map((c) => c.user).join(' ') + a.embeds.flat().join(' ')
  ok(!sent.includes('ravi@okaxis') && !sent.includes('412345678901') && !sent.includes('9876543210'), 'nothing personal sent')
  eq(s.matchCalls[0].side, 'BUY'); eq(s.matchCalls[0].status, 'BUYER_PAYED'); eq(s.matchCalls[0].category, 'small'); eq(s.matchCalls[0].accountId, BLYNK)
})

Deno.test('embedding outage: still drafts, without Playbook matches', async () => {
  const s = new FakeStore(), a = new FakeAi()
  a.embedFails = true
  s.rows = [msg('client', 'hello, is the ad still live?')]
  const r = await run(s, a)
  eq(r.body.drafts.length, 2); eq(s.matchCalls.length, 0)
  ok(s.calls.some((c) => c.purpose === 'embed' && c.status === 'error'))
})

Deno.test('phrasings added by the seed or on the Playbook page are embedded alongside the lookup, masked, and stored', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'Can I pay now?')]
  s.pending = [{ id: 'q-1', question_text: 'Can I pay now?' }, { id: 'q-2', question_text: 'call me on 9876543210 please' }]
  const r = await run(s, a)
  eq(r.status, 200)
  eq(a.embeds.length, 2, 'the question and the phrasings in two parallel calls')
  eq(a.embeds[0], ['Can I pay now?', 'situation: Client can pay'], 'the lookup embeds the question and the chat before it')
  eq(a.embeds[1].length, 2)
  ok(!a.embeds[1].join(' ').includes('9876543210'), 'phrasings are masked before embedding')
  eq(s.embedded.map((e) => e.id).join(','), 'q-1,q-2')
  eq(s.embedded[0].v.length, 1536); eq(s.embedded[0].model, 'openai/text-embedding-3-small')
  eq(s.matchCalls[0].embeddings.length, 1, 'only the question is matched against phrasings')
  eq(s.matchCalls[0].contextEmbedding?.length, 1536, 'the chat before goes to the example comparison')
  eq(s.calls.filter((c) => c.purpose === 'embed').length, 2)
})

Deno.test('a failing phrasing batch never costs the chat its lookup; the phrasings wait for the next chat', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'Can I pay now?')]
  s.pending = [{ id: 'q-3', question_text: 'Shall I pay?' }]
  a.embedFailsWhen = (texts) => texts.includes('Shall I pay?')
  const r = await run(s, a)
  eq(r.status, 200)
  eq(s.embedded.length, 0)
  eq(s.matchCalls.length, 1, 'the lookup still ran')
  eq(s.calls.filter((c) => c.purpose === 'embed').map((c) => c.status).sort().join(','), 'error,ok')
})

Deno.test('no phrasings waiting: one embedding call, as before', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'Can I pay now?')]
  await run(s, a)
  eq(a.embeds.length, 1)
})

// ─── Situations (CP-4) ──────────────────────────────────────────────────────────────────────────────

const sysRow = (type: string): ChatRow => ({ ...msg('us', JSON.stringify({ type }), 'system'), sender_is_self: false, is_system_message: true })
const kycAsked = () => [sysRow('order_created_with_additional_kyc_maker_sell'), msg('us', 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')]

Deno.test('the situation is worked out from the chat, used for matching and shown with its evidence', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'Can I pay now?')]
  const r = await run(s, a)
  eq(r.status, 200)
  eq(s.matchCalls[0].stage, 'sell.kyc.pending')
  eq(r.body.context.situation, 'sell.kyc.pending'); eq(r.body.context.situation_label, 'KYC pending')
  ok(String(r.body.context.situation_evidence).startsWith('KYC asked'), 'evidence for the approver')
  const u = JSON.parse(a.chats[0].user)
  eq(u.order.situation, 'KYC pending'); ok(String(u.order.situation_means).includes('Do not share payment details'))
  const req = [...s.requests.values()][0]
  ok(String(req.request_key).endsWith('|TRADING|sell.kyc.pending'), 'the situation is part of the cached chat state')
  ok(Array.isArray(req.context.chat_tail) && req.context.chat_tail.length > 0, 'chat lines kept for the inbox')
})

Deno.test('per question, only the most specific reply that fits this situation is offered', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'Can I pay now?')]
  const topic = id()
  const anyReply = entry({ topic_id: topic, title: 'Can I pay now?', reply_en: 'Sir, please wait.', specificity: 0 })
  const kycReply = entry({ topic_id: topic, title: 'Can I pay now?', scope: { stages: ['sell.kyc.pending'] }, reply_en: 'Sir, please share the requested KYC details first.', specificity: 3 })
  const payReply = entry({ topic_id: topic, title: 'Can I pay now?', scope: { stages: ['sell.pay.ready'] }, reply_en: 'Yes, sir. Please pay to the details shared.', fits: false, specificity: -1 })
  s.matchRows = [anyReply, kycReply, payReply]
  const r = await run(s, a)
  eq(r.body.playbook.map((p: any) => p.entryId), [kycReply.entry_id])
  eq(r.body.playbook[0].situations, ['KYC pending']); eq(r.body.playbook[0].specific, true)
  eq(r.body.skippedReason, 'approved_reply_found'); eq(a.chats.length, 0)
})

Deno.test('before verification a reply asking the client to pay is held back, whatever it was saved for', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('client', 'Can I pay now?')]
  s.matchRows = [entry({ title: 'Can I pay now?', reply_en: 'Yes sir, please pay to {upi}.', reply_hi: 'Ji sir, {upi} par payment kar dijiye.' })]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.kyc.review')
  eq(r.body.playbook.length, 0); eq(r.body.heldBack.length, 1)
  ok(r.body.heldBack[0].reason.includes('not verified'), 'the approver sees why')
  eq(a.chats.length, 2, 'drafted instead')
})

Deno.test('an AI draft asking the client to pay before verification is held back', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'Can I pay now?')]
  a.replies['openai/gpt-6-astra'] = { ok: true, data: { reply: 'Yes sir, please pay to {upi}.', new_policy: false, note: '' }, usage: { input: 10, output: 10, reasoning: 0, estimated: false }, latencyMs: 5 }
  const r = await run(s, a)
  eq(r.body.drafts[0].blocked, true); eq(r.body.drafts[0].flags, ['pay_before_verification'])
  eq(r.body.drafts[1].blocked, false)
})

Deno.test('a known question without a reply for this situation is named, and its other answers guide the AI', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'How much time?')]
  const t = id()
  s.matchRows = [entry({ topic_id: t, title: 'How long will it take?', scope: { sides: ['SELL'], stages: ['sell.pay.checking'] }, fits: false, specificity: -1, similarity: 0.92, reply_en: 'Thank you, sir. We are checking the payment.' })]
  const r = await run(s, a)
  eq(r.body.playbook.length, 0)
  eq(r.body.otherSituations, [{ topicId: t, title: 'How long will it take?', similarity: 0.92, situations: ['Checking payment'] }])
  const u = JSON.parse(a.chats[0].user)
  eq(u.other_situation_answers[0].for_situations, ['Checking payment'])
  eq(u.approved_answers.length, 0, 'answers for other situations are never passed as policy for this one')
})

Deno.test('an out-of-date Hindi copy is not offered: the English reply is shown with a note', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [
    msg('client', 'tds kyu kata'), msg('us', 'Sure, sir.'), msg('client', 'bataiye na tds kyu kata'), msg('us', 'Please allow me a moment, sir.'),
    msg('client', 'jaldi bataiye tds kyu kata'),
  ]
  s.matchRows = [entry({ title: 'Why 1% TDS is deducted', reply_en: 'Sir, 1% TDS is deducted under Section 194S.', reply_hi: 'Sir, purana jawab.', reply_hi_stale: true })]
  const r = await run(s, a)
  eq(r.body.context.language, 'hi')
  eq(r.body.playbook[0].text, 'Sir, 1% TDS is deducted under Section 194S.')
  eq(r.body.playbook[0].language, 'en'); eq(r.body.playbook[0].languageNote, 'hindi_outdated')
})

Deno.test("an approver's correction of the situation is used, and starts a fresh suggestion", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('client', 'How much time?')]
  const first = await run(s, a)
  eq(first.body.context.situation, 'sell.kyc.review')
  s.mark = { code: 'sell.kyc.call', at: Date.now() + 60_000, by: SHUBHAM }
  const second = await run(s, a)
  eq(second.body.cached, false, 'a different situation is a different chat state')
  eq(second.body.context.situation, 'sell.kyc.call'); eq(second.body.context.situation_detected, 'sell.kyc.review')
  ok(second.body.context.situation_marked?.by === SHUBHAM)
  eq(s.matchCalls[1].stage, 'sell.kyc.call')
})

Deno.test('an approved reply is always offered; a tentative one only when it is more specific', async () => {
  const { bestFitting } = await import('./handler.ts')
  const t = id()
  const approvedAny = entry({ topic_id: t, specificity: 0 })
  const tentativeStep = entry({ topic_id: t, status: 'tentative', scope: { stages: ['sell.kyc.review'] }, specificity: 3 })
  eq(bestFitting([approvedAny, tentativeStep]).map((m) => m.entry_id), [approvedAny.entry_id, tentativeStep.entry_id])
  const approvedStep = entry({ topic_id: t, scope: { stages: ['sell.kyc.review'] }, specificity: 3 })
  const tentativeAny = entry({ topic_id: t, status: 'tentative', specificity: 0 })
  eq(bestFitting([approvedStep, tentativeAny]).map((m) => m.entry_id), [approvedStep.entry_id])
  eq(bestFitting([entry({ topic_id: t, fits: false, specificity: -1 })]), [])
})

Deno.test('replies used in a chat like this one come first; the chat before is kept on the request for learning', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('us', 'Sir one time verification is needed, our team will connect you soon.'), msg('client', 'How much time?')]
  const t = id()
  const other = entry({ topic_id: t, title: 'How long will it take?', scope: { stages: ['sell.kyc.call'] }, specificity: 3, context_similarity: 0.41, reply_en: 'Sir, the call is scheduled.' })
  const like = entry({ topic_id: t, title: 'How long will it take?', scope: { stages: ['sell.kyc.call'] }, specificity: 3, context_similarity: 0.88, reply_en: 'Sir, our KYC team will call you shortly.' })
  s.matchRows = [other, like]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.kyc.call')
  eq(r.body.playbook.map((p: any) => p.entryId), [like.entry_id, other.entry_id], 'most similar chat first')
  eq(r.body.playbook[0].contextSimilarity, 0.88)
  const req = [...s.requests.values()][0]
  ok(String(req.context.context_text).startsWith('situation: Verification call'), 'context text stored')
  ok(Array.isArray(req.context.chat_before) && req.context.chat_before.some((l: any) => l.text.includes('verification')), 'chat before stored')
  ok(req.context_embedding, 'context embedding stored')
})

Deno.test('drafts are told the company teams and to give a number only when asked', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'Which number will call me for KYC?')]
  await run(s, a)
  ok(a.chats[0].system.includes('Give a contact number only when the client asks for one'))
  const u = JSON.parse(a.chats[0].user)
  eq(u.teams.map((t: any) => t.placeholder), ['{contact:kyc}', '{contact:rm}', '{contact:support}'])
})

Deno.test("a Playbook reply gives any team's number by its code; a switched-off team gives none", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'who handles refunds?')]
  s.teamRows = [...s.teamRows, { code: 'payments_team', label: 'Payments team', description: 'Refunds and payment problems' }]
  s.contactRows = [{ purpose: 'payments_team', person_name: 'Neha', phone: '+91 98111 22233', available_now: true } as any]
  s.matchRows = [entry({ title: 'Refunds', reply_en: 'Sir, our payments team will help you at {contact:payments_team}.', reply_hi: null })]
  const r = await run(s, a)
  eq(r.body.contactPurposes, ['payments_team'])
  eq(r.body.contacts.payments_team?.name, 'Neha'); eq(r.body.missingContacts, [])
  // switched off: no number is given (the reply keeps its placeholder, which the composer will not send unfilled)
  s.teamRows = s.teamRows.filter((t) => t.code !== 'payments_team')
  const again = await run(s, a)
  eq(again.body.contacts, {}); eq(again.body.missingContacts, ['payments_team'])
})

Deno.test('a reply whose every copy is out of date is never offered; the AI drafts instead', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'When will I get the TDS certificate?')]
  s.matchRows = [entry({ reply_en: 'Sir, the TDS certificate is shared every quarter.', reply_en_stale: true, reply_hi: null })]
  const r = await run(s, a)
  eq(r.body.playbook.length, 0); eq(r.body.related.length, 0)
  eq(a.chats.length, 2, 'drafted, since nothing usable fits')
})
