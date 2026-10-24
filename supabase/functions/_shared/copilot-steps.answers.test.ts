// Run: deno test supabase/functions/_shared/copilot-steps.answers.test.ts
// The client's next message after our purpose, source-of-funds, profession and paying-bank questions in real chats
// (14–24 Oct 2026, read-only export; digits replaced by #, made-up values where a value matters), with how often each came. Answers must be recognised (the
// script moves on, no lookup); questions, requests and complaints never are. Typos and replies that are hard to read
// either way are left out.
import { buildTranscript, type ChatRow } from './copilot-playbook.ts'
import { answersStep, type StepKey, turnNeedsAnswer } from './copilot-steps.ts'

type Case = [string, number]
const ANSWERS: Record<string, Case[]> = {
  paying_bank: [
    ['sbi', 52], ['hdfc', 36], ['kotak', 26], ['icici', 14], ['boi', 10], ['pnb', 9], ['bank of india', 9], ['axis', 9], ['kotak mahindra bank', 7],
    ['axis bank', 7], ['central bank', 5], ['federal bank', 5], ['iob', 5], ['central bank of india', 5], ['state bank of india', 5], ['canara bank', 4],
    ['bank of baroda', 4], ['indian bank', 4], ['indusind', 4], ['indusind bank', 4], ['hdfc bank', 3], ['jupiter federal bank', 3], ['bob', 3],
    ['sbi bank', 3], ['punjab national bank', 2], ['jammu and kashmir', 2], ['esaf', 2], ['esaf small finance bank', 2], ['slice bank account', 2],
    ['south indian bank', 2], ['i have three accounts sbi, indian overseas bank and icici bank', 2], ['indian', 2], ['indian overseas bank', 2],
    ['icici or axis', 1], ['idbi', 1], ['idfc', 1], ['idfc bank', 1], ['idfc bank sir', 1], ['im paying through punjab national bank', 1],
    ['jammu and kashmir bank', 1], ['jana bank', 1], ['jana small bank', 1], ['jio payments bank', 1], ['kotak bank', 1], ['kotak gpay', 1],
    ['kotak. same as always', 1], ['kvb', 1], ['mobiwik', 1], ['paying from idfc', 1], ['paying from idfc bank', 1], ['paying upi from same bank canara', 1],
    ['payment thru icici', 1], ['paytm by iob', 1], ['paytm central bank', 1], ['paytm, central bank', 1], ['phone pay', 1], ['punjab and sind bank', 1],
    ['rbl', 1], ['rbl bank', 1], ['same hdfc', 1], ['same hdfc bank', 1], ['same pnb only', 1], ['same rbl', 1], ['same sbi', 1], ['sbi again', 1],
    ['sbi sir', 1], ['scb', 1], ['slice', 1], ['state bank', 1], ['uco bank', 1], ['uco bank sir', 1], ['uco sir', 1], ['union', 1], ['union bank se sir', 1],
    ['yes bank', 1], ['good evening icici', 1], ['gpay', 1], ['hdfc and phonepe', 1], ['hdfc bank payment', 1], ['hdfc bank sir', 1], ['hdfc sir', 1],
    ['i am going to use icici bank', 1], ['i will use hdfc', 1], ['i will use pnb bank', 1], ['icici / au small finance', 1], ['as same sbi', 1],
    ['axis bro', 1], ['bob bank', 1], ['bob regular', 1], ['bob sir', 1], ['bob via gpay', 1], ['canara', 1], ['csb', 1], ['cub', 1], ['dcb bank', 1],
    ['fino', 1], ['fino payment bank', 1], ['icici bank', 1], ['icici gpay', 1], ['ji sbi', 1], ['haan hdfc se', 1], ['from my sbi account', 1],
  ],
  purpose: [
    ['trading', 52], ['for trading', 21], ['investment', 14], ['trade', 5], ['to trade', 3], ['exness trading', 3], ['for trading sir', 3], ['investing', 3],
    ['forex', 3], ['for trade', 3], ['exness deposit', 2], ['crypto trading', 2], ['invest', 2], ['for trading purpose', 2], ['forex trading', 2],
    ['i want to invest in eth', 2], ['prop firm', 2], ['futures trading', 2], ['for investment', 2], ['deposit in excess', 1], ['deposit into vantage', 1],
    ['deposit to trading account', 1], ['deposite in exness to the trading', 1], ['depositing for another wallet sir', 1], ['f&o and spot', 1],
    ['facebook ads', 1], ['for  holding', 1], ['for a treding', 1], ['for binance buy purchase', 1], ['for buy coins investment', 1], ['for buy crypto coin', 1],
    ['for buying a coin trump', 1], ['for buying funded account', 1], ['for capital load in quotex', 1], ['for crypto buying', 1],
    ['for crypto trading purpose in binance itself', 1], ['for deposit in broker', 1], ['for dogecoins brother', 1], ['for forex trde', 1],
    ['for my personal trading', 1], ['for playing stake', 1], ['for saving', 1], ['for shopping from savana app', 1], ['for trade in eth', 1],
    ['for trading at exness app', 1], ['for trading bro', 1], ['am trader', 1], ['as a assets', 1], ['for trading gold', 1], ['for trading in exness', 1],
    ['for trading in exness platform', 1], ['for trading in futures brother', 1], ['for trading in quotex', 1], ['for trading,investing', 1],
    ['for trending', 1], ['for use stake', 1], ['forex deposit', 1], ['forex treding', 1], ['founded account purchasing', 1], ['future', 1],
    ['futures and option trading', 1], ['gaming', 1], ['gaming site pe deposit karna hai', 1], ['gold and crypto trading', 1], ['holding in binance', 1],
    ['i am a trader', 1], ['i am buying funded account', 1], ['i am going to do investing', 1], ['i am trading', 1], ['i am trading on binance sir', 1],
    ['i need for my trading accout', 1], ['i need margin in my trading account', 1], ['i need to deposit in vt market', 1], ['i wanna hold it for long', 1],
    ['i want to buy fil coin in spot', 1], ['i want to buy funded account for trading', 1], ['i want to deposit in my trading app', 1],
    ['i want to deposit it to exness', 1], ['i want to invest in crypto', 1], ['i want to invest in icp', 1], ['i want to learn trading', 1],
    ['i want to purchase a forex funded account', 1], ['i want to quotex deposit', 1], ['i want to trade', 1], ['im buying it for transactions', 1],
    ['im treders', 1], ['im treding sir', 1], ['invest in binance only', 1], ['invest in exness trading account', 1], ['invest mostly', 1],
    ['investing crypto', 1], ['investment in bmt token', 1], ['investment in crypto coins madam', 1], ['investment in my binance account', 1],
    ['investment purpose.', 1], ['investment trading', 1], ['just for the spin reward', 1], ['just saving it on binance.', 1], ['just to put it on btc', 1],
    ['just wanna buy a propfirm challenge', 1], ['my ac got wipe out so buying', 1], ['need to buy nft', 1], ['normal spot trading', 1], ['normal trading', 1],
    ['only money savings', 1], ['own funds', 1], ['personal investment', 1], ['personal use', 1], ['personal use. keep in wallet', 1],
    ['purchase funded account', 1], ['purchase prop firm challenge accounts', 1], ['purchasing one scrapping tool', 1], ['quotex me trading', 1],
    ['quotex trading the platform deposit', 1], ['saving', 1], ['savings', 1], ['self investment', 1], ['selling usdt in higher prices', 1],
    ['sir buy funded account', 1], ['spot trading in binance', 1], ['stock investment', 1], ['stock market trading', 1], ['to buy crypto', 1],
    ['to buy prop firm account for trading', 1], ['to buy sui and bome coins', 1], ['to deposit in exness', 1], ['to deposit in stake', 1],
    ['to purchase a prop firm account', 1], ['to purchase bitcoin', 1], ['to trade in forex', 1], ['trade and investment', 1], ['trade in exnesss', 1],
    ['trade in xauusd', 1], ['trade or invest', 1], ['trade panna bro', 1], ['trading and investing', 1], ['trading cfds', 1], ['trading crypto market', 1],
    ['trading futures in binance', 1], ['trading in quotex', 1], ['trading in xauusd', 1], ['trading in xm', 1], ['trading investment', 1],
    ['trading parpose', 1], ['trading purpose', 1], ['trading purpose in crypto market', 1], ['trading saving', 1], ['trading sir', 1], ['trading use', 1],
    ['trading.', 1], ['trading/investment', 1], ['transferring to sibling abroad', 1], ['treding', 1], ['trending', 1], ['usdt sell', 1],
    ['want to add stake account', 1], ['xauusd/btc/usool trading', 1], ['xm', 1], ['yeild earnings', 1], ['yes crypto pr invest krna h', 1],
    ['yes i m using it for trading', 1], ['yes sir for trading in btc sir', 1], ['yes to hold some coins like solana.', 1], ['asset allocation', 1],
    ['binance trading in xau', 1], ['btc trade', 1], ['buy a leptop', 1], ['buy airfare to my friend', 1], ['buy profirm', 1], ['buy something', 1],
    ['buying and selling', 1], ['buying prop challenge', 1], ['buying prop fund', 1], ['byy coin', 1], ['coin buy karni hai', 1], ['crypto holding', 1],
    ['crypto me invest karne ke liye', 1], ['crypto purchase', 1], ['crypto trading ke liye', 1], ['ji trading', 1],
  ],
  source_of_funds: [
    ['salary', 63], ['business', 33], ['bussiness', 12], ['savings', 6], ['my savings', 5], ['my salary', 4], ['business income', 4], ['private job', 3],
    ['job', 3], ['salary sir', 2], ['exness', 2], ['from my savings', 2], ['business bro', 2], ['buisness', 2], ['saving', 2], ['personal funds', 2],
    ['business.', 2], ['salary employee', 2], ['forex treding', 1], ['freelance', 1], ['from alibaba', 1],
    ['from my brother', 1], ['from my buissness', 1], ['from my own business', 1], ['from my personal bank account', 1], ['gold loan', 1],
    ['government employee', 1], ['have business', 1], ['i am a government employee', 1], ['i am a job holder', 1], ['i am a software engineer in microsoft', 1],
    ['i am an accountant', 1], ['i am an employee', 1], ['i am business in car', 1], ['i am publisher cpa affiliate marketing', 1], ['i am trader', 1],
    ['agriculture income', 1], ['buisness bro', 1], ['busbessy', 1], ['i have a #-# job', 1], ['i have a consultation business', 1], ['i have a shop', 1],
    ['i m employed', 1], ['i took loan', 1], ['i work in a bank', 1], ['i work in it industry', 1], ['i work with amazon india', 1],
    ["i'm a freelancer sir", 1], ["i'm a salaried person", 1], ["i'm farmer.", 1], ['iam a engineer', 1], ['iam a salaried employee...', 1],
    ['iam influencer', 1], ["it's my salery account", 1], ['ive got credited salary', 1], ['job salary', 1], ['loan', 1], ['loans', 1], ['loans from cred', 1],
    ['logistics besness', 1], ['me kaam bhi karta hu', 1], ['mere baap ka paisa h', 1], ['mere dost ne diya hai', 1],
    ['mushroom farming business and csc centre clerk', 1], ['my brother sent me', 1], ['my hotel buisness income', 1], ['my husband salary', 1],
    ['my own', 1], ['my own fund', 1], ['my own income', 1], ['my parents', 1], ['my partners', 1], ['my personal capital', 1], ['my salary and gold loan', 1],
    ['nothing special just saving', 1], ['own fund.', 1], ['own funds', 1], ['own money', 1], ['parents', 1], ['parents gave me to trade', 1],
    ['personal business', 1], ['personal fund', 1], ['personal income', 1], ['personal money earn from stocks and trade', 1], ['personal work', 1],
    ['playing stakes', 1], ['real estate office', 1], ['real-estate agent', 1], ['salaried from private sector', 1], ['salary and savings', 1],
    ['salary and trading', 1], ['salary funds', 1], ['salary he sirji', 1], ['salary.', 1], ['salary.. i am an employee of sbi', 1], ['salaryy', 1],
    ['salery', 1], ['salery aati hai', 1], ['salery account h', 1], ['salry', 1], ['savings.', 1], ['self', 1], ['self employed', 1],
    ['self employed and affiliate', 1], ['self funding our regular business fund', 1], ['self income', 1], ['sir graphic designer', 1],
    ['sir i have it from savings', 1], ['sir trading', 1], ['taken from father', 1], ['took a loan sir', 1], ['trading', 1], ['business and salary both', 1],
    ['business brother', 1], ['business funds', 1], ['business generated', 1], ['business hai bro', 1], ['business hai coaching institute', 1],
    ['business or job', 1], ['business own a school', 1], ['business sir', 1], ['bussines', 1], ['cash deposit', 1], ['college salary', 1],
    ['converting my savings to crypto', 1], ['devpment work', 1], ['factory haii.', 1], ['family', 1], ['family income', 1], ['father', 1],
    ["father's business", 1], ['haan sir salary', 1], ['ji, business', 1],
  ],
  profession: [
    ['construction', 2], ['trading', 2], ['bizness', 1], ['bnb host', 1], ['business', 1], ['business men', 1], ['college students', 1], ['contractor', 1],
    ['dev opps engineer', 1], ['house wife', 1], ['housewife', 1], ['i am a farmer', 1], ['i am doing my mba from spjimr mumbai', 1], ['i am workers', 1],
    ['i have business', 1], ['i m doctor by profession', 1], ['i work at a mnc', 1], ['im a ln student', 1], ['im working in pvt company', 1],
    ['insurance', 1], ['it engineer', 1], ['job', 1], ['logistics company worker', 1], ['m a student', 1], ['manager marketing', 1],
    ['medical store pharmacy', 1], ['mobile service centre', 1], ['nri', 1], ['own business', 1], ['own furniture buisness', 1], ['part time trader', 1],
    ['pharmacist', 1], ['piping enginner', 1], ['private job', 1], ['qa automation tester', 1], ['restaurant owner', 1], ['self employed', 1],
    ['sell p employee', 1], ['senior cybersecurity engineer', 1], ['software', 1], ['student', 1], ['stuendent', 1], ['teacher', 1], ['trade', 1],
    ['trader', 1], ['assistant professor', 1], ['police constable', 1], ['i am in police', 1], ['bank verification officer', 1],
  ],
}
/** Replies to those questions that are no answer: a question, a request, a complaint or something else. */
const NOT_ANSWERS: Record<string, string[]> = {
  paying_bank: ['upi', 'plzz fast sir', 'already paid', 'can i pay', 'please check and release quick', 'please share ur upi id', 'pls share upi id',
    'my limit  reached', 'rest all of my accounts have reached payment limit', 'send ur upi id', 'share acc details', 'upi id', 'upi id ??',
    'i am already verified', 'i have given so many times my adhar card should i send again?', 'good evening i am already verified',
    'i am already  same user and will pay through upi of same bank', 'we already had done transactions sir', 'no. not doing any trade right now',
    'send details will add you as a beneficiary', 'right now i have passport photo because i am out of india', 'sorry sir galti se phone send hogaya',
    'same as last time', 'i have done the deal just now sir with you', 'sbi not working', 'sbi account freeze ho gaya', 'yes', 'yes sir'],
  purpose: ['aapko kya kaam hai', 'all are my id proof sir', 'i have only front', 'oh i am sorry i thought you are selling', 'ohh so sorry',
    'sir whatsaap par baat kiya tha', 'sorry bro cancel this order', 'why', 'ye sab jagh hi mobile no. kyu mangte h', 'check sir', 'bpjpj1234l',
    'mo n 9876543210', '9876543210', 'ha', 'hello sir', 'good morning sir', 'ok', 'scam', 'i am already verified', 'mera kyc ho chuka hai',
    'jaldi karo', 'police complaint', 'ji mera account freeze ho gaya', 'haan sir bank server down hai', 'wait wrong amount received'],
  source_of_funds: ['upi', 'hi', 'hi sir reply me', 'hindi me btao', 'hmm', '?', '??', '#####', 'kindly send the upi details', 'send me your upi id',
    'share bank bro', 'upi plz', 'statement send ker di hai maine sir', 'sir whatsaap par baat kiya tha', 'phonepay upi', 'ok'],
  profession: ['ok', 'so many questions sir?', 'what i do now', 'yes', 'ill do cash deposit brother don\'t worry'],
}

