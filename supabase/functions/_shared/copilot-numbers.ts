// Copilot · Rephrase: the numbers in a text with their units, so a rewrite can be held to exactly the operator's numbers:
// none added, dropped, changed or swapped. "5k" is 5000, "half an hour" is 30 minutes, "6 pm" a time of day, "18/10" a
// date, "5-10 min" two numbers of minutes. Pure helpers (no network), unit-tested in copilot-numbers.test.ts.

/** Where each script's digit zero is: a number cannot hide in full-width or Devanagari digits. */
const DIGIT_ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xff10]
/** Compatibility forms folded (full-width, circled), then every digit written in ASCII. An unknown digit still counts as one. */
export function asciiDigits(s: string): string {
  return String(s ?? '').normalize('NFKC').replace(/\p{Nd}/gu, (d) => {
    const c = d.codePointAt(0)!
    const z = DIGIT_ZEROS.find((zero) => c >= zero && c <= zero + 9)
    return z === undefined ? '9' : String(c - z)
  })
}

/** Characters that do not show: zero-width spaces and joiners, direction marks, soft hyphens, word joiners, fillers. */
const INVISIBLE = /[\p{Cf}\u034F\u115F\u1160\u17B4\u17B5\u180E\u3164\uFE00-\uFE0F\uFFA0\u20E3]/gu

/**
 * Text as the checks read it: fractions spelled as decimals, compatibility forms folded (full-width letters, digits and
 * "＠" become plain), invisible characters removed, the keycap-ten emoji as 10, and every digit in ASCII.
 */
export function normalizeText(s: string): string {
  const t = String(s ?? '')
    .replace(/(\d)\s*½/g, '$1.5').replace(/½/g, '0.5').replace(/(\d)\s*¼/g, '$1.25').replace(/¼/g, '0.25')
    .replace(/(\d)\s*¾/g, '$1.75').replace(/¾/g, '0.75')
    .normalize('NFKC')
    .replace(/\u{1F51F}/gu, ' 10 ')
    .replace(INVISIBLE, '')
  return asciiDigits(t)
}

export type QuantityKind = 'num' | 'usdt' | 'time' | 'clock' | 'date' | 'percent' | 'times' | 'ordinal'
export interface Quantity {
  kind: QuantityKind
  /** num, usdt, percent, times, ordinal: the value · time: minutes · clock: minutes past 12 on the dial · date: month × 100 + day */
  value: number
  /** Clock times: afternoon (true), morning (false) or not said (null). */
  pm?: boolean | null
  /** Never "added" or "dropped" on its own (politeness such as "a minute", ordinals, "both"). */
  soft: boolean
  /** A politeness moment ("a minute", "ek pal"): stands for any wait of a minute or less. */
  moment?: boolean
  /** No unit or currency was written ("5000"). */
  bare?: boolean
  /** Where it starts in the text (for the order) and where it ends. */
  at: number
  end: number
  /** How it reads, for the call log. */
  label: string
}

const TOKEN_ANY = /⟦\s*\d{1,3}\s*⟧/g
const PLACEHOLDER = /\{[^{}]{1,40}\}/g
const blankOut = (m: string) => ' '.repeat(m.length)

