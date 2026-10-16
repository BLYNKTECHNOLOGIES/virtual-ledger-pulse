// Run: deno test supabase/functions/_shared/copilot-situation.test.ts
// The chats below follow real sell and buy orders (texts shortened, numbers removed).
import { buildTranscript, type ChatRow } from './copilot-playbook.ts'
import {
  alternativeSteps, asksToPayNow, beforeVerification, covers, detectSituation, evidenceText, fitsOrder, invitesPayment, markable, resolveSituation,
  SITUATIONS, situationDef, stageDepth, statusFromEvents,
} from './copilot-situation.ts'

function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`)
}
function ok(cond: unknown, msg = '') { if (!cond) throw new Error(msg || 'assertion failed') }

const T0 = Date.parse('2026-10-15T05:40:00Z') // 11:10 IST
let n = 0
const at = (min: number) => T0 + min * 60_000
const us = (min: number, text: string): ChatRow => ({ binance_message_id: `u${++n}`, message_type: 'text', sender_is_self: true, message_text: text, binance_create_time: at(min) })
const client = (min: number, text: string, type = 'text'): ChatRow => ({ binance_message_id: `c${++n}`, message_type: type, sender_is_self: false, message_text: text, binance_create_time: at(min) })
const sys = (min: number, type: string): ChatRow => ({ binance_message_id: `s${++n}`, message_type: 'system', is_system_message: true, message_text: JSON.stringify({ type }), binance_create_time: at(min) })
const auto = (min: number, text: string, self = true): ChatRow => ({ dedupe_key: `a${++n}`, message_type: 'auto_reply', sender_is_self: self, message_text: text, binance_create_time: at(min) })
const card = (min: number): ChatRow => ({ binance_message_id: `k${++n}`, message_type: 'card', sender_is_self: true, message_text: '{"addKycVrfInfo":[{"displayTitleValue":"Identity"}]}', binance_create_time: at(min) })

const sit = (side: 'SELL' | 'BUY', status: string, rows: ChatRow[], nowMin = 999) => detectSituation(side, status, buildTranscript(rows), at(nowMin))

// A new client's sell order: extra KYC, documents, questions, RM call, verified, paid, completed.
const sellRows: ChatRow[] = [
  sys(0, 'order_created_with_additional_kyc_maker_sell'),
  auto(0, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no'),
  auto(0, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no', false),
  card(0.1),
  client(0.2, 'hello sir'), client(0.4, 'Are u Online'),
  us(0.6, 'Good morning sir'), us(0.9, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no'),
]

Deno.test('sell, new client: KYC pending until the client sends something real', () => {
  const s = sit('SELL', 'TRADING', sellRows)
  eq(s.code, 'sell.kyc.pending')
  eq(evidenceText(s.evidence), 'KYC asked 11:10 · nothing received yet')
  eq(sit('SELL', 'TRADING', [...sellRows, client(1, 'Good morning'), client(1.2, "I'm sending you adhar card front and back")]).code, 'sell.kyc.pending',
    'a greeting or "sending now" is not the documents')
  eq(sit('SELL', 'TRADING', [...sellRows, client(1.1, 'how much time?')]).code, 'sell.kyc.pending', 'a question is not an answer')
})

const withDocs = [...sellRows, client(1.0, 'img', 'image'), client(1.1, 'img', 'image'), client(1.2, 'mobile [number]')]
Deno.test('sell: documents received means we are checking; a new KYC question puts the client back on turn', () => {
  const s = sit('SELL', 'TRADING', withDocs)
  eq(s.code, 'sell.kyc.review')
  eq(evidenceText(s.evidence), 'Documents received 11:11 · Client answered 11:11')
  const asked = [...withDocs, us(2, 'May I know your purpose of buying  USDT ?')]
  const p = sit('SELL', 'TRADING', asked)
  eq(p.code, 'sell.kyc.pending')
  eq(evidenceText(p.evidence), 'Documents received 11:11 · Question asked 11:12 · waiting for the answer')
  eq(sit('SELL', 'TRADING', [...asked, client(2.2, 'Trading')]).code, 'sell.kyc.review')
})

const rmRows = [...withDocs, us(2, 'May I know your purpose of buying  USDT ?'), client(2.2, 'Trading'),
  us(2.5, 'May I know your source of funds ? Bussiness Or Salary.'), client(2.7, 'Business'),
  us(3, 'Sir one time verification is needed Please allow us a minute our RM team will connect you soon.')]
Deno.test('sell: the RM message means verification; client chatter does not change it', () => {
  const s = sit('SELL', 'TRADING', [...rmRows, client(3.5, 'ok'), client(10, 'Done sir'), client(14, 'please check')])
  eq(s.code, 'sell.kyc.call')
  eq(evidenceText(s.evidence), 'Verification call message sent 11:13')
  ok(beforeVerification('SELL', s.code), 'still before verification')
})

Deno.test('sell: verified on Binance and payment details shared means the client can pay; then paid, then done', () => {
  const ready = [...rmRows, sys(16, 'maker_verified_additional_kyc_maker_sell'), us(16.1, 'pos.5307682@indus'), us(16.2, 'pay on it sir')]
  const s = sit('SELL', 'TRADING', ready)
  eq(s.code, 'sell.pay.ready')
  eq(evidenceText(s.evidence), 'Verified on Binance 11:26 · Payment details shared 11:26')
  ok(!beforeVerification('SELL', s.code))
  const paid = sit('SELL', 'BUYER_PAYED', [...ready, sys(17, 'seller_payed')])
  eq(paid.code, 'sell.pay.checking'); eq(evidenceText(paid.evidence), 'Client marked the order as paid 11:27')
  eq(sit('SELL', 'COMPLETED', [...ready, sys(17, 'seller_payed'), sys(18, 'seller_completed')]).code, 'done')
  eq(sit('SELL', 'CANCELLED_BY_SYSTEM', ready).code, 'cancelled')
  eq(sit('SELL', 'APPEAL', ready).code, 'appeal')
})

Deno.test('sell: payment details shared (even before the Binance click) also mean the client can pay', () => {
  eq(sit('SELL', 'TRADING', [...rmRows, us(9, 'Please wait sir we are verifying with team'), us(9.1, 'pos.5307682@indus')]).code, 'sell.pay.ready')
})

Deno.test('sell: a repeat client without extra KYC can pay from the start, unless we start a verification call', () => {
  const plain = [sys(0, 'seller_merchant_trading'), client(0.5, 'hi'), client(0.6, 'can I pay?')]
  const s = sit('SELL', 'TRADING', plain)
  eq(s.code, 'sell.pay.ready'); eq(evidenceText(s.evidence), 'No extra KYC on this order')
  eq(sit('SELL', 'TRADING', [...plain, us(1, 'Our RM will connect you soon sir')]).code, 'sell.kyc.call', 'video KYC for a known client')
  eq(sit('SELL', 'TRADING', [...plain, us(1, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')]).code, 'sell.kyc.pending')
})

Deno.test('buy: details asked, received, paying, beneficiary waiting period, paid', () => {
  const open = [sys(0, 'buyer_merchant_trading'), us(0.3, 'Good Evening Sir')]
  eq(sit('BUY', 'TRADING', open).code, 'buy.pay.processing')
  const asked = [...open, us(0.5, 'Kindly share your PAN card and mobile no sir')]
  eq(sit('BUY', 'TRADING', asked).code, 'buy.details')
  eq(sit('BUY', 'TRADING', [...asked, client(1, 'how long?')]).code, 'buy.details', 'a question is not the details')
  const got = [...asked, client(1, 'pan', 'image')]
  eq(sit('BUY', 'TRADING', got).code, 'buy.pay.processing')
  const cooling = [...got, us(2, 'Paying on your given details sir'), us(5, "We have added your account as a beneficiary. We'll be able to make the payment after 30 minutes.")]
  const c = sit('BUY', 'TRADING', cooling, 15)
  eq(c.code, 'buy.pay.cooling'); eq(c.readyAt, at(35))
  eq(evidenceText(c.evidence), 'Beneficiary added 11:15 · payment possible from about 11:45')
  const ended = sit('BUY', 'TRADING', cooling, 36)
  eq(ended.code, 'buy.pay.processing'); eq(evidenceText(ended.evidence), 'Beneficiary waiting period ended 11:45')
  eq(sit('BUY', 'BUYER_PAYED', [...cooling, sys(40, 'buyer_payed')], 41).code, 'buy.pay.sent')
})

Deno.test("an approver's correction wins until our next step or a status change", () => {
  const rows = [...withDocs]
  const d = sit('SELL', 'TRADING', rows)
  eq(d.code, 'sell.kyc.review')
  const marked = resolveSituation('SELL', d, { code: 'sell.kyc.call', at: at(5), by: 'u1' })
  eq(marked.code, 'sell.kyc.call'); eq(marked.detectedCode, 'sell.kyc.review'); eq(marked.marked, { by: 'u1', at: at(5) }); eq(marked.label, 'Verification call')
  // client messages after the correction do not undo it
  const later = sit('SELL', 'TRADING', [...rows, client(6, 'done sir')])
  eq(resolveSituation('SELL', later, { code: 'sell.kyc.call', at: at(5), by: 'u1' }).code, 'sell.kyc.call')
  // our next step does
  const next = sit('SELL', 'TRADING', [...rows, us(7, 'pos.5307682@indus')])
  eq(resolveSituation('SELL', next, { code: 'sell.kyc.call', at: at(5), by: 'u1' }).code, 'sell.pay.ready')
  // a correction older than the detection's step is ignored
  eq(resolveSituation('SELL', d, { code: 'sell.kyc.call', at: at(0.5), by: 'u1' }).code, 'sell.kyc.review')
  // status situations always come from Binance; a code for the other side, or "back to detected", changes nothing
  const paid = sit('SELL', 'BUYER_PAYED', rows)
  eq(resolveSituation('SELL', paid, { code: 'sell.kyc.call', at: at(900), by: 'u1' }).code, 'sell.pay.checking')
  eq(resolveSituation('SELL', d, { code: 'buy.details', at: at(5), by: 'u1' }).code, 'sell.kyc.review')
  eq(resolveSituation('SELL', d, { code: null, at: at(5), by: 'u1' }).code, 'sell.kyc.review')
})

Deno.test('situation codes form a tree; only detectable, non-status codes can be set by hand', () => {
  ok(covers('sell.kyc', 'sell.kyc.call')); ok(covers('sell.kyc.call', 'sell.kyc.call')); ok(!covers('sell.kyc.call', 'sell.kyc'))
  ok(!covers('sell.kyc', 'sell.kycx')); ok(!covers('sell.kyc', null))
  ok(markable('sell.kyc.review', 'SELL')); ok(!markable('sell.kyc', 'SELL'), 'groups are for scoping replies')
  ok(!markable('sell.pay.checking', 'SELL'), 'status situations come from Binance'); ok(!markable('buy.details', 'SELL'))
  eq(SITUATIONS.filter((s) => s.detectable).length, 12)
  eq(situationDef('buy.pay.cooling')?.label, 'Beneficiary activation')
  for (const s of SITUATIONS) {
    const parent = s.code.split('.').slice(0, -1).join('.')
    if (s.code.includes('.') && parent.includes('.')) ok(situationDef(parent), `parent of ${s.code} is listed`)
  }
})

Deno.test('invitesPayment: requests to pay and payment details, in English and Hinglish, but not "details after verification"', () => {
  for (const t of [
    'Yes sir, please pay to {upi}.', 'pos.12345@indus', 'Yes, sir. Please pay to the payment details shared in this order.',
    'Sir, please complete the payment to the details shared.', 'Ji sir, order mein di gayi payment details par payment kar dijiye.',
    'Sir, is UPI par payment karein.', 'You can make the payment now, sir.',
    // a "once verified" about the release never excuses a request to pay beside it
    'Sir, please pay to {upi} and we will release the USDT once the payment is verified.',
    'aap {upi} par payment kar sakte hain, verification hote hi release kar denge',
    'aap payment kar sakte hain verification hote hi release kar denge',
    'Sir, please pay and we will release once your KYC is verified.',
    // common ways of asking
    'Sir, payment kijiye.', 'Payment karein sir.', 'payment karo', 'Sir, amount bhej dijiye.', 'Paise bhej do sir',
    'Please make the payment to the details shown in the order.', 'Kindly proceed with the payment.',
    'Please transfer the amount to the account shown in the order.', 'Sir, you may pay now.', 'Pay now sir', 'Go ahead and pay, sir.',
    'A/c no [number], IFSC [ifsc]. Please pay.', 'Sir UPI: [upi]',
    // a condition in another sentence, or one that is not the client's verification, excuses nothing
    'Sir, once your verification is complete we will release the USDT. Please complete the payment.',
    'Sir, after KYC we release; please pay now.', 'Sir, verification ke baad USDT release hoga. Abhi payment kar dijiye.',
    'Sir, once the KYC documents are shared, you can make the payment.', 'Sir, after your KYC details are shared, you can pay.',
    'Sir, KYC documents share hote hi payment kar dijiye.', 'Sir, please share your Aadhaar first, then you can make the payment.',
    // more ways of asking
    'Sir, pay now.', 'Pay now, sir.', 'Sir, transfer now.', 'Sir, payment kar dijiyega.', 'Sir, payment karke screenshot bhej dijiye.',
    'Sir, amount send kar dijiye.', 'Sir, paise daal dijiye.', 'Sir, aapko payment karna hai.', 'Sir, aap payment kar skte hain.',
    'Feel free to pay, sir.', 'Sir, you may proceed to pay.', 'Sir, the payment can be made now.', 'Sir, kindly remit the amount.',
    "Sir, please don't wait to pay.", 'Sir, please share your Aadhaar and pay.', 'Sir, share the screenshot after you pay.',
    'Sir, UPI par bhej dijiye.', 'Sir, pay after verification? No, pay now.',
    // a condition that opens another clause governs that one
    'Sir, you can make the payment now, once your verification is complete we will release the USDT.',
    'Sir, please pay now, after verification is done you will receive the USDT.',
    'After your verification is complete the order will be processed, please pay now.',
    'Verification ke baad aapka order complete hoga, payment kar dijiye.', 'KYC complete hote hi order process hoga, abhi payment kar dijiye.',
    "Don't worry you can pay now", 'No worries sir dont panic just pay now', "Sir, don't forget to pay.",
    'Sir, your verification is complete, you can pay now.',
  ]) ok(invitesPayment(t), t)
  for (const t of [
    'Please wait a moment, sir. We will share the payment details as soon as your verification is complete.',
    'Sir, please share the requested KYC details first. We will share the payment details as soon as your verification is complete.',
    'Sir, verification complete hote hi payment details share kar denge.',
    "Sir, we accept payment only from a bank account in your own name. Please do not pay from anyone else's account.",
    'No problem, sir. Please cancel the order from your side and do not make any payment for it.',
    'Koi baat nahi sir, order apni side se cancel kar dijiye aur iske liye koi payment mat kijiye.',
    'Sir, you can reach our support team at {contact:support}.', 'Write to support@blynkex.com for help.',
    'Thank you, sir. Please make sure the payment comes from a bank account in your own name.',
    // paying tied to the client's verification is for later
    'You can pay after your verification is complete, sir.', 'Once your verification is complete, please pay to the details shown in the order.',
    'Verification complete hone ke baad, payment kar dijiye.', 'Sir, verification ke baad payment kijiye.',
    'Please do not pay until your verification is complete.', 'Sir, we will send the payment details after verification.',
    'Sir, please complete your KYC first, then you can pay.', 'Pehle KYC complete kijiye, phir payment kar sakte hain.',
    'Sir, KYC ke baad hi payment kijiye, abhi nahi.', 'Sir, please pay only after the verification is complete.',
    "Sir, please don't make the payment yet.", 'Sir, payment mat kar dijiye abhi.', 'Which bank will you use to pay, sir?',
    'Sir, aap kis bank se payment karenge?', 'Sir, hum sirf aapke apne naam ke bank account se hi payment lete hain.',
    'Sir, before you make the payment, please share your Aadhaar card and mobile number.',
    'Sir, you can pay, but only after your verification is complete.',
  ]) ok(!invitesPayment(t), t)
  ok(asksToPayNow('Yes, sir. Please pay to the payment details shared in this order.'))
  ok(asksToPayNow('Sir, your verification is complete, you can pay now.'), 'says verification is done: a payment reply')
  ok(!asksToPayNow('Sir, please share your Aadhaar first, then you can make the payment.'), 'held back, but a KYC reply all the same')
})

Deno.test('sell: a real KYC request after the payment details or the Binance verification puts the client back in KYC', () => {
  const ready = [...rmRows, sys(16, 'maker_verified_additional_kyc_maker_sell'), us(16.1, 'pos.5307682@indus')]
  const again = [...ready, us(17, 'Sir kindly share your Aadhaar card front and back once more')]
  const s = sit('SELL', 'TRADING', [...again, client(17.5, 'Can I pay now?')])
  eq(s.code, 'sell.kyc.pending'); eq(evidenceText(s.evidence), 'KYC asked again 11:27 · nothing received yet')
  ok(beforeVerification('SELL', s.code), 'payment-inviting replies are held back again')
  eq(sit('SELL', 'TRADING', [...again, client(18, 'img', 'image')]).code, 'sell.kyc.review')
  eq(sit('SELL', 'TRADING', [us(0, 'abcpay@ybl'), us(1, 'Sir please share your Aadhaar card and mobile number'), client(2, 'Can I pay now?')]).code, 'sell.kyc.pending')
  // saying KYC is done, or mentioning it without asking, is not a request
  eq(sit('SELL', 'TRADING', [...ready, us(17, 'Your KYC is complete sir, please share the payment screenshot after paying')]).code, 'sell.pay.ready')
  eq(sit('SELL', 'TRADING', [...ready, us(17, 'Your Aadhaar is verified sir')]).code, 'sell.pay.ready')
  // "not done yet" is a request after all; an instruction to pay that mentions the mobile number is not
  eq(sit('SELL', 'TRADING', [us(0, 'abcpay@ybl'), us(1, 'Sir, your KYC is not done yet. Please share your Aadhaar card.')]).code, 'sell.kyc.pending')
  eq(sit('SELL', 'TRADING', [us(0, 'abcpay@ybl'), us(1, 'aapki KYC complete nahi hui hai, please Aadhaar card share kijiye')]).code, 'sell.kyc.pending')
  eq(sit('SELL', 'TRADING', [us(0, 'abcpay@ybl'), us(1, 'Kindly pay from the bank account registered with your mobile number.')]).code, 'sell.pay.ready')
  eq(sit('SELL', 'TRADING', [client(0, 'hi'), us(1, 'Kindly pay from the bank account registered with your mobile number.')]).code, 'sell.pay.ready')
  // a KYC request that mentions paying as the next step is still a KYC request
  for (const ask of ['Sir, before you make the payment, please share your Aadhaar card and mobile number.',
    'Kindly share your Aadhaar card and mobile number for verification, after that you can make the payment.',
    'Please share your Aadhaar card first, then you can make the payment.',
    'Please share your Aadhaar card and mobile number to proceed with the payment.']) {
    eq(sit('SELL', 'TRADING', [us(0, ask), client(1, 'Can I pay now?')]).code, 'sell.kyc.pending', ask)
  }
})

Deno.test('appeal comes from the live status; the chat notice counts only when the status is not known', () => {
  const rows = [sys(0, 'seller_merchant_trading'), sys(1, 'seller_payed'), sys(5, 'be_appeal')]
  eq(sit('SELL', 'APPEAL', rows).code, 'appeal')
  eq(sit('SELL', 'BUYER_PAYED', rows).code, 'sell.pay.checking', 'a withdrawn appeal: the order is back to paid')
  eq(sit('SELL', 'UNKNOWN', rows).code, 'appeal')
  eq(sit('SELL', 'COMPLETED', [...rows, sys(9, 'seller_completed')]).code, 'done')
})

Deno.test("statusFromEvents: the order status as of a cut chat, from Binance's notices", () => {
  eq(statusFromEvents(buildTranscript([sys(0, 'seller_merchant_trading'), us(1, 'hi')])), 'TRADING')
  eq(statusFromEvents(buildTranscript([sys(0, 'seller_merchant_trading'), sys(2, 'seller_payed')])), 'BUYER_PAYED')
  eq(statusFromEvents(buildTranscript([sys(2, 'buyer_payed'), sys(3, 'buyer_completed')])), 'COMPLETED')
  eq(statusFromEvents(buildTranscript([sys(2, 'seller_reason_expired')])), 'CANCELLED')
  eq(statusFromEvents(buildTranscript([sys(2, 'seller_payed'), sys(4, 'submit_appeal')])), 'APPEAL')
})

// ─── Other steps the client could be at (CP-5) ──────────────────────────────────────────────────────

Deno.test('alternativeSteps: the neighbouring KYC steps, closest first; never "Client can pay" before verification', () => {
  eq(alternativeSteps('SELL', { code: 'sell.kyc.call' }, 'new'), ['sell.kyc.review', 'sell.kyc.pending'])
  eq(alternativeSteps('SELL', { code: 'sell.kyc.review' }, 'new'), ['sell.kyc.call', 'sell.kyc.pending'])
  eq(alternativeSteps('SELL', { code: 'sell.kyc.pending' }, 'new'), ['sell.kyc.review', 'sell.kyc.call'])
  for (const code of ['sell.kyc.pending', 'sell.kyc.review', 'sell.kyc.call']) {
    ok(alternativeSteps('SELL', { code }, 'approved').every((c) => covers('sell.kyc', c)), `only KYC steps from ${code}`)
    ok(alternativeSteps('SELL', { code }, 'new').every((c) => markable(c, 'SELL')), 'every step can be set by an approver')
  }
})

Deno.test('alternativeSteps: verified, paid and finished orders have none; a sell order with no KYC sign may still need KYC', () => {
  // Verified on Binance or payment details shared: the step comes from Binance or our details, not a guess.
  const verified = sit('SELL', 'TRADING', [...rmRows, sys(14, 'maker_verified_additional_kyc_maker_sell')])
  eq(verified.code, 'sell.pay.ready'); eq(verified.noKyc, undefined)
  eq(alternativeSteps('SELL', verified, 'new'), [])
  // No Binance KYC notice and no KYC request from us: "Client can pay", but a client we have not approved may need KYC.
  const plain = sit('SELL', 'TRADING', [client(0, 'Hi, can I pay?')])
  eq(plain.code, 'sell.pay.ready'); eq(plain.noKyc, true)
  eq(alternativeSteps('SELL', plain, 'new'), ['sell.kyc.pending'])
  eq(alternativeSteps('SELL', plain, 'linked'), ['sell.kyc.pending'])
  eq(alternativeSteps('SELL', plain, 'approved'), [], 'an approved client without extra KYC can pay')
  for (const code of ['sell.pay.checking', 'buy.pay.sent', 'done', 'cancelled', 'appeal']) eq(alternativeSteps('SELL', { code }, 'new').concat(alternativeSteps('BUY', { code }, 'new')), [], code)
  eq(alternativeSteps(null, { code: 'sell.kyc.call' }, 'new'), [], 'side unknown')
  eq(alternativeSteps('SELL', { code: null }, 'new'), [])
})

Deno.test('alternativeSteps: our payment steps on a buy order', () => {
  eq(alternativeSteps('BUY', { code: 'buy.details' }, 'new'), ['buy.pay.processing', 'buy.pay.cooling'])
  eq(alternativeSteps('BUY', { code: 'buy.pay.processing' }, 'approved'), ['buy.pay.cooling', 'buy.details'])
  eq(alternativeSteps('BUY', { code: 'buy.pay.cooling' }, 'approved'), ['buy.pay.processing', 'buy.details'])
  eq(alternativeSteps('BUY', { code: 'sell.kyc.call' }, 'new'), [], 'a sell step on a buy order')
})

Deno.test("fitsOrder and stageDepth follow the database's fits and specificity", () => {
  const o = { side: 'SELL', category: 'regular', accountId: 'acc-1', status: 'TRADING', clientState: 'new' }
  ok(fitsOrder({}, o, 'sell.kyc.call') && fitsOrder(null, o, null), 'no scope: any order, any situation')
  ok(fitsOrder({ stages: ['sell.kyc'] }, o, 'sell.kyc.call'), 'a group covers its steps')
  ok(!fitsOrder({ stages: ['sell.kyc'] }, o, null), 'unknown situation: only replies for any situation')
  ok(!fitsOrder({ stages: ['sell.kyc.review'] }, o, 'sell.kyc.call'))
  ok(!fitsOrder({ sides: ['BUY'] }, o, 'sell.kyc.call'))
  ok(!fitsOrder({ client_states: ['approved'] }, o, 'sell.kyc.call'))
  ok(fitsOrder({ account_ids: ['acc-1'], categories: ['regular'], statuses: ['TRADING'] }, o, 'sell.kyc.call'))
  eq(stageDepth({ stages: ['sell.kyc', 'sell.kyc.call'] }, 'sell.kyc.call'), 3)
  eq(stageDepth({ stages: ['sell.kyc'] }, 'sell.kyc.review'), 2)
  eq(stageDepth({}, 'sell.kyc.review'), 0)
  eq(stageDepth({ stages: ['sell.pay.ready'] }, 'sell.kyc.review'), 0)
})

Deno.test('sell: "you can pay to the given account once verified" is still a KYC reply; "please pay on it" shares the details', () => {
  for (const text of [
    'Sir, you can pay to the given account once your verification is complete.',
    'Sir, after your verification is complete, please pay to the above account.',
    'Sir, kindly wait. You can pay to the same account after verification.',
    "Please don't pay on it",
  ]) eq(sit('SELL', 'TRADING', [...withDocs, us(3, text)]).code, 'sell.kyc.review', text)
  for (const text of ['Please pay on it sir', 'pay on this upi sir', 'Please pay sir', 'Sir your verification is completed successfully , kindly pay on the given details']) {
    eq(sit('SELL', 'TRADING', [...withDocs, us(3, text)]).code, 'sell.pay.ready', text)
  }
})

Deno.test('buy: "please share the requested details so that we can process your payment" asks for details; our promise does not', () => {
  const paying = [us(0, 'Paying on your given details, sir.'), client(1, 'How long?')]
  eq(sit('BUY', 'TRADING', paying).code, 'buy.pay.processing')
  eq(sit('BUY', 'TRADING', [...paying, us(2, 'Sir, please share the requested details so that we can process your payment.')]).code, 'buy.details')
  eq(sit('BUY', 'TRADING', [...paying, us(2, 'Not yet, sir. Please share the requested details first so that we can process the payment.')]).code, 'buy.details')
  eq(sit('BUY', 'TRADING', [...paying, us(2, 'Abhi nahi sir. Pehle requested details share kar dijiye, taaki payment process kar sakein.')]).code, 'buy.details', 'Hinglish word order')
  eq(sit('BUY', 'TRADING', [...paying, us(2, 'Sir, payment process ho raha hai, details share kar denge.')]).code, 'buy.pay.processing', 'our promise in Hinglish')
  eq(sit('BUY', 'TRADING', [us(0, 'Sir please share your PAN details and mobile no'), client(1, 'PAN [number] mobile [number]'), us(2, 'We will share the payment details once it is done, please wait.')]).code, 'buy.pay.processing',
    'the client answered; our promise to share is not a new request')
})

Deno.test('buy: thanks, past tense and warnings about details are not requests for them', () => {
  const paying = [us(0, 'Paying on your given details, sir.'), client(1, 'How long?')]
  for (const text of [
    'Details share karne ke liye thank you sir, payment process ho raha hai.',
    'Aapne details share kar di hai, payment process ho raha hai, please wait.',
    'Sir payment is in process, please do not share your details with anyone.',
  ]) eq(sit('BUY', 'TRADING', [...paying, us(2, text)]).code, 'buy.pay.processing', text)
})

Deno.test('sell: the Hinglish verification-call message is read as the call', () => {
  eq(sit('SELL', 'TRADING', [...withDocs, us(3, 'Sir, ek baar verification zaroori hai. Hamari KYC team thodi der mein aapse connect karegi.')]).code, 'sell.kyc.call')
  eq(sit('SELL', 'TRADING', [...withDocs, us(3, 'Sir, verification ke liye hamari KYC team aapko call karegi.')]).code, 'sell.kyc.call')
  eq(sit('SELL', 'TRADING', [...withDocs, us(3, 'Sir, hamari support team aapse contact karegi.')]).code, 'sell.kyc.review', 'any team contacting is not the KYC call')
  eq(sit('SELL', 'TRADING', [...withDocs, us(3, 'Sir, verification ke liye hamari KYC team aapse contact karegi.')]).code, 'sell.kyc.review',
    'like the English "our KYC team will contact you": not read as the call')
  eq(sit('SELL', 'TRADING', [...withDocs, us(3, 'Sir, ek baar verification complete ho jaye, phir payment details share kar denge.')]).code, 'sell.kyc.review',
    '"ek baar" meaning "once"')
})
