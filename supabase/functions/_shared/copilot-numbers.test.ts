// Run: deno test supabase/functions/_shared/copilot-numbers.test.ts
import { asciiDigits, normalizeText, numberChanges, quantities, timesAdded } from './copilot-numbers.ts'
import { eq } from './copilot-fakes.test-helpers.ts'

const q = (t: string) => quantities(t).map((x) => `${x.label}${x.soft ? '~' : ''}`)
const none = { added: [], dropped: [], reordered: false }

Deno.test('normalizeText: compatibility forms, invisible characters, keycaps and other scripts\' digits', () => {
  eq(normalizeText('blynk＠ybl'), 'blynk@ybl')
  eq(normalizeText('p​ay ­now⁠'), 'pay now')
  eq(normalizeText('wait 🔟 min, 5️⃣ min'), 'wait  10  min, 5 min')
  eq(normalizeText('१२३ ١٢٣ １２３'), '123 123 123')
  eq(normalizeText('1½ hours, ½ hour'), '1.5 hours, 0.5 hour')
  eq(asciiDigits('१२३ ١٢٣ １２３ 123'), '123 123 123 123')
})

Deno.test('quantities: amounts, multipliers and currencies', () => {
  eq(q('Rs 4500/- bhejo'), ['4500'])
  eq(q('Please send ₹4,500.'), ['4500'])
  eq(q("4.5k pay karo, 5L limit, 2 cr max, ₹1,00,000 tak"), ["4500", "500000", "20000000", "100000"])
  eq(q('pay 5 thousand, paanch hazaar, five hundred rupees, do lakh'), ['5000', '5000', '500', '200000'])
  eq(q('send 5000 USDT, $100, 100$, 20 usd'), ['5000 usdt', '100 usdt', '100 usdt', '20 usdt'])
  eq(q('rate 92.50'), ['92.5'])
  eq(q('order 5000 ka hai'), ['5000'])
})

Deno.test('quantities: times in minutes, ranges, politeness and words', () => {
  eq(q('wait 10 min'), ['10 min'])
  eq(q('30-minute cooling, 2 hrs, do din, 3 mnth, 2 working days'), ['30 min', '120 min', '2880 min', '129600 min', '2880 min'])
  eq(q('half an hour, an hour, an hour and a half, dedh ghanta, aadha ghanta, one and a half hours'), ['30 min', '60 min', '90 min', '90 min', '30 min', '90 min'])
  eq(q('5-10 min, two to three days, 5 se 10 minute, 2-3 din'), ['5 min', '10 min', '2880 min', '4320 min', '5 min', '10 min', '2880 min', '4320 min'])
  eq(q('a couple of minutes, five more minutes, twenty-five minutes, forty five minutes, sixteen minutes'), ['2 min', '5 min', '25 min', '45 min', '16 min'])
  eq(q('wait १० मिनट'), ['10 min'])
  eq(q('pls wait a moment, ek minute, one second'), ['a moment~', 'a moment~', 'a moment~'])
  eq(q('pls w8 4u b4 gr8'), [])
  eq(q('kar do, do it, one of them, ek baar'), ['1x'])
  eq(q('it will take 1,5 minutes'), ['1', '5 min'])
})

Deno.test('quantities: clock times, dates, percent, ordinals', () => {
  eq(q('by 10:30, 10.30 tak, by 10.30, 6 pm, 6:00 PM, 9 baje subah, 9 baje shaam, half past ten, quarter to ten'),
    ['10:30', '10:30', '10:30', '6:00 pm', '6:00 pm', '9:00 am', '9:00 pm', '10:30', '9:45'])
  eq(q('10 am to 10 pm, 10 to 11 am'), ['10:00 am', '10:00 pm', '10:00 am', '11:00 am'])
  eq(q('18/10 ko, 18 October, October 18th, 18-10-2026'), ['18/10', '18/10', '18/10', '18/10'])
  eq(q('fee 1.5%, 1.5 percent, 2 per cent'), ['1.5%', '1.5%', '2%'])
  eq(q('2nd baar, the second time, first, pehli baar, both'), ['2~', '2~', '1~', '1~', '2~'])
  eq(q('please wait a second'), ['a moment~'])
  eq(q('rate 92.50, mark as paid, may I help'), ['92.5'])
})

Deno.test('numberChanges: the same numbers in other forms are fine', () => {
  for (const [a, b] of [
    ['pay 5k in 10 min', 'Please pay ₹5,000 within 10 minutes.'],
    ['wait two minutes', 'Please give us 2 minutes.'],
    ['wait 30 min', 'Please wait half an hour.'],
    ['aadha ghanta wait karo', 'Please wait 30 minutes.'],
    ['dedh ghanta lagega', 'It will take an hour and a half.'],
    ['5-10 min wait', 'Please wait five to ten minutes.'],
    ['verification me 2-3 din', 'Verification may take 2-3 days.'],
    ['payment 10:30 tak', 'Please pay by 10.30.'],
    ['6 pm tak pay karo', 'Please pay by 6:00 PM.'],
    ['pay by 10:30', 'Please pay by half past ten.'],
    ['kal subah 9 baje se available', 'We will be available from 9 AM tomorrow.'],
    ['our timing 10 am to 10 pm', 'Our timings are 10 AM to 10 PM.'],
    ['18/10 ko payment', 'The payment is on 18 October.'],
    ['fee 1.5%', 'The fee is 1.5 percent.'],
    ['2nd baar bol raha hu', 'I am telling you for the second time.'],
    ['5L limit', 'The limit is ₹5,00,000.'],
    ['1 lakh max', 'The maximum is ₹1,00,000.'],
    ['5000 pay karo', 'Please pay five thousand rupees.'],
    ['min 500 max 50000', 'The minimum is ₹500 and the maximum is ₹50,000.'],
    ['1 min sir', 'Sir, a minute please.'],
    ['ruko', 'Sir, ek minute rukiye.'],
    ['pls w8', 'Sir, please wait a moment.'],
    ['wait 🔟 min', 'Please wait 10 minutes.'],
    ['ek baar ka process hai', 'This is a one-time process.'],
    ['kyc ke liye bank stmt 3 mnth ka bhejo', 'Please share your bank statement for the last 3 months.'],
    ['100 usdt ka order', 'The order is for 100 USDT.'],
    ['order 100 ka hai, usdt', 'The order is for 100 USDT.'],
    ['send 2 docs', 'Please send both documents.'],
    ['beneficiary add kiya hai, 30 min cooling hai', 'There is a 30-minute cooling period.'],
  ]) eq(numberChanges(a, b), none, `${a} → ${b}`)
})

