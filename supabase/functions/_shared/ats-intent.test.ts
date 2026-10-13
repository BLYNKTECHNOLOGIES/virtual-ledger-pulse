// Run: deno test supabase/functions/_shared/ats-intent.test.ts
import { analyzeReply, detectLang, stripQuoted, type ReplyContext } from './ats-intent.ts'

// Tue 13 Oct 2026, 10:00 IST
const at = new Date('2026-10-13T04:30:00Z')
const IV: ReplyContext = { receivedAt: at, hasUpcomingInterview: true, lastOutboundPurpose: 'interview', lastOutboundTemplate: 'interview-scheduled' }
const ASK: ReplyContext = { receivedAt: at, hasUpcomingInterview: false, lastOutboundPurpose: 'interview', lastOutboundTemplate: 'interview-invitation' }
const NONE: ReplyContext = { receivedAt: at }
const ACK: ReplyContext = { receivedAt: at, lastOutboundPurpose: 'acknowledgement', lastOutboundTemplate: 'acknowledgement' }
const DOCS: ReplyContext = { receivedAt: at, lastOutboundPurpose: 'general', lastOutboundTemplate: 'request-documents' }

type Case = [string, ReplyContext, string, string[]?, number?]
const cases: Case[] = [
  ['Yes sir, I will be there on time.', IV, 'confirm'],
  ['Ok sir', IV, 'confirm'],
  ['Thank you for the update.', NONE, 'thanks'],
  ['I am not interested anymore, I have joined another company.', IV, 'withdraw'],
  ["Sorry, I can't make it tomorrow. Can we reschedule to Thursday 11 am?", IV, 'reschedule', ['Thu 15 Oct, 11:00 AM']],
  ['Kal nahi aa paunga sir, parso 12 baje aa sakta hu', IV, 'reschedule', ['Thu 15 Oct, 12:00 PM']],
  ['I am available on Monday after 2 pm or Tuesday morning', ASK, 'availability', ['Mon 19 Oct, 2:00 PM', 'Tue 20 Oct, 10:00 AM']],
  ['Please find attached my resume.', DOCS, 'documents', [], 1],
  ['What is the salary for this role?', ACK, 'question'],
  ['Where is the office located? Is there any parking?', IV, 'question'],
  ['I have attached my documents. Can I come on 16th October at 11:30 am?', DOCS, 'availability', ['Fri 16 Oct, 11:30 AM'], 2],
  ['I accept the interview invitation. See you on Thursday.', IV, 'confirm'],
  ['Out of office: I am on leave until 20 Oct', NONE, 'auto_reply'],
  ['ठीक है सर, मैं कल 11 बजे आ जाऊंगा', IV, 'confirm', ['Wed 14 Oct, 11:00 AM']],
  ['Sir mujhe ye job nahi karni', IV, 'withdraw'],
  ['Can I get the interview at 4pm instead? I have an exam in the morning.', IV, 'reschedule'],
  ['Thanks, received the invite.', IV, 'thanks'],
  ['Hello, I applied for the customer support job last week. Any update on my application?', ACK, 'question'],
  ['Sir I will come tomorrow at 11', IV, 'confirm', ['Wed 14 Oct, 11:00 AM']],
  ['Can we do it on 20/10 at 3 pm?', IV, 'reschedule', ['Tue 20 Oct, 3:00 PM']],
  ['Please share the address and map location', IV, 'question'],
  ['I will not be able to attend the interview due to some personal reasons.', IV, 'reschedule'],
  ['Joined somewhere else, thanks', IV, 'withdraw'],
  ['ok', NONE, 'thanks'],
  ['Interview kab hai?', ACK, 'question'],
  ['Mera interview kis time hai sir', IV, 'question'],
  ['', DOCS, 'documents', [], 1],
  ["I'll be there at 11:30. Thank you!", IV, 'confirm'],
  ['Can I come on Saturday?', ACK, 'availability', ['Sat 17 Oct']],
  ['Sorry for the late reply. I am available tomorrow between 11 and 1', ASK, 'availability', ['Wed 14 Oct, 11:00 AM']],
  ['Mon 19 Oct 11:00 AM works for me', ASK, 'availability', ['Mon 19 Oct, 11:00 AM']],
  ['I want to change my interview time', IV, 'reschedule'],
  ['My phone number is 98765 43210', NONE, 'other', []],
  ['Ji sir', IV, 'confirm'],
  ['Sir kitni salary milegi?', ACK, 'question'],
  ['I am not available on Wednesday. I can come on Friday at 10 AM.', IV, 'reschedule', ['Fri 16 Oct, 10:00 AM']],
  ['Please remove my application', ACK, 'withdraw'],
  ['मैं इंटरव्यू में नहीं आ पाऊंगा', IV, 'reschedule'],
  ['Done sir, documents bhej diye hai', DOCS, 'documents', [], 2],
  ['Kya main kal 11 baje aa sakta hu?', ASK, 'availability', ['Wed 14 Oct, 11:00 AM']],
  ['Yes, Thursday at 3pm is fine', ASK, 'availability', ['Thu 15 Oct, 3:00 PM']],
  ["Thanks. I'll attend.", IV, 'confirm'],
  ["I can't do Monday, but Tuesday 11 am is fine", ASK, 'availability', ['Tue 20 Oct, 11:00 AM']],
  ['I got a job already, thank you for the opportunity', IV, 'withdraw'],
  ['Please call me after 5 pm today', ACK, 'availability', ['Tue 13 Oct, 5:00 PM']],
  ['I will be 10 minutes late', IV, 'other'],
  ['sir main 20.10.2026 ko 2 baje aa jaunga', IV, 'confirm', ['Tue 20 Oct, 2:00 PM']],
  ['Monday, 19/10 at 4:30 pm?', ASK, 'availability', ['Mon 19 Oct, 4:30 PM']],
  ['Hi\n\nYes I will attend.\n\nOn Mon, 12 Oct 2026 at 18:00, HR Blynk <hr@blynkex.com> wrote:\n> Are you available tomorrow at 11 am?\n> Please reply', IV, 'confirm', []],
  ['I have 2 years of experience and 11 months in sales', ACK, 'other', []],
  ['My notice period is 30 days', ACK, 'other', []],
  ['Not interested in night shift. Day shift is fine.', IV, 'question'],
  ['I am not interested in this job', IV, 'withdraw'],
  ['Sorry, I am busy today, can we talk tomorrow?', ACK, 'availability', ['Wed 14 Oct']],
  ['Is the job for Bhopal location?', ACK, 'question'],
  ['Will there be any written test?', IV, 'question'],
  ['I am free on 12/10', ASK, 'availability', []],
  ['Yes I am interested, please tell me the next steps', ASK, 'other'],
]