const MULT: Record<string, number> = {
  k: 1e3, thousand: 1e3, thousands: 1e3, hazaar: 1e3, hazar: 1e3, hajar: 1e3, hazaaar: 1e3,
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7,
}
/** Units after a number (with the factor that turns a time into minutes). */
const UNITS: Array<[RegExp, QuantityKind, number]> = [
  [/^(seconds?|secs?)$/, 'time', 1 / 60],
  [/^(minutes?|mins?|mnts?|minit|minat|मिनट)$/, 'time', 1],
  [/^(hours?|hrs?|h|ghanta|ghante|ghanton|घंटा|घंटे)$/, 'time', 60],
  [/^(days?|din|दिन)$/, 'time', 1440],
  [/^(weeks?|wks?|hafta|hafte|हफ्ता|हफ्ते)$/, 'time', 10080],
  [/^(months?|mnths?|mahina|mahine|महीना|महीने)$/, 'time', 43200],
  [/^(years?|yrs?|saal)$/, 'time', 525600],
  [/^(%|percent|pct|pratishat)$/, 'percent', 1],
  [/^(usdt|usdc|usd|dollars?|\$)$/, 'usdt', 1],
  [/^(rupees?|rupaye|rupay|rs|inr|\/-)$/, 'num', 1],
  [/^(times?|baar|bar)$/, 'times', 1],
]
const unitOf = (w: string | undefined): { kind: QuantityKind; factor: number } | null => {
  const x = String(w ?? '').toLowerCase().replace(/\.$/, '')
  for (const [re, kind, factor] of UNITS) if (re.test(x)) return { kind, factor }
  return null
}
/** Words that may sit between a number and its unit ("five more minutes", "2 working days"). */
const BETWEEN = new Set(['more', 'extra', 'additional', 'working', 'business', 'full', 'whole', 'calendar', 'odd', 'aur'])

const EN_ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
// Hinglish numbers count only before a unit ("do din"; "pay kar do" is not a number).
const HI_NUM: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12,
  pandrah: 15, bees: 20, pachees: 25, tees: 30, chalis: 40, chaalis: 40, pachas: 50, pachaas: 50, sau: 100,
  aadha: 0.5, adha: 0.5, aadhe: 0.5, dedh: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, dhayi: 2.5,
}
const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 }
/** "second" is an ordinal only before one of these ("the second time"); otherwise it is a unit of time. */
const ORDINAL_NOUN = /^(time|baar|attempt|reminder|request|payment|order|transaction|try|chance|one|message|account|step)$/
const HOUR_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
}
const MONTH_RE = Object.keys(MONTHS).sort((x, y) => y.length - x.length).join('|')

/** "a minute", "one moment", "ek pal": politeness, not a time frame (a wait of a minute or less where the operator typed one). */
const FILLER = /\b(?:a|an|one|just a|ek|bas ek|sirf ek)\s+(?:moment|second|sec|minute|min|pal)\b/g

const normNum = (int: string, dec: string | undefined) => {
  const i = int.replace(/,/g, '').replace(/^0+(?=\d)/, '')
  const d = (dec ?? '').replace(/0+$/, '')
  return Number(d ? `${i}.${d}` : i)
}
const round = (v: number) => Math.round(v * 1e6) / 1e6
const clockLabel = (v: number, pm: boolean | null | undefined) => `${Math.floor(v / 60) || 12}:${String(v % 60).padStart(2, '0')}${pm === true ? ' pm' : pm === false ? ' am' : ''}`
const label = (kind: QuantityKind, value: number, pm?: boolean | null) =>
  kind === 'clock' ? clockLabel(value, pm)
  : kind === 'date' ? `${value % 100}/${Math.floor(value / 100)}`
  : kind === 'time' ? `${round(value)} min`
  : kind === 'percent' ? `${round(value)}%`
  : kind === 'usdt' ? `${round(value)} usdt`
  : kind === 'times' ? `${round(value)}x`
  : String(round(value))

/** Morning or afternoon from the word right after or before a clock time ("9 baje shaam", "subah 9 baje"). */
const HALF_WORD = /^(subah|morning|savere|sawere|shaam|sham|raat|dopahar|evening|night|afternoon)$/
const dayHalf = (after: string, before: string): boolean | null => {
  const a = after.match(/^\s*(?:ke\s+|in\s+the\s+|at\s+)?([a-z]+)/)?.[1]
  const b = before.match(/([a-z]+)\s*$/)?.[1]
  const w = a && HALF_WORD.test(a) ? a : b && HALF_WORD.test(b) ? b : null
  return w === null ? null : !/^(subah|morning|savere|sawere)$/.test(w)
}

