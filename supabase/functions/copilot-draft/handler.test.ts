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
  ok(third.body.retryAfterMs > 70_000 && third.body.retryAfterMs <= 75_000, 'tells the waiting approver when the request can be taken over')
})

Deno.test('monthly cap: no drafting, approved replies still work', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.spend = 24999.99
  s.rows = [msg('client', 'Is TDS deducted?')]
  s.matchRows = [entry({ similarity: 0.58, title: 'TDS rate' })]
  const r = await run(s, a)
  eq(r.body.status, 'capped'); eq(r.body.skippedReason, 'monthly_cap'); eq(a.chats.length, 0, 'no AI pick and no drafts')
  eq(r.body.route.result, 'capped')
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

// ─── Other steps the client could be at (CP-5) ──────────────────────────────────────────────────────

const callChat = () => [...kycAsked(), msg('client', 'img', 'image'), msg('us', 'Sir one time verification is needed, our team will connect you soon.'), msg('client', 'Shall I pay now?')]
const payNowTopic = () => {
  const t = id()
  return {
    t,
    call: entry({ topic_id: t, title: 'Can I pay now?', status: 'tentative', scope: { sides: ['SELL'], stages: ['sell.kyc.review', 'sell.kyc.call'] }, specificity: 3,
      reply_en: 'Please wait a moment, sir. We will share the payment details as soon as your verification is complete.', reply_hi: null }),
    pending: entry({ topic_id: t, title: 'Can I pay now?', scope: { sides: ['SELL'], stages: ['sell.kyc.pending'] }, fits: false, specificity: -1,
      reply_en: 'Sir, please share the requested KYC details first. We will share the payment details as soon as your verification is complete.', reply_hi: null }),
    pay: entry({ topic_id: t, title: 'Can I pay now?', status: 'tentative', scope: { sides: ['SELL'], stages: ['sell.pay.ready'] }, fits: false, specificity: -1,
      reply_en: 'Yes, sir. Please pay to the payment details shared in this order, from a bank account in your own name.', reply_hi: null }),
  }
}

Deno.test('the reply for the detected step comes first; the same question\'s replies for the other KYC steps are offered; never a pay reply', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = callChat()
  const q = payNowTopic()
  s.matchRows = [q.call, q.pending, q.pay]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.kyc.call')
  eq(r.body.playbook.map((p: any) => p.entryId), [q.call.entry_id])
  eq(r.body.alternatives.map((p: any) => [p.entryId, p.steps, p.stepLabels]), [[q.pending.entry_id, ['sell.kyc.pending'], ['KYC pending']]])
  eq(r.body.alternatives[0].text, q.pending.reply_en); eq(r.body.alternatives[0].status, 'approved')
  eq(r.body.otherSteps, [], '"Checking KYC" already has the reply shown above')
  const everything = JSON.stringify(r.body)
  ok(!everything.includes(q.pay.entry_id), 'a reply asking to pay is never offered before verification, not even as another step')
})

Deno.test('steps with no reply in the question are offered as one-tap switches; an unknown question offers them all', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'How much time?')]
  const t = id()
  s.matchRows = [entry({ topic_id: t, title: 'How long will it take?', scope: { stages: ['sell.kyc.pending'] }, specificity: 3, reply_en: 'Sir, please share the documents first; we check them within a few minutes.' })]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.kyc.pending')
  eq(r.body.alternatives, [])
  eq(r.body.otherSteps, [{ code: 'sell.kyc.review', label: 'Checking KYC' }, { code: 'sell.kyc.call', label: 'Verification call' }])
  s.matchRows = []
  s.rows.push(msg('client', 'hello?'))
  const unknown = await run(s, a)
  eq(unknown.body.otherSteps.map((x: any) => x.code), ['sell.kyc.review', 'sell.kyc.call'])
})

Deno.test('a pay reply saved under a KYC step is skipped; a reply for two other steps is offered once, for both; a reply that applies here too is not', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'Can I pay now?')]
  const t = id()
  const pending = entry({ topic_id: t, title: 'Can I pay now?', scope: { stages: ['sell.kyc.pending'] }, specificity: 3, reply_en: 'Sir, please share the requested KYC details first.' })
  const misfiled = entry({ topic_id: t, title: 'Can I pay now?', scope: { stages: ['sell.kyc.review'] }, fits: false, specificity: -1, reply_en: 'Sir, please pay to {upi}.' })
  const both = entry({ topic_id: t, title: 'Can I pay now?', status: 'tentative', scope: { stages: ['sell.kyc.review', 'sell.kyc.call'] }, fits: false, specificity: -1, reply_en: 'Sir, we are checking your details. We will share the payment details once you are verified.' })
  const group = entry({ topic_id: t, title: 'Can I pay now?', scope: { stages: ['sell.kyc'] }, specificity: 2, reply_en: 'Sir, please wait while we complete your verification.' })
  s.matchRows = [pending, misfiled, both, group]
  const r = await run(s, a)
  eq(r.body.playbook.map((p: any) => p.entryId), [pending.entry_id])
  eq(r.body.alternatives.map((p: any) => [p.entryId, p.steps]), [[both.entry_id, ['sell.kyc.review', 'sell.kyc.call']]])
  eq(r.body.alternatives[0].stepLabels, ['Checking KYC', 'Verification call'])
  ok(!JSON.stringify(r.body.alternatives).includes(misfiled.entry_id), 'the pay reply is never offered')
  ok(!JSON.stringify(r.body.alternatives).includes(group.entry_id), 'a reply for every KYC step says nothing about the step')
  eq(r.body.otherSteps, [])
})

Deno.test('verified or paid orders have no other steps', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const q = payNowTopic()
  s.rows = [...kycAsked(), sysRow('maker_verified_additional_kyc_maker_sell'), msg('client', 'Can I pay now?')]
  s.matchRows = [{ ...q.pay, fits: true, specificity: 3 }, q.pending, { ...q.call, fits: false, specificity: -1 }]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.pay.ready')
  eq(r.body.playbook.map((p: any) => p.entryId), [q.pay.entry_id])
  eq(r.body.alternatives, []); eq(r.body.otherSteps, [])
  s.orderRow = { ...s.orderRow, order_status: 'BUYER_PAYED' }
  s.rows.push(msg('client', 'paid, please check'))
  const paid = await run(s, a)
  eq(paid.body.context.situation, 'sell.pay.checking')
  eq(paid.body.alternatives, []); eq(paid.body.otherSteps, [])
})

Deno.test('a client we have not approved, on an order with no KYC sign: the KYC reply is offered next to "Client can pay"', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.panel = { status: 'not_found' }
  s.rows = [msg('client', 'Can I pay now?')]
  const q = payNowTopic()
  s.matchRows = [{ ...q.pay, status: 'approved', fits: true, specificity: 3 }, q.pending, { ...q.call, fits: false, specificity: -1 }]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.pay.ready'); eq(r.body.context.client_state, 'new')
  eq(r.body.playbook.map((p: any) => p.entryId), [q.pay.entry_id])
  eq(r.body.alternatives.map((p: any) => [p.entryId, p.steps]), [[q.pending.entry_id, ['sell.kyc.pending']]])
  // An approved client on the same order: nothing else to offer.
  s.panel = { status: 'linked', client: { kyc_status: 'VERIFIED', buyer_status: 'APPROVED' } }
  s.rows.push(msg('client', 'sir?'))
  const known = await run(s, a)
  eq(known.body.alternatives, []); eq(known.body.otherSteps, [])
})

