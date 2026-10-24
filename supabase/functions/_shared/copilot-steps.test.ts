// Run: deno test supabase/functions/_shared/copilot-steps.test.ts
// The chats follow real orders of 17–23 Oct 2026 (texts shortened, numbers replaced).
import { buildTranscript, type ChatRow } from './copilot-playbook.ts'
import { detectSituation } from './copilot-situation.ts'
import {
  answersStep, BANK_ONLY, isBankOnly, isDataOnly, looksLikeAnswer, notAQuestion, planSteps, saysPaid, STEP_DEFS, type PlanInput, RELEASE_REMINDER_MS, type StepEntry, stepOffers,
  turnNeedsAnswer, waitingBefore, waitingSince,
} from './copilot-steps.ts'

function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`)
}
function ok(cond: unknown, msg = '') { if (!cond) throw new Error(msg || 'assertion failed') }

const T0 = Date.parse('2026-10-20T13:30:00Z') // 19:00 IST
let n = 0
const at = (min: number) => T0 + min * 60_000
const us = (min: number, text: string, type = 'text'): ChatRow => ({ binance_message_id: `u${++n}`, message_type: type, sender_is_self: true, message_text: text, binance_create_time: at(min) })
const client = (min: number, text: string, type = 'text'): ChatRow => ({ binance_message_id: `c${++n}`, message_type: type, sender_is_self: false, message_text: text, binance_create_time: at(min) })
const sys = (min: number, type: string): ChatRow => ({ binance_message_id: `s${++n}`, message_type: 'system', is_system_message: true, message_text: JSON.stringify({ type }), binance_create_time: at(min) })
const auto = (min: number, text: string): ChatRow => ({ dedupe_key: `a${++n}`, message_type: 'auto_reply', sender_is_self: true, message_text: text, binance_create_time: at(min) })
const card = (min: number): ChatRow => ({ binance_message_id: `k${++n}`, message_type: 'card', sender_is_self: true, message_text: '{"addKycVrfInfo":[{"displayTitleValue":"Upload identity card"}]}', binance_create_time: at(min) })
const img = (min: number) => client(min, '', 'image')

const KYC_AUTO = 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no'
const start: ChatRow[] = [sys(0, 'order_created_with_additional_kyc_maker_sell'), auto(0, KYC_AUTO), card(0.02)]

/** The plan the panel would get: the situation as the server works it out, then the steps. */
function plan(side: 'SELL' | 'BUY', status: string, rows: ChatRow[], extra: Partial<PlanInput> = {}, nowMin = 30) {
  const t = buildTranscript(rows)
  const stage = detectSituation(side, status, t, at(nowMin), side === 'SELL' ? { kycVerify: 1, createdAt: at(0) } : null).code
  return planSteps({ side, status, stage, clientState: 'new', transcript: t, now: at(nowMin), ...extra })
}
const states = (p: ReturnType<typeof planSteps>) => Object.fromEntries(p.checklist.map((s) => [s.key, s.answer ? `${s.state}:${s.answer}` : s.state]))

// ─── Sell orders: a new client ──────────────────────────────────────────────────────────────────────

Deno.test('sell, new client: greet first while the ad already asked for the documents', () => {
  const p = plan('SELL', 'TRADING', start)
  eq(p.next, ['greeting'])
  eq(p.waitingFor, 'kyc', 'the auto-reply asked for Aadhaar: the client owes the documents')
  eq(states(p).kyc, 'asked')
  eq(p.knownClient, false)
})

Deno.test('sell, new client: documents → purpose → source of funds → verification call', () => {
  const greeted = [...start, us(0.3, 'Good Evening Sir')]
  eq(plan('SELL', 'TRADING', greeted).next, [], 'nothing new to send while the documents are awaited')
  const docs = [...greeted, img(1), img(1.1), client(1.2, '9876543210')]
  const a = plan('SELL', 'TRADING', docs)
  eq(a.next, ['purpose'])
  eq(states(a).kyc, 'done')
  const asked = [...docs, us(1.5, 'May I know your purpose of buying USDT ?')]
  const b = plan('SELL', 'TRADING', asked)
  eq([b.next, b.waitingFor], [[], 'purpose'])
  const answered = [...asked, client(1.8, 'Trading')]
  const c = plan('SELL', 'TRADING', answered)
  eq(c.next, ['source_of_funds'])
  eq(states(c).purpose, 'done:Trading')
  const source = [...answered, us(2, 'Please let me know what is your source of fund ?'), client(2.3, 'salary')]
  const d = plan('SELL', 'TRADING', source)
  eq(d.next, ['verification_call'])
  eq(d.options, ['profession', 'paying_bank'], 'asked now and then once the source is known')
  const call = [...source, us(2.6, 'Our team will reach out to you shortly to ensure a smooth order process. Thank you for your support.')]
  const e = plan('SELL', 'TRADING', call, {}, 4)
  eq([e.next, e.hints], [[], ['share_details']])
  eq(e.options, ['profession', 'paying_bank'])
  eq(plan('SELL', 'TRADING', call, {}, 6).options, ['profession', 'paying_bank', 'call_wait', 'pick_up_call'], 'a few minutes after the call message')
  eq(plan('SELL', 'TRADING', [...call, us(6, 'Please pick up call for verification sir')], {}, 8).options, ['profession', 'paying_bank'],
    'just told to pick up: no status update yet')
  eq(plan('SELL', 'TRADING', [...call, us(6, 'Please pick up call for verification sir')], {}, 9.5).options, ['profession', 'paying_bank', 'call_wait'])
  const update = [...call, us(6, 'Sir, our KYC team will call you shortly for the verification. Please keep your phone free; thank you for your patience.')]
  eq(plan('SELL', 'TRADING', update, {}, 7).options, ['profession', 'paying_bank'], 'the update restarts the wait')
})

Deno.test('sell, new client: a question instead of the answer keeps us waiting for it', () => {
  const rows = [...start, us(0.3, 'Good Evening Sir'), img(1), us(1.5, 'May I know your purpose of buying USDT ?'), client(1.7, 'how much time will it take?')]
  const p = plan('SELL', 'TRADING', rows)
  eq([p.next, p.waitingFor], [[], 'purpose'])
  const t = buildTranscript(rows)
  ok(turnNeedsAnswer(t.filter((m) => m.at > at(1.5)), p.waitingFor), 'the question needs a reply')
  ok(!turnNeedsAnswer(buildTranscript([client(1.7, 'Trading')]), 'purpose'), 'the answer needs the next step')
  ok(turnNeedsAnswer(buildTranscript([client(1.7, 'can i pay now')]), 'purpose'), '"can I pay" is not an answer to the purpose')
  ok(turnNeedsAnswer(buildTranscript([client(1.7, 'done')]), 'purpose'), '"done" does not answer the purpose')
})

Deno.test('sell, KYC still running and the order about to expire: extend the payment time, whatever else is awaited', () => {
  const rows = [...start, us(0.3, 'Good Evening Sir'), img(1), us(1.5, 'May I know your purpose of buying USDT ?')]
  const soon = plan('SELL', 'TRADING', rows, { payBy: at(30) }, 23)
  eq([soon.hints, soon.waitingFor], [['extend_time'], 'purpose'])
  eq(plan('SELL', 'TRADING', rows, { payBy: at(30) }, 20).hints, [], 'more than 8 minutes left')
  eq(plan('SELL', 'TRADING', rows, { payBy: at(30) }, 31).hints, [], 'expired')
  eq(plan('SELL', 'TRADING', [...greetedBankRows(), us(1, 'pos.1234567@indus')], { payBy: at(5), clientState: 'approved' }, 2).hints, [],
    'payment step: not KYC any more')
})

Deno.test('sell: documents sent before anyone asked still count', () => {
  const rows = [...start, img(0.2), img(0.25), us(0.4, 'Good Evening Sir'), us(0.5, KYC_AUTO)]
  const p = plan('SELL', 'TRADING', rows)
  eq(states(p).kyc, 'done')
  eq(p.next, ['purpose'])
})

// ─── Sell orders: a client whose KYC we hold ──────────────────────────────────────────────────────

Deno.test('sell, known client: which bank, then the payment details; KYC only on request', () => {
  const p = plan('SELL', 'TRADING', start, { clientState: 'approved' })
  eq(p.next, ['greeting', 'paying_bank'])
  eq(p.options, ['kyc'], '"Ask for KYC again" stays one tap away')
  eq([p.knownClient, states(p).kyc, p.waitingFor], [true, 'skipped', null], 'the auto-reply does not make a known client owe documents')
  const asked = [...start, us(0.3, 'Good Evening Sir'), us(0.4, 'Which bank will you use to pay sir?')]
  eq(plan('SELL', 'TRADING', asked, { clientState: 'approved' }).waitingFor, 'paying_bank')
  const named = [...asked, client(0.7, 'sbi')]
  const q = plan('SELL', 'TRADING', named, { clientState: 'approved' })
  eq([q.next, q.hints, states(q).paying_bank], [['own_account'], ['share_details'], 'done:sbi'], 'their own account, then the details')
  const told = plan('SELL', 'TRADING', [...named, us(0.8, 'Thank you, sir. Please make sure the payment comes from same bank account in your own name.')], { clientState: 'approved' })
  eq([told.next, told.hints], [[], ['share_details']])
  // the Hinglish copy of the bank question counts too
  eq(plan('SELL', 'TRADING', [...start, us(0.4, 'Sir, aap kis bank se payment karenge?')], { clientState: 'approved' }).waitingFor, 'paying_bank')
  // Someone typed a KYC request: this chat runs the full KYC script (a re-check).
  const recheck = plan('SELL', 'TRADING', [...named, us(1, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')], { clientState: 'approved' })
  eq([recheck.knownClient, recheck.waitingFor], [false, 'kyc'])
  eq(plan('SELL', 'TRADING', start, { clientState: 'linked' }).knownClient, false, 'a client in our records without approved KYC is a new client here')
})

// ─── Sell orders: payment ────────────────────────────────────────────────────────────────────────

function greetedBankRows() { return [...start, us(0.3, 'Good Evening Sir'), us(0.4, 'Which bank will you use to pay sir?'), client(0.7, 'sbi')] }
const greetedBank = greetedBankRows()
Deno.test('sell, client can pay: please pay after the details; mark as paid when they say so', () => {
  const details = [...greetedBank, us(1, 'pos.1234567@indus')]
  const a = plan('SELL', 'TRADING', details, { clientState: 'approved' })
  eq(a.next, ['please_pay'])
  const asked = [...details, us(1.1, 'please pay sir')]
  eq(plan('SELL', 'TRADING', asked, { clientState: 'approved' }).next, [])
  const said = [...asked, client(3, 'payment done')]
  const b = plan('SELL', 'TRADING', said, { clientState: 'approved' })
  eq(b.next, ['mark_paid'])
  eq(plan('SELL', 'TRADING', [...said, us(3.2, 'Please do mark as paid sir')], { clientState: 'approved' }).next, [])
})

Deno.test('sell, client can pay (verified, no details in the chat): share the details', () => {
  const rows = [...greetedBank, sys(1, 'maker_verified_additional_kyc_maker_sell')]
  const p = plan('SELL', 'TRADING', rows, { clientState: 'approved' })
  eq([p.next, p.hints], [[], ['share_details']])
})

Deno.test('sell, marked paid: we are checking the payment; a screenshot request is an option', () => {
  const paid = [...greetedBank, us(1, 'pos.1234567@indus'), us(1.1, 'please pay sir'), sys(4, 'seller_payed')]
  const a = plan('SELL', 'BUYER_PAYED', paid, { clientState: 'approved' })
  eq([a.next, a.options], [['verify_payment'], ['payment_screenshot']])
  const told = [...paid, us(4.2, 'Thank you. We’ll verify the payment and release the order once confirmed')]
  eq(plan('SELL', 'BUYER_PAYED', told, { clientState: 'approved' }).next, [])
  const shot = plan('SELL', 'BUYER_PAYED', [...told, us(5, 'Please share detailed screenshot where your bank name is also visible')], { clientState: 'approved' })
  eq([shot.waitingFor, shot.options], ['payment_screenshot', []])
})

Deno.test('completed: thanks once; cancelled and appeal: nothing', () => {
  const done = [...greetedBank, sys(6, 'seller_completed')]
  eq(plan('SELL', 'COMPLETED', done).next, ['thanks'])
  eq(plan('SELL', 'COMPLETED', [...done, us(6.1, 'Thank you for trading with us. We’d greatly appreciate your positive feedback')]).next, [])
  eq(plan('SELL', 'CANCELLED', greetedBank).next, [])
  eq(plan('BUY', 'APPEAL', [sys(0, 'buyer_merchant_trading')]).checklist, [])
})

// ─── Buy orders ───────────────────────────────────────────────────────────────────────────────────

const buyStart: ChatRow[] = [sys(0, 'buyer_merchant_trading')]
Deno.test('buy: greet, PAN and mobile, the amount after TDS, then paying', () => {
  const a = plan('BUY', 'TRADING', buyStart)
  eq(a.next, ['greeting', 'buy_details'])
  eq(a.options, ['tds_notice'])
  const asked = [...buyStart, us(0.4, 'Good Evening Sir'), us(0.5, 'Please share pan card and mobile no')]
  eq(plan('BUY', 'TRADING', asked).waitingFor, 'buy_details')
  const given = [...asked, img(1), client(1.1, '9876543210')]
  const b = plan('BUY', 'TRADING', given)
  eq([b.next, b.options], [['tds_notice'], ['paying', 'beneficiary']])
  const tds = [...given, us(1.5, 'Sir, as per our ad terms, 1% TDS is deducted on this trade under Section 194S, so we will pay you ₹49,500.00.')]
  const c = plan('BUY', 'TRADING', tds)
  eq([c.next, c.options], [['paying'], ['beneficiary']])
  eq(plan('BUY', 'TRADING', [...tds, us(2, 'Kindly wait sir paying on your given details')]).next, [])
})

Deno.test('buy: PAN and phone on file skip the request', () => {
  const p = plan('BUY', 'TRADING', [...buyStart, us(0.4, 'Good Evening Sir')], { onFile: ['pan', 'phone'] })
  eq(p.next, ['tds_notice'])
  eq(states(p).buy_details, 'skipped')
})

Deno.test('buy, marked paid: "we have sent the payment" only after our proof; then a reminder after 10 minutes', () => {
  const base = [...buyStart, us(0.4, 'Good Evening Sir'), us(1, 'Kindly wait sir paying on your given details'), sys(8, 'buyer_payed')]
  const early = plan('BUY', 'BUYER_PAYED', base, {}, 9)
  eq([early.next, early.hints], [[], ['send_proof']], 'marked paid with no screenshot yet: no claim that the money went')
  const proof = [...base, us(8.2, '', 'image')]
  eq(plan('BUY', 'BUYER_PAYED', proof, {}, 9).next, ['paid_release'])
  const told = [...proof, us(8.3, 'Payment done sir please check and release')]
  eq(plan('BUY', 'BUYER_PAYED', told, {}, 12).next, [])
  eq(plan('BUY', 'BUYER_PAYED', told, {}, 8.3 + RELEASE_REMINDER_MS / 60_000 + 0.1).next, ['release_reminder'])
  // A client message after it does not stop the reminder, our own message does.
  eq(plan('BUY', 'BUYER_PAYED', [...told, us(15, 'Kindly release sir')], {}, 20).next, [])
})

// ─── What the client sent ────────────────────────────────────────────────────────────────────────

Deno.test('values, bank names and plain answers need no AI', () => {
  for (const s of ['9876543210', 'mobile no 98765 43210', 'Mobile: 9876543210', 'PAN ABCDE1234F', 'my upi is ravi@ybl']) ok(isDataOnly(s), s)
  for (const s of ['salary', 'hello', '50k', 'my number is wrong', '']) ok(!isDataOnly(s), s)
  for (const s of ['sbi', 'SBI', 'HDFC bank', 'from kotak', 'Bank of India', 'paytm by iob'.slice(0, 5), 'Kotak Mahindra Bank']) ok(BANK_ONLY.test(s), s)
  for (const s of ['sbi not working', 'which bank', 'can I pay from sbi?']) ok(!BANK_ONLY.test(s), s)
  for (const s of ['salary', 'for trading', 'Business income', 'my savings', 'I am an accountant']) ok(looksLikeAnswer(s), s)
  for (const s of ['can i pay', 'send upi', 'why', 'how much time', 'done', 'wait', 'ok', 'one min']) ok(!looksLikeAnswer(s), s)
  ok(!turnNeedsAnswer(buildTranscript([img(1), client(1.1, '9876543210'), client(1.2, 'ok sir')]), 'kyc'))
  ok(!turnNeedsAnswer(buildTranscript([client(1, 'done')]), 'kyc'), '"done" while the documents are awaited')
  ok(!turnNeedsAnswer(buildTranscript([client(1, 'HDFC')]), null))
  ok(turnNeedsAnswer(buildTranscript([client(1, 'payment done')]), null), 'a payment claim gets the Playbook reply')
  ok(turnNeedsAnswer(buildTranscript([img(1), client(1.1, 'please verify fast')]), 'kyc'))
})

Deno.test('waiting since: the first client message after our last one', () => {
  const t = buildTranscript([us(0, 'Good Evening Sir'), client(1, 'hi'), client(2, '??')])
  eq(waitingSince(t), at(1))
  eq(waitingSince(buildTranscript([client(1, 'hi'), us(2, 'Good Evening Sir')])), null)
  eq(waitingSince(buildTranscript([client(1, 'hi'), sys(2, 'buyer_payed')])), at(1), 'a Binance notice does not answer the client')
  eq(waitingSince(buildTranscript([client(1, 'hi'), us(1.1, 'Dear customer, please share your Aadhaar…', 'auto_reply')])), at(1), 'nor does our ad\'s auto-reply')
})

// ─── Words from the Playbook ─────────────────────────────────────────────────────────────────────

const entry = (o: Partial<StepEntry> & { step_key: string }): StepEntry => ({
  id: `e-${o.step_key}-${++n}`, title: o.step_key, status: 'approved', scope: {}, reply_en: `${o.step_key} en`, reply_hi: null, ...o,
})
const order = { side: 'SELL', category: 'regular', accountId: null, status: 'TRADING', clientState: 'approved' }
const offerFor = (p: ReturnType<typeof planSteps>, entries: StepEntry[], extra: Partial<Parameters<typeof stepOffers>[2]> = {}) =>
  stepOffers(p, entries, { order, stage: 'sell.kyc.pending', side: 'SELL', lang: 'en', address: 'sir', now: new Date(at(1)), tentative: true, ...extra })

Deno.test('offers: approved words first, tentative only for approvers and until they expire', () => {
  const p = plan('SELL', 'TRADING', start, { clientState: 'approved' })
  const approved = entry({ step_key: 'paying_bank', reply_en: 'Which bank will you use to pay, sir?' })
  const tentative = entry({ step_key: 'paying_bank', status: 'tentative', reply_en: 'Which bank, sir?' })
  const greeting = entry({ step_key: 'greeting', status: 'tentative', reply_en: '{greeting}, sir.' })
  const offers = offerFor(p, [tentative, approved, greeting, entry({ step_key: 'kyc', reply_en: 'Please share your Aadhaar card, sir.' })])
  eq(offers.map((o) => [o.key, o.text, o.option]), [
    ['greeting', 'Good evening, sir.', false], ['paying_bank', 'Which bank will you use to pay, sir?', false], ['kyc', 'Please share your Aadhaar card, sir.', true],
  ])
  eq(offerFor(p, [tentative, greeting], { tentative: false }).length, 0, 'operators would never get unapproved words')
  eq(offerFor(p, [{ ...tentative, expires_at: new Date(at(0)).toISOString() }]).length, 0, 'an expired tentative step is not offered')
})

Deno.test('offers: scope, the most specific words, language and form of address', () => {
  const p = plan('SELL', 'TRADING', start, { clientState: 'approved' })
  const buyOnly = entry({ step_key: 'paying_bank', scope: { sides: ['BUY'] } })
  eq(offerFor(p, [buyOnly]).filter((o) => o.key === 'paying_bank').length, 0, 'a step for buy orders is not offered on a sell order')
  const general = entry({ step_key: 'paying_bank', reply_en: 'Which bank, sir?' })
  const forKnown = entry({ step_key: 'paying_bank', reply_en: 'Which of your banks, sir?', scope: { client_states: ['approved'] } })
  eq(offerFor(p, [general, forKnown]).find((o) => o.key === 'paying_bank')?.text, 'Which of your banks, sir?', 'words for this kind of client win')
  const hindiStale = entry({ step_key: 'paying_bank', reply_en: 'Which bank will you use to pay, sir?', reply_hi: 'Sir, kaunse bank se pay karenge?', reply_hi_stale: true })
  const h = offerFor(p, [hindiStale], { lang: 'hi' }).find((o) => o.key === 'paying_bank')!
  eq([h.language, h.languageNote], ['en', 'hindi_outdated'])
  const hi = offerFor(p, [{ ...hindiStale, reply_hi_stale: false }], { lang: 'hi', address: 'maam' }).find((o) => o.key === 'paying_bank')!
  eq([hi.text, hi.language], ["Ma'am, kaunse bank se pay karenge?", 'hi'])
})

Deno.test('offers: words that invite payment never before verification', () => {
  const p = plan('SELL', 'TRADING', start, { clientState: 'approved' })
  const pays = entry({ step_key: 'paying_bank', reply_en: 'Please pay to {upi} from your bank, sir.' })
  eq(offerFor(p, [pays]).filter((o) => o.key === 'paying_bank').length, 0)
  eq(offerFor(p, [pays], { stage: 'sell.pay.ready' }).filter((o) => o.key === 'paying_bank').length, 1)
})

Deno.test('what we awaited when the client\'s turn began decides whether the turn is an answer', () => {
  const t = buildTranscript([sys(0, 'order_created_with_additional_kyc_maker_sell'), us(0.2, 'Please share your Aadhar card'), client(1, 'img', 'image'),
    us(1.5, 'Sir, may I know the purpose of this trade?'), client(2, 'trading')])
  const input: PlanInput = { side: 'SELL', status: 'TRADING', stage: 'sell.kyc.review', clientState: 'new', transcript: t, now: at(2.2) }
  const turn = t.filter((m) => m.at > at(1.5))
  eq(planSteps(input).waitingFor, null, 'the full chat: the purpose is answered')
  eq(waitingBefore(input, turn), 'purpose', 'before the turn: we awaited the purpose')
  ok(!turnNeedsAnswer(turn, waitingBefore(input, turn)))
  // documents in the turn: before it, we awaited them
  const d = buildTranscript([sys(0, 'order_created_with_additional_kyc_maker_sell'), us(0.2, 'Please share your Aadhar card'), client(1, 'done')])
  const dIn: PlanInput = { ...input, stage: 'sell.kyc.pending', transcript: d }
  eq(waitingBefore(dIn, d.filter((m) => m.who === 'client')), 'kyc')
  // whatever the step: the question our last message asked
  const p = buildTranscript([us(0, 'Sir, may I know the purpose of this trade?'), client(1, 'trading')])
  const pIn: PlanInput = { side: 'SELL', status: 'TRADING', stage: 'sell.pay.ready', clientState: 'approved', transcript: p, now: at(1.2) }
  eq(waitingBefore(pIn, p.filter((m) => m.who === 'client')), 'purpose')
  eq(waitingBefore({ ...pIn, transcript: buildTranscript([us(0, 'Good evening sir'), client(1, 'hi')]) }, []), null)
}
)

Deno.test('a wording that asks nothing is never kept as a way of asking', () => {
  for (const t of ['[image]', '[image] / [image]', '[file]', '9876543210', 'Mobile no 9876543210', 'ok sir', 'Thank you', 'HDFC bank', 'sbi / ok', '', '  ', '👍', '???']) {
    ok(notAQuestion(t), t)
  }
  for (const t of ['When will you release?', 'kab release hoga', '[image] / is this ok?', 'why 1% tds deducted', 'salary']) ok(!notAQuestion(t), t)
})

Deno.test('the Hinglish copies of the script are recognised once sent', () => {
  const sent = (text: string, key: string) => {
    const d = STEP_DEFS.find((x) => x.key === key)!
    ok(typeof d.asked === 'function' ? d.asked(text) : d.asked.test(text), `${key}: ${text}`)
  }
  sent('Sir, aapke funds ka source kya hai — salary, business ya kuch aur?', 'source_of_funds')
  sent('Sir, aap kis bank se payment karenge?', 'paying_bank')
  sent('Thank you sir. Please Binance par order ko paid mark kar dijiye.', 'mark_paid')
  sent('Thank you sir. Payment check kar rahe hain, confirm hote hi USDT release kar denge.', 'verify_payment')
  sent('We have sent the payment, sir. Please check your bank account and release the USDT once you have received it.', 'paid_release')
  sent('Sir, payment bhej diya hai. Please bank account check karke, payment milte hi USDT release kar dijiye.', 'paid_release')
  sent('Thank you sir. Please payment aapke apne naam ke bank account se hi karein.', 'own_account')
  sent('Sir, details share karne ke liye thank you. Aapka payment process ho raha hai, hum update kar denge.', 'paying')
  const d = STEP_DEFS.find((x) => x.key === 'paid_release')!
  ok(!(d.asked as RegExp).test('Have you paid? Please check'), 'a question is not our payment')
})

Deno.test('a picture the screen has not stored yet ("[image]" hint) is a picture: documents in, nothing to look up', () => {
  const t = buildTranscript([sys(0, 'order_created_with_additional_kyc_maker_sell'), auto(0, KYC_AUTO)], { id: 'live-1', text: '[image]' })
  const last = t[t.length - 1]
  eq([last.who, last.kind], ['client', 'image'])
  ok(!turnNeedsAnswer([last], 'kyc'), 'nothing to look up')
  const p = planSteps({ side: 'SELL', status: 'TRADING', stage: 'sell.kyc.review', clientState: 'new', transcript: t, now: at(1) })
  eq(states(p).kyc, 'done')
})

Deno.test('a real question is never taken for "nothing to look up" or for an answer (review cases)', () => {
  const needs = (text: string, waiting: Parameters<typeof turnNeedsAnswer>[1]) => turnNeedsAnswer(buildTranscript([client(1, text)]), waiting)
  for (const [text, waiting] of [
    ['When are you sending the payment?', null], ['When you will send payment?', 'buy_details'], ['sending, can I pay from my wife account?', 'kyc'],
    ['I am already verified', 'paying_bank'], ['Mera KYC ho chuka hai', 'purpose'], ['jaldi karo', 'source_of_funds'], ['police complaint', 'purpose'],
    ['scam', 'purpose'], ['UPI sir', 'paying_bank'], ['upi', null], ['same bank as before', 'paying_bank'], ['sending?', null],
  ] as const) ok(needs(text, waiting), `${text} (${waiting}) needs an answer`)
  for (const [text, waiting] of [
    ['sending sir', 'kyc'], ['1 min', 'kyc'], ['wait', null], ['ek minute', 'purpose'], ['salary', 'source_of_funds'], ['for trading', 'purpose'],
    ['sbi', 'paying_bank'], ['HDFC bank', null], ['done', 'kyc'], ['[image]', null], ['9876543210', 'kyc'], ['I will send', 'kyc'],
  ] as const) ok(!needs(text, waiting), `${text} (${waiting}) asks nothing`)
  ok(!answersStep('purpose', 'scam') && !answersStep('purpose', 'I am already verified') && answersStep('purpose', 'Trading'))
  ok(!answersStep('paying_bank', 'business') && answersStep('paying_bank', 'from kotak'))
  // "scam" is not recorded as the purpose; the purpose stays asked
  const p = plan('SELL', 'TRADING', [...start, client(0.5, 'img', 'image'), us(1, 'May I know the purpose of buying USDT, sir?'), client(1.5, 'scam')])
  eq([states(p).purpose, p.waitingFor], ['asked', 'purpose'])
})

Deno.test('"ji", "haan", "wait" in front: a real message is looked up, an answer still counts (second review)', () => {
  const needs = (text: string, waiting: Parameters<typeof turnNeedsAnswer>[1]) => turnNeedsAnswer(buildTranscript([client(1, text)]), waiting)
  for (const [text, waiting] of [
    ['ji mera account freeze ho gaya', 'purpose'], ['haan sir bank server down hai', 'purpose'], ['wait wrong amount received', null], ['Ruko, galat UTR', null],
    ['Hmm I got less amount', null], ['ji amount kam aaya', null], ['abhi bhej raha hu lekin limit khatam', 'kyc'],
  ] as const) ok(needs(text, waiting), `${text} (${waiting}) needs an answer`)
  for (const [text, waiting] of [
    ['haan sir', null], ['ji sir', 'purpose'], ['bhej raha hu sir', 'kyc'], ['2 min sir', null], ['will send sir', 'kyc'], ['ji trading', 'purpose'],
    ['Haan sir salary', 'source_of_funds'], ['Ji, business', 'source_of_funds'], ['ji sbi', 'paying_bank'], ['haan hdfc se', 'paying_bank'],
  ] as const) ok(!needs(text, waiting), `${text} (${waiting}) asks nothing`)
  // the answer is recorded without the "ji", and the script moves on
  const asked = [...start, img(0.5), us(1, 'May I know the purpose of buying USDT, sir?')]
  const p = plan('SELL', 'TRADING', [...asked, client(1.5, 'ji trading')])
  eq([states(p).purpose, p.next], ['done:trading', ['source_of_funds']])
  // a known client's bank with "ji" in front: their own account next, then the details
  const named = plan('SELL', 'TRADING', [...start, us(0.4, 'Which bank will you use to pay sir?'), client(0.7, 'ji sbi')], { clientState: 'approved' })
  eq([states(named).paying_bank, named.next, named.hints], ['done:sbi', ['own_account'], ['share_details']])
})

Deno.test('the paying bank in the words clients use (second review)', () => {
  for (const t of ['From my SBI account', 'Union Bank of India', 'SBI savings account', 'through HDFC', 'HDFC and ICICI', 'sbi', 'HDFC bank', 'from kotak',
    'kotak se', 'Bank of Baroda', 'Indian Overseas Bank', 'Punjab National Bank', 'yes bank', 'phonepe', 'icici current account', 'axis, hdfc']) ok(BANK_ONLY.test(t), t)
  for (const t of ['yes', 'yes sir', 'upi', 'UPI sir', 'business', 'same bank as before', 'imps', 'union', 'indian', 'trading']) ok(!BANK_ONLY.test(t), t)
  // as the answer to "which bank?", the names that are also ordinary words count on their own
  for (const t of ['indian', 'union', 'slice', 'jana small bank']) ok(isBankOnly(t, true) && answersStep('paying_bank', t), t)
  ok(!isBankOnly('yes', true) && !isBankOnly('upi', true))
  const p = plan('SELL', 'TRADING', [...start, us(0.4, 'Which bank will you use to pay sir?'), client(0.7, 'From my SBI account')], { clientState: 'approved' })
  eq([states(p).paying_bank, p.next], ['done:From my SBI account', ['own_account']])
})

Deno.test('a profession can be "police" or a "verification officer"; "paid, not released" is still a payment claim (second review)', () => {
  for (const t of ['Police constable', 'I am in police', 'Bank verification officer']) ok(answersStep('profession', t) && !answersStep('purpose', t), t)
  ok(!answersStep('profession', 'KYC already done') && !answersStep('profession', 'scam'))
  for (const t of ['Paid sir, not released yet', 'Payment done, not received USDT', 'maine paid kar diya, aap nahi bhej rahe']) ok(saysPaid(t), t)
})

Deno.test('third review: ways of paying are looked up; real professions count; a promise may name what is sent', () => {
  const needs = (text: string, waiting: Parameters<typeof turnNeedsAnswer>[1]) => turnNeedsAnswer(buildTranscript([client(1, text)]), waiting)
  for (const text of ['pay to phonepe', 'phonepe pay', 'gpay payment', 'pay with gpay', 'HDFC payment again', 'I will pay from SBI']) {
    ok(!isBankOnly(text), text); ok(needs(text, null), `${text} is looked up`)
  }
  ok(isBankOnly('my sbi account') && isBankOnly('kotak se') && isBankOnly('HDFC bank sir'), 'a bank named on its own still asks nothing')
  ok(isBankOnly('I will pay from SBI', true) && answersStep('paying_bank', 'I will pay from SBI'), 'as the answer to "which bank?" it is the bank')
  for (const t of ['Front office executive', 'Photo studio owner', 'Aadhaar center operator', 'Quality check engineer', 'Server engineer']) ok(answersStep('profession', t), t)
  for (const t of ['KYC already done', 'jaldi karo', 'sorry bro cancel this order']) ok(!answersStep('profession', t), t)
  for (const text of ['sending docs', 'sending aadhar', '1 min sending pic', 'abhi aadhar bhej raha hu']) ok(!needs(text, 'kyc'), `${text} asks nothing`)
  for (const text of ['aadhar card', 'photo', 'sending aadhar but it is not clear']) ok(needs(text, 'kyc'), `${text} is looked up`)
})

Deno.test('"not paid yet" is not a payment claim: no "mark as paid" for it', () => {
  for (const t of ['not paid yet', 'I have not paid', 'abhi paid nahi kiya', 'payment nahi hua', "didn't pay yet", 'paid nahi hua', 'payment abhi nahi kiya', 'Payment is not done']) ok(!saysPaid(t), t)
  for (const t of ['paid', 'payment done sir', 'I have paid', 'pay kar diya']) ok(saysPaid(t), t)
  const details = [...start, sys(0.5, 'maker_verified_additional_kyc_maker_sell'), us(1, 'blynk@ybl'), us(1.1, 'Please pay on it, sir.')]
  eq(plan('SELL', 'TRADING', [...details, client(2, 'not paid yet')]).next, [])
  eq(plan('SELL', 'TRADING', [...details, client(2, 'paid')]).next, ['mark_paid'])
})

Deno.test('a first request after the documents is not a re-ask; one side, "again" or "the correct Aadhaar" is (second review)', () => {
  const docs = [...start, img(0.2), img(0.25)]
  for (const first of ['Please share Aadhaar front and back side and mobile number', 'Kindly share your Aadhar card both side and mobile no',
    'Please share your Aadhaar properly', 'Sir, your Aadhaar details are correct, thank you', 'please share aadhar front and back side sir']) {
    const p = plan('SELL', 'TRADING', [...docs, us(0.5, first)])
    eq([states(p).kyc, p.next], ['done', ['purpose']], first)
  }
  for (const again of ['back side aadhar card sir', 'Please share back side also sir', 'Sir, the Aadhar image is not clear. Please share it again.',
    'no problem sir please share correct aadhar', 'Sir please share the other side of the Aadhaar', 'send front side photo of aadhar']) {
    const p = plan('SELL', 'TRADING', [...docs, us(0.5, again)])
    eq([states(p).kyc, p.waitingFor], ['asked', 'kyc'], again)
    eq(states(plan('SELL', 'TRADING', [...docs, us(0.5, again), img(0.7)])).kyc, 'done', `${again}: a new picture completes it`)
  }
})

Deno.test('documents asked again: only what comes after the request counts', () => {
  const asked = [...start, client(0.5, 'img', 'image'), us(1, 'Sir, the Aadhar image is not clear. Please share it again.')]
  const p = plan('SELL', 'TRADING', asked)
  eq([states(p).kyc, p.waitingFor, p.next], ['asked', 'kyc', []], 'not on to the purpose yet')
  const q = plan('SELL', 'TRADING', [...asked, client(2, 'img', 'image')])
  eq([states(q).kyc, q.next], ['done', ['purpose']])
})