Deno.test('reply intents and proposed times', () => {
  const failures: string[] = []
  for (const [text, ctx, want, wantTimes, att] of cases) {
    const r = analyzeReply({ text, attachmentCount: att ?? 0 }, ctx)
    const got = r.times.map((t) => t.label)
    if (r.intent !== want || (wantTimes !== undefined && JSON.stringify(got) !== JSON.stringify(wantTimes))) {
      failures.push(`${JSON.stringify(text)} -> ${r.intent} ${JSON.stringify(got)} (want ${want} ${JSON.stringify(wantTimes)})`)
    }
  }
  if (failures.length) throw new Error(failures.join('\n'))
})

Deno.test('language and quoted history', () => {
  if (detectLang('Kal nahi aa paunga sir, parso 12 baje aa sakta hu') !== 'hinglish') throw new Error('hinglish')
  if (detectLang('ठीक है सर') !== 'hi') throw new Error('hi')
  if (detectLang('I will be there on time') !== 'en') throw new Error('en')
  if (stripQuoted('Yes\n\nOn Mon, 12 Oct 2026 at 18:00, HR <hr@blynkex.com>\nwrote:\n> hi') !== 'Yes') throw new Error('gmail quote')
  if (stripQuoted('Ok noted\n\nFrom: HR <hr@blynkex.com>\nSent: Monday\nTo: me') !== 'Ok noted') throw new Error('outlook quote')
})
