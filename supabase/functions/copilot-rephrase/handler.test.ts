// deno-lint-ignore-file no-explicit-any
// Run: deno test supabase/functions/copilot-rephrase/handler.test.ts
import { handleRephrase } from './handler.ts'
import { BLYNK, eq, FakeAi, FakeStore, id, msg, OPERATOR, ok, SHUBHAM } from '../_shared/copilot-fakes.test-helpers.ts'

const NOW = new Date('2026-10-18T09:00:00Z') // 14:30 IST
const ORDER = '22944071217231917056'
const FLASH = 'google/gemini-3-flash-preview'
const run = (store: FakeStore, ai: FakeAi, input: any, user = OPERATOR) => handleRephrase({ store, ai, now: () => NOW }, user, input)
const reply = (text: string, extra: Record<string, unknown> = {}) => ({ ok: true, data: { ok: true, reply: text, ...extra }, usage: { input: 900, output: 40, reasoning: 0, estimated: false }, latencyMs: 700 })

/** A sell order whose client can pay: KYC verified on Binance, our payment details already sent. */
function paying(s: FakeStore) {
  s.orderRow = { ...s.orderRow, kyc_raw: '2' }
  s.rows = [msg('client', 'hello'), msg('us', 'Good afternoon, sir. Please pay to the UPI ID shown on the order.'), msg('client', 'can you give bank details instead of upi?')]
}

Deno.test('only approvers and the operators an approver picked may rephrase', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const r = await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' }, id())
  eq([r.status, r.body.error], [403, 'not_allowed']); eq(a.chats.length, 0); eq(s.calls.length, 0)
  s.rephrasers.clear()
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' })).status, 403, 'an operator taken off the list')
  a.replies[FLASH] = reply('Sir, please wait while we check.')
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' }, SHUBHAM)).status, 200, 'approvers always may')
})

Deno.test('a rewrite: the cheap model, no thinking, personal values never sent, values back in the result, logged masked', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  a.replies[FLASH] = (_sys: string, user: string) => {
    const u = JSON.parse(user)
    eq(u.operator_text, 'imps abhi nahi hoga, upi ⟦1⟧ pe pay kar do')
    ok(!user.includes('blynk@ybl'), 'the UPI ID never reaches the model')
    eq(u.order.situation, 'Client can pay')
    eq(u.chat.at(-1), { from: 'client', text: 'can you give bank details instead of upi?' })
    return reply('Sir, IMPS is not available at the moment. Kindly make the payment via UPI to ⟦1⟧.')
  }
  const r = await run(s, a, { orderNumber: ORDER, text: 'imps abhi nahi hoga, upi blynk@ybl pe pay kar do' })
  eq(r.status, 200)
  eq(r.body.status, 'ok'); eq(r.body.text, 'Sir, IMPS is not available at the moment. Kindly make the payment via UPI to blynk@ybl.')
  eq(r.body.language, 'en'); eq(r.body.warnings, []); eq(r.body.left, 199)
  eq(a.chats[0].model, FLASH); eq(a.chats[0].opts, { timeoutMs: 15_000, effort: 'none' })
  const c = s.calls.find((x) => x.purpose === 'rephrase')
  eq([c.purpose, c.status, c.user_id, c.order_number], ['rephrase', 'ok', OPERATOR, ORDER])
  eq(c.input_text, 'imps abhi nahi hoga, upi [upi] pe pay kar do'); eq(c.output_text, 'Sir, IMPS is not available at the moment. Kindly make the payment via UPI to [upi].')
  eq(c.cost_inr, Math.round(((900 * 0.5 + 40 * 3) / 1e6) * 88 * 10000) / 10000)
  eq(r.body.callId, c.id)
})