Deno.test('buy order: replies for our other payment steps, closest first', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, trade_type: 'BUY' }
  s.rows = [msg('us', 'Please share your PAN card and bank details, sir.'), msg('client', 'When will you pay?')]
  const t = id()
  const details = entry({ topic_id: t, title: 'When will you pay?', scope: { sides: ['BUY'], stages: ['buy.details'] }, specificity: 2, reply_en: 'Sir, we will pay as soon as you share your PAN and bank details.' })
  const cooling = entry({ topic_id: t, title: 'When will you pay?', status: 'tentative', scope: { sides: ['BUY'], stages: ['buy.pay.cooling'] }, fits: false, specificity: -1, reply_en: 'Sir, your account is being activated with our bank. We will pay right after.' })
  const paying = entry({ topic_id: t, title: 'When will you pay?', scope: { sides: ['BUY'], stages: ['buy.pay.processing'] }, fits: false, specificity: -1, reply_en: 'Sir, your payment is in process.' })
  s.matchRows = [details, cooling, paying]
  const r = await run(s, a)
  eq(r.body.context.situation, 'buy.details')
  eq(r.body.alternatives.map((p: any) => [p.entryId, p.steps]), [[paying.entry_id, ['buy.pay.processing']], [cooling.entry_id, ['buy.pay.cooling']]])
})

Deno.test("other steps' team numbers are filled in, and the cached chat state keeps the options", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = callChat()
  s.contactRows = [{ id: 'c1', purpose: 'kyc', person_name: 'Chirag', phone: '9800011122', available_now: true, priority: 1 }]
  const q = payNowTopic()
  const pending = { ...q.pending, reply_en: 'Sir, please share the requested KYC details first. For help, our KYC team is at {contact:kyc}.' }
  s.matchRows = [q.call, pending]
  const r = await run(s, a)
  eq(r.body.contactPurposes, ['kyc']); eq(r.body.contacts.kyc?.name, 'Chirag')
  const again = await run(s, a)
  eq(again.body.cached, true)
  eq(again.body.alternatives.map((p: any) => p.entryId), [pending.entry_id]); eq(again.body.contacts.kyc?.name, 'Chirag')
})

Deno.test('stepOptions: most specific first, approved before tentative, then the most similar chat; conflicts, outdated and general replies never', async () => {
  const { stepOptions } = await import('./handler.ts')
  const o = { side: 'SELL', category: 'regular', accountId: null, status: 'TRADING', clientState: 'new' }
  const t = id()
  const group = entry({ topic_id: t, scope: { stages: ['sell.kyc'] }, reply_en: 'Group reply.' })
  const stepTentative = entry({ topic_id: t, status: 'tentative', scope: { stages: ['sell.kyc.review'] }, reply_en: 'Review, tentative.' })
  const stepApproved = entry({ topic_id: t, scope: { stages: ['sell.kyc.review'] }, reply_en: 'Review, approved.', context_similarity: 0.2 })
  const stepApprovedLike = entry({ topic_id: t, scope: { stages: ['sell.kyc.review'] }, reply_en: 'Review, approved, like this chat.', context_similarity: 0.9 })
  const conflictA = entry({ topic_id: t, scope: { stages: ['sell.kyc.call'] }, conflict_open: true, reply_en: 'Call, one answer.' })
  const conflictB = entry({ topic_id: t, scope: { stages: ['sell.kyc.call'] }, conflict_open: true, reply_en: 'Call, the other answer.' })
  const outdated = entry({ topic_id: t, scope: { stages: ['sell.kyc.call'] }, reply_en: 'Call, outdated.', reply_en_stale: true, reply_hi: null })
  const otherSide = entry({ topic_id: t, scope: { sides: ['BUY'], stages: ['sell.kyc.call'] }, reply_en: 'Wrong side.' })
  const all = [group, stepTentative, stepApproved, stepApprovedLike, conflictA, conflictB, outdated, otherSide]
  const r = stepOptions(all, ['sell.kyc.review', 'sell.kyc.call'], o, new Set(), 'sell.kyc.pending')
  eq(r.options.map((x) => [x.m.reply_en, x.steps]), [['Review, approved, like this chat.', ['sell.kyc.review']]])
  eq(r.open, ['sell.kyc.call'], 'the call step\'s answers disagree: a switch, never the group reply in their place')
  // Only a reply that applies at the current step too (the group, or the reply shown above): nothing for that step.
  eq(stepOptions([group], ['sell.kyc.review'], o, new Set(), 'sell.kyc.pending'), { options: [], open: [] })
  eq(stepOptions([stepApproved], ['sell.kyc.review'], o, new Set([stepApproved.entry_id]), 'sell.kyc.call'), { options: [], open: [] })
  eq(stepOptions([], ['sell.kyc.call'], o, new Set(), 'sell.kyc.pending'), { options: [], open: ['sell.kyc.call'] })
})

Deno.test('a question whose reply for this step was held back still offers its replies for the other steps', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('client', 'Can I pay now?')]
  const t = id()
  const payAny = entry({ topic_id: t, title: 'Can I pay now?', reply_en: 'Yes sir, please pay to {upi}.', reply_hi: null })
  const pendingR = entry({ topic_id: t, title: 'Can I pay now?', scope: { stages: ['sell.kyc.pending'] }, fits: false, specificity: -1, reply_en: 'Sir, please share the requested KYC details first.', reply_hi: null })
  const callR = entry({ topic_id: t, title: 'Can I pay now?', status: 'tentative', scope: { stages: ['sell.kyc.call'] }, fits: false, specificity: -1, reply_en: 'Sir, our KYC team will call you for the verification first.', reply_hi: null })
  s.matchRows = [payAny, pendingR, callR]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.kyc.review')
  eq(r.body.heldBack.map((h: any) => h.entryId), [payAny.entry_id])
  eq(r.body.alternatives.map((p: any) => [p.entryId, p.steps]), [[callR.entry_id, ['sell.kyc.call']], [pendingR.entry_id, ['sell.kyc.pending']]])
  eq(r.body.otherSteps, [])
})

Deno.test('a reply for any step is not offered as another step; a step whose answers disagree is a switch', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'How much longer? please hurry')]
  const t = id()
  const pendingR = entry({ topic_id: t, title: 'Client asks us to hurry', scope: { stages: ['sell.kyc.pending'] }, specificity: 3, reply_en: 'Sir, please share the requested KYC details so that we can proceed.' })
  const anyR = entry({ topic_id: t, title: 'Client asks us to hurry', specificity: 0, reply_en: 'Sure, sir. We are on it.' })
  const callA = entry({ topic_id: t, title: 'Client asks us to hurry', scope: { stages: ['sell.kyc.call'] }, fits: false, specificity: -1, conflict_open: true, reply_en: 'Sir, the call will happen shortly.' })
  const callB = entry({ topic_id: t, title: 'Client asks us to hurry', scope: { stages: ['sell.kyc.call'] }, fits: false, specificity: -1, conflict_open: true, reply_en: 'Sir, please wait for our call.' })
  s.matchRows = [pendingR, anyR, callA, callB]
  const r = await run(s, a)
  eq(r.body.playbook.map((p: any) => p.entryId), [pendingR.entry_id])
  eq(r.body.alternatives, [], '"We are on it" applies at every step: it is no answer for another step')
  eq(r.body.otherSteps.map((x: any) => x.code), ['sell.kyc.call'])
})