Deno.test('real answers to our purpose, source of funds, profession and bank questions are recognised (at least 97% of them)', () => {
  const misses: string[] = []
  let all = 0, hit = 0
  for (const [step, cases] of Object.entries(ANSWERS)) {
    for (const [text, n] of cases) {
      all += n
      if (answersStep(step as StepKey, text)) hit += n
      else misses.push(`${step}: "${text}" ×${n}`)
    }
  }
  const share = hit / all
  if (share < 0.97) throw new Error(`recognised ${(share * 100).toFixed(1)}% (${hit} of ${all}); missed:\n  ${misses.join('\n  ')}`)
  console.log(`recognised ${(share * 100).toFixed(1)}% of ${all} answers; missed: ${misses.join(' | ') || 'none'}`)
})

Deno.test('questions, requests and complaints after those questions are never taken as the answer', () => {
  const wrong: string[] = []
  for (const [step, texts] of Object.entries(NOT_ANSWERS)) {
    for (const text of texts) if (answersStep(step as StepKey, text)) wrong.push(`${step}: "${text}"`)
  }
  if (wrong.length) throw new Error(`taken as answers:\n  ${wrong.join('\n  ')}`)
})

Deno.test('an answer asks nothing (no lookup); a request, complaint or question after the same question is looked up', () => {
  let n = 0
  const turn = (text: string): ChatRow[] => [{ binance_message_id: `x${++n}`, message_type: 'text', sender_is_self: false, message_text: text, binance_create_time: 1_792_000_000_000 + n }]
  for (const [step, cases] of Object.entries(ANSWERS)) {
    for (const [text] of cases) {
      if (answersStep(step as StepKey, text) && turnNeedsAnswer(buildTranscript(turn(text)), step as StepKey)) throw new Error(`${step}: "${text}" is an answer but would be looked up`)
    }
  }
  for (const text of ['plzz fast sir', 'already paid', 'can i pay', 'please share ur upi id', 'i am already verified', 'sorry bro cancel this order',
    'hi sir reply me', 'hindi me btao', 'ji mera account freeze ho gaya', 'so many questions sir?']) {
    for (const step of ['paying_bank', 'purpose', 'source_of_funds', 'profession'] as StepKey[]) {
      if (!turnNeedsAnswer(buildTranscript(turn(text)), step)) throw new Error(`${step}: "${text}" would not be looked up`)
    }
  }
})
