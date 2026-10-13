// ATS: reads a candidate's email reply and says what it is about, so HR sees the next step without opening it.
// Rule-based and deterministic (no AI, nothing leaves the server). English, Hindi (Devanagari) and Hinglish.
// Used by ats-mail-sync when it files an inbound email; the result is stored on ats_messages.intent / intent_data.
// HR can always correct the label in the ATS (intent_source = 'hr').

export type ReplyIntent =
  | 'confirm' // will attend the interview
  | 'reschedule' // can't make the interview time / wants another time
  | 'availability' // replies with dates/times (usually to "Ask for interview times")
  | 'withdraw' // not interested any more / joined elsewhere
  | 'documents' // sent files (resume, certificates)
  | 'question' // asks something
  | 'thanks' // short thank-you / ok, nothing to do
  | 'auto_reply' // out-of-office and other automatic replies
  | 'other'

export interface ReplyContext {
  /** When the email was received (used to resolve "tomorrow", weekdays). */
  receivedAt: Date
  /** template_code of the last email the ATS sent this candidate before this reply, if any. */
  lastOutboundTemplate?: string | null
  /** purpose of that email: general | acknowledgement | rejection | interview | offer. */
  lastOutboundPurpose?: string | null
  /** The candidate has a scheduled interview that has not started yet. */
  hasUpcomingInterview?: boolean
}

export interface ReplyInput {
  /** Plain text of the reply; quoted history is removed here. */
  text: string
  subject?: string | null
  /** Saved or listed attachments, excluding calendar (.ics) files. */
  attachmentCount?: number
  /** From the email headers (Auto-Submitted, Precedence, X-Autoreply). */
  automatic?: boolean
}

export interface ProposedTime {
  /** ISO timestamp (UTC) of the proposed start. */
  start: string
  /** "Mon 20 Oct, 11:00 AM" (IST); "Mon 20 Oct" when no time was given. */
  label: string
  /** True when only a day was given. */
  dateOnly: boolean
  /** The words it was read from, for the tooltip. */
  text: string
}

export interface ReplyAnalysis {
  intent: ReplyIntent
  confidence: 'high' | 'medium' | 'low'
  lang: 'en' | 'hi' | 'hinglish'
  /** Up to 3 proposed interview times found in the reply (IST). */
  times: ProposedTime[]
  /** Everything else that was noticed, e.g. ['has_attachments', 'question']. */
  signals: string[]
  /** Up to 160 characters of the new text, without quoted history. */
  preview: string
}

const IST_OFFSET_MIN = 330

// ---------------------------------------------------------------- quoted history

const QUOTE_START: RegExp[] = [
  /^On .{3,300}wrote:\s*$/i, // Gmail / Apple Mail
  /^On .{3,200}$/i, // Gmail wraps "On … <a@b>" and puts "wrote:" on the next line (checked with the next line)
  /^-{2,}\s*(Original Message|Forwarded message)\s*-{0,}/i,
  /^_{10,}\s*$/, // Outlook separator
  /^From:\s.+/i, // Outlook header block (checked with the next lines)
  /ने लिखा:\s*$/, // Gmail in Hindi
  /^Sent from my (iPhone|iPad|Android|Samsung|mobile|phone)/i,
  /^Get Outlook for (Android|iOS)/i,
]

/** The new part of a reply, without quoted history, mobile footers or a trailing signature dash block. */
export function stripQuoted(text: string): string {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    const next = (lines[i + 1] ?? '').trim()
    if (QUOTE_START[0].test(l) || QUOTE_START[2].test(l) || QUOTE_START[3].test(l) || QUOTE_START[5].test(l) ||
      QUOTE_START[6].test(l) || QUOTE_START[7].test(l)) {
      end = i
      break
    }
    if (QUOTE_START[1].test(l) && /^(.*<[^>]+>\s*)?wrote:\s*$/i.test(next)) {
      end = i
      break
    }
    if (QUOTE_START[4].test(l) && /^(Sent|Date|To|Subject):/i.test(next)) {
      end = i
      break
    }
    if (l.startsWith('>') && (lines[i + 1] ?? '').trim().startsWith('>')) {
      end = i
      break
    }
    if (l === '--' || l === '-- ') {
      end = i
      break
    }
  }
  return lines.slice(0, end).join('\n').trim()
}