Deno.test('the step to set is the one the chat will show once the reply is sent', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'What verification?')]
  const t = id()
  const pendingR = entry({ topic_id: t, title: 'What is the verification?', scope: { stages: ['sell.kyc.pending'] }, specificity: 3, reply_en: 'Sir, please share the requested KYC details first.' })
  const callR = entry({ topic_id: t, title: 'What is the verification?', scope: { stages: ['sell.kyc.review', 'sell.kyc.call'] }, fits: false, specificity: -1,
    reply_en: 'Sir, a one-time verification is needed. Our KYC team will connect with you shortly.' })
  s.matchRows = [pendingR, callR]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.kyc.pending')
  eq(r.body.alternatives.map((p: any) => [p.entryId, p.steps, p.stepLabels]), [[callR.entry_id, ['sell.kyc.call', 'sell.kyc.review'], ['Verification call', 'Checking KYC']]],
    'it announces the call: sending it sets "Verification call"')
})

Deno.test("a chat set to a KYC step by an approver still gets that question's replies for the other KYC steps", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.panel = { status: 'not_found' }
  s.rows = [msg('client', 'Can I pay now?')]
  s.mark = { code: 'sell.kyc.pending', at: Date.now() + 60_000, by: SHUBHAM }
  const q = payNowTopic()
  s.matchRows = [{ ...q.pending, fits: true, specificity: 3 }, { ...q.call, fits: false, specificity: -1 }, q.pay]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.kyc.pending'); eq(r.body.context.situation_detected, 'sell.pay.ready')
  eq(r.body.playbook.map((p: any) => p.entryId), [q.pending.entry_id])
  eq(r.body.alternatives.map((p: any) => [p.entryId, p.steps]), [[q.call.entry_id, ['sell.kyc.review', 'sell.kyc.call']]],
    'the chat alone reads "Client can pay"; sending this reply does not change that, so it is offered')
  ok(!JSON.stringify(r.body.alternatives).includes(q.pay.entry_id))
})

Deno.test('other steps come from the question whose reply is shown, not a closer match with replies only for other situations', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('client', 'How much time?')]
  const a1 = entry({ similarity: 0.93, title: 'How long will it take?', scope: { stages: ['sell.pay.checking'] }, fits: false, specificity: -1, reply_en: 'Thank you, sir. We are checking the payment.' })
  const t = id()
  const shown = entry({ topic_id: t, similarity: 0.88, title: 'When will KYC be done?', scope: { stages: ['sell.kyc.review'] }, specificity: 3, reply_en: 'Sir, we are checking your details.' })
  const call = entry({ topic_id: t, similarity: 0.88, title: 'When will KYC be done?', scope: { stages: ['sell.kyc.call'] }, fits: false, specificity: -1, reply_en: 'Sir, our KYC team will call you shortly.' })
  s.matchRows = [a1, shown, call]
  // Two close questions (0.93 and 0.88): the AI decides which one the client asked.
  a.replies['google/gemini-3-flash-preview'] = () => ({ ok: true, data: { pick: 'Q2', confidence: 'high', reason: 'KYC is being checked' }, usage: { input: 900, output: 60, reasoning: 0, estimated: false }, latencyMs: 5 })
  const r = await run(s, a)
  eq(r.body.route.result, 'picked')
  eq(r.body.playbook.map((p: any) => p.entryId), [shown.entry_id])
  eq(r.body.alternatives.map((p: any) => [p.entryId, p.steps]), [[call.entry_id, ['sell.kyc.call']]])
  eq(r.body.otherSteps.map((x: any) => x.code), ['sell.kyc.pending'])
})

Deno.test('the step to set follows the language shown: the Hinglish call message sets "Verification call" too', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'ye verification kya hai?'), msg('us', 'Sure, sir.'), msg('client', 'kya hai ye verification bataiye?'), msg('us', 'Please allow me a moment, sir.'),
    msg('client', 'jaldi bataiye verification kya hai?')]
  const t = id()
  const pendingR = entry({ topic_id: t, title: 'What is the verification?', scope: { stages: ['sell.kyc.pending'] }, specificity: 3, reply_en: 'Sir, please share the requested KYC details first.', reply_hi: 'Sir, pehle requested KYC details share kar dijiye.' })
  const callR = entry({ topic_id: t, title: 'What is the verification?', scope: { stages: ['sell.kyc.review', 'sell.kyc.call'] }, fits: false, specificity: -1,
    reply_en: 'A one-time verification is needed, sir. Our KYC team will connect with you shortly.', reply_hi: 'Sir, ek baar verification zaroori hai. Hamari KYC team thodi der mein aapse connect karegi.' })
  s.matchRows = [pendingR, callR]
  const r = await run(s, a)
  eq(r.body.context.language, 'hi'); eq(r.body.context.situation, 'sell.kyc.pending')
  eq(r.body.alternatives[0]?.text, 'Sir, ek baar verification zaroori hai. Hamari KYC team thodi der mein aapse connect karegi.')
  eq(r.body.alternatives[0].steps, ['sell.kyc.call', 'sell.kyc.review'])
})

// ─── CP-6: a clear best match, the AI picking the question, Binance's deadlines and what we hold on the client ─────

const UTILITY = 'google/gemini-3-flash-preview'
const routeReply = (pick: string, confidence = 'high', reason = 'Same question') =>
  (_system: string, _user: string) => ({ ok: true, data: { pick, confidence, reason }, usage: { input: 1500, output: 120, reasoning: 0, estimated: false }, latencyMs: 5 })
const utilityCalls = (a: FakeAi) => a.chats.filter((c) => c.model === UTILITY)
const draftCalls = (a: FakeAi) => a.chats.filter((c) => c.model !== UTILITY)

Deno.test('a clear best question below the threshold is shown first (0.66, next 0.50): no AI at all', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'tds certificate milega?')]
  const best = entry({ similarity: 0.66, title: 'TDS certificate timing' })
  const next = entry({ similarity: 0.5, title: 'Why 1% TDS', reply_en: 'Sir, 1% TDS is deducted under Section 194S.' })
  s.matchRows = [best, next]
  const r = await run(s, a)
  eq(s.matchCalls[0].minSimilarity, 0.4); eq(s.matchCalls[0].limit, 8)
  eq(a.chats.length, 0, 'no AI pick, no drafts')
  eq(r.body.playbook.map((p: any) => [p.entryId, p.pickedBy]), [[best.entry_id, 'lead']])
  eq(r.body.related.length, 0, 'a question under the related threshold is not shown')
  eq(r.body.lead, { topicId: best.topic_id, similarity: 0.66, next: 0.5 })
  eq(r.body.route, null); eq(r.body.skippedReason, 'approved_reply_found')
})

Deno.test('close questions (0.66 and 0.60): the AI picks one; its approved reply is shown first and nothing is drafted', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('us', 'Good evening, sir.'), msg('client', 'TDS ka certificate kab tak aayega? call me 9876543210')]
  const first = entry({ similarity: 0.66, title: 'Why 1% TDS', reply_en: 'Sir, 1% TDS is deducted under Section 194S.', question_text: 'tds kyu kata' })
  const second = entry({ similarity: 0.6, title: 'TDS certificate timing', question_text: 'tds certificate kab milega' })
  s.matchRows = [first, second]
  s.questionRows = [{ topic_id: second.topic_id, question_text: 'When will I get Form 16A?' }, { topic_id: second.topic_id, question_text: 'tds certificate kab milega' }]
  a.replies[UTILITY] = routeReply('Q2', 'high', 'Asks when the TDS certificate comes')
  const r = await run(s, a)
  eq(utilityCalls(a).length, 1); eq(draftCalls(a).length, 0, 'no drafts: an approved reply was picked')
  eq(r.body.playbook.map((p: any) => [p.entryId, p.pickedBy]), [[second.entry_id, 'ai']])
  eq(r.body.related.map((p: any) => p.entryId), [first.entry_id], 'the other question stays one tap away')
  eq(r.body.route, { result: 'picked', topicId: second.topic_id, title: 'TDS certificate timing', confidence: 'high', reason: 'Asks when the TDS certificate comes' })
  eq(r.body.skippedReason, 'ai_picked_reply')
  const call = s.calls.find((c) => c.variant === 'route')
  eq([call.purpose, call.model, call.status], ['judge', UTILITY, 'ok']); ok(call.cost_inr > 0, 'cost logged against the monthly cap')
  ok(String(call.output_text).includes('"result":"picked"'))
  const sys = utilityCalls(a)[0].system, u = JSON.parse(utilityCalls(a)[0].user)
  ok(sys.includes('You never write replies'))
  eq(u.candidates.map((c: any) => [c.id, c.question]), [['Q1', 'Why 1% TDS'], ['Q2', 'TDS certificate timing']])
  eq(u.candidates[1].client_wordings, ['tds certificate kab milega', 'When will I get Form 16A?'])
  eq(u.candidates[1].reply_now, 'Sir, the TDS certificate is shared every quarter.')
  ok(u.client_message.includes('[phone]') && !JSON.stringify(u).includes('9876543210'), 'personal numbers masked')
  eq(u.order.situation, 'Client can pay')
  const req = [...s.requests.values()][0]
  eq(req.matches.map((m: any) => m.picked_by), [null, 'ai'], 'kept on the request for the scorecard')
})