Deno.test('the model set for rewording is used; Hindi when the chat is in Hindi; English or Hindi on request', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.cfg = { ...s.cfg!, rephrase_model: 'google/gemini-3.1-flash-lite' }
  s.rows = [msg('client', 'payment kab tak aayega'), msg('us', 'Sir, we are checking.'), msg('client', 'kitna time lagega bhai'), msg('us', 'Sir, a few minutes.'), msg('client', 'jaldi karo yaar')]
  a.replies['google/gemini-3.1-flash-lite'] = reply('Sir, bas kuch minute, hum check kar rahe hain.')
  const r = await run(s, a, { orderNumber: ORDER, text: 'bas 5 min checking' })
  eq(r.body.language, 'hi'); ok(a.chats[0].system.includes('Hinglish in English letters'))
  eq(r.body.status, 'blocked', 'the 5 was dropped'); eq(r.body.reason, 'It changed a number')
  eq(s.calls[0].status, 'blocked'); ok(s.calls[0].guardrail_flags.includes('dropped:5 min'))
  a.replies['google/gemini-3.1-flash-lite'] = reply('Sir, please give us 5 minutes; we are checking.')
  const en = await run(s, a, { orderNumber: ORDER, text: 'bas 5 min checking', lang: 'en' })
  eq([en.body.language, en.body.status], ['en', 'ok']); ok(a.chats[1].system.includes('Write it in English'))
})

Deno.test('"Another": earlier rewrites go to the model as it saw the text (values as tokens)', async () => {
  const s = new FakeStore(), a = new FakeAi()
  a.replies[FLASH] = (_s: string, user: string) => {
    eq(JSON.parse(user).avoid, ['Sir, please pay on ⟦1⟧.'])
    return reply('Sir, kindly make the payment on ⟦1⟧.')
  }
  const r = await run(s, a, { orderNumber: ORDER, text: 'pay on blynk@ybl pls', avoid: ['Sir, please pay on blynk@ybl.', '', 42] })
  eq(r.body.text, 'Sir, kindly make the payment on blynk@ybl.')
})

Deno.test('held back: asking to pay before verification when the operator did not; offered with a warning when they did', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.orderRow = { ...s.orderRow, kyc_raw: '1' } // Binance: extra KYC required, not verified
  s.rows = [msg('client', 'what should I do now?')]
  a.replies[FLASH] = reply('Sir, please share your Aadhaar and then make the payment.')
  const r = await run(s, a, { orderNumber: ORDER, text: 'aadhaar bhejo pehle' })
  eq([r.body.status, r.body.text, r.body.reason], ['blocked', null, 'It asked the client to pay, which you did not say'])
  a.replies[FLASH] = reply('Sir, you may make the payment now via UPI.')
  const own = await run(s, a, { orderNumber: ORDER, text: 'ab upi se pay kar sakte ho' })
  eq(own.body.status, 'ok'); eq(own.body.warnings.map((w: any) => w.code), ['pay_before_verification'])
})

Deno.test('nothing offered when the model could not tell; "same" when the text is already right', async () => {
  const s = new FakeStore(), a = new FakeAi()
  a.replies[FLASH] = { ok: true, data: { ok: false, reply: '' }, usage: { input: 800, output: 5, reasoning: 0, estimated: false }, latencyMs: 300 }
  const r = await run(s, a, { orderNumber: ORDER, text: 'ask rahul about this one' })
  eq([r.status, r.body.status, r.body.text], [200, 'unclear', null]); eq(s.calls[0].status, 'ok')
  a.replies[FLASH] = reply('Sir, please wait a moment.')
  const same = await run(s, a, { orderNumber: ORDER, text: 'Sir, please wait a moment.' })
  eq(same.body.status, 'same')
  // Nothing was offered, so nothing is kept as offered and neither can be reported as a sent rewrite.
  eq([s.calls[0].output_text, s.calls[1].output_text], [null, null])
  paying(s)
  for (const callId of [r.body.callId, same.body.callId]) {
    eq((await run(s, a, { action: 'used', callId, orderNumber: ORDER, finalText: 'Sir, please wait a moment.' })).body.error, 'not_offered')
  }
  eq(s.inbox.length, 0)
})

Deno.test('the AI failing is an error (logged), not a rewrite', async () => {
  const s = new FakeStore(), a = new FakeAi()
  a.replies[FLASH] = { ok: false, usage: { input: 0, output: 0, reasoning: 0, estimated: true }, latencyMs: 15000, error: 'timeout' }
  const r = await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' })
  eq([r.status, r.body.error], [502, 'rephrase_failed']); eq([s.calls[0].status, s.calls[0].error], ['error', 'timeout'])
})