// ---------------------------------------------------------------- language

const DEVANAGARI = /[ऀ-ॿ]/
const HINGLISH = /\b(hai|hain|hu|hoon|hun|nahi|nahin|nai|kal|parso|aaj|aaunga|aaungi|aaoonga|aa\s?jaunga|aa\s?jaungi|aa\s?jaenge|aayenge|sakta|sakti|sakte|paunga|paungi|mujhe|mera|meri|main|mai|hum|aap|apka|aapka|theek|thik|accha|acha|haan|haa|ji|kya|kab|kaise|kitna|kitni|kahan|karna|karni|krna|baje|subah|shaam|sham|dopahar|wala|wali|abhi|bata|batao|bataiye|kijiye|dijiye|chahiye)\b/i

export function detectLang(text: string): 'en' | 'hi' | 'hinglish' {
  if (DEVANAGARI.test(text)) return 'hi'
  const hits = (String(text).toLowerCase().match(new RegExp(HINGLISH.source, 'gi')) ?? []).length
  return hits >= 2 ? 'hinglish' : 'en'
}

// ---------------------------------------------------------------- patterns

const P = {
  auto: [
    /\bout of (the )?office\b/, /\bauto(matic)?[\s-]?(reply|response|generated)\b/, /\bon (annual |sick )?leave\b/,
    /\baway from (my )?(desk|office|email)\b/, /\blimited access to (my )?e-?mail\b/, /\bthis (is an|mailbox is) (automated|unmonitored)\b/,
    /\bdo not reply to this (e-?mail|message)\b/,
  ],
  withdraw: [
    // "not interested" — but not "not interested in night shift" (a preference, not a withdrawal)
    /\b(not|no longer|nahi|nahin|nai|na)\s+(interested|intrested|intersted|interseted)\b(?!\s+in\s+(?!(this|the|your|ur|it)\b)[a-z-]+\s+(shift|shifts|work|timing|timings|hours)\b)/,
    /\b(interested|intrested)\s+(nahi|nahin|nai)\b/,
    /\bwithdraw(ing|n)?\b/, /\bwould like to withdraw\b/,
    /\bjoined\s+(somewhere|elsewhere|some\s?where\s+else|other\s+place)\b/, /\b(got|found|have)\s+(a\s+|another\s+|other\s+|new\s+)?(job|placement)\s+(already|elsewhere|somewhere)\b/,
    /\b(already\s+)(got|found)\s+(a\s+|another\s+)?(job|placement)\b/,
    /\b(already\s+)?(joined|join(ing)?)\s+(another|other|a different|some other|a new)\s+(company|organi[sz]ation|job|firm|place)\b/,
    /\b(got|accepted|taken|received)\s+(an?|another|other|one more|some other)\s+(offer|job)\b/,
    /\b(do not|don'?t)\s+want\s+(to\s+(continue|proceed|join|go ahead|attend)|this\s+(job|role|position))\b/,
    /\bnot\s+(looking|planning)\s+(for|to)\b/, /\b(please\s+)?(cancel|remove|close)\s+my\s+(application|candidature|profile)\b/,
    /\b(job|naukri|interview)\s+(nahi|nahin|nai)\s+(karna|karni|krna|chahiye|chahte|chahti)\b/,
    /\bnahi\s+(karna|karni|krna)\s+(hai|h)\b/,
    /रुचि नहीं|इंटरेस्टेड नहीं|नौकरी नहीं करनी/,
  ],
  reschedule: [
    /\b(re-?\s?schedule|postpone|prepone)\b/,
    /\b(another|different|other|some other|any other|next|alternate|alternative)\s+(date|day|time|timing|slot)\b/,
    /\bchange\s+(the\s+|my\s+|in\s+)?(interview\s+)?(date|day|time|timing|slot|schedule)\b/,
    /\bshift\s+(the\s+|my\s+)?(interview|date|time|timing)\b/, /\binstead\b/,
    /\b(can|could)\s+(we|it|you|i)\s+(do|have|keep|make|move|arrange|schedule|get)\s+(it|this|the\s+interview|my\s+interview)?\s*(on|at|for|to)\b/,
    /\b(can'?t|cannot|can not|won'?t|will not|wont|unable to|not able to|couldn'?t|could not|may not|might not)\s+(be\s+able\s+to\s+)?(make it|come|attend|join|appear|be (there|available|present|free)|reach|visit|manage)\b/,
    /\b(not|nahi)\s+(be\s+)?(available|free)\b/, /\bunavailable\b/,
    /\b(out of (station|town|city)|outstation|travel(l)?ing|not in (bhopal|town|the city))\b/,
    /\b(nahi|nahin|nai|na)\s+(aa|a|pahunch|pahuch|join)\s?(pa|paa|sak|saku|sakta|sakti|sakunga|sakungi|paunga|paungi|unga|ungi|ega|egi)\w*/,
    /\b(aa|a|aana|pahunch|pahuch)\s?(pa|paa|sak|sakta|sakti|paunga|paungi)?\w*\s+(nahi|nahin|nai)\b/,
    /\bkal\s+(nahi|nahin|nai)\b/, /\b(kisi|koi)\s+(aur|or|dusre|doosre)\s+(din|date|time|samay|tarikh)\b/, /\bdusre\s+din\b/,
    /\b(date|time|din|samay|timing)\s+(badal|change|aage|aagey|shift)\w*/,
    /नहीं आ (पा|सक)|समय बदल|तारीख बदल|दूसरे दिन|किसी और दिन/,
  ],
  confirm: [
    /\bconfirm(ed|ing)?\b/, /\b(i|we)\s?('ll|'d| will| shall| would| am going to)\s+(definitely\s+|surely\s+|sure\s+)?(be there|be present|come|attend|join|reach|visit|be available|appear)\b/,
    /\bsee you (then|there|on|tomorrow|soon)\b/, /\blooking forward\b/, /\baccept(ed|ing)?\s+(the\s+)?(invite|invitation|interview)\b/,
    /\b(i\s?a?m|i am|i'm)\s+(available|free|ready|coming)\b/, /\bwill be (there|available|present|on time)\b/,
    /\b(aa\s?jaunga|aa\s?jaungi|aaunga|aaungi|aaoonga|aaoongi|aa\s?jaenge|aa\s?jayenge|aayenge|pahunch\s?jaunga|pahuch\s?jaunga|aa\s?raha\s?(hu|hoon|hun)|aa\s?rahi\s?(hu|hoon|hun))\b/,
    /\b(time|samay)\s+(par|pe)\s+(aa|pahunch)\w*/,
    /आ\s?(ऊंगा|ऊँगा|उंगा|ऊंगी|ऊँगी|जाऊंगा|जाऊँगा|जाउंगा|जाऊंगी|जाऊँगी|जाउंगी)|पहुँच जा|पहुंच जा/,
  ],
  confirmWeak: [/^\s*(ok(ay)?|sure|yes|yeah|yep|done|noted|fine|alright|theek\s+(hai|h|he)|thik\s+(hai|h|he)|ji|haan|haa|hanji|ji\s+haan|ठीक है|हाँ|हां|जी)\b/],
  availability: [
    /\b(i\s?a?m|i am|i'm|will be)\s+(available|free)\s+(on|at|from|after|before|between|tomorrow|today|this|next|in the)\b/,
    /\b(suits|suitable|convenient|works)\s+(for\s+)?me\b/, /\b(can|could)\s+(come|visit|attend|join)\s+(on|at|tomorrow|today|this|next|after|before|any)\b/,
    /\bmy (available|availability|preferred)\b/, /\b(free|available)\s+(slots?|timings?|time)\b/,
  ],
  documents: [
    /\b(attached|attaching|attachment|attachments|pfa|please find|enclosed|enclosing)\b/,
    /\b(sending|sharing|send|share|forwarding)\s+(my\s+|the\s+)?(updated\s+|latest\s+)?(resume|cv|bio-?\s?data|documents?|certificates?|marksheets?|id proof)\b/,
  ],
  question: [
    /\?/, /^(what|when|where|how|which|who|why|whom|is there|are there|do you|does the|can i|could i|may i|should i|will i|is it)\b/m,
    /\b(salary|ctc|package|stipend|in-?hand|pay(ment)?|incentive|location|address|map|timings?|shift|night shift|work from home|wfh|remote|documents? (required|needed)|dress code|interview process|round|eligib)\w*/,
    /\b(kya|kab|kitna|kitni|kitne|kahan|kaha|kaise|kaun|konsa|kaunsa|kyun|kyu|kis)\b/, /क्या|कब|कितना|कितनी|कहाँ|कहां|कैसे|कौन/,
  ],
  thanks: [
    /\b(thank(s| you| u)?|thanku|thanq|thnx|thx|ty|noted|received|got it|okay|ok|great|sure|dhanyavad|dhanyawad|shukriya)\b/,
    /धन्यवाद|शुक्रिया|ठीक है/,
  ],
}

const any = (list: RegExp[], s: string) => list.some((re) => re.test(s))

// ---------------------------------------------------------------- dates and times (IST)

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, ravivar: 0, raviwar: 0, 'रविवार': 0,
  mon: 1, monday: 1, somvar: 1, somwar: 1, somvaar: 1, 'सोमवार': 1,
  tue: 2, tues: 2, tuesday: 2, mangalvar: 2, mangalwar: 2, 'मंगलवार': 2,
  wed: 3, wednesday: 3, budhvar: 3, budhwar: 3, 'बुधवार': 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, guruvar: 4, guruwar: 4, brihaspativar: 4, 'गुरुवार': 4,
  fri: 5, friday: 5, shukravar: 5, shukrawar: 5, 'शुक्रवार': 5,
  sat: 6, saturday: 6, shanivar: 6, shaniwar: 6, 'शनिवार': 6,
}
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Ymd { y: number; m: number; d: number }

function istParts(d: Date): Ymd & { hh: number; mm: number; dow: number } {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60_000)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes(), dow: t.getUTCDay() }
}
function addDays(p: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(p.y, p.m, p.d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }
}
function istToUtc(p: Ymd, hh: number, mm: number): Date {
  return new Date(Date.UTC(p.y, p.m, p.d, hh, mm) - IST_OFFSET_MIN * 60_000)
}
function dow(p: Ymd): number {
  return new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay()
}
function label(p: Ymd, hh: number | null, mm: number | null): string {
  const day = `${DAY_NAMES[dow(p)]} ${p.d} ${MONTH_NAMES[p.m]}`
  if (hh === null) return day
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${day}, ${h12}:${String(mm ?? 0).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`
}

interface DateHit { at: number; end: number; ymd: Ymd; text: string }
interface TimeHit { at: number; end: number; hh: number; mm: number; text: string }

const WD_RE = new RegExp(`\\b(this\\s+|next\\s+|coming\\s+|agle\\s+|is\\s+)?(${Object.keys(WEEKDAYS).filter((k) => /^[a-z]+$/.test(k)).sort((a, b) => b.length - a.length).join('|')})\\b|(${Object.keys(WEEKDAYS).filter((k) => !/^[a-z]+$/.test(k)).join('|')})`, 'gi')
const MONTH_KEYS = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')
const DM_NAME_RE = new RegExp(`\\b(\\d{1,2})(st|nd|rd|th)?\\s*(of\\s+)?(${MONTH_KEYS})\\b\\.?(\\s*,?\\s*(20\\d\\d))?`, 'gi')
const MD_NAME_RE = new RegExp(`\\b(${MONTH_KEYS})\\.?\\s+(\\d{1,2})(st|nd|rd|th)?\\b(?![:.]\\d)(\\s*,?\\s*(20\\d\\d))?`, 'gi')
const DM_NUM_RE = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](20\d\d|\d\d))?\b/g
const REL_RE = /\b(day after tomorrow|parso|parson|tomorrow|tmrw|tmr|tomorow|kal|today|aaj)\b|(परसों|कल|आज)/gi

// Times: "11 am", "11:30am", "11.30 a.m.", "14:00", "3 o'clock", "11 baje", "11 बजे", "subah 11", "shaam 5 baje", "after 2 pm"
const TIME_RE = /\b(?:(subah|morning|dopahar|dopeher|afternoon|shaam|sham|evening)\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|baje|bje|बजे|o'?\s?clock|hrs|hours)?(?:\s+(subah|morning|dopahar|afternoon|shaam|sham|evening))?/gi
// "between 11 and 1", "from 2 to 4 pm", "11-1": the start of the range
const RANGE_RE = /\b(between|from|btw)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(and|to|-|till|until)\s*(\d{1,2})(?:[:.]\d{2})?\s*(am|pm)?/gi
// A part of the day on its own: "Tuesday morning", "kal shaam"
const POD_RE = /\b(morning|subah|afternoon|dopahar|evening|shaam|sham)\b|(सुबह|दोपहर|शाम)/gi
const POD_HOUR: Record<string, number> = {
  morning: 10, subah: 10, 'सुबह': 10, afternoon: 14, dopahar: 14, 'दोपहर': 14, evening: 17, shaam: 17, sham: 17, 'शाम': 17,
}
// A clause that says when the candidate can NOT come: its dates are not proposals.
const NEGATIVE_CLAUSE = /\b(can'?t|cannot|can not|won'?t|will not|wont|unable|not able|couldn'?t|could not|not (be )?(available|free|possible)|busy|nahi|nahin|nai)\b|नहीं/i

function weekdayDate(base: Ymd, target: number, prefix: string): Ymd {
  const today = dow(base)
  let diff = (target - today + 7) % 7
  if (diff === 0) diff = 7 // "Monday" said on a Monday means next Monday
  if (/next|agle/i.test(prefix) && diff < 2) diff += 7 // "next Tuesday" said on Monday: a week later
  return addDays(base, diff)
}

function findDates(s: string, base: Ymd): DateHit[] {
  const out: DateHit[] = []
  for (const m of s.matchAll(REL_RE)) {
    const w = (m[1] || m[2] || '').toLowerCase()
    const n = /day after|parso|parson|परसों/.test(w) ? 2 : /tomorrow|tmrw|tmr|tomorow|kal|कल/.test(w) ? 1 : 0
    out.push({ at: m.index!, end: m.index! + m[0].length, ymd: addDays(base, n), text: m[0] })
  }
  for (const m of s.matchAll(WD_RE)) {
    const key = (m[2] || m[3] || '').toLowerCase()
    if (!(key in WEEKDAYS)) continue
    out.push({ at: m.index!, end: m.index! + m[0].length, ymd: weekdayDate(base, WEEKDAYS[key], m[1] || ''), text: m[0].trim() })
  }
  const pushDm = (d: number, mo: number, y: number | null, at: number, end: number, text: string) => {
    if (d < 1 || d > 31 || mo < 0 || mo > 11) return
    let year = y ?? base.y
    const cand = { y: year, m: mo, d }
    if (!y && Date.UTC(cand.y, cand.m, cand.d) < Date.UTC(base.y, base.m, base.d) - 30 * 86_400_000) year++
    const t = new Date(Date.UTC(year, mo, d))
    if (t.getUTCMonth() !== mo) return // 31 Feb
    out.push({ at, end, ymd: { y: year, m: mo, d }, text })
  }
  for (const m of s.matchAll(DM_NAME_RE)) pushDm(Number(m[1]), MONTHS[m[4].toLowerCase()], m[6] ? Number(m[6]) : null, m.index!, m.index! + m[0].length, m[0])
  for (const m of s.matchAll(MD_NAME_RE)) pushDm(Number(m[2]), MONTHS[m[1].toLowerCase()], m[5] ? Number(m[5]) : null, m.index!, m.index! + m[0].length, m[0])
  for (const m of s.matchAll(DM_NUM_RE)) {
    // dd/mm or dd-mm(-yyyy) (India); skip things that look like times (11.30) or phone fragments
    const a = Number(m[1])
    const b = Number(m[2])
    if (m[0].includes('.') && !m[3]) continue
    if (b > 12) continue
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null
    pushDm(a, b - 1, y, m.index!, m.index! + m[0].length, m[0])
  }
  return out.sort((x, y) => x.at - y.at)
}

function officeHour(h: number, unit: string): number {
  if (unit === 'am') return h === 12 ? 0 : h
  if (unit === 'pm') return h < 12 ? h + 12 : h
  return h >= 1 && h <= 7 ? h + 12 : h
}

function findTimes(s: string, dateSpans: Array<[number, number]>): TimeHit[] {
  const out: TimeHit[] = []
  const overlaps = (at: number, end: number) =>
    dateSpans.some(([a, b]) => at < b && end > a) || out.some((t) => at < t.end && end > t.at)
  for (const m of s.matchAll(RANGE_RE)) {
    const at = m.index!
    const end = at + m[0].length
    const unit = (m[4] || m[7] || '').toLowerCase()
    const hh = officeHour(Number(m[2]), m[4] ? unit : (m[7] && Number(m[2]) <= Number(m[6]) ? unit : ''))
    const mm = m[3] ? Number(m[3]) : 0
    if (hh < 7 || hh > 21 || mm > 59) continue
    out.push({ at, end, hh, mm, text: m[0].trim() })
  }
  for (const m of s.matchAll(TIME_RE)) {
    const at = m.index!
    const end = at + m[0].length
    if (overlaps(at, end)) continue // part of a date like 20/10 or 20 Oct, or of a range
    const part = (m[1] || m[5] || '').toLowerCase()
    const unit = (m[4] || '').toLowerCase().replace(/[\s.]/g, '')
    let hh = Number(m[2])
    const mm = m[3] ? Number(m[3]) : 0
    const lead = /\b(at|by|around|before|after|from|till|until|@|ko|pe|par)\s*$/i.test(s.slice(Math.max(0, at - 8), at))
    if (!unit && !part && !m[3] && !lead) continue // a bare number is not a time ("at 11" is)
    if (unit === 'hrs' || unit === 'hours') {
      if (!m[3] && hh < 10) continue // "2 hours" is a duration
    }
    if (hh > 23 || mm > 59) continue
    if (unit === 'am') {
      if (hh === 12) hh = 0
    } else if (unit === 'pm') {
      if (hh < 12) hh += 12
    } else if (/shaam|sham|evening|dopahar|dopeher|afternoon/.test(part)) {
      if (hh < 12) hh += 12
    } else if (/subah|morning/.test(part)) {
      if (hh === 12) hh = 0
    } else if (hh >= 1 && hh <= 7) {
      hh += 12 // "3 baje", "3:30" during office hours means afternoon
    }
    if (hh < 7 || hh > 21) continue // not an interview time
    out.push({ at, end, hh, mm, text: m[0].trim() })
  }
  for (const m of s.matchAll(POD_RE)) {
    const at = m.index!
    const end = at + m[0].length
    if (out.some((t) => at < t.end + 2 && end > t.at - 2)) continue // "subah 11", "5 baje shaam" already read
    const key = (m[1] || m[2] || '').toLowerCase()
    if (!(key in POD_HOUR)) continue
    out.push({ at, end, hh: POD_HOUR[key], mm: 0, text: m[0] })
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Clause boundaries (commas, "but", "lekin") so "can't come Monday, Tuesday 11 am is fine" keeps only Tuesday. */
function clauseOf(s: string, at: number): string {
  const re = /[,;]|\bbut\b|\blekin\b|\bmagar\b|\bpar\b(?=\s)|\bhowever\b|\binstead\b|लेकिन|पर /gi
  let start = 0
  let end = s.length
  for (const m of s.matchAll(re)) {
    if (m.index! < at) start = m.index! + m[0].length
    else if (m.index! >= at) {
      end = m.index!
      break
    }
  }
  return s.slice(start, end)
}

/** Proposed interview times in the reply (IST), nearest date+time pairs first, at most 3, never in the past. */
export function findProposedTimes(text: string, receivedAt: Date): ProposedTime[] {
  const now = receivedAt
  const base = istParts(now)
  const baseYmd = { y: base.y, m: base.m, d: base.d }
  const out: ProposedTime[] = []
  const seen = new Set<string>()
  for (const sentence of text.split(/(?<=[.!?\n])\s+|\n+/)) {
    const s = sentence.trim()
    if (!s) continue
    // A weekday right next to the same date ("Mon 19 Oct", "Monday, 19/10") is one date.
    const dates = findDates(s, baseYmd).filter((d, i, all) =>
      !all.some((o, j) => j !== i && sameDay(o.ymd, d.ymd) && Math.abs(o.at - d.end) <= 3 && j > i))
    const times = findTimes(s, dates.map((d) => [d.at, d.end]))
    const used = new Set<number>()
    for (const d of dates) {
      if (NEGATIVE_CLAUSE.test(clauseOf(s, d.at))) continue
      // nearest time after the date (within 40 chars), else nearest before it
      let best: TimeHit | null = null
      let bestDist = Infinity
      times.forEach((t, i) => {
        if (used.has(i)) return
        const dist = t.at >= d.end ? t.at - d.end : (d.at - t.end) + 15
        if (dist >= 0 && dist < 40 && dist < bestDist) {
          best = t
          bestDist = dist
        }
      })
      const t = best as TimeHit | null
      if (t) used.add(times.indexOf(t))
      const start = istToUtc(d.ymd, t ? t.hh : 10, t ? t.mm : 0)
      if (start.getTime() < now.getTime()) continue
      const key = `${d.ymd.y}-${d.ymd.m}-${d.ymd.d}-${t ? `${t.hh}:${t.mm}` : 'day'}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ start: start.toISOString(), label: label(d.ymd, t ? t.hh : null, t ? t.mm : null), dateOnly: !t, text: t ? `${d.text} ${t.text}` : d.text })
    }
  }
  // A day on its own is dropped when the same day also came with a time.
  const timed = new Set(out.filter((p) => !p.dateOnly).map((p) => p.label.split(',')[0]))
  return out.filter((p) => !(p.dateOnly && timed.has(p.label))).slice(0, 3)
}