Deno.test('the AI says none, is unsure, or fails: drafts as before and nothing is picked', async () => {
  for (const [reply, result] of [[routeReply('none', 'high', 'Different question'), 'none'], [routeReply('Q1', 'low'), 'unsure'],
    [() => ({ ok: false, usage: { input: 0, output: 0, reasoning: 0, estimated: true }, latencyMs: 15000, status: 0, error: 'timeout' }), 'failed']] as const) {
    const s = new FakeStore(), a = new FakeAi()
    s.rows = [msg('client', 'Can I get an invoice?')]
    s.matchRows = [entry({ similarity: 0.66, title: 'Why 1% TDS' }), entry({ similarity: 0.6, title: 'TDS certificate timing' })]
    a.replies[UTILITY] = reply as any
    const r = await run(s, a)
    eq(r.body.route.result, result, result)
    eq(r.body.playbook.length, 0, result); eq(r.body.related.length, 2, result)
    eq(draftCalls(a).length, 2, `${result}: both models draft`)
    eq(s.calls.find((c) => c.variant === 'route').status, result === 'failed' ? 'error' : 'ok')
  }
})

Deno.test('no AI pick for small talk, images, or questions only for the other side', async () => {
  const cases: Array<[ChatRow[], any[]]> = [
    [[msg('client', 'ok sir'), msg('client', 'thanks')], [entry({ similarity: 0.5 })]],
    [[msg('client', 'img', 'image')], [entry({ similarity: 0.5 })]],
    [[msg('client', 'Can I sell to you?')], [entry({ similarity: 0.7, scope: { sides: ['BUY'] }, fits: false, specificity: -1 })]],
  ]
  for (const [rows, matches] of cases) {
    const s = new FakeStore(), a = new FakeAi()
    s.rows = rows; s.matchRows = matches
    const r = await run(s, a)
    eq(utilityCalls(a).length, 0); eq(r.body.route, null)
  }
})

Deno.test('drafting again for the same chat state keeps the AI pick, without picking again', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'TDS ka certificate kab tak aayega?')]
  const second = entry({ similarity: 0.6, title: 'TDS certificate timing' })
  s.matchRows = [entry({ similarity: 0.66, title: 'Why 1% TDS' }), second]
  a.replies[UTILITY] = routeReply('Q2')
  await run(s, a)
  const forced = await run(s, a, { mode: 'force' })
  eq(utilityCalls(a).length, 1, 'one AI pick for this chat state')
  eq(draftCalls(a).length, 2, 'drafts asked for by hand')
  eq(forced.body.playbook.map((p: any) => [p.entryId, p.pickedBy]), [[second.entry_id, 'ai']])
  eq(forced.body.route.result, 'picked')
  const redraft = await run(s, a, { mode: 'redraft', instruction: 'shorter' })
  eq(utilityCalls(a).length, 1); eq(redraft.body.playbook[0].pickedBy, 'ai')
  // a new client message is a new chat state: a fresh pick
  s.rows.push(msg('client', 'aur invoice?'))
  await run(s, a)
  eq(utilityCalls(a).length, 2)
})

Deno.test('a question the AI picks that has replies only for other steps is named, and its answers guide the drafts', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'Release kab hoga?')]
  const t = id()
  s.matchRows = [
    entry({ topic_id: t, similarity: 0.62, title: 'When will you release?', scope: { sides: ['SELL'], stages: ['sell.pay.checking'] }, fits: false, specificity: -1, reply_en: 'Sir, we release once the payment is verified.' }),
    entry({ similarity: 0.58, title: 'TDS certificate timing' }),
  ]
  a.replies[UTILITY] = routeReply('Q1', 'medium')
  const r = await run(s, a)
  eq(r.body.route.result, 'picked')
  eq(r.body.otherSituations.map((o: any) => o.topicId), [t])
  eq(r.body.playbook.length, 0); eq(draftCalls(a).length, 2)
  const u = JSON.parse(draftCalls(a)[0].user)
  eq(u.other_situation_answers[0].title, 'When will you release?')
})

Deno.test("Binance's extra-KYC field and deadlines: from the order data, the screen's live values first; shown and told to the drafts", async () => {
  const s = new FakeStore(), a = new FakeAi()
  const created = NOW.getTime() - 10 * 60_000
  s.orderRow = { ...s.orderRow, create_time: created, kyc_raw: '1', kyc_detail: '1', pay_by: String(NOW.getTime() + 6 * 60_000) }
  s.rows = [msg('client', 'hello sir, can I pay?')]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.kyc.pending', 'no KYC notice in the chat, but Binance requires it')
  eq(r.body.context.binance_kyc, 1)
  eq(r.body.context.pay_by, new Date(NOW.getTime() + 6 * 60_000).toISOString())
  eq(r.body.context.release_by, null)
  const u = JSON.parse(draftCalls(a)[0].user)
  // Before verification the deadline only hurries the KYC: never a time left to pay.
  eq(u.order.order_expires, '15 Oct, 20:36 IST (6 min left)'); eq(u.order.pay_deadline, undefined)
  ok(String(u.order.order_expires_means).includes('never ask them to pay'))
  eq(u.order.binance_extra_kyc, 'required by Binance and not verified on Binance yet')
  ok(draftCalls(a)[0].system.includes('Deadlines in "order" come from Binance'))

  // the screen's live values: "verified" moves the chat on; a 0 from the screen never lowers what Binance stored
  const s2 = new FakeStore(), a2 = new FakeAi()
  s2.orderRow = { ...s.orderRow }
  s2.rows = [msg('client', 'hello sir, can I pay?')]
  const live = await run(s2, a2, { hint: { kycVerify: 2, payBy: NOW.getTime() + 9 * 60_000 + 30_000 } })
  eq(live.body.context.situation, 'sell.pay.ready'); eq(live.body.context.binance_kyc, 2)
  eq(live.body.context.pay_by, new Date(NOW.getTime() + 9 * 60_000 + 30_000).toISOString())
  const lu = JSON.parse(draftCalls(a2)[0].user)
  eq(lu.order.pay_deadline, '15 Oct, 20:39 IST (9 min left)', 'once the client can pay; minutes rounded down')
  ok(String(lu.order.pay_deadline_means).includes('The client must pay')); eq(lu.order.binance_extra_kyc, 'verified on Binance')
  const s3 = new FakeStore(), a3 = new FakeAi()
  s3.orderRow = { ...s.orderRow }
  s3.rows = [msg('client', 'hello sir, can I pay?')]
  eq((await run(s3, a3, { hint: { kycVerify: 0, payBy: 'soon' } })).body.context.binance_kyc, 1)
})