Deno.test('allowances: the month\'s budget and this person\'s rewrites today (failed calls and yesterday do not count)', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.cfg = { ...s.cfg!, rephrase_daily_limit: 3 }
  const today = '2026-10-18T05:00:00.000Z', yesterday = '2026-10-17T18:00:00.000Z' // 10:30 IST today; 23:30 IST yesterday
  s.calls.push(
    { id: id(), user_id: OPERATOR, purpose: 'rephrase', status: 'ok', created_at: today },
    { id: id(), user_id: OPERATOR, purpose: 'rephrase', status: 'blocked', created_at: today },
    { id: id(), user_id: OPERATOR, purpose: 'rephrase', status: 'error', created_at: today },
    { id: id(), user_id: OPERATOR, purpose: 'rephrase', status: 'ok', created_at: yesterday },
    { id: id(), user_id: SHUBHAM, purpose: 'rephrase', status: 'ok', created_at: today },
  )
  a.replies[FLASH] = reply('Sir, please wait.')
  const third = await run(s, a, { orderNumber: ORDER, text: 'pls wait' })
  eq([third.status, third.body.left], [200, 0])
  s.calls.at(-1)!.created_at = today
  const fourth = await run(s, a, { orderNumber: ORDER, text: 'pls wait again' })
  eq([fourth.status, fourth.body.error], [429, 'daily_limit']); ok(fourth.body.message.includes('3 rewrites'))
  s.spend = 25_000
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait' }, SHUBHAM)).body.error, 'monthly_cap')
})

Deno.test('input checks', async () => {
  const s = new FakeStore(), a = new FakeAi()
  eq((await run(s, a, { orderNumber: 'x', text: 'pls wait' })).body.field, 'orderNumber')
  eq((await run(s, a, { orderNumber: ORDER, text: '  ' })).body.field, 'text')
  eq((await run(s, a, { orderNumber: ORDER, text: 'a'.repeat(601) })).body.field, 'text')
  eq((await run(s, a, { orderNumber: ORDER, text: 'wait' })).body.error, 'too_short')
  eq((await run(s, a, { orderNumber: ORDER, text: 'ok 5' })).body.error, 'too_short')
  eq((await run(s, a, { action: 'nope', orderNumber: ORDER, text: 'pls wait' })).body.field, 'action')
  eq(a.chats.length, 0)
})

// ── used: an operator sent a rewrite ──

async function rewrite(s: FakeStore, a: FakeAi, typed: string, out: string, user = OPERATOR) {
  a.replies[FLASH] = reply(out)
  const r = await run(s, a, { orderNumber: ORDER, text: typed }, user)
  return r.body.callId as string
}

Deno.test('used: an operator\'s sent rewrite waits in the inbox with the question, chat, typed words and the reply as the Playbook keeps it', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  s.phones = [{ purpose: 'rm', phone: '+91 98111 22233' }]
  const callId = await rewrite(s, a, 'imps nahi hoga, upi pe 4500 bhejo, issue ho to 9811122233 pe call karo', 'Sir, IMPS is not available. Kindly send 4500 via UPI; for any issue, call ⟦1⟧.')
  const sentAt = NOW.getTime() - 2000
  const r = await run(s, a, {
    action: 'used', callId, orderNumber: ORDER, sentAt, templateValues: { amount: 4500 },
    finalText: 'Sir, IMPS is not available. Kindly send 4500 via UPI; for any issue, call 9811122233.',
  })
  eq(r.body.queued, true)
  const item = s.inbox[0]
  eq([item.kind, item.order_number, item.exchange_account_id, item.created_by], ['operator_reply', ORDER, BLYNK, OPERATOR])
  eq(item.question_text, 'can you give bank details instead of upi?')
  eq(item.context.sent, 'Sir, IMPS is not available. Kindly send {amount} via UPI; for any issue, call {contact:rm}.')
  eq(item.context.rough, 'imps nahi hoga, upi pe {amount} bhejo, issue ho to [phone] pe call karo', 'typed words, masked, the amount as a placeholder')
  eq(item.context.edited, false); eq(item.context.sent_at, NOW.getTime(), "the server's time, not the screen's"); eq(item.context.situation, 'sell.pay.ready')
  eq(item.context.call_id, callId); eq(item.context.reply_key.length, 24)
  eq(item.context.chat.at(-1).text, 'can you give bank details instead of upi?')
  const c = s.calls.find((x) => x.id === callId)
  eq([c.feedback, c.feedback_edited, c.feedback_by], ['used', false, OPERATOR])
})

