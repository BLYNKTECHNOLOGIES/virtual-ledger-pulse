// Run: deno test supabase/functions/_shared/copilot-playbook.test.ts
import {
  applyAddress, buildDraftMessages, buildTranscript, clientFacts, clientTurn, costInr, decideAddress, decideLanguage, detectLang,
  detectRisks, generalize, greetingFor, guardDraft, maskPII, orderCategory, readUsage, type ChatRow, type Msg,
} from './copilot-playbook.ts'

function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`)
}
function ok(cond: unknown, msg = '') { if (!cond) throw new Error(msg || 'assertion failed') }

let n = 0
const row = (who: 'client' | 'us', text: string, type = 'text'): ChatRow => ({
  binance_message_id: `m${++n}`, message_type: type, sender_is_self: who === 'us', is_system_message: false, message_text: text, binance_create_time: 1_000_000 + n * 1000,
})
const chat = (...rows: ChatRow[]) => buildTranscript(rows)

Deno.test('maskPII hides personal numbers and handles but keeps amounts and short numbers', () => {
  eq(maskPII('my upi is ravi.k@okaxis'), 'my upi is [upi]')
  eq(maskPII('mail me at ravi@gmail.com'), 'mail me at [email]')
  eq(maskPII('call 9876543210 or +91 98765 43210'), 'call [phone] or [phone]')
  eq(maskPII('PAN ABCDE1234F, IFSC HDFC0001234'), 'PAN [pan], IFSC [ifsc]')
  eq(maskPII('aadhaar 1234 5678 9012'), 'aadhaar [aadhaar]')
  eq(maskPII('UTR 412345678901 ref'), 'UTR [number] ref')
  eq(maskPII('paid 45,000 for order in 15 minutes'), 'paid 45,000 for order in 15 minutes')
  eq(maskPII('account 50100123456789'), 'account [number]')
  eq(maskPII('UTR 412345678901, ok. Ref 123456789.'), 'UTR [number], ok. Ref [number].')
  eq(maskPII('total 1,00,00,000.50'), 'total 1,00,00,000.50')
})

Deno.test('detectLang: Hindi in Roman script, English and neutral', () => {
  eq(detectLang('payment kab milega bhai'), 'hi')
  eq(detectLang('Maine payment kar diya hai'), 'hi')
  eq(detectLang('भुगतान कर दिया'), 'hi')
  eq(detectLang('When will you release my USDT?'), 'en')
  eq(detectLang('I have paid, please check'), 'en')
  eq(detectLang('ok'), 'neutral')
  eq(detectLang('done'), 'en')
  eq(detectLang('[image]'), 'neutral')
})

Deno.test('decideLanguage: English first; Hindi only after the client keeps writing Hindi past N English replies', () => {
  const t1 = chat(row('client', 'payment kab milega'), row('us', 'Your payment is being processed, sir.'), row('client', 'kitna time lagega bhai'))
  eq(decideLanguage(t1, 2).lang, 'en', 'one English reply is not enough')
  const t2 = chat(
    row('client', 'payment kab milega'), row('us', 'Your payment is being processed, sir.'),
    row('client', 'kitna time lagega bhai'), row('us', 'Please allow us a few minutes, sir.'),
    row('client', 'abhi tak nahi aaya'),
  )
  eq(decideLanguage(t2, 2).lang, 'hi', 'switch after 2 English replies')
  eq(decideLanguage(t2, 3).lang, 'en', 'setting 3 needs a third English reply')
  const t3 = chat(
    row('client', 'payment kab milega'), row('us', 'Processing, sir.'), row('client', 'jaldi karo na'), row('us', 'Please wait, sir.'),
    row('client', 'kya hua abhi tak'), row('us', 'Kripya thoda intezaar karein.'), row('client', 'Ok, when will it come?'),
  )
  eq(decideLanguage(t3, 2).lang, 'en', 'client went back to English')
  const t4 = chat(row('client', 'Hello'), row('us', 'Aap payment kar dijiye, sir.'))
  eq(decideLanguage(t4, 2).lang, 'hi', 'follows an approver who already switched')
})

Deno.test("decideAddress: ma'am only from the client's own feminine words", () => {
  eq(decideAddress(chat(row('client', 'main payment kar rahi hoon'))), 'maam')
  eq(decideAddress(chat(row('client', 'payment kar rahi hu'))), 'maam')
  eq(decideAddress(chat(row('client', 'I am a housewife, is that ok for source of funds?'))), 'maam')
  eq(decideAddress(chat(row('client', 'maine payment kar di hai'))), 'sir', 'object agreement is not the speaker')
  eq(decideAddress(chat(row('client', 'aapki team kya kar rahi hai'))), 'sir', 'third person')
  eq(decideAddress(chat(row('client', 'main payment kar raha hoon'))), 'sir')
  eq(decideAddress(chat(row('us', 'kar rahi hoon'))), 'sir', 'our own words do not count')
})

Deno.test('applyAddress keeps capitalisation both ways', () => {
  eq(applyAddress('Sir, please pay. Thank you sir.', 'maam'), "Ma'am, please pay. Thank you ma'am.")
  eq(applyAddress("Ma'am, please pay. Thanks ma'am", 'sir'), 'Sir, please pay. Thanks sir')
})

Deno.test('buildTranscript: system notices, KYC card, duplicate auto-replies, recalls and the live hint', () => {
  const rows: ChatRow[] = [
    { binance_message_id: 's1', message_type: 'system', is_system_message: true, message_text: '{"type":"order_created_with_additional_kyc_maker_sell"}', binance_create_time: 1 },
    { binance_message_id: 'a1', message_type: 'auto_reply', sender_is_self: true, message_text: 'Please share Aadhaar', binance_create_time: 2 },
    { dedupe_key: 'a2', message_type: 'auto_reply', sender_is_self: false, message_text: 'Please share Aadhaar ', binance_create_time: 3 },
    { binance_message_id: 'c1', message_type: 'card', sender_is_self: true, message_text: '{"addKycVrfInfo":[{"displayTitleValue":"Upload identity card"}]}', binance_create_time: 4 },
    { binance_message_id: 'x1', message_type: 'text', sender_is_self: false, message_text: 'oops', is_recall: true, binance_create_time: 5 },
    { binance_message_id: 'i1', message_type: 'image', sender_is_self: false, message_text: 'https://x/y.jpg', binance_create_time: 6 },
  ]
  const t = buildTranscript(rows, { id: 'live1', text: 'uploaded, please check' })
  eq(t.map((m) => m.who), ['system', 'auto', 'auto', 'client', 'client'])
  eq(t[0].text, 'Order created. Binance asked the client for additional KYC.')
  eq(t[2].text, '[Binance KYC request card: Upload identity card]')
  eq(t[3].text, '[image]')
  eq(t[4].text, 'uploaded, please check')
  eq(buildTranscript(rows, { id: 'i1', text: '[image]' }).length, 4, 'hint already captured is not duplicated')
  eq(t[0].event, 'order_created_with_additional_kyc_maker_sell', 'Binance event kept for the situation')
  eq(t[2].event, 'kyc_card')
  eq(t[1].event, undefined)
})

Deno.test('clientTurn: messages after our last human reply; auto-replies do not count as an answer', () => {
  const t = chat(row('client', 'hi'), row('us', 'Good evening, sir.'), row('client', 'payment done'), row('client', 'when release?'))
  const turn = clientTurn(t)!
  eq(turn.question, 'payment done / when release?')
  eq(clientTurn(chat(row('client', 'hi'), row('us', 'Hello sir'))), null)
  const withAuto: Msg[] = [...chat(row('client', 'hi')), { id: 'a', at: 9e9, who: 'auto', kind: 'auto_reply', text: 'auto' }]
  eq(clientTurn(withAuto)?.question, 'hi')
})

Deno.test('detectRisks: red and amber signals from client text, Binance notices and order flags', () => {
  const t = chat(row('client', 'my brother will pay from his account'), row('client', 'is this a scam?'))
  eq(detectRisks(t).map((r) => r.code), ['third_party', 'scam_fear'])
  eq(detectRisks(chat(row('client', 'cyber cell ne mera account freeze kar diya'))).map((r) => r.code), ['police'])
  eq(detectRisks(chat(row('client', 'lets do a direct deal on whatsapp'))).map((r) => r.code), ['outside_binance'])
  eq(detectRisks(chat(row('client', 'ok')), { hasComplaint: true }).map((r) => r.code), ['appeal'])
  eq(detectRisks(chat(row('client', 'I paid 5000, please check'))), [])
})

Deno.test('guardDraft: blocks release promises, outside-Binance offers and typed personal numbers', () => {
  ok(guardDraft('Sir, we will release your USDT now.').blocked, 'release promise')
  ok(!guardDraft('Sir, we will release the USDT as soon as we confirm the payment in our account.').blocked, 'conditional release is fine')
  ok(!guardDraft('Your payment is being verified, sir. Please allow a few minutes.').blocked)
  ok(guardDraft('Sir, we can do this trade on WhatsApp instead.').blocked, 'outside Binance')
  ok(guardDraft('Sir, you can also pay outside Binance.').blocked)
  ok(guardDraft('Please call 9876543210 for KYC.').blocked, 'typed phone')
  ok(guardDraft('Please pay to ravi@okhdfcbank.').blocked, 'typed UPI')
  const g = guardDraft('Sir, for KYC help please call {contact:kyc}. 😊')
  ok(!g.blocked); eq(g.contacts, ['kyc']); eq(g.text, 'Sir, for KYC help please call {contact:kyc}.')
  eq(guardDraft('Please pay ₹5,000 now').flags, ['number_check'])
  eq(guardDraft('Use { contact_RM } please').text, 'Use {contact:rm} please')
  eq(guardDraft('Hello {client_name}').flags, ['unknown_placeholder'])
})

Deno.test('guardDraft: Hinglish release promises are held back unless tied to the payment check', () => {
  ok(guardDraft('Sir, USDT abhi release kar denge.').blocked, 'release now')
  ok(guardDraft('Sir, thodi der mein release ho jayega.').blocked)
  ok(!guardDraft('Thank you sir, payment check karke USDT release kar denge.').blocked, 'after the check')
  ok(!guardDraft('Sir, payment confirm hote hi USDT release kar denge.').blocked, 'as soon as confirmed')
  ok(!guardDraft('Sir, payment milte hi release kar denge.').blocked)
})

Deno.test('guardDraft: on a sell order before verification, a request to pay is held back', () => {
  const kyc = { side: 'SELL' as const, situation: 'sell.kyc.review' }
  eq(guardDraft('Yes sir, please pay to {upi}.', kyc).flags, ['pay_before_verification'])
  ok(guardDraft('Sir, aap payment kar dijiye.', kyc).blocked, 'Hinglish request to pay')
  ok(!guardDraft('Please wait, sir. We will share the payment details as soon as your verification is complete.', kyc).blocked)
  ok(!guardDraft('Sir, verification complete hote hi payment details share kar denge.', kyc).blocked)
  ok(!guardDraft('Yes sir, please pay to {upi}.', { side: 'SELL', situation: 'sell.pay.ready' }).blocked, 'fine once the client can pay')
  ok(!guardDraft('Please pay now, sir.', { side: 'BUY', situation: 'buy.details' }).blocked, 'not on buy orders')
  ok(!guardDraft('Yes sir, please pay to {upi}.').blocked, 'without a situation there is nothing to check')
})

Deno.test('orderCategory uses the small-order ranges per side', () => {
  const s = { min: 200, max: 4000, enabled: true }, b = { min: 200, max: 5000, enabled: true }
  eq(orderCategory('SELL', 3999, s, b), 'small')
  eq(orderCategory('SELL', 4500, s, b), 'regular')
  eq(orderCategory('BUY', 4500, s, b), 'small')
  eq(orderCategory('BUY', 4500, s, { ...b, enabled: false }), 'regular')
  eq(orderCategory(null, 100, s, b), 'regular')
})

Deno.test('clientFacts: side-specific approval, no personal data', () => {
  const panel = { status: 'linked', client: { kyc_status: 'VERIFIED', buyer_status: 'APPROVED', seller_status: 'PENDING', name: 'Ravi', phone_masked: '••••3210' }, documents: { aadhaar: true, pan: true, vkyc: false }, history: { buy_count: 4 } }
  const sell = clientFacts('SELL', panel)
  eq(sell.state, 'approved'); eq((sell.facts as any).documents_on_file, ['aadhaar', 'pan'])
  ok(!JSON.stringify(sell.facts).includes('Ravi') && !JSON.stringify(sell.facts).includes('3210'), 'no name or phone')
  eq(clientFacts('BUY', panel).state, 'linked')
  eq(clientFacts('SELL', { status: 'not_client' }).state, 'new')
})

Deno.test('generalize: amounts, order number, contact numbers and address back to placeholders', () => {
  const out = generalize("Ma'am, please pay ₹4,500.00 for order 22944071217231917056. For KYC call +91 98765 43210.",
    { amount: 4500, orderNo: '22944071217231917056' }, [{ purpose: 'kyc', phone: '+919876543210' }])
  eq(out, 'Sir, please pay ₹{amount} for order {orderNo}. For KYC call {contact:kyc}.')
  eq(generalize('Please pay 4500', { amount: '4500' }, []), 'Please pay {amount}')
  eq(generalize('Paid 14500 already', { amount: 4500 }, []), 'Paid 14500 already', 'does not touch longer numbers')
})

Deno.test('cost and usage', () => {
  const p = { 'm': { in: 2, out: 10 } }
  eq(costInr('m', { input: 1_000_000, output: 100_000, reasoning: 0, estimated: false }, p, 88), 264)
  eq(readUsage({ usage: { prompt_tokens: 100, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 50 } } }, 0, 0), { input: 100, output: 50, reasoning: 50, estimated: false })
  eq(readUsage(null, 350, 35).estimated, true)
})

Deno.test('greeting by IST time', () => {
  eq(greetingFor(new Date('2026-10-15T03:00:00Z')), 'Good morning') // 08:30 IST
  eq(greetingFor(new Date('2026-10-15T08:00:00Z')), 'Good afternoon') // 13:30 IST
  eq(greetingFor(new Date('2026-10-15T15:00:00Z')), 'Good evening') // 20:30 IST
})

Deno.test('draft prompt carries the rules, the address, the language and no unmasked data', () => {
  const { system, user } = buildDraftMessages({
    houseStyle: 'House style.', lang: 'hi', address: 'maam', greet: 'Good evening', order: { side: 'SELL' }, client: { state: 'new' },
    approved: [{ title: 'TDS', status: 'approved', examples: ['tds?'], answer: 'Sir, TDS is 1%.', similarity: 0.8 }],
    avoid: [{ draft: 'We will release now', why: 'Promises release' }], chat: [{ from: 'client', at: '20:30', text: 'tds kitna hai' }],
    answerThis: 'tds kitna hai', instruction: 'Make it shorter: one sentence if possible.', risks: [], now: '15 Oct, 20:31',
  })
  ok(system.includes('Hinglish in English letters'), 'Hinglish style for Hindi drafts')
  ok(system.includes('not "kripya"'), 'no bookish Hindi')
  ok(system.includes('order.situation'), 'the situation rule')
  ok(system.includes(`Address the client as "ma'am"`))
  ok(system.includes('start with "Good evening, ma\'am."'))
  ok(system.includes("Manager's instruction for this draft: Make it shorter"))
  ok(system.includes('Never ask the client to skip or avoid KYC'))
  const u = JSON.parse(user)
  eq(u.answer_this, 'tds kitna hai'); eq(u.avoid[0].why_rejected ?? u.avoid[0].why, 'Promises release')
})