Deno.test('once marked paid: the release deadline; our open appeal case on the panel only; buy orders say who pays', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, order_status: 'BUYER_PAYED', pay_by: String(NOW.getTime() - 20 * 60_000) }
  s.rows = [sysRow('seller_payed'), msg('client', 'paid sir, please release')]
  s.appeal = { status: 'respond_by_set', responseDueAt: NOW.getTime() + 25 * 60_000 }
  const r = await run(s, a, { hint: { releaseBy: NOW.getTime() + 14 * 60_000 } })
  eq(r.body.context.pay_by, null, 'paying is done')
  eq(r.body.context.release_by, new Date(NOW.getTime() + 14 * 60_000).toISOString())
  eq(r.body.context.appeal_case, { status: 'respond_by_set', response_due: new Date(NOW.getTime() + 25 * 60_000).toISOString() })
  const u = JSON.parse(draftCalls(a)[0].user)
  eq(u.order.release_deadline, '15 Oct, 20:44 IST (14 min left)')
  ok(String(u.order.release_deadline_means).startsWith('We should check the payment'))
  ok(!JSON.stringify(u).includes('appeal_case') && !JSON.stringify(u).includes('our_appeal'), 'our appeal work is never told to the drafts')
  // a paid order without a release time shows none (never the pay deadline instead)
  const p2 = new FakeStore(), a2 = new FakeAi()
  p2.orderRow = { ...s.orderRow }
  p2.rows = [sysRow('seller_payed'), msg('client', 'paid sir')]
  const none = await run(p2, a2)
  eq([none.body.context.pay_by, none.body.context.release_by], [null, null])
  s.appeal = { status: 'resolved', responseDueAt: null }
  s.rows.push(msg('client', 'hello?'))
  eq((await run(s, a)).body.context.appeal_case, null, 'a closed case is not shown')

  const b = new FakeStore(), ab = new FakeAi()
  b.orderRow = { ...b.orderRow, trade_type: 'BUY', pay_by: String(NOW.getTime() + 30 * 60_000) }
  b.rows = [msg('client', 'payment kab karoge?')]
  await run(b, ab)
  ok(String(JSON.parse(draftCalls(ab)[0].user).order.pay_deadline_means).startsWith('We must pay the client'))
})

Deno.test('what we hold on the client: counts and yes/no only, for the panel and the drafts', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.panel = {
    status: 'linked',
    client: { kyc_status: 'VERIFIED', buyer_status: 'APPROVED', phone_masked: '••••••3210', pan_masked: 'AB••••••4F' },
    documents: { aadhaar: true, pan: true },
    order_context: { name_check: 'mismatch', side_completed: 4, appeals: 1, orders_90d: 6, cancelled_90d: 2, today_other_count: 0 },
    limit_request_pending: false,
  }
  s.rows = [msg('client', 'Can I pay by IMPS?')]
  const r = await run(s, a)
  eq(r.body.context.client, { on_file: ['aadhaar', 'pan', 'phone'], earlier_orders: 4, appeals: 1, name_check: 'mismatch', limit_request_pending: false })
  // appeals are counted on the client's orders as the client card counts them; the ERP's orders count as earlier orders too
  const t = new FakeStore(), at2 = new FakeAi()
  t.panel = { ...s.panel, history: { buy_count: 9 } }
  t.appeal = { status: 'requested', responseDueAt: null }
  t.rows = [msg('client', 'Can I pay by IMPS?')]
  const tr = await run(t, at2)
  eq([tr.body.context.client.appeals, tr.body.context.client.earlier_orders], [1, 9])
  const u = JSON.parse(draftCalls(a)[0].user)
  eq([u.client.phone_on_file, u.client.earlier_binance_orders_this_side, u.client.appeals_on_this_clients_orders, u.client.binance_name_vs_client_record], [true, 4, 1, 'mismatch'])
  ok(!JSON.stringify(u).includes('3210') && !JSON.stringify(u).includes('AB••'), 'no number, not even masked')
  ok(draftCalls(a)[0].system.includes('Never mention internal records'))
  const n = new FakeStore(), an = new FakeAi()
  n.panel = { status: 'not_client' }
  n.rows = [msg('client', 'Can I pay by IMPS?')]
  eq((await run(n, an)).body.context.client, null)
})

Deno.test('two close questions above 0.78 (siblings): the AI decides, not the threshold; without the AI the old rule applies', async () => {
  const mk = () => {
    const s = new FakeStore(), a = new FakeAi()
    s.rows = [msg('client', 'payment kar diya, release karo')]
    const pay = entry({ similarity: 0.88, title: 'Can I pay now?', reply_en: 'Sir, please wait for the payment details.' })
    const done = entry({ similarity: 0.86, title: 'Payment done — please release' , reply_en: 'Thank you, sir. We are checking the payment.' })
    s.matchRows = [pay, done]
    return { s, a, pay, done }
  }
  // the AI picks the second one: only that reply is shown first, the other stays one tap away
  const x = mk()
  x.a.replies[UTILITY] = routeReply('Q2', 'high', 'Client says they paid')
  const r = await run(x.s, x.a)
  eq(r.body.playbook.map((p: any) => [p.entryId, p.pickedBy]), [[x.done.entry_id, 'ai']])
  eq(r.body.related.map((p: any) => p.entryId), [x.pay.entry_id])
  eq(draftCalls(x.a).length, 0)
  // the AI says none: nothing is shown first, the drafts come
  const y = mk()
  y.a.replies[UTILITY] = routeReply('none')
  const n = await run(y.s, y.a)
  eq(n.body.playbook.length, 0); eq(n.body.related.length, 2); eq(draftCalls(y.a).length, 2)
  // over the budget the AI cannot be asked: both are shown first, as before
  const z = mk()
  z.s.spend = 24999.99
  const c = await run(z.s, z.a)
  eq(c.body.route.result, 'capped')
  eq(c.body.playbook.map((p: any) => [p.entryId, p.pickedBy ?? null]), [[z.pay.entry_id, null], [z.done.entry_id, null]])
  // a clear lead above the threshold needs no AI
  const w = mk()
  w.s.matchRows[1].similarity = 0.7
  const l = await run(w.s, w.a)
  eq(utilityCalls(w.a).length, 0); eq(l.body.playbook.map((p: any) => p.entryId), [w.pay.entry_id]); eq(l.body.lead, null)
})

Deno.test('drafting again keeps the AI\'s "none" for the same chat state: no new pick, nothing shown first', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'payment kar diya, release karo')]
  s.matchRows = [entry({ similarity: 0.88, title: 'Can I pay now?' }), entry({ similarity: 0.86, title: 'Payment done — please release' })]
  a.replies[UTILITY] = routeReply('none')
  await run(s, a)
  const f = await run(s, a, { mode: 'force' })
  eq(utilityCalls(a).length, 1); eq(f.body.route.result, 'none'); eq(f.body.playbook.length, 0)
})

Deno.test('a cached suggestion comes back with today\'s order facts (deadlines, appeal case, client records)', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'When will I get the TDS certificate?')]
  s.matchRows = [entry({ similarity: 0.91 })]
  const first = await run(s, a)
  eq(first.body.context.appeal_case, null)
  s.appeal = { status: 'respond_by_set', responseDueAt: NOW.getTime() + 40 * 60_000 }
  const again = await run(s, a)
  eq(again.body.cached, true)
  eq(again.body.context.appeal_case, { status: 'respond_by_set', response_due: new Date(NOW.getTime() + 40 * 60_000).toISOString() })
  eq(again.body.playbook.map((p: any) => p.entryId), first.body.playbook.map((p: any) => p.entryId), 'the same suggestions')
})

