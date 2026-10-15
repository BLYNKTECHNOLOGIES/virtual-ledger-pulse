// deno-lint-ignore-file no-explicit-any
// Run: deno test supabase/functions/copilot-draft/handler.test.ts
import { handleDraft } from './handler.ts'
import { BLYNK, entry, eq, FakeAi, FakeStore, msg, OPERATOR, ok, SHUBHAM } from '../_shared/copilot-fakes.test-helpers.ts'

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
  const key = `${s.rows[s.rows.length - 1].binance_message_id}|TRADING`
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
  ok(a.chats[0].system.includes('Hindi written in English letters'))
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
