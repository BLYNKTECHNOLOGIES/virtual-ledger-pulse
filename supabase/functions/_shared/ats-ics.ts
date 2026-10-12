// ATS: calendar invites for interviews (iCalendar, RFC 5545, sent as iTIP REQUEST / CANCEL, RFC 5546), and
// reading a candidate's calendar reply ("Accepted", "Declined", "Maybe") to one. Owned by the ATS module.
// Times are written in UTC, so no time zone blocks are needed; calendar apps show them in local time (IST).
import { b64ToBytes, headerParam, type MimeLeaf, qpToBytes, utf8, walkMime } from './ats-mail.ts'

const te = new TextEncoder()
const SEQUENCE_EPOCH = Date.UTC(2026, 0, 1)

/** SEQUENCE for a new version of an event: seconds since 2026-01-01 UTC, so every later version is higher. */
export function icsSequence(now = Date.now()): number {
  return Math.max(0, Math.floor((now - SEQUENCE_EPOCH) / 1000))
}

/** The candidate's event for an interview. Interviewers get their own event each (see panelUid). */
export const INTERVIEW_UID_RE =
  /^ats-interview-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@[^\s@]+$/i

export function interviewUid(interviewId: string, domain: string): string {
  return `ats-interview-${interviewId.toLowerCase()}@${cleanDomain(domain)}`
}

export function panelUid(interviewId: string, panelId: string, domain: string): string {
  return `ats-interview-${interviewId.toLowerCase()}-${panelId.toLowerCase()}@${cleanDomain(domain)}`
}

function cleanDomain(domain: string): string {
  return (domain || 'blynkex.com').toLowerCase().replace(/[^a-z0-9.-]/g, '') || 'blynkex.com'
}

/** 2026-10-21T06:00:00.000Z -> 20261021T060000Z */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')
}

/** TEXT value escaping (RFC 5545 3.3.11). */
export function icsText(s: string): string {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/\r\n?|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

/** A quoted parameter value (CN): no double quotes or control characters allowed. */
function icsParam(s: string): string {
  // deno-lint-ignore no-control-regex
  return `"${String(s ?? '').replace(/["\u0000-\u001f\u007f]/g, '').trim().slice(0, 100)}"`
}

/** Folds one content line at 75 octets without splitting a character (RFC 5545 3.1). */
export function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = te.encode(ch).length
    if (bytes + n > 75) {
      out.push(cur)
      cur = ' ' + ch
      bytes = 1 + n
    } else {
      cur += ch
      bytes += n
    }
  }
  out.push(cur)
  return out.join('\r\n')
}

export interface IcsPerson {
  email: string
  name?: string | null
}

export interface IcsEvent {
  method: 'REQUEST' | 'CANCEL'
  uid: string
  sequence: number
  start: Date
  end: Date
  summary: string
  description?: string | null
  location?: string | null
  url?: string | null
  organizer: IcsPerson
  attendees: IcsPerson[]
  stamp?: Date
}

/** One VEVENT in a VCALENDAR with METHOD:REQUEST (new or changed) or METHOD:CANCEL. CRLF line endings. */
export function buildIcs(e: IcsEvent): string {
  const cancel = e.method === 'CANCEL'
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Blynk Virtual Technologies//ATS//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.method}`,
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${Math.max(0, Math.floor(e.sequence))}`,
    `DTSTAMP:${icsDate(e.stamp ?? new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.url && /^https:\/\/[^\s<>"]+$/.test(e.url) ? [`URL:${e.url}`] : []),
    `ORGANIZER;CN=${icsParam(e.organizer.name || e.organizer.email)}:mailto:${e.organizer.email}`,
    ...e.attendees.map((a) =>
      `ATTENDEE;CN=${icsParam(a.name || a.email)};CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;` +
      `RSVP=${cancel ? 'FALSE' : 'TRUE'}:mailto:${a.email}`
    ),
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------- replies

export interface CalendarReply {
  uid: string
  attendee: string
  partstat: string
}

/** Splits "NAME;P1=V1;P2=\"a:b\":value" into name, params and value, respecting quotes. */
function splitContentLine(line: string): { name: string; params: Map<string, string>; value: string } | null {
  let q = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') q = !q
    else if (c === ':' && !q) {
      colon = i
      break
    }
  }
  if (colon <= 0) return null
  const head = line.slice(0, colon)
  const parts: string[] = []
  let cur = ''
  q = false
  for (const c of head) {
    if (c === '"') q = !q
    if (c === ';' && !q) {
      parts.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  parts.push(cur)
  const params = new Map<string, string>()
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq <= 0) continue
    params.set(p.slice(0, eq).trim().toUpperCase(), p.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1'))
  }
  return { name: parts[0].trim().toUpperCase(), params, value: line.slice(colon + 1) }
}

/** Reads an iTIP REPLY: the event UID and the attendee's answer. Anything else returns null. */
export function parseCalendarReply(ics: string): CalendarReply | null {
  const lines = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  let method = ''
  let inEvent = false
  let uid = ''
  let attendee = ''
  let partstat = ''
  for (const raw of lines) {
    const cl = splitContentLine(raw.trim())
    if (!cl) continue
    const v = cl.value.trim()
    if (cl.name === 'BEGIN') {
      if (v.toUpperCase() === 'VEVENT' && !uid) inEvent = true
    } else if (cl.name === 'END') {
      if (v.toUpperCase() === 'VEVENT' && inEvent) break
    } else if (cl.name === 'METHOD' && !inEvent) {
      method = v.toUpperCase()
    } else if (inEvent && cl.name === 'UID') {
      uid = v
    } else if (inEvent && cl.name === 'ATTENDEE' && !attendee) {
      const ps = (cl.params.get('PARTSTAT') ?? '').toUpperCase()
      if (ps) {
        partstat = ps
        attendee = v.replace(/^mailto:/i, '').trim().toLowerCase()
      }
    }
  }
  if (method !== 'REPLY' || !uid || !attendee || !partstat) return null
  return { uid, attendee, partstat }
}

/** Finds a calendar reply (text/calendar part or an .ics attachment) in a raw email. */
export function findCalendarReply(raw: string): CalendarReply | null {
  const leaves: MimeLeaf[] = []
  walkMime(raw, 0, leaves)
  for (const leaf of leaves) {
    const ct = leaf.head['content-type'] ?? ''
    const type = ct.split(';')[0].trim().toLowerCase()
    const name = headerParam(leaf.head['content-disposition'] ?? '', 'filename') || headerParam(ct, 'name') || ''
    if (type !== 'text/calendar' && type !== 'application/ics' && !/\.ics$/i.test(name)) continue
    if (leaf.body.length > 400_000) continue
    const enc = (leaf.head['content-transfer-encoding'] ?? '7bit').toLowerCase().trim()
    let text: string
    try {
      text = enc === 'base64' ? utf8(b64ToBytes(leaf.body)) : enc === 'quoted-printable' ? utf8(qpToBytes(leaf.body)) : leaf.body
    } catch {
      continue
    }
    const reply = parseCalendarReply(text)
    if (reply) return reply
  }
  return null
}