Deno.test('the AI never sees a reply held back before verification as the reply for this step', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('client', 'Can I pay now?')]
  s.matchRows = [
    entry({ similarity: 0.66, title: 'Can I pay now?', reply_en: 'Yes sir, please pay to {upi}.', reply_hi: 'Ji sir, {upi} par payment kar dijiye.' }),
    entry({ similarity: 0.6, title: 'How long will it take?', reply_en: 'Sir, we are checking your details.' }),
  ]
  a.replies[UTILITY] = routeReply('Q1')
  const r = await run(s, a)
  const u = JSON.parse(utilityCalls(a)[0].user)
  eq(u.candidates[0].reply_now, null, 'held back: no reply for this step')
  eq(r.body.route.result, 'picked'); eq(r.body.playbook.length, 0); eq(r.body.heldBack.length, 1)
  eq(draftCalls(a).length, 2, 'drafted instead')
})

Deno.test('an AI pick that throws never blocks the drafts', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'Can I get an invoice?')]
  s.matchRows = [entry({ similarity: 0.66, title: 'Why 1% TDS' }), entry({ similarity: 0.6, title: 'TDS certificate timing' })]
  a.replies[UTILITY] = () => { throw new Error('network down') }
  const r = await run(s, a)
  eq(r.status, 200); eq(r.body.route.result, 'failed'); eq(draftCalls(a).length, 2)
})

Deno.test("a new sell order not stored yet: without Binance's KYC field it is KYC pending (pay replies held back); the screen's 0 means no extra KYC", async () => {
  const mk = () => {
    const s = new FakeStore(), a = new FakeAi()
    s.orderRow = null
    s.rows = [msg('client', 'hi sir, can I pay now?')]
    s.matchRows = [entry({ title: 'Can I pay now?', reply_en: 'Yes sir, please pay to {upi}.', reply_hi: 'Ji sir, {upi} par payment kar dijiye.' })]
    return { s, a }
  }
  const x = mk()
  const r = await run(x.s, x.a, { hint: { tradeType: 'SELL', status: 'TRADING' } })
  eq(r.body.context.situation, 'sell.kyc.pending'); eq(r.body.playbook.length, 0); eq(r.body.heldBack.length, 1)
  const y = mk()
  const r0 = await run(y.s, y.a, { hint: { tradeType: 'SELL', status: 'TRADING', kycVerify: 0 } })
  eq(r0.body.context.situation, 'sell.pay.ready'); eq(r0.body.playbook.length, 1)
})

Deno.test('the AI answering outside its candidates is no answer: the old rule applies', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'payment kar diya, release karo')]
  const pay = entry({ similarity: 0.88, title: 'Can I pay now?' }), done = entry({ similarity: 0.86, title: 'Payment done — please release' })
  s.matchRows = [pay, done]
  a.replies[UTILITY] = routeReply('Q9')
  const r = await run(s, a)
  eq(r.body.route.result, 'failed'); eq(r.body.playbook.length, 2, 'both at 0.78 or more, as before')
  eq(s.calls.find((c) => c.variant === 'route').error, 'invalid_pick')
})

Deno.test('the clear lead must beat a question for the other side that scores higher, and questions cut off by the lookup limit', async () => {
  // a refund question on a sell order: the buy-only question scores far higher, so the sell question is not trusted alone
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'mera refund kab aayega')]
  s.matchRows = [entry({ similarity: 0.9, title: 'Refund for our payment', scope: { sides: ['BUY'] }, fits: false, specificity: -1 }),
    entry({ similarity: 0.65, title: 'Payment done — please release' }), entry({ similarity: 0.45, title: 'Why 1% TDS' })]
  a.replies[UTILITY] = routeReply('none')
  const r = await run(s, a)
  eq(utilityCalls(a).length, 1, 'asked the AI'); eq(r.body.playbook.length, 0)
  // seven buy questions fill the lookup between 0.69 and 0.63: the sell question at 0.70 is not 0.15 ahead of what may be cut off
  const t = new FakeStore(), b = new FakeAi()
  t.rows = [msg('client', 'kitna time lagega')]
  const sell = entry({ similarity: 0.7, title: 'How long will it take?' })
  t.matchRows = [sell, ...[0.69, 0.68, 0.67, 0.66, 0.65, 0.64, 0.63].map((x) => entry({ similarity: x, title: `Buy question ${x}`, scope: { sides: ['BUY'] }, fits: false, specificity: -1 }))]
  b.replies[UTILITY] = routeReply('Q1')
  const r2 = await run(t, b)
  eq(utilityCalls(b).length, 1); eq(r2.body.playbook.map((p: any) => [p.entryId, p.pickedBy]), [[sell.entry_id, 'ai']])
})

Deno.test('no AI pick when no candidate has a reply for this order', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.panel = { status: 'not_client' }
  s.rows = [msg('client', 'TDS ka certificate kab tak aayega?')]
  s.matchRows = [entry({ similarity: 0.66, title: 'TDS for approved clients', scope: { client_states: ['approved'] }, fits: false, specificity: -1 }),
    entry({ similarity: 0.6, title: 'TDS for approved clients 2', scope: { client_states: ['approved'] }, fits: false, specificity: -1 })]
  const r = await run(s, a)
  eq(utilityCalls(a).length, 0); eq(r.body.route, null); eq(draftCalls(a).length, 2)
})

Deno.test('taking over a stale request restarts its clock, so the next approver waits instead of paying again', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'When will I get the TDS certificate?')]
  s.matchRows = [entry({ similarity: 0.91 })]
  const key = `${s.rows[0].binance_message_id}|TRADING|sell.pay.ready`
  const old = await s.insertRequest({ user_id: OPERATOR, order_number: ORDER, mode: 'suggest', request_key: key, status: 'pending' })
  s.requests.get(old.id!)!.created_at = new Date(NOW.getTime() - 120_000).toISOString()
  const r = await run(s, a)
  eq(r.body.requestId, old.id)
  eq(s.requests.get(old.id!)!.created_at, NOW.toISOString())
})

Deno.test("an order not stored yet: the client panel's counts for this side are unknown", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = null
  s.panel = { status: 'linked', client: { kyc_status: 'VERIFIED', buyer_status: 'APPROVED' }, documents: {}, order_context: { side_completed: 0, appeals: 1 } }
  s.appeal = { status: 'requested', responseDueAt: null }
  s.rows = [msg('client', 'Can I pay by IMPS?')]
  const r = await run(s, a, { hint: { tradeType: 'SELL', status: 'TRADING', kycVerify: 0 } })
  eq([r.body.context.client.earlier_orders, r.body.context.client.appeals], [null, 1])
})

Deno.test("Binance's stored 'required' is not told to the drafts once the chat shows the client can pay", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, kyc_raw: '1', kyc_detail: '1' }
  s.rows = [sysRow('order_created_with_additional_kyc_maker_sell'), sysRow('maker_verified_additional_kyc_maker_sell'), msg('client', 'Can I get an invoice?')]
  const r = await run(s, a)
  eq(r.body.context.situation, 'sell.pay.ready')
  eq(JSON.parse(draftCalls(a)[0].user).order.binance_extra_kyc, undefined)
})

Deno.test('a facts-only request (nothing to answer on the screen) never looks anything up, drafts or saves, even if a client message is stored', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'When will I get the TDS certificate?')]
  s.orderRow = { ...s.orderRow, pay_by: String(NOW.getTime() + 12 * 60_000) }
  const r = await run(s, a, { mode: 'context' })
  eq(r.body.status, 'nothing_to_answer'); eq(r.body.context.pay_by, new Date(NOW.getTime() + 12 * 60_000).toISOString())
  eq(a.chats.length + a.embeds.length, 0); eq(s.requests.size, 0); eq(s.calls.length, 0)
})

