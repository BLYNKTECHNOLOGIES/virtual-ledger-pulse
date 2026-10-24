// Run: deno test supabase/functions/_shared/copilot-situation.test.ts
// The chats below follow real sell and buy orders (texts shortened, numbers removed).
import { buildTranscript, type ChatRow } from './copilot-playbook.ts'
import { withNotices } from './copilot-store.ts'
import {
  alternativeSteps, asksToPayNow, beforeVerification, covers, detectSituation, evidenceText, fitsOrder, invitesPayment, isSmallTalk, markable,
  type OrderSignals, requiredOnly, resolveSituation, SITUATIONS, situationDef, stageDepth, statusFromEvents, verifiedBy,
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
const usPic = (min: number): ChatRow => ({ binance_message_id: `p${++n}`, message_type: 'image', sender_is_self: true, message_text: '', binance_create_time: at(min) })
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
  const s = detectSituation('SELL', 'TRADING', buildTranscript(plain), at(999), { kycVerify: 0 })
  eq(s.code, 'sell.pay.ready'); eq(evidenceText(s.evidence), 'No extra KYC on Binance for this order')
  // Binance's field not known yet (a new order not stored yet): treated as needing KYC, never "Client can pay"
  const unknown = sit('SELL', 'TRADING', plain)
  eq(unknown.code, 'sell.kyc.pending'); eq(evidenceText(unknown.evidence), "Binance's KYC setting not known yet · nothing received yet"); eq(unknown.since, 0)
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
  eq(sit('BUY', 'BUYER_PAYED', [...cooling, sys(40, 'buyer_payed'), usPic(40.2)], 41).code, 'buy.pay.sent')
})

Deno.test('buy: marked paid is "waiting for release" only once our proof is in the chat', () => {
  const paying = [sys(0, 'buyer_merchant_trading'), us(0.3, 'Good Evening Sir'), us(1, 'Kindly wait sir paying on your given details')]
  const marked = sit('BUY', 'BUYER_PAYED', [...paying, sys(10, 'buyer_payed')], 11)
  eq(marked.code, 'buy.pay.processing', 'marked paid with no screenshot yet: the money may not have gone')
  eq(evidenceText(marked.evidence), 'We marked the order as paid 11:20 · no payment proof in the chat yet')
  eq(sit('BUY', 'BUYER_PAYED', [...paying, sys(10, 'buyer_payed'), usPic(10.1)], 11).code, 'buy.pay.sent')
  eq(sit('BUY', 'BUYER_PAYED', [...paying, usPic(8), sys(10, 'buyer_payed')], 11).code, 'buy.pay.sent', 'the screenshot went just before the mark')
  eq(sit('BUY', 'BUYER_PAYED', [...paying, sys(10, 'buyer_payed'), us(30, 'Payment done kindly check and release')], 31).code, 'buy.pay.sent')
  eq(sit('BUY', 'BUYER_PAYED', [...paying, usPic(1.2), sys(10, 'buyer_payed')], 11).code, 'buy.pay.processing',
    'a picture of ours from long before the mark (our company documents) is not the proof')
  eq(sit('BUY', 'BUYER_PAYED', paying, 11).code, 'buy.pay.sent', 'without the notice in the chat, the status alone decides (as before)')
})