function sameDay(a: Ymd, b: Ymd): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d
}

// ---------------------------------------------------------------- main

/** What a candidate's reply is about. */
export function analyzeReply(input: ReplyInput, ctx: ReplyContext): ReplyAnalysis {
  const body = stripQuoted(input.text || '')
  const s = body.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
  const subj = String(input.subject ?? '').toLowerCase()
  const lang = detectLang(body)
  const signals: string[] = []
  const attachments = Number(input.attachmentCount ?? 0)
  if (attachments > 0) signals.push('has_attachments')
  const times = findProposedTimes(body, ctx.receivedAt)
  if (times.length) signals.push('has_times')
  const interviewCtx = !!ctx.hasUpcomingInterview || ctx.lastOutboundPurpose === 'interview'
  const askedForTimes = ctx.lastOutboundTemplate === 'interview-invitation'
  // There is an interview to confirm (not just a request for times).
  const confirmCtx = !!ctx.hasUpcomingInterview || (ctx.lastOutboundPurpose === 'interview' && !askedForTimes)
  const preview = body.replace(/\s+/g, ' ').slice(0, 160)
  const done = (intent: ReplyIntent, confidence: ReplyAnalysis['confidence']): ReplyAnalysis => {
    if (intent !== 'question' && any(P.question, s)) signals.push('question')
    return { intent, confidence, lang, times, signals: [...new Set(signals)], preview }
  }

  if (input.automatic || any(P.auto, s) || /\b(out of office|automatic reply|auto(-| )?reply)\b/.test(subj)) return done('auto_reply', 'high')
  if (!s) return done(attachments ? 'documents' : 'other', attachments ? 'medium' : 'low')
  if (any(P.withdraw, s)) return done('withdraw', 'high')
  // Asked for times and no interview yet: "can't do Monday, Tuesday 11 am is fine" is an answer, not a reschedule.
  if (askedForTimes && !ctx.hasUpcomingInterview && times.length) return done('availability', 'high')
  if (any(P.reschedule, s)) return done('reschedule', interviewCtx ? 'high' : 'medium')
  if (confirmCtx && any(P.confirm, s)) return done('confirm', 'high')
  if (times.length && (askedForTimes || !ctx.hasUpcomingInterview || any(P.availability, s))) {
    return done('availability', askedForTimes ? 'high' : 'medium')
  }
  if (confirmCtx && s.length <= 80 && any(P.confirmWeak, s) && !/\?/.test(s)) return done('confirm', 'medium')
  if (attachments > 0 || any(P.documents, s)) return done('documents', attachments > 0 ? 'high' : 'medium')
  if (any(P.question, s)) return done('question', /\?/.test(s) ? 'high' : 'medium')
  if (s.length <= 120 && any(P.thanks, s)) return done('thanks', 'medium')
  if (!interviewCtx && any(P.confirm, s)) return done('confirm', 'low')
  if (askedForTimes && any(P.availability, s)) return done('availability', 'low')
  return done('other', 'low')
}