// ─── Round 3: replies for other clients, the lead against the other side, re-checks, Binance's open KYC ─────

Deno.test("replies for other clients never make an AI pick worth asking, and are never named as another situation's answer", async () => {
  // unsure between two questions whose only replies are for approved clients (this client is new)
  const s = new FakeStore(), a = new FakeAi()
  s.panel = { status: 'not_client' }
  s.rows = [msg('client', 'TDS ka certificate kab tak aayega?')]
  s.matchRows = [entry({ similarity: 0.66, title: 'TDS for approved clients', scope: { client_states: ['approved'], stages: ['sell.pay.ready'] }, fits: false, specificity: -1 }),
    entry({ similarity: 0.6, title: 'TDS for approved clients 2', scope: { client_states: ['approved'], stages: ['sell.kyc'] }, fits: false, specificity: -1 })]
  const r = await run(s, a)
  eq(utilityCalls(a).length, 0, 'no paid pick that could change nothing'); eq(r.body.route, null); eq(draftCalls(a).length, 2)
  // a question clearly recognised, with replies only for approved clients: not "has replies only for Client can pay"
  const t = new FakeStore(), b = new FakeAi()
  t.panel = { status: 'not_client' }
  t.rows = [msg('client', 'TDS ka certificate kab tak aayega?')]
  t.matchRows = [entry({ similarity: 0.9, title: 'TDS for approved clients', scope: { client_states: ['approved'], stages: ['sell.pay.ready'] }, fits: false, specificity: -1 })]
  const r2 = await run(t, b)
  eq(r2.body.otherSituations, []); eq((JSON.parse(draftCalls(b)[0].user).other_situation_answers ?? []).length, 0)
})

Deno.test('the clear lead must also be 0.15 ahead of the best question for the other side', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'kitna time lagega')]
  const sell = entry({ similarity: 0.7, title: 'How long will it take?' })
  s.matchRows = [sell, entry({ similarity: 0.69, title: 'How long for our payment?', scope: { sides: ['BUY'] }, fits: false, specificity: -1 })]
  a.replies[UTILITY] = routeReply('Q1')
  const r = await run(s, a)
  eq(utilityCalls(a).length, 1, 'as close as a buy question: the AI is asked'); eq(r.body.lead, null)
  eq(r.body.playbook.map((p: any) => [p.entryId, p.pickedBy]), [[sell.entry_id, 'ai']])
  const t = new FakeStore(), b = new FakeAi()
  t.rows = [msg('client', 'kitna time lagega')]
  const far = entry({ similarity: 0.7, title: 'How long will it take?' })
  t.matchRows = [far, entry({ similarity: 0.55, title: 'How long for our payment?', scope: { sides: ['BUY'] }, fits: false, specificity: -1 })]
  const r2 = await run(t, b)
  eq(b.chats.length, 0, 'clearly ahead: no AI at all')
  eq(r2.body.playbook.map((p: any) => [p.entryId, p.pickedBy]), [[far.entry_id, 'lead']])
  eq(r2.body.lead, { topicId: far.topic_id, similarity: 0.7, next: 0.55 }, 'measured against the other-side question')
})

Deno.test("an approver's re-check after Binance-only \"verified\" holds through our KYC request: pay replies stay held back", async () => {
  const mk = () => {
    const s = new FakeStore(), a = new FakeAi()
    // Binance says verified; its notice is not in the chat (not synced yet)
    s.orderRow = { ...s.orderRow, kyc_raw: '2', kyc_detail: '2' }
    const rows = [...kycAsked(), msg('client', 'img', 'image'), msg('us', 'Sir one time verification is needed, our team will connect you soon.'), msg('client', 'ok')]
    const markAt = Number(rows[rows.length - 1].binance_create_time) + 500
    s.rows = [...rows, msg('us', 'Sir, the Aadhar image is not clear. Please share your Aadhar card again'), msg('client', 'Can I pay now?')]
    s.matchRows = [entry({ title: 'Can I pay now?', reply_en: 'Yes sir, please pay to {upi}.', reply_hi: 'Ji sir, {upi} par payment kar dijiye.' })]
    return { s, a, markAt }
  }
  const x = mk()
  x.s.mark = { code: 'sell.kyc.pending', at: x.markAt, by: SHUBHAM, detected: 'sell.pay.ready' }
  const r = await run(x.s, x.a)
  eq(r.body.context.situation, 'sell.kyc.pending'); eq(r.body.context.situation_evidence.startsWith('KYC asked again'), true)
  eq(r.body.playbook.length, 0); eq(r.body.heldBack.length, 1); eq(r.body.context.before_verification, true)
  // adjusting the step during the re-check keeps it a re-check
  const y = mk()
  y.s.marks = [{ code: 'sell.kyc.call', at: y.markAt + 100, by: SHUBHAM, detected: 'sell.kyc.review' }, { code: 'sell.kyc.pending', at: y.markAt, by: SHUBHAM, detected: 'sell.pay.ready' }]
  eq((await run(y.s, y.a)).body.context.before_verification, true)
  // without the approver's re-check the click's time is unknown: the chat reads "Client can pay" until Binance's notice arrives
  const z = mk()
  eq((await run(z.s, z.a)).body.context.situation, 'sell.pay.ready')
})

Deno.test('the panel gets the step decision the drafts follow, and whether Binance still says the extra KYC is open', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, kyc_raw: '1', kyc_detail: '1', create_time: NOW.getTime() - 600_000 }
  s.rows = [msg('client', 'hello sir, can I pay?')]
  const r = await run(s, a, { mode: 'context' })
  eq([r.body.context.situation, r.body.context.before_verification, r.body.context.binance_kyc_open], ['sell.kyc.pending', true, true])
  // a "Client can pay" set by hand does not hold while Binance says the KYC is open
  s.mark = { code: 'sell.pay.ready', at: NOW.getTime() - 1000, by: SHUBHAM, detected: 'sell.kyc.pending' }
  const m = await run(s, a, { mode: 'context' })
  eq([m.body.context.situation, m.body.context.situation_marked], ['sell.kyc.pending', null])
  // verified in the chat (the stored field is behind): not before verification, nothing open
  s.mark = null
  s.rows = [sysRow('order_created_with_additional_kyc_maker_sell'), sysRow('maker_verified_additional_kyc_maker_sell'), msg('client', 'Can I get an invoice?')]
  const v = await run(s, a, { mode: 'context' })
  eq([v.body.context.situation, v.body.context.before_verification, v.body.context.binance_kyc_open], ['sell.pay.ready', false, false])
  // buy orders have no such step
  const b = new FakeStore()
  b.orderRow = { ...b.orderRow, trade_type: 'BUY' }
  b.rows = [msg('client', 'payment kab karoge?')]
  const bo = await run(b, new FakeAi(), { mode: 'context' })
  eq([bo.body.context.before_verification, bo.body.context.binance_kyc_open], [null, false])
})