Deno.test('sell: documents sent before our standard request are not asked for again', () => {
  const rows = [sys(0, 'order_created_with_additional_kyc_maker_sell'), card(0.02), client(0.2, 'img', 'image'), client(0.25, 'img', 'image'),
    us(0.4, 'Good Evening Sir'), us(0.5, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')]
  const s = sit('SELL', 'TRADING', rows)
  eq(s.code, 'sell.kyc.review', 'the documents are already in')
  eq(s.since, at(0.5), 'the request is still our latest step')
  eq(sit('SELL', 'TRADING', [...rows, us(1, 'Sir, the Aadhar image is not clear. Please share it again')]).code, 'sell.kyc.pending', 'a real re-ask waits')
  eq(sit('SELL', 'TRADING', [...rows, us(1, 'Please share back side also sir')]).code, 'sell.kyc.pending')
  // CP-8: a typed first request after the documents names both sides; one side, "again" or "the correct Aadhaar" is a re-ask
  for (const first of ['please share aadhar front and back side sir', 'Sir please share both side aadhar card image & mobile no', 'Please share your Aadhaar properly']) {
    eq(sit('SELL', 'TRADING', [...rows, us(1, first)]).code, 'sell.kyc.review', first)
  }
  for (const again of ['back side aadhar card sir', 'no problem sir please share correct aadhar', 'Sir please share the other side of the Aadhaar']) {
    eq(sit('SELL', 'TRADING', [...rows, us(1, again)]).code, 'sell.kyc.pending', again)
  }
  eq(sit('SELL', 'TRADING', [...rows, us(1, 'May I know your purpose of buying USDT ?')]).code, 'sell.kyc.pending', 'a new question waits for its answer')
  eq(sit('SELL', 'TRADING', [sys(0, 'order_created_with_additional_kyc_maker_sell'), us(0.5, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')]).code,
    'sell.kyc.pending', 'no documents yet: pending as before')
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
  eq(detectSituation('SELL', 'TRADING', buildTranscript([client(0, 'hi'), us(1, 'Kindly pay from the bank account registered with your mobile number.')]), at(999), { kycVerify: 0 }).code, 'sell.pay.ready')
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
  // Binance says no extra KYC and no KYC request from us: "Client can pay", but a client we have not approved may need KYC.
  const plain = detectSituation('SELL', 'TRADING', buildTranscript([client(0, 'Hi, can I pay?')]), at(999), { kycVerify: 0 })
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

// ─── Binance's order data (additionalKycVerify) fills a gap in the chat ─────────────────────────────

const sitWith = (side: 'SELL' | 'BUY', status: string, rows: ChatRow[], signals: OrderSignals, nowMin = 999) =>
  detectSituation(side, status, buildTranscript(rows), at(nowMin), signals)

Deno.test('sell: Binance says extra KYC is required but the chat has no notice yet: KYC pending, never "client can pay"', () => {
  const plain = [client(0.5, 'hi'), client(0.6, 'can I pay?')]
  eq(sitWith('SELL', 'TRADING', plain, { kycVerify: 0 }).code, 'sell.pay.ready', 'only Binance saying "no extra KYC" lets the client pay from the start')
  const s = sitWith('SELL', 'TRADING', plain, { kycVerify: 1, createdAt: at(0) })
  eq(s.code, 'sell.kyc.pending'); eq(s.noKyc, undefined)
  eq(evidenceText(s.evidence), 'Extra KYC required on Binance · nothing received yet')
  ok(beforeVerification('SELL', s.code))
  eq(alternativeSteps('SELL', s, 'new'), ['sell.kyc.review', 'sell.kyc.call'])
  // the client's documents after the order was created count as received
  eq(sitWith('SELL', 'TRADING', [...plain, client(1, 'img', 'image')], { kycVerify: 1, createdAt: at(0) }).code, 'sell.kyc.review')
  // the order's creation time unknown: still KYC pending
  eq(sitWith('SELL', 'TRADING', plain, { kycVerify: 1 }).code, 'sell.kyc.pending')
  // our verification-call message still reads as the call
  eq(sitWith('SELL', 'TRADING', [...plain, us(2, 'Sir one time verification is needed, our RM team will connect you soon.')], { kycVerify: 1, createdAt: at(0) }).code, 'sell.kyc.call')
})

Deno.test("sell: Binance says verified before the chat's notice arrives: the client can pay; it counts from our latest message", () => {
  const s = sitWith('SELL', 'TRADING', rmRows, { kycVerify: 2, createdAt: at(0) }, 20)
  eq(s.code, 'sell.pay.ready')
  eq(evidenceText(s.evidence), 'Verified on Binance', 'the time of the click is not known')
  eq(s.since, at(3), 'from our latest message (the verification-call message), never later')
  eq(resolveSituation('SELL', s, { code: 'sell.kyc.review', at: at(2.8), by: 'u1' }).code, 'sell.pay.ready', 'a correction made before it loses')
  eq(resolveSituation('SELL', s, { code: 'sell.kyc.call', at: at(5), by: 'u1' }).code, 'sell.kyc.call', 'a correction made after it holds (erring towards KYC)')
  // once the chat's notice is in, it gives the time and the usual rules apply
  const withNotice = sitWith('SELL', 'TRADING', [...rmRows, sys(16, 'maker_verified_additional_kyc_maker_sell')], { kycVerify: 2, createdAt: at(0) }, 20)
  eq(withNotice.code, 'sell.pay.ready'); eq(evidenceText(withNotice.evidence), 'Verified on Binance 11:26'); eq(withNotice.since, at(16))
  eq(resolveSituation('SELL', withNotice, { code: 'sell.kyc.call', at: at(18), by: 'u1' }).code, 'sell.kyc.call', 'a re-check marked after the notice holds')
  // "required" (1) with the chat's Verified notice: the chat is newer and wins
  eq(sitWith('SELL', 'TRADING', [...rmRows, sys(16, 'maker_verified_additional_kyc_maker_sell')], { kycVerify: 1, createdAt: at(0) }).code, 'sell.pay.ready')
  // a status from Binance still comes first
  eq(sitWith('SELL', 'BUYER_PAYED', rmRows, { kycVerify: 2 }).code, 'sell.pay.checking')
})

Deno.test('sell: Binance says no extra KYC (0): no-KYC wording; our own KYC request in the chat still counts', () => {
  const plain = [client(0.5, 'hi'), client(0.6, 'can I pay?')]
  const s = sitWith('SELL', 'TRADING', plain, { kycVerify: 0 })
  eq(s.code, 'sell.pay.ready'); eq(s.noKyc, true); eq(evidenceText(s.evidence), 'No extra KYC on Binance for this order')
  eq(alternativeSteps('SELL', s, 'new'), ['sell.kyc.pending'], 'a client we have not approved may still need KYC')
  eq(sitWith('SELL', 'TRADING', [...plain, us(1, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no')], { kycVerify: 0 }).code, 'sell.kyc.pending')
})

Deno.test('requiredOnly: a reply sent earlier is filed without the later verification; buy orders ignore the field', () => {
  eq(requiredOnly({ kycVerify: 2, createdAt: 5 }), { kycVerify: 1, createdAt: 5, verifiedLater: true })
  eq(requiredOnly({ kycVerify: 0 }), { kycVerify: 0, createdAt: null })
  eq(requiredOnly(null), { kycVerify: null, createdAt: null })
  const before = [client(0.5, 'hi'), client(0.6, 'can I pay?')]
  eq(sitWith('SELL', 'TRADING', before, requiredOnly({ kycVerify: 2, createdAt: at(0) }), 1).code, 'sell.kyc.pending')
  eq(sitWith('BUY', 'TRADING', [us(0.5, 'Kindly share your PAN card and mobile no sir')], { kycVerify: 1 }).code, 'buy.details')
})

Deno.test('isSmallTalk: greetings, thanks and "ok" only', () => {
  for (const t of ['ok', 'Ok sir', 'thanks', 'Thank you ji', 'hello', 'good morning sir', 'hmm']) ok(isSmallTalk(t), t)
  for (const t of ['can I pay now?', 'ok but when will you release', 'kitna time lagega', '']) ok(!isSmallTalk(t), t)
})

Deno.test("sell: verified per Binance's order data, no notice in the chat: a KYC request after our payment details is still a re-check", () => {
  const rows = [sys(0, 'order_created_with_additional_kyc_maker_sell'), us(0.5, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no'),
    client(1, 'img', 'image'), us(5, 'Sir please pay on this UPI: pos.5307682@indus'), us(8, 'Sir, the Aadhar image is not clear. Please share your Aadhar card again'),
    client(9, 'Can I pay now?')]
  const without = sit('SELL', 'TRADING', rows)
  eq(without.code, 'sell.kyc.pending')
  const withField = sitWith('SELL', 'TRADING', rows, { kycVerify: 2, createdAt: at(0) }, 20)
  eq(withField.code, 'sell.kyc.pending', 'the re-check after the details still counts')
  eq(withField.since, at(8))
  // with the details as our latest step, the client can pay; the evidence names both
  const ready = sitWith('SELL', 'TRADING', rows.slice(0, 4), { kycVerify: 2, createdAt: at(0) }, 20)
  eq(ready.code, 'sell.pay.ready'); eq(evidenceText(ready.evidence), 'Verified on Binance · Payment details shared 11:15')
})

Deno.test('invitesPayment: "time left to pay" and its Hinglish form invite payment; "after verification" still excuses them', () => {
  for (const t of ['Sir, you have 6 minutes left to pay.', 'Sir, 6 min left to pay, please hurry.', 'Sir, aapke paas pay karne ke liye 6 minute bache hain.', "Sir, it's time to pay now."]) {
    ok(invitesPayment(t), t)
  }
  for (const t of ['Sir, please complete the KYC first; it will be time to pay after verification.', 'Sir, the order has 6 minutes left; please share your Aadhaar quickly.']) {
    ok(!invitesPayment(t), t)
  }
})

Deno.test("sell: verified per Binance's order data counts from our latest KYC step: our small talk never undoes an approver's correction", () => {
  const rows = [...rmRows]
  const d = sitWith('SELL', 'TRADING', [...rows, us(6, 'Ok sir, please wait.')], { kycVerify: 2, createdAt: at(0) }, 20)
  eq(d.code, 'sell.pay.ready'); eq(d.since, at(3), 'from the verification-call message, not the small talk at 11:16')
  eq(resolveSituation('SELL', d, { code: 'sell.kyc.call', at: at(5), by: 'u1' }).code, 'sell.kyc.call')
})

Deno.test('invitesPayment: more ways of giving the time to pay, in English and Hinglish; payment checks and KYC wording are not', () => {
  for (const t of ['Sir, you have 6 minutes to pay.', 'Sir, only 6 minutes remaining for payment.', 'Sir, 6 min left for payment.',
    'Sir, you need to pay within 6 minutes or the order will be cancelled.', 'Sir, payment ke liye 6 minute bache hain.',
    'Sir, 6 minute bache hain payment karne ke liye.', 'Sir, aapke paas payment ke liye sirf 6 min hai.', 'Sir, you need to pay now.']) {
    ok(invitesPayment(t), t)
  }
  for (const t of ['Sir, it takes 10 minutes for payment verification.', 'Sir, please allow some time for the payment to reflect.',
    'Sir, you have to pay 1% TDS on crypto sales as per the law.', 'Sir, please share your Aadhaar card for verification.',
    'Sir, verification ke baad payment ke liye 15 minute milenge.']) {
    ok(!invitesPayment(t), t)
  }
})

// ─── Round 3: an approver's re-check after Binance-only "verified"; Binance's open KYC; the time to pay ──────

Deno.test("verifiedBy: an approver's \"Client can pay\", or move from it back to KYC, says the client was verified by then", () => {
  const m = (code: string | null, min: number, detected: string | null) => ({ code, at: at(min), by: 'u1', detected })
  eq(verifiedBy([]), null)
  // a re-check: moved from "Client can pay" back to a KYC step
  eq(verifiedBy([m('sell.kyc.pending', 5, 'sell.pay.ready')]), at(5))
  // adjusting the KYC step during the re-check, or going back to what the chat shows, keeps it
  eq(verifiedBy([m('sell.kyc.call', 9, 'sell.kyc.pending'), m(null, 8, 'sell.kyc.review'), m('sell.kyc.pending', 5, 'sell.pay.ready')]), at(5))
  // the newest counts: a later re-check, or a later "Client can pay" set by hand
  eq(verifiedBy([m('sell.kyc.review', 12, 'sell.pay.ready'), m('sell.pay.ready', 10, 'sell.kyc.call'), m('sell.kyc.pending', 5, 'sell.pay.ready')]), at(12))
  eq(verifiedBy([m('sell.pay.ready', 10, 'sell.kyc.call'), m('sell.kyc.pending', 5, 'sell.pay.ready')]), at(10))
  // a KYC step set after an approver's own "Client can pay" (the chat showed KYC then): the "Client can pay" still counts
  eq(verifiedBy([m('sell.kyc.pending', 12, 'sell.kyc.review'), m('sell.pay.ready', 10, 'sell.kyc.review')]), at(10))
  // a KYC step set while the chat already showed KYC is not a re-check; nor is a correction without the step it corrected
  eq(verifiedBy([m('sell.kyc.call', 5, 'sell.kyc.review')]), null)
  eq(verifiedBy([{ code: 'sell.kyc.pending', at: at(5), by: 'u1' }]), null)
})

Deno.test("sell: verified per Binance's order data, no notice in the chat: an approver's re-check holds through our KYC messages after it", () => {
  // KYC asked, documents, verification-call message, "ok"; Binance says verified but its notice is not in the chat.
  const base = [...withDocs, us(3, 'Sir one time verification is needed Please allow us a minute our RM team will connect you soon.'), client(3.5, 'ok')]
  const sig: OrderSignals = { kycVerify: 2, createdAt: at(0) }
  const d = sitWith('SELL', 'TRADING', base, sig, 20)
  eq(d.code, 'sell.pay.ready'); eq(d.since, at(3))
  // The approver moves the chat back to KYC pending at 11:15 (a re-check): it holds…
  const mark = { code: 'sell.kyc.pending', at: at(5), by: 'u1', detected: 'sell.pay.ready' }
  eq(resolveSituation('SELL', d, mark).code, 'sell.kyc.pending')
  // …and our re-check request after it is read as one (it no longer moves the stand-in verification to itself)
  const reask = [...base, us(6, 'Sir, the Aadhar image is not clear. Please share your Aadhar card again'), client(7, 'Can I pay now?')]
  eq(sitWith('SELL', 'TRADING', reask, sig, 20).code, 'sell.pay.ready', "without the approver's re-check the click's time is unknown")
  const rsig: OrderSignals = { ...sig, verifiedBy: at(5) }
  const r = sitWith('SELL', 'TRADING', reask, rsig, 20)
  eq(r.code, 'sell.kyc.pending'); eq(evidenceText(r.evidence), 'KYC asked again 11:16 · nothing received yet'); eq(r.since, at(6))
  eq(resolveSituation('SELL', r, mark).code, 'sell.kyc.pending')
  ok(beforeVerification('SELL', r.code))
  // the client's documents, then our verification-call message: the re-check goes on step by step
  const docs = [...reask, client(8, 'img', 'image')]
  eq(sitWith('SELL', 'TRADING', docs, rsig, 20).code, 'sell.kyc.review')
  eq(sitWith('SELL', 'TRADING', [...docs, us(9, 'Our RM team will connect you soon sir')], rsig, 20).code, 'sell.kyc.call')
  // our payment details end it
  const paid = sitWith('SELL', 'TRADING', [...docs, us(10, 'Sir please pay on this UPI: pos.5307682@indus')], rsig, 20)
  eq(paid.code, 'sell.pay.ready'); eq(evidenceText(paid.evidence), 'Verified on Binance · Payment details shared 11:20')
  // with no KYC message after the re-check, the approver's step stands
  const quiet = sitWith('SELL', 'TRADING', base, rsig, 20)
  eq(quiet.code, 'sell.pay.ready'); eq(quiet.since, at(3)); eq(resolveSituation('SELL', quiet, mark).code, 'sell.kyc.pending')
  // the re-check only matters while Binance's notice is missing: with it, its time decides as before
  const noticed = sitWith('SELL', 'TRADING', [...base, sys(4, 'maker_verified_additional_kyc_maker_sell'), us(6, 'Sir, the Aadhar image is not clear. Please share your Aadhar card again')], sig, 20)
  eq(noticed.code, 'sell.kyc.pending')
})

Deno.test('sell: while Binance says the extra KYC is not verified, a "Client can pay" set by hand does not hold', () => {
  const sig: OrderSignals = { kycVerify: 1, createdAt: at(0) }
  const d = sitWith('SELL', 'TRADING', withDocs, sig, 20)
  eq(d.code, 'sell.kyc.review'); eq(d.kycRequired, true)
  eq(resolveSituation('SELL', d, { code: 'sell.pay.ready', at: at(5), by: 'u1' }).code, 'sell.kyc.review')
  eq(resolveSituation('SELL', d, { code: 'sell.kyc.call', at: at(5), by: 'u1' }).code, 'sell.kyc.call', 'another KYC step can still be set')
  // Binance's Verified notice in the chat (the stored field is behind), or our payment details: not locked
  const notice = sitWith('SELL', 'TRADING', [...withDocs, sys(4, 'maker_verified_additional_kyc_maker_sell')], sig, 20)
  eq(notice.code, 'sell.pay.ready'); eq(notice.kycRequired, undefined)
  const kycAfterDetails = sitWith('SELL', 'TRADING', [...withDocs, us(4, 'pos.5307682@indus'), us(6, 'Sir please share your Aadhar card again')], sig, 20)
  eq(kycAfterDetails.code, 'sell.kyc.pending'); eq(kycAfterDetails.kycRequired, undefined)
  eq(resolveSituation('SELL', kycAfterDetails, { code: 'sell.pay.ready', at: at(7), by: 'u1' }).code, 'sell.pay.ready', 'after our payment details the approver decides')
  // the field unknown, or verified: as before
  eq(sitWith('SELL', 'TRADING', withDocs, { kycVerify: null }, 20).kycRequired, undefined)
  eq(sitWith('SELL', 'TRADING', withDocs, { kycVerify: 2, createdAt: at(0) }, 20).kycRequired, undefined)
})

Deno.test('invitesPayment: the time to pay after a verification condition is not a request; "so pay fast" and "payment ka time … bacha hai" are', () => {
  for (const t of ['Sir, once your KYC is done, you will have 15 minutes to pay.', 'Sir, after verification you will get 15 minutes for payment.',
    'Sir, KYC complete hone ke baad aapko payment ke liye 15 minute milenge.', 'Sir, please complete the KYC first, then pay.',
    'Sir, first complete the KYC and then pay.']) {
    ok(!invitesPayment(t), t); ok(!asksToPayNow(t), t)
  }
  for (const t of ['Sir, the order will expire in 6 minutes, so pay fast.', 'Sir, payment ka time 6 minute bacha hai.', 'Sir, pay quickly please.',
    'Sir, you have 6 minutes left to pay, after verification we will release.',
    // the time to pay before verification still holds a reply back (the drafts are told never to mention it then)
    'Sir, Binance gives 15 minutes for payment, so please share the documents quickly.']) {
    ok(invitesPayment(t), t)
  }
  for (const t of ['Sir, we will verify and payment will be processed.', 'Sir, KYC done and paid?']) ok(!invitesPayment(t), t)
})

Deno.test("a long chat: Binance's KYC notices older than the messages loaded are still read, each once", () => {
  const created = sys(0, 'order_created_with_additional_kyc_maker_sell'), verified = sys(4, 'maker_verified_additional_kyc_maker_sell')
  const early = [created, us(0.5, 'May I kindly request you to share your Aadhar card, (front and back) and Mobile no'), client(1, 'img', 'image'), verified]
  const chatter: ChatRow[] = []
  for (let i = 0; i < 40; i++) chatter.push(client(10 + i, `question ${i}?`), us(10.5 + i, `answer ${i}`))
  const recent = [...chatter, us(60, 'Sir, the Aadhar image is not clear. Please share your Aadhar card again')]
  const sig: OrderSignals = { kycVerify: 2, createdAt: at(0) }
  // only the latest messages: the re-check request becomes the stand-in verification time
  eq(sitWith('SELL', 'TRADING', recent, sig, 70).code, 'sell.pay.ready')
  // with the notices read on their own, Binance's time decides and the request is a re-check
  const merged = withNotices(recent, [created, verified])
  eq(merged.length, recent.length + 2)
  const r = sitWith('SELL', 'TRADING', merged, sig, 70)
  eq(r.code, 'sell.kyc.pending'); eq(evidenceText(r.evidence), 'KYC asked again 12:10 · nothing received yet')
  // a notice already among the latest messages is not added twice
  eq(withNotices([verified, ...recent], [created, verified]).length, recent.length + 2)
})

Deno.test("filing an earlier message when Binance says verified now: KYC was required, but an approver's \"Client can pay\" made then still counts", () => {
  const rows = [...withDocs]
  const d = sitWith('SELL', 'TRADING', rows, requiredOnly({ kycVerify: 2, createdAt: at(0) }), 5)
  eq(d.code, 'sell.kyc.review'); eq(d.kycRequired, undefined)
  eq(resolveSituation('SELL', d, { code: 'sell.pay.ready', at: at(3), by: 'u1' }).code, 'sell.pay.ready')
  // Binance never verified the client: the correction does not hold
  const never = sitWith('SELL', 'TRADING', rows, requiredOnly({ kycVerify: 1, createdAt: at(0) }), 5)
  eq(never.kycRequired, true); eq(resolveSituation('SELL', never, { code: 'sell.pay.ready', at: at(3), by: 'u1' }).code, 'sell.kyc.review')
})

Deno.test("sell: verified per Binance's order data: a KYC request after an approver's own \"Client can pay\" is a re-check", () => {
  // Re-check at 11:15, the approver sets "Client can pay" at 11:20, then we ask for the Aadhaar again at 11:22.
  const base = [...withDocs, us(3, 'Sir one time verification is needed Please allow us a minute our RM team will connect you soon.'), client(3.5, 'ok'),
    us(6, 'Sir, the Aadhar image is not clear. Please share your Aadhar card again'), client(8, 'img', 'image')]
  const marks = [{ code: 'sell.pay.ready', at: at(10), by: 'u1', detected: 'sell.kyc.review' }, { code: 'sell.kyc.pending', at: at(5), by: 'u1', detected: 'sell.pay.ready' }]
  const sig: OrderSignals = { kycVerify: 2, createdAt: at(0), verifiedBy: verifiedBy(marks) }
  // up to the approver's "Client can pay": it stands
  const d = sitWith('SELL', 'TRADING', base, sig, 11)
  eq(resolveSituation('SELL', d, marks[0]).code, 'sell.pay.ready')
  // our KYC request after it puts the chat back in KYC; the client's "Can I pay now?" changes nothing
  const r = sitWith('SELL', 'TRADING', [...base, us(12, 'Sir, please share your Aadhar card again, the photo is cut'), client(13, 'Can I pay now?')], sig, 14)
  eq(r.code, 'sell.kyc.pending'); eq(evidenceText(r.evidence), 'KYC asked again 11:22 · nothing received yet')
  eq(resolveSituation('SELL', r, marks[0]).code, 'sell.kyc.pending')
})

Deno.test('invitesPayment: a verification condition excuses a request only when it governs it; "pay later" and "pay attention" are not requests', () => {
  // conditions that govern another clause, or close a clause before the request: still requests
  for (const t of ['Sir, after verification the order will be released, you have 10 minutes left to pay.',
    'Sir, once your KYC is verified we will release the USDT immediately, and only 8 minutes are left to pay.',
    'Verification ke baad order release hoga, payment karne ke liye 5 minute bache hain.',
    'Sir, as soon as your verification is complete we will confirm, the time to pay is running out.',
    'Sir, after KYC we release fast, you have 15 min to pay.',
    'KYC complete hone ke baad hum release karenge, payment ka time 6 minute bacha hai.',
    "Please don't cancel until your KYC is complete, you have 10 minutes left to pay.",
    'Sir, the payment gets checked after verification, only 10 minutes left to pay.',
    'We will release the USDT once your verification is complete, please pay now.',
    'Sir, verification ke baad turant ho jayega, 5 min bache hain pay karne ke liye.']) {
    ok(invitesPayment(t), t)
  }
  // a bare "once verified / approved" names no subject (the payment, the beneficiary, the UPI name?): held back on the safe side
  for (const t of ["Please pay, you'll receive it once verified.", 'Please pay and mark as paid once verified.', 'Sir payment kar dijiye, credit hoga once verified.',
    'We release once verified, please pay now.', 'Hum release kar denge once verified, aap payment kar dijiye.',
    'Order will be released once verified, kindly make the payment.', 'Ok sir, add the beneficiary, once approved you can pay.',
    'Please check the name shown is BLYNK, once verified please pay.', 'Sir UPI ID verify kar lijiye, once verified payment kar dijiye.',
    'Please do not cancel until verified, you have 10 minutes left to pay.', 'Sir please wait till approved, only 8 min left to pay.',
    'Once verified, you can pay.', 'Sir, please pay once verified.']) {
    ok(invitesPayment(t), t)
  }
  // "pay only / when / once / after …" is still a request; a call, link or documents is not the verification itself
  for (const t of ['Sir, please verify the name and pay only from your own account.', 'Sir, the details are in the order, so pay only from your own bank account.',
    'Sir, the order is open, so pay whenever you are ready.', 'Sir, the UPI is in the order, so pay once you have checked the name.',
    'Sir, check the name and pay after confirming it.', 'Sir, add the beneficiary and pay after 5 minutes.',
    'Sir, wait for the KYC verification call and then pay.', 'Sir, wait for the verification and then pay.',
    'Sir, complete the KYC verification call and then pay.', 'Sir, complete your KYC documents and then pay.',
    'Sir, do the verification of our account name, then pay.', 'Sir, you need not do the KYC again, then pay now.']) {
    ok(invitesPayment(t), t)
  }
  // conditions that govern the request, a step first, and things that are not requests
  for (const t of ['Sir, once your KYC is done, you will have 15 minutes to pay.', 'Sir, after verification you will get 15 minutes for payment.',
    'Sir, KYC complete hone ke baad aapko payment ke liye 15 minute milenge.', 'Sir, aapka KYC complete hone ke baad payment kar dijiye.',
    'Sir, complete your KYC, then pay.', 'Sir, please complete your KYC and then you can pay.', 'Sir, get verified and then pay.',
    'Sir, complete your verification and then pay from your own account.', 'Sir, your KYC is under review, so pay later once we confirm.',
    'Sir, verification is pending, so pay attention to the call from our team.', 'Sir, once you are verified, you can pay.']) {
    ok(!invitesPayment(t), t); ok(!asksToPayNow(t), t)
  }
  // a statement that KYC is done, then "pay": still a request
  ok(invitesPayment('Sir, your KYC is done, then pay.'))
})

Deno.test('invitesPayment: a UPI ID ending a sentence and a lower-case IFSC are payment details; a request inside a time to pay follows that time', () => {
  ok(invitesPayment('Sir, our UPI ID is blynk@ybl.'), 'UPI ID before a full stop')
  ok(invitesPayment('Sir, IFSC hdfc0001234'), 'lower-case IFSC')
  ok(!invitesPayment('Sir, mail us at ops@blynk.in'), 'an e-mail address is not a UPI ID')
  ok(!invitesPayment('Sir, once your KYC is done, you will have 15 minutes to make the payment.'), 'the condition governs the time to pay and the request in it')
  ok(invitesPayment('Sir, you have 15 minutes to make the payment.'), 'without the condition it still invites payment')
})

Deno.test('invitesPayment, round 2: a time to pay is let go only under a verification condition with nothing in between', () => {
  ok(!invitesPayment('Once your KYC is verified, you will have 15 minutes left to make the payment.'), 'governed by the condition')
  for (const t of [
    'Once your KYC is verified, but right now there are 15 minutes left to make the payment.',
    'Once your KYC is verified we will share details; meanwhile only 15 minutes are left to pay.',
    'KYC complete hone ke baad, lekin abhi 15 minute bache hain payment ke liye.',
  ]) ok(invitesPayment(t), t)
  ok(!invitesPayment('Sir, the UPI ID blynk@ybl.in is not ours; we will share ours after verification.'), 'a domain-like ID is not a UPI ID')
})