Deno.test('numberChanges: added, dropped, changed units, currencies, swaps and repeats are caught', () => {
  eq(numberChanges('wait 10 min', 'Please wait 15 minutes.'), { added: ['15 min'], dropped: ['10 min'], reordered: false })
  eq(numberChanges('pay 4500 only', 'Please pay the amount.'), { added: [], dropped: ['4500'], reordered: false })
  eq(numberChanges('pay 5k only', 'Please pay ₹5 lakh only.'), { added: ['500000'], dropped: ['5000'], reordered: false })
  eq(numberChanges('4.5k pay karo', 'Please pay ₹4.5.'), { added: ['4.5'], dropped: ['4500'], reordered: false })
  eq(numberChanges('wait 10 min', 'Please wait 10 hours.'), { added: ['600 min'], dropped: ['10 min'], reordered: false })
  eq(numberChanges('5000 pay karo', 'Please pay 5000 USDT.'), { added: ['5000 usdt'], dropped: ['5000'], reordered: false })
  eq(numberChanges('5k bhejo', 'Please send 5,000 USDT.'), { added: ['5000 usdt'], dropped: ['5000'], reordered: false })
  eq(numberChanges('wait 3 days', 'Please wait two to three days.'), { added: ['2880 min'], dropped: [], reordered: false })
  eq(numberChanges('wait 10 min', 'Please wait 10 minutes, and then 10 more minutes.'), { added: ['10 min'], dropped: [], reordered: false })
  eq(numberChanges('wait 1 min', 'Please wait 1,5 minutes.'), { added: ['1', '5 min'], dropped: ['1 min'], reordered: false })
  eq(numberChanges('wait karo', 'Please wait half an hour.').added, ['30 min'])
  eq(numberChanges('wait karo', 'Please wait a couple of minutes.').added, ['2 min'])
  eq(numberChanges('wait karo', 'Please allow a two-minute wait.').added, ['2 min'])
  eq(numberChanges('wait karo', 'Please wait १५ minutes.').added, ['15 min'])
  eq(numberChanges('dedh ghanta lagega', 'It will take half an hour.'), { added: ['30 min'], dropped: ['90 min'], reordered: false })
  eq(numberChanges('10:30 tak', 'by 10:45'), { added: ['10:45'], dropped: ['10:30'], reordered: false })
  eq(numberChanges('6 pm tak', 'by 6 am'), { added: ['6:00 am'], dropped: ['6:00 pm'], reordered: false })
  eq(numberChanges('fee 1.5%', 'The fee is 15%.'), { added: ['15%'], dropped: ['1.5%'], reordered: false })
  eq(numberChanges('pay 4500 now, 500 later', 'Please pay ₹500 now and ₹4,500 later.').reordered, true)
  eq(numberChanges('wait 10 min, release 30 min me', 'Please wait 30 minutes; the release takes 10 minutes.').reordered, true)
  eq(numberChanges('pay in 10 min, release in 2 hours', 'Pay within 10 hours; the release takes 2 minutes.'), { added: ['600 min', '2 min'], dropped: ['10 min', '120 min'], reordered: false })
  eq(numberChanges('1 sec', 'Please wait a minute.'), none, 'a politeness moment stands for a typed second too')
  eq(numberChanges('wait 5 min', 'Please wait a moment.'), { added: [], dropped: ['5 min'], reordered: false }, 'but not for five minutes')
})

Deno.test('timesAdded: a time frame the typed words have no word for', () => {
  eq(timesAdded('checking', 'We will update you within a few days.'), ['day'])
  eq(timesAdded('checking', 'We will update you within two working days.'), [], 'a time with a number is numberChanges\' business')
  eq(timesAdded('wait 30 min', 'Please wait half an hour.'), [])
  eq(timesAdded('checking', 'Please allow a few minutes.'), ['minute'])
  eq(timesAdded('checking', 'It will be done by tomorrow.'), ['tomorrow'])
  eq(timesAdded('thodi der', 'Please wait a few minutes.'), [])
  eq(timesAdded('pls wait', 'Please wait a moment.'), [])
  eq(timesAdded('thanks', 'Thank you, sir. Have a great day.'), [])
  eq(timesAdded('2nd baar', 'I am telling you for the second time.'), [])
  eq(timesAdded('2 hrs lagenge', 'It will take two hours.'), [])
  eq(timesAdded('kal tak', 'by tomorrow'), [])
  eq(timesAdded('kal aaya tha', 'It came yesterday.'), [])
  eq(timesAdded('kal tak', 'by today'), ['today'])
  eq(timesAdded('bank stmt 3 mnth', 'the last 3 months'), [])
  eq(timesAdded('१० मिनट', '10 minutes'), [])
})