Deno.test("Binance-only \"verified\": a KYC request after an approver's own \"Client can pay\" holds pay replies back again", async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, kyc_raw: '2', kyc_detail: '2' }
  const rows = [...kycAsked(), msg('client', 'img', 'image'), msg('us', 'Sir one time verification is needed, our team will connect you soon.'), msg('client', 'ok')]
  const t = Number(rows[rows.length - 1].binance_create_time)
  // a re-check, then "Client can pay" set by hand, then our KYC request again
  s.marks = [{ code: 'sell.pay.ready', at: t + 600, by: SHUBHAM, detected: 'sell.pay.ready' }, { code: 'sell.kyc.pending', at: t + 300, by: SHUBHAM, detected: 'sell.pay.ready' }]
  s.matchRows = [entry({ title: 'Can I pay now?', reply_en: 'Yes sir, please pay to {upi}.', reply_hi: 'Ji sir, {upi} par payment kar dijiye.' })]
  s.rows = [...rows, msg('client', 'Can I pay now?')]
  const before = await run(s, a)
  eq(before.body.context.situation, 'sell.pay.ready', "the approver's \"Client can pay\" stands until our next KYC step")
  s.rows = [...rows, msg('us', 'Sir, please share your Aadhar card again, the photo is cut'), msg('client', 'Can I pay now?')]
  const r = await run(s, new FakeAi())
  eq(r.body.context.situation, 'sell.kyc.pending'); eq(r.body.playbook.length, 0); eq(r.body.heldBack.length, 1)
})

// ─── CP-8: the next step of the script, and no AI for answers ─────────────────────────────────────

const stepRow = (step_key: string, reply_en: string, over: Record<string, unknown> = {}): any =>
  ({ id: id(), step_key, title: step_key, status: 'approved', scope: { sides: ['SELL'] }, reply_en, reply_hi: null, ...over })
const NEW_CLIENT = { status: 'not_found' }

Deno.test('an answer to our question gets the next step: no lookup, no request, no AI', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.panel = NEW_CLIENT
  s.stepRows = [stepRow('purpose', 'Sir, may I know the purpose of this trade?'), stepRow('source_of_funds', 'Sir, may I know your source of funds?')]
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('us', 'Sir, may I know the purpose of this trade?'), msg('client', 'trading')]
  const r = await run(s, a)
  eq([r.status, r.body.status, r.body.skippedReason], [200, 'ready', 'no_question'])
  eq(a.chats.length + a.embeds.length, 0, 'no AI'); eq(s.requests.size, 0, 'no request row'); eq(s.matchCalls.length, 0, 'no lookup')
  eq(r.body.next.offers[0].key, 'source_of_funds'); eq(r.body.next.offers[0].text, 'Sir, may I know your source of funds?')
  eq(r.body.next.checklist.find((c: any) => c.key === 'purpose').answer, 'trading')
  eq([r.body.route, r.body.question, r.body.drafts], [null, null, []])
  // pictures and values the same way
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('client', 'Mobile no 9876543210')]
  const p = await run(s, a)
  eq(p.body.skippedReason, 'no_question'); eq(a.chats.length + a.embeds.length, 0)
})

Deno.test('a question still gets the Playbook lookup, with the next step beside it', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.panel = NEW_CLIENT
  s.stepRows = [stepRow('purpose', 'Sir, may I know the purpose of this trade?')]
  s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('client', 'Why do you need my Aadhaar?')]
  const r = await run(s, a)
  eq(a.embeds.length, 1, 'looked up'); ok(r.body.skippedReason !== 'no_question')
  eq(r.body.next.offers.map((o: any) => o.key), ['purpose'])
  // the same chat state again is the cached answer, with today's next step
  const again = await run(s, a)
  eq(again.body.cached, true); eq(again.body.next.offers.map((o: any) => o.key), ['purpose'])
  // no words saved for a step: named, so an approver can add them
  s.stepRows = []
  eq((await run(s, a, { mode: 'context' })).body.next.missing, [{ key: 'purpose', label: 'Purpose' }])
})

Deno.test('questions and complaints while we wait for an answer still get the lookup (never taken as the answer)', async () => {
  for (const text of ['I am already verified', 'Mera KYC ho chuka hai', 'jaldi karo', 'police complaint karunga', 'sending, can I pay from my wife account?', 'UPI sir']) {
    const s = new FakeStore(), a = new FakeAi()
    s.panel = NEW_CLIENT
    s.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('us', 'Which bank will you use to pay, sir?'), msg('client', text)]
    const r = await run(s, a)
    ok(r.body.skippedReason !== 'no_question', text); eq(a.embeds.length, 1, text)
  }
  // our buy orders: the client asks when we pay
  for (const text of ['When are you sending the payment?', 'When you will send payment?']) {
    const b = new FakeStore(), a = new FakeAi()
    b.orderRow = { ...b.orderRow, trade_type: 'BUY' }
    b.rows = [msg('us', 'Kindly share your PAN card and mobile number, sir.'), msg('client', text)]
    const r = await run(b, a)
    ok(r.body.skippedReason !== 'no_question', text); eq(a.embeds.length, 1, text)
  }
})

Deno.test('"Draft anyway" on a picture or a plain answer still drafts; the request keeps that the client asked nothing', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('client', 'img', 'image')]
  const r = await run(s, a, { mode: 'force' })
  eq(draftCalls(a).length, 2); ok(r.body.skippedReason !== 'no_question')
  eq([...s.requests.values()].at(-1)?.context?.asks_nothing, true)
  // a plain answer to our question (copilot-learn never files it as a client question)
  const t = new FakeStore()
  t.panel = NEW_CLIENT
  t.rows = [...kycAsked(), msg('client', 'img', 'image'), msg('us', 'Sir, may I know the purpose of this trade?'), msg('client', 'trading')]
  await run(t, new FakeAi(), { mode: 'force' })
  eq([...t.requests.values()].at(-1)?.context?.asks_nothing, true)
  // a question
  const u = new FakeStore()
  u.rows = [msg('client', 'Why is my order not released yet?')]
  await run(u, new FakeAi(), { mode: 'force' })
  eq([...u.requests.values()].at(-1)?.context?.asks_nothing, false)
})

Deno.test('the order view (context) carries the next step and the numbers its words need', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.panel = NEW_CLIENT
  s.contactRows = [{ id: 'c1', purpose: 'kyc', person_name: 'Asha', phone: '+919876543210', available_now: true, priority: 1 }]
  s.stepRows = [stepRow('purpose', 'Sir, may I know the purpose of this trade? For help: {contact:kyc}.')]
  s.rows = [...kycAsked(), msg('client', 'img', 'image')]
  const r = await run(s, a, { mode: 'context' })
  eq(r.body.status, 'nothing_to_answer'); eq(r.body.next.offers[0].key, 'purpose'); eq(r.body.next.missing, [])
  eq(r.body.contacts.kyc.name, 'Asha'); eq(a.chats.length + a.embeds.length, 0)
  ok(typeof r.body.next.waitingSince === 'string', 'the client is waiting for us')
})

Deno.test('a reply written for this kind of client wins over one for every client at the same step', async () => {
  const { bestFitting } = await import('./handler.ts')
  const t = id()
  const general = entry({ topic_id: t, scope: { stages: ['sell.kyc.call'] }, specificity: 3 })
  const returning = entry({ topic_id: t, scope: { stages: ['sell.kyc.call'], client_states: ['approved'] }, specificity: 3 })
  eq(bestFitting([general, returning]).map((m) => m.entry_id), [returning.entry_id])
  // a tentative one for this kind of client is shown beside the approved general one
  const tentative = entry({ topic_id: t, status: 'tentative', scope: { stages: ['sell.kyc.call'], client_states: ['approved'] }, specificity: 3 })
  eq(bestFitting([general, tentative]).map((m) => m.entry_id), [general.entry_id, tentative.entry_id])
  // a deeper step still beats a kind of client
  const deeper = entry({ topic_id: t, scope: { stages: ['sell.kyc.call'] }, specificity: 4 })
  eq(bestFitting([deeper, returning]).map((m) => m.entry_id), [deeper.entry_id])
})