Deno.test('used: once per rewrite; the same reply twice in one order is one item; an edited send is marked edited', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  const c1 = await rewrite(s, a, 'imps nahi, upi se pay karo', 'Sir, IMPS is not available; kindly pay via UPI.')
  const used = (callId: string, finalText: string) => run(s, a, { action: 'used', callId, orderNumber: ORDER, sentAt: NOW.getTime() - 1000, finalText })
  eq((await used(c1, 'Sir, IMPS is not available; kindly pay via UPI.')).body.queued, true)
  eq((await used(c1, 'Sir, IMPS is not available; kindly pay via UPI.')).body.reason, 'already_sent')
  const c2 = await rewrite(s, a, 'imps nahi hai, upi pe karo', 'Sir, IMPS is not available; kindly pay via UPI.')
  eq((await used(c2, 'Sir, IMPS is not available; kindly pay via UPI.')).body.reason, 'duplicate')
  const c3 = await rewrite(s, a, 'imps nahi hai, upi pe karo na', 'Sir, IMPS is not available; kindly pay via UPI.')
  eq((await used(c3, 'Sir, IMPS is not available right now; please pay via UPI only.')).body.queued, true)
  eq(s.inbox.length, 2); eq(s.inbox[1].context.edited, true)
})

Deno.test('used: an approver\'s send is not queued (saved through copilot-learn); someone else\'s rewrite or order is refused', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  const mine = await rewrite(s, a, 'pls wait checking', 'Sir, please wait while we check.', SHUBHAM)
  eq((await run(s, a, { action: 'used', callId: mine, orderNumber: ORDER, sentAt: NOW.getTime(), finalText: 'Sir, please wait while we check.' }, SHUBHAM)).body.reason, 'approver')
  eq(s.inbox.length, 0); eq(s.calls.find((x) => x.id === mine).feedback, 'used')
  const theirs = await rewrite(s, a, 'pls wait checking', 'Sir, please wait while we check.')
  eq((await run(s, a, { action: 'used', callId: theirs, orderNumber: ORDER, sentAt: NOW.getTime(), finalText: 'x y' }, SHUBHAM)).status, 404, "not the approver's rewrite")
  eq((await run(s, a, { action: 'used', callId: theirs, orderNumber: '99944071217231917056', sentAt: NOW.getTime(), finalText: 'x y' })).status, 404, 'another order')
  eq((await run(s, a, { action: 'used', callId: id(), orderNumber: ORDER, sentAt: NOW.getTime(), finalText: 'x y' })).status, 404)
})

Deno.test('used: nothing queued without a client question; bad input refused', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.rows = [msg('us', 'Good afternoon, sir.')]
  const callId = await rewrite(s, a, 'kindly mark as paid after paying', 'Sir, kindly mark the order as paid after paying.')
  eq((await run(s, a, { action: 'used', callId, orderNumber: ORDER, sentAt: NOW.getTime(), finalText: 'Sir, kindly mark the order as paid after paying.' })).body.reason, 'no_question')
  eq(s.inbox.length, 0)
  eq((await run(s, a, { action: 'used', callId: 'x', orderNumber: ORDER, sentAt: NOW.getTime(), finalText: 'a' })).body.field, 'callId')
  eq((await run(s, a, { action: 'used', callId, orderNumber: ORDER, sentAt: NOW.getTime(), finalText: '' })).body.field, 'finalText')
})

Deno.test('used: a reply to a message that asks nothing (a picture, a number, "ok", an answer) is not queued', async () => {
  for (const [text, type] of [['img', 'image'], ['9876543210', 'text'], ['ok sir', 'text'], ['trading', 'text']]) {
    const s = new FakeStore(), a = new FakeAi()
    const last = (s.rows = [msg('client', 'hello'), msg('us', 'Sir, may I know the purpose of this trade?'), msg('client', text, type)])[2]
    const callId = await rewrite(s, a, 'thik hai checking', 'Sir, thank you; we are checking.')
    const r = await run(s, a, { action: 'used', callId, orderNumber: ORDER, sentAt: NOW.getTime(), finalText: 'Sir, thank you; we are checking.' })
    eq([r.body.queued, r.body.reason], [false, 'no_question'], String(last.message_text)); eq(s.inbox.length, 0)
    eq(s.calls.find((x) => x.id === callId).feedback, 'used')
  }
})

// ── Second round (review) ──