/** The numbers in a text, in order, with their units. Tokens and placeholders are not numbers. */
export function quantities(text: string): Quantity[] {
  let t = normalizeText(text).toLowerCase().replace(TOKEN_ANY, blankOut).replace(PLACEHOLDER, blankOut)
  const out: Quantity[] = []
  const push = (q: Omit<Quantity, 'label'> & { label?: string }) => out.push({ ...q, label: q.label ?? label(q.kind, q.value, q.pm) })
  const clock = (h: number, m: number, ap: string | undefined, at: number, end: number) => {
    let pm: boolean | null = ap ? ap.startsWith('p') : null
    if (h >= 13) { pm = true; h -= 12 } else if (h === 0) pm = false
    if (pm === null) pm = dayHalf(t.slice(end, end + 16), t.slice(Math.max(0, at - 16), at))
    push({ kind: 'clock', value: (h % 12) * 60 + m, pm, soft: false, at, end })
  }
  const AP = String.raw`(a\.?m\.?|p\.?m\.?)(?![a-z])`
  const AP_ANY = String.raw`(?:a\.?m\.?|p\.?m\.?)(?![a-z])`

  // Times of day: 10:30 (pm), 10.30 before am/pm/baje/tak or after "by"/"at", 6 pm, 9 baje, half past ten.
  t = t.replace(new RegExp(String.raw`(?<![\d.,:])([01]?\d|2[0-3]):([0-5]\d)(?:\s*${AP})?(?![\d:])`, 'g'), (m, h, mm, ap, at) => {
    clock(Number(h), Number(mm), ap, at, at + m.length); return blankOut(m)
  })
  t = t.replace(new RegExp(String.raw`(?<![\d.,:])([01]?\d|2[0-3])\.([0-5]\d)(?=\s*(?:${AP_ANY}|baje|bje|tak|o'?clock))(?:\s*${AP})?`, 'g'), (m, h, mm, ap, at) => {
    clock(Number(h), Number(mm), ap, at, at + m.length); return blankOut(m)
  })
  t = t.replace(/(?<=\b(?:by|at|till|until|before|after|from|around)\s+)([01]?\d|2[0-3])\.([0-5]\d)(?!\d|\.\d)/g, (m, h, mm, at) => {
    clock(Number(h), Number(mm), undefined, at, at + m.length); return blankOut(m)
  })
  t = t.replace(new RegExp(String.raw`(?<![\d.,:])(1[0-2]|0?\d|1[3-9]|2[0-3])\s*(?:${AP}|baje|bje|o'?clock)`, 'g'), (m, h, ap, at) => {
    clock(Number(h), 0, ap, at, at + m.length); return blankOut(m)
  })
  // PATCH N1: "subah 10 se raat 10 tak": an hour right after a part of the day is a time of day.
  t = t.replace(/(?<=\b(?:subah|savere|sawere|shaam|sham|raat|dopahar|morning|evening|night)\s+)(1[0-2]|0?[1-9])(?![\d:.])(?!\s*(?:min|mins|minute|minutes|ghante|ghanta|hours?|hrs?|din|days?|k\b|hazaa?r|lakh))/g, (m, h, at) => {
    clock(Number(h), 0, undefined, at, at + m.length); return blankOut(m)
  })
  t = t.replace(/\b(half|quarter)\s+past\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|1[0-2]|0?[1-9])\b/g, (m, part, h, at) => {
    clock(HOUR_WORDS[h] ?? Number(h), part === 'half' ? 30 : 15, undefined, at, at + m.length); return blankOut(m)
  })
  t = t.replace(/\bquarter\s+to\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|1[0-2]|0?[1-9])\b/g, (m, h, at) => {
    clock(((HOUR_WORDS[h] ?? Number(h)) + 11) % 12, 45, undefined, at, at + m.length); return blankOut(m)
  })

  // Dates: 18/10, 18/10/2026, 18-10-2026, 18 Oct, 18th October, October 18 ("5-10" without a year is a range).
  const date = (d: number, mo: number, at: number, end: number) => push({ kind: 'date', value: mo * 100 + d, soft: false, at, end })
  t = t.replace(/(?<![\d.,:/])(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}|\d{2}))?(?![\d/])/g, (m, d, mo, _y, at) => { date(Number(d), Number(mo), at, at + m.length); return blankOut(m) })
  t = t.replace(/(?<![\d.,:/-])(0?[1-9]|[12]\d|3[01])-(0?[1-9]|1[0-2])-(\d{4}|\d{2})(?![\d-])/g, (m, d, mo, _y, at) => { date(Number(d), Number(mo), at, at + m.length); return blankOut(m) })
  t = t.replace(new RegExp(String.raw`(?<![\d.,:])(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH_RE})\b`, 'g'), (m, d, mo, at) => { date(Number(d), MONTHS[mo], at, at + m.length); return blankOut(m) })
  t = t.replace(new RegExp(String.raw`\b(${MONTH_RE})\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b(?![\d:.])`, 'g'), (m, mo, d, at) => { date(Number(d), MONTHS[mo], at, at + m.length); return blankOut(m) })

  // Politeness: "a minute", "ek pal" (soft).
  t = t.replace(FILLER, (m, at) => {
    push({ kind: 'time', value: 1, soft: true, moment: true, at, end: at + m.length, label: 'a moment' }); return blankOut(m)
  })

  // Numbers written in digits, with a currency before them, a multiplier ("5k", "2 lakh") and a unit after them.
  interface Cand {
    q: Omit<Quantity, 'label'>
    /** Written in words; a unit (or currency or multiplier) was written; minutes per unit (times); a Hinglish word. */
    word: boolean
    unit: boolean
    factor: number
    hindi: boolean
  }
  const cands: Cand[] = []
  const DIG = new RegExp(String.raw`(₹|\brs\.?|\binr\b|\$|\busdt\b|\busd\b)?\s*(?<![\p{L}\d])(\d{1,3}(?:,\d{2,3})+(?!\d)|\d+)(?:\.(\d+))?`
    + String.raw`(?:\s*(k|thousands?|hazaa?r|hajar|lakhs?|lacs?|crores?|cr)(?![\p{L}])|(l)(?![\p{L}]))?(\s*\/-)?`
    + String.raw`(?:[\s-]*(?:(?:more|extra|additional|working|business|full|whole|calendar)\s+)?`
    + String.raw`(seconds?|secs?|minutes?|mins?|mnts?|minit|minat|hours?|hrs?|h|ghanta|ghante|ghanton|days?|din|weeks?|wks?|hafta|hafte|months?|mnths?|mahina|mahine|years?|yrs?|saal|%|percent|per\s?cent|pct|usdt|usdc|usd|dollars?|\$|rupees?|rupaye|rupay|rs\.?|inr|times?|baar|bar|st|nd|rd|th|मिनट|घंटा|घंटे|दिन|हफ्ता|हफ्ते|महीना|महीने)(?![\p{L}\p{M}]))?`, 'gu')
  for (const m of t.matchAll(DIG)) {
    const at = (m.index ?? 0) + m[0].indexOf(m[2], m[1] ? m[1].length : 0)
    const end = (m.index ?? 0) + m[0].length
    if (/\p{L}/u.test(t[end] ?? '')) continue // a digit inside a word: "4u", "2nite"
    let v = normNum(m[2], m[3])
    const mult = (m[4] ?? m[5])?.toLowerCase()
    if (mult) v = round(v * (MULT[mult] ?? MULT[mult.replace(/s$/, '')] ?? 1))
    const u = m[7] ? m[7].toLowerCase().replace(/\s+/g, '') : ''
    let kind: QuantityKind = 'num', factor = 1, soft = false
    let unit = !!(m[1] || m[6] || mult)
    if (/^(st|nd|rd|th)$/.test(u)) {
      kind = 'ordinal'; soft = true; unit = true
      // PATCH N2: "until the 20th", "19th ko", "by 5th": a day of the month (not "the 2nd time").
      const nextWord = t.slice(end).match(/^\s*([a-z]+)/)?.[1] ?? ''
      if (!ORDINAL_NOUN.test(nextWord) && (/\b(on|by|the|till|until|before|after|from)\s*$/.test(t.slice(Math.max(0, at - 8), at)) || /^\s*(tak|ko|tarikh|tareekh|date)\b/.test(t.slice(end)))) { kind = 'date'; soft = false }
    }
    else if (u) {
      const k = unitOf(u)
      if (k) { kind = k.kind; factor = k.factor; unit = true }
    }
    if (kind === 'num' && m[1] && /\$|usd/.test(m[1])) kind = 'usdt'
    cands.push({ q: { kind, value: round(v * factor), soft, bare: !unit, at, end }, word: false, unit, factor, hindi: false })
  }

  // Numbers written in words: compounds ("twenty-five"), teens and tens on their own, any number word before a unit or a
  // multiplier, "an hour", "half an hour", "an hour and a half", "a couple of minutes", ordinals and "both".
  const words = [...t.matchAll(/[a-z]+|[\u0900-\u097F]+/g)].map((m) => ({ w: m[0], at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
  // Words count together only when nothing but spaces or a hyphen stands between them ("kar do 5 minute": "do" is not 2).
  const joined = (x: number, y: number) => !!words[x] && !!words[y] && /^[\s-]*$/.test(t.slice(words[x].end, words[y].at))
  const unitAfter = (j: number): { kind: QuantityKind; factor: number; next: number } | null => {
    let k = j
    while (words[k] && BETWEEN.has(words[k].w) && joined(k - 1, k)) k++
    if (!joined(k - 1, k)) return null
    const u = unitOf(words[k]?.w)
    return u ? { ...u, next: k + 1 } : null
  }
  const andAHalf = (j: number) => words[j]?.w === 'and' && words[j + 1]?.w === 'a' && words[j + 2]?.w === 'half'
  const add = (kind: QuantityKind, value: number, at: number, endWord: number, o: Partial<Cand> & { soft?: boolean; bare?: boolean } = {}) =>
    cands.push({
      q: { kind, value: round(value), soft: o.soft ?? false, bare: o.bare ?? false, at, end: words[endWord].end },
      word: true, unit: o.unit ?? true, factor: o.factor ?? 1, hindi: o.hindi ?? false,
    })
  for (let i = 0; i < words.length; i++) {
    const { w, at } = words[i]
    const next = words[i + 1]?.w
    if ((w === 'a' || w === 'an') && next && /^(hour|day|week|month|year)$/.test(next)) {
      const u = unitOf(next)!
      const half = andAHalf(i + 2)
      add(u.kind, (half ? 1.5 : 1) * u.factor, at, i + (half ? 4 : 1), { factor: u.factor })
      i += half ? 4 : 1
      continue
    }
    if (w === 'half') {
      const j = next === 'an' || next === 'a' ? i + 2 : i + 1
      const u = unitOf(words[j]?.w)
      if (u && u.kind === 'time') { add('time', 0.5 * u.factor, at, j, { factor: u.factor }); i = j }
      else if (!u) add('num', 0.5, at, i) // PATCH N3: "half of {amount}"
      continue
    }
    if (w === 'couple') {
      const u = unitAfter(next === 'of' ? i + 2 : i + 1)
      if (u) { add(u.kind, 2 * u.factor, at, u.next - 1, { factor: u.factor }); i = u.next - 1 }
      continue
    }
    if (w === 'twice' || w === 'thrice') { add('times', w === 'twice' ? 2 : 3, at, i); continue }
    // PATCH N3: "double/triple the amount" (not "double-check"), "half of {amount}", "a few hundred rupees".
    if ((w === 'double' || w === 'triple') && !/^(check\w*|confirm\w*|click\w*|tap\w*)$/.test(next ?? '')) { add('times', w === 'double' ? 2 : 3, at, i); continue }
    if (/^(few|several|kuch|couple)$/.test(w)) {
      const k = next === 'of' ? i + 2 : i + 1
      if (/^(hundred|hundreds|thousand|thousands|lakh|lakhs|hazaar|hazar|sau|crore)$/.test(words[k]?.w ?? '')) { add('num', -1, at, k); i = k; continue }
    }
    if (w === 'both') { add('num', 2, at, i, { soft: true }); continue }
    if (w === 'pehla' || (w === 'pehli' && (next === 'baar' || next === 'bar'))) { add('ordinal', 1, at, i, { soft: true }); continue }
    if (w in ORDINAL && (w !== 'second' || ORDINAL_NOUN.test(next ?? ''))) { add('ordinal', ORDINAL[w], at, i, { soft: true }); continue }
    let value: number | null = null
    let j = i + 1
    // "kar do", "de do", "bhej do": an imperative, not the number two.
    if (w === 'do' && /^(kar|kr|de|bhej|daal|dal|le|ho|rakh|dikha|bata|bol|likh|send|check)$/.test(words[i - 1]?.w ?? '')) continue
    let hindi = w in HI_NUM
    // PATCH N3: "a thousand", "an hundred", "a lakh"; "sawa do" (2.25), "paune do" (1.75), "sawa ghanta" (1.25).
    const BIG_WORD = /^(hundred|thousand|lakh|lakhs|lac|crore|crores|hazaar|hazar|sau)$/
    let mod = 0
    if ((w === 'a' || w === 'an') && BIG_WORD.test(next ?? '')) value = 1
    else if ((w === 'sawa' || w === 'paune') && next) {
      const nx = words[i + 1].w
      const base = nx in HI_NUM ? HI_NUM[nx] : nx in EN_ONES ? EN_ONES[nx] : null
      if (base !== null && joined(i, i + 1)) { value = base + (w === 'sawa' ? 0.25 : -0.25); j = i + 2 } else { value = w === 'sawa' ? 1.25 : 0.75 }
      hindi = true; mod = 1
    }
    else if (w in EN_TENS) {
      value = EN_TENS[w]
      if (next && next in EN_ONES && EN_ONES[next] > 0 && EN_ONES[next] < 10 && joined(i, i + 1)) { value += EN_ONES[next]; j++ }
    } else if (w in EN_ONES) value = EN_ONES[w]
    else if (hindi) value = HI_NUM[w]
    if (value === null) continue
    let multiplied = false
    if (words[j]?.w === 'hundred' || words[j]?.w === 'sau') { value *= 100; j++; multiplied = true }
    // PATCH N3: a count before what it counts ("two installments", "three payments"); a Hindi fraction on its own.
    if (!hindi && value >= 2 && /^(installments?|instalments?|parts?|payments?|transactions?|transfers?|orders?|tranches?|splits?)$/.test(words[j]?.w ?? '') && joined(j - 1, j)) multiplied = true
    const frac = /^(aadha|adha|aadhe|dedh|derh|dhai|dhaai|dhayi)$/.test(w) || mod === 1
    const big = words[j]?.w
    if (big && big !== 'k' && big !== 'cr' && big !== 'l' && MULT[big]) { value = round(value * MULT[big]); j++; multiplied = true }
    if (andAHalf(j)) { value += 0.5; j += 3 }
    const u = unitAfter(j)
    if (u) {
      // "do din", "five more minutes", "one and a half hours", "five hundred rupees".
      const half = andAHalf(u.next)
      add(u.kind, (value + (half ? 0.5 : 0)) * u.factor, at, u.next - 1 + (half ? 3 : 0), { factor: u.factor, hindi })
      i = u.next - 1 + (half ? 3 : 0)
      continue
    }
    // Kept for a range ("two to three days"); dropped below when nothing gives it a unit.
    add('num', value, at, j - 1, { unit: multiplied || frac, bare: !multiplied, hindi }) // PATCH N3: a fraction counts, and still takes a range's unit
    i = j - 1
  }

  // Ranges: "5-10 min", "two to three days", "₹500 to 1000": the first number takes the unit of the second.
  cands.sort((x, y) => x.q.at - y.q.at)
  for (let i = 0; i + 1 < cands.length; i++) {
    const a = cands[i], b = cands[i + 1]
    if (!a.q.bare || b.q.bare || b.q.soft || b.q.kind === 'ordinal') continue
    if (!/^\s*(?:-|–|—|to|or|se|and|\/|ya)\s*$/.test(t.slice(a.q.end, b.q.at))) continue
    if (!['time', 'num', 'usdt', 'percent', 'times'].includes(b.q.kind)) continue
    a.q = { ...a.q, kind: b.q.kind, value: round(a.q.value * b.factor), bare: false }
    a.unit = true
  }
  // Clock ranges: "10 to 11 am" (the first number is an hour on the same dial).
  for (const c of cands) {
    if (!c.q.bare || c.word || !Number.isInteger(c.q.value) || c.q.value > 23) continue
    const after = out.find((q) => q.kind === 'clock' && q.at >= c.q.end && /^\s*(?:-|–|—|to|se|and)\s*$/.test(t.slice(c.q.end, q.at)))
    if (after) { c.q = { ...c.q, kind: 'clock', value: (c.q.value % 12) * 60, pm: c.q.value >= 13 ? true : after.pm ?? null, bare: false }; c.unit = true }
  }
  for (const c of cands) {
    // A number word with no unit: Hinglish ones are not numbers ("kar do"), English ones only from 13 up ("sixteen").
    if (c.word && !c.unit && (c.hindi || c.q.value < 13)) continue
    push(c.q)
  }
  return out.sort((x, y) => x.at - y.at)
}

/** The typed text names a crypto amount, so a bare number of it may be written "5,000 USDT". */
const CRYPTO_NAMED = /\b(usdt|usdc|usd|crypto|coins?|tokens?|dollars?)\b|\$/i

/** The typed quantity `x` and the rewrite's `y` name the same value; a time of day keeps its morning or evening exactly (an
 *  open "10 baje" may not become "10 PM", and "6 pm" may not lose its "pm"). */
const sameValue = (x: Quantity, y: Quantity) =>
  Math.abs(x.value - y.value) < 1e-6 && (x.kind !== 'clock' || (x.pm ?? null) === (y.pm ?? null))
const family = (k: QuantityKind) => (k === 'num' || k === 'usdt' ? 'amount' : k)

export interface NumberChanges { added: string[]; dropped: string[]; reordered: boolean }

/**
 * Numbers the rewrite added, numbers of the typed text it left out (counted, with their units), and whether two numbers of
 * one kind changed places. A unit may not change ("10 min" → "10 hours"), a currency the operator did not name never
 * matches ("5000" → "5000 USDT"), and a politeness "a moment" stands only for a wait of a minute or less.
 */
export function numberChanges(input: string, output: string): NumberChanges {
  const a = quantities(input), b = quantities(output)
  const cryptoNamed = CRYPTO_NAMED.test(normalizeText(input))
  const usedA = new Array<boolean>(a.length).fill(false)
  const pairB = new Array<number>(b.length).fill(-1)
  const exact = (x: Quantity, y: Quantity) => x.kind === y.kind && sameValue(x, y)
  const compatible = (x: Quantity, y: Quantity) =>
    (x.kind === 'num' && y.kind === 'usdt' && cryptoNamed && sameValue(x, y))
    || (y.moment === true && x.kind === 'time' && x.value <= 1)
    || (x.moment === true && y.kind === 'time' && y.value <= 1)
  for (const ok of [exact, compatible]) {
    b.forEach((q, bi) => {
      if (pairB[bi] >= 0) return
      const k = a.findIndex((x, i) => !usedA[i] && ok(x, q))
      if (k >= 0) { usedA[k] = true; pairB[bi] = k }
    })
  }
  const added = b.filter((q, bi) => pairB[bi] < 0 && !q.soft).map((q) => q.label)
  const dropped = a.filter((q, i) => !usedA[i] && !q.soft).map((q) => q.label)
  let reordered = false
  const last: Record<string, number> = {}
  b.forEach((q, bi) => {
    const k = pairB[bi]
    if (k < 0 || q.soft || a[k].soft) return
    const f = family(q.kind)
    if (last[f] !== undefined && k < last[f]) reordered = true
    last[f] = Math.max(last[f] ?? -1, k)
  })
  return { added, dropped, reordered }
}

const TIME_CLASSES: Array<[string, RegExp]> = [
  ['second', /\b(sec|secs|seconds?)\b/i],
  ['minute', /\b(min|mins|minute|minutes|mnt|mnts|minit|der)\b|मिनट/i],
  ['hour', /\b(hr|hrs|hour|hours|ghanta|ghante|ghanton)\b|घंट/i],
  ['day', /\b(day|days|din)\b|दिन/i],
  ['week', /\b(week|weeks|wk|wks|hafta|hafte)\b|हफ्त/i],
  ['month', /\b(month|months|mnth|mnths|mahina|mahine)\b|महीन/i],
  ['year', /\b(year|years|yr|yrs|saal)\b/i],
  ['today', /\b(today|tonight|aaj)\b|आज/i],
  ['tomorrow', /\b(tomorrow|kal)\b|कल/i],
  // PATCH N4: the day after tomorrow, weekdays, parts of the day, end of day, weekend.
  ['day_after', /\b(parso|parson|day\s+after\s+tomorrow)\b|परसों/i],
  ['weekday', /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar|itvaar|itwar)\b/i],
  ['morning', /\b(morning|subah|savere|sawere)\b/i],
  ['afternoon', /\b(afternoon|dopahar|noon)\b/i],
  ['meal', /\b(lunch|lunchtime|dinner|breakfast)\b/i],
  ['evening', /\b(evening|shaam|sham)\b/i],
  ['night', /\b(night|raat)\b/i],
  ['midnight', /\b(midnight)\b/i],
  ['overnight', /\b(overnight)\b/i],
  ['eod', /\b(eod|cob|end\s+of\s+(the\s+)?(day|business))\b/i],
  ['weekend', /\b(weekends?)\b/i],
  ['yesterday', /\b(yesterday|kal)\b|कल/i],
]
/** Not time frames: ordinals that look like units ("the second time" is not seconds) and wishes ("have a great day"). */
const NOT_A_TIME = /\b(the\s+|a\s+|my\s+|your\s+|this\s+)?second\s+(time|baar|attempt|reminder|request|payment|order|transaction|try|chance|one|message|account|step)\b|\b(good|great|nice|wonderful|lovely|blessed)\s+(day|evening|night|morning|afternoon|week|weekend)\b/gi

/**
 * Time frames in the rewrite the typed text has no word for ("within a few days" for "checking"). Times with a number are
 * left to numberChanges ("30 min" and "half an hour" are the same time), so only the words without one count here.
 */
export function timesAdded(input: string, output: string): string[] {
  const classes = (s: string) => {
    let x = normalizeText(s)
    for (const q of quantities(x)) if (q.kind === 'time' || q.kind === 'clock' || q.kind === 'date') x = x.slice(0, q.at) + ' '.repeat(q.end - q.at) + x.slice(q.end)
    x = x.replace(NOT_A_TIME, ' ').replace(FILLER, ' ').replace(/\bday\s+after\s+tomorrow\b/gi, 'parso').replace(/\bend\s+of\s+(the\s+)?(day|business)\b/gi, 'eod')
    return new Set(TIME_CLASSES.filter(([, re]) => re.test(x)).map(([c]) => c))
  }
  const a = classes(input)
  return [...classes(output)].filter((c) => !a.has(c))
}