Deno.test('only for orders on a Binance account the person works on (our records decide, never the screen)', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  a.replies[FLASH] = reply('Sir, please wait while we check.')
  s.accounts = { [OPERATOR]: ['00000000-0000-0000-0000-0000000000aa'] }
  const r = await run(s, a, { orderNumber: ORDER, text: 'pls wait checking', exchangeAccountId: '00000000-0000-0000-0000-0000000000aa' })
  eq([r.status, r.body.error], [403, 'not_allowed']); eq(a.chats.length, 0, 'no AI call'); eq(s.calls.length, 0)
  s.accounts = { [OPERATOR]: [BLYNK] }
  s.orderRow = null
  s.rows = [msg('client', 'hello?')]
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking', exchangeAccountId: BLYNK })).status, 403, 'account unknown from our records')
  s.rows = [{ ...msg('client', 'hello?'), exchange_account_id: BLYNK }]
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' })).status, 200, 'the stored chat names the account')
})

Deno.test('used: only an offered rewrite; a failed queue leaves it unmarked so a retry still queues it', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  a.replies[FLASH] = reply('Sir, please wait 15 minutes.')
  const blocked = (await run(s, a, { orderNumber: ORDER, text: 'wait 10 min pls' })).body.callId
  eq((await run(s, a, { action: 'used', callId: blocked, orderNumber: ORDER, finalText: 'Sir, please wait 15 minutes.' })).body.error, 'not_offered')
  const callId = await rewrite(s, a, 'imps nahi, upi se pay karo', 'Sir, IMPS is not available; kindly pay via UPI.')
  s.inboxFails = true
  eq((await run(s, a, { action: 'used', callId, orderNumber: ORDER, finalText: 'Sir, IMPS is not available; kindly pay via UPI.' })).status, 500)
  eq(s.calls.find((x) => x.id === callId).feedback, undefined, 'not marked')
  s.inboxFails = false
  eq((await run(s, a, { action: 'used', callId, orderNumber: ORDER, finalText: 'Sir, IMPS is not available; kindly pay via UPI.' })).body.queued, true)
  eq(s.calls.find((x) => x.id === callId).feedback, 'used')
})

Deno.test('words in Devanagari count (vowel signs are part of a word)', async () => {
  const s = new FakeStore(), a = new FakeAi()
  a.replies[FLASH] = reply('Sir, kindly send the money.')
  eq((await run(s, a, { orderNumber: ORDER, text: 'पैसे भेज दो' })).status, 200)
})

// ── Third round (review) ──

Deno.test('automatic rewording switched off: a request made on its own is refused before any cost; asking still works', async () => {
  const s = new FakeStore(), a = new FakeAi()
  s.cfg = { ...s.cfg!, rephrase_auto: false }
  a.replies[FLASH] = reply('Sir, please wait while we check.')
  const r = await run(s, a, { orderNumber: ORDER, text: 'pls wait checking', mode: 'auto' })
  eq([r.status, r.body.error], [409, 'auto_off']); eq(a.chats.length, 0); eq(s.calls.length, 0)
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking', mode: 'manual' })).status, 200)
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking', mode: 'another', avoid: ['Sir, please wait while we check.'] })).status, 200)
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' })).status, 200, 'a screen that sends no mode counts as asked')
  s.cfg = { ...s.cfg!, rephrase_auto: true }
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking', mode: 'auto' })).status, 200)
})

Deno.test('used: the question is what came before our sent message, not a client message that came in after it', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  const callId = await rewrite(s, a, 'imps nahi, upi se pay karo', 'Sir, IMPS is not available; kindly pay via UPI.')
  const q = s.rows.at(-1)!
  s.calls.find((x) => x.id === callId).created_at = new Date(Number(q.binance_create_time) + 500).toISOString()
  const ours = msg('us', 'Sir, IMPS is not available; kindly pay via UPI.')
  s.rows = [...s.rows, ours, msg('client', 'ok sir, paying now')]
  const r = await run(s, a, { action: 'used', callId, orderNumber: ORDER, finalText: 'Sir, IMPS is not available; kindly pay via UPI.' })
  eq(r.body.queued, true)
  const item = s.inbox[0]
  eq(item.question_text, 'can you give bank details instead of upi?')
  eq(item.context.sent_at, Number(ours.binance_create_time), 'the time our message reached the chat')
  eq(item.context.chat.at(-1).text, 'can you give bank details instead of upi?')
})

Deno.test('used: an older identical message of ours is not taken for this send; without ours in the chat yet, now is used', async () => {
  const s = new FakeStore(), a = new FakeAi()
  const first = msg('client', 'how do I pay?'), old = msg('us', 'Sir, kindly pay via UPI.')
  s.rows = [first, old, msg('client', 'can you give bank details instead of upi?')]
  const callId = await rewrite(s, a, 'upi se pay karo', 'Sir, kindly pay via UPI.')
  s.calls.find((x) => x.id === callId).created_at = new Date(Number(old.binance_create_time) + 3_600_000).toISOString()
  const r = await run(s, a, { action: 'used', callId, orderNumber: ORDER, finalText: 'Sir, kindly pay via UPI.' })
  eq(r.body.queued, true)
  eq(s.inbox[0].question_text, 'can you give bank details instead of upi?'); eq(s.inbox[0].context.sent_at, NOW.getTime())
})

Deno.test('used: a rewrite of a rewrite keeps the words first typed; a first call that is not this chain is ignored', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  const first = await rewrite(s, a, 'imps nahi, upi se pay karo', 'Sir, IMPS is not available; kindly pay via UPI.')
  const second = await rewrite(s, a, 'Sir, IMPS is not available; kindly pay via UPI.', 'Sir, IMPS is not available at the moment. Kindly make the payment via UPI.')
  const final = 'Sir, IMPS is not available at the moment. Kindly make the payment via UPI.'
  eq((await run(s, a, { action: 'used', callId: second, roughCallId: first, orderNumber: ORDER, finalText: final })).body.queued, true)
  eq(s.inbox[0].context.rough, 'imps nahi, upi se pay karo'); eq(s.inbox[0].context.suggestion, final)
  // Another person's call, or one whose rewrite is not what was reworded, is not taken as the typed words.
  const s2 = new FakeStore(), a2 = new FakeAi()
  paying(s2)
  const theirs = await rewrite(s2, a2, 'imps nahi hai bhai', 'Sir, IMPS is not available; kindly pay via UPI.', SHUBHAM)
  const unrelated = await rewrite(s2, a2, 'ruko thoda', 'Sir, please wait a little.')
  const own = await rewrite(s2, a2, 'Sir, IMPS is not available; kindly pay via UPI.', final)
  eq((await run(s2, a2, { action: 'used', callId: own, roughCallId: theirs, orderNumber: ORDER, finalText: final })).body.queued, true)
  eq(s2.inbox[0].context.rough, 'Sir, IMPS is not available; kindly pay via UPI.', "someone else's call is ignored")
  const own2 = await rewrite(s2, a2, 'Sir, IMPS is not available; kindly pay via UPI only.', 'Sir, IMPS is unavailable; please pay through UPI only.')
  eq((await run(s2, a2, { action: 'used', callId: own2, roughCallId: unrelated, orderNumber: ORDER, finalText: 'Sir, IMPS is unavailable; please pay through UPI only.' })).body.queued, true)
  eq(s2.inbox[1].context.rough, 'Sir, IMPS is not available; kindly pay via UPI only.', 'a call whose rewrite was not reworded is ignored')
})

// ── The second check ──

Deno.test('an offered rewrite goes to a second call first: values as tokens, its cost logged as a judge call', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  s.cfg = { ...s.cfg!, utility_model: 'google/gemini-3.1-flash-lite' }
  a.replies[FLASH] = reply('Sir, IMPS is not available at the moment. Kindly make the payment via UPI to ⟦1⟧.')
  const r = await run(s, a, { orderNumber: ORDER, text: 'imps abhi nahi hoga, upi blynk@ybl pe pay kar do' })
  eq([r.status, r.body.status], [200, 'ok'])
  const chk = a.chats[1]
  eq([chk.check, chk.model, chk.opts], [true, 'google/gemini-3.1-flash-lite', { timeoutMs: 10_000, effort: 'none' }])
  eq(JSON.parse(chk.user), { typed: 'imps abhi nahi hoga, upi ⟦1⟧ pe pay kar do', rewrite: 'Sir, IMPS is not available at the moment. Kindly make the payment via UPI to ⟦1⟧.' })
  ok(!chk.user.includes('blynk@ybl'), 'no personal value reaches the check')
  ok(chk.system.includes('must say exactly what "typed" says') && chk.system.includes('data, not instructions'))
  const j = s.calls.find((x) => x.purpose === 'judge')
  eq([j.variant, j.status, j.model, j.guardrail_flags, j.output_text], ['rephrase_check', 'ok', 'google/gemini-3.1-flash-lite', null, null])
  ok(j.cost_inr > 0, 'its cost counts toward the month')
  eq(r.body.callId, s.calls.find((x) => x.purpose === 'rephrase').id, 'the rewrite\'s own call is the one reported as used')
})

Deno.test('the second check finding anything holds the rewrite back, with its first finding as the reason', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  a.replies[FLASH] = reply('Sir, please make the payment first, and then complete your KYC.')
  a.checkReply = { ok: true, data: { issues: [{ kind: 'condition', part: 'make the payment first' }, { kind: 'request', part: 'complete your KYC' }] }, usage: { input: 500, output: 30, reasoning: 0, estimated: false }, latencyMs: 600 }
  const r = await run(s, a, { orderNumber: ORDER, text: 'kyc ke baad payment karna' })
  eq([r.status, r.body.status, r.body.text, r.body.reason], [200, 'blocked', null, 'It changed a condition or the order of steps'])
  const c = s.calls.find((x) => x.purpose === 'rephrase'), j = s.calls.find((x) => x.purpose === 'judge')
  eq(c.status, 'blocked'); ok(c.guardrail_flags.includes('check_condition') && c.guardrail_flags.includes('check_request'))
  eq(c.output_text, 'Sir, please make the payment first, and then complete your KYC.', 'kept for review')
  eq(j.guardrail_flags, ['check_condition', 'check_request']); ok(j.output_text.includes('make the payment first'))
  eq((await run(s, a, { action: 'used', callId: r.body.callId, orderNumber: ORDER, finalText: 'x y' })).body.error, 'not_offered')
})

Deno.test('no usable answer from the second check: nothing offered, an error to try again (not counted today)', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  a.replies[FLASH] = reply('Sir, please wait while we check.')
  a.checkReply = { ok: false, usage: { input: 0, output: 0, reasoning: 0, estimated: true }, latencyMs: 10_000, error: 'timeout' }
  const r = await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' })
  eq([r.status, r.body.error, r.body.message], [502, 'rephrase_failed', 'The second check did not answer. Try again.'])
  const c = s.calls.find((x) => x.purpose === 'rephrase')
  eq([c.status, c.error], ['error', 'check_failed:timeout'])
  eq(s.calls.find((x) => x.purpose === 'judge').status, 'error')
  a.checkReply = { ok: true, data: { verdict: 'fine' }, usage: { input: 400, output: 5, reasoning: 0, estimated: false }, latencyMs: 300 }
  const bad = await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' })
  eq([bad.status, s.calls.filter((x) => x.purpose === 'rephrase').at(-1).error], [502, 'check_failed:invalid_answer'])
  eq(await s.rephraseCount(OPERATOR, '2000-01-01T00:00:00.000Z'), 0, 'failed calls do not use the allowance')
})

Deno.test('the second check runs only on a rewrite about to be offered, and not when it is switched off', async () => {
  const s = new FakeStore(), a = new FakeAi()
  paying(s)
  a.replies[FLASH] = reply('Sir, please wait 15 minutes.')
  eq((await run(s, a, { orderNumber: ORDER, text: 'wait 10 min pls' })).body.status, 'blocked')
  a.replies[FLASH] = reply('Sir, please wait a moment.')
  eq((await run(s, a, { orderNumber: ORDER, text: 'Sir, please wait a moment.' })).body.status, 'same')
  a.replies[FLASH] = { ok: true, data: { ok: false, reply: '' }, usage: { input: 800, output: 5, reasoning: 0, estimated: false }, latencyMs: 300 }
  eq((await run(s, a, { orderNumber: ORDER, text: 'ask rahul about this one' })).body.status, 'unclear')
  eq(a.chats.filter((c) => c.check).length, 0, 'held back, "same" and "unclear" need no second look')
  s.cfg = { ...s.cfg!, rephrase_verify: false }
  a.replies[FLASH] = reply('Sir, please wait while we check.')
  eq((await run(s, a, { orderNumber: ORDER, text: 'pls wait checking' })).body.status, 'ok')
  eq(a.chats.filter((c) => c.check).length, 0, 'switched off in Settings')
})
