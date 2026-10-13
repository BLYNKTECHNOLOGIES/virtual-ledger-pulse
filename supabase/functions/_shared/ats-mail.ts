// deno-lint-ignore-file no-control-regex
// ATS candidate email helpers. Owned by the ATS module.
// - A read-only IMAP reader: EXAMINE (read-only select) and BODY.PEEK only, so it never marks mail as read,
//   moves it or deletes it. It reads headers first and downloads a full email only when it belongs to a candidate.
// - Header, address and attachment parsing, plain text to HTML, and the rule that decides which candidate an
//   email belongs to.
// The HR mailbox reader (imap-client.ts) is imported for its body parser and is not changed.
import { parseMessage } from './imap-client.ts'

export { parseMessage }

export const ATS_BUCKET = 'ats-files'
export const ATS_FILE_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp']
export const ATS_FILE_MAX_BYTES = 10 * 1024 * 1024
export const ATS_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const te = new TextEncoder()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ---------------------------------------------------------------- bytes

/** Maps each byte to one char (used for IMAP protocol lines, which are ASCII). */
export function bytesToBinary(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
  return s
}

export function bytesToBase64(b: Uint8Array): string {
  return btoa(bytesToBinary(b))
}

export function utf8(b: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(b)
}

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b))
  return Array.from(d).map((x) => x.toString(16).padStart(2, '0')).join('')
}

function binaryToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

export function b64ToBytes(s: string): Uint8Array {
  let clean = s.replace(/[^A-Za-z0-9+/]/g, '')
  const rem = clean.length % 4
  if (rem === 1) clean = clean.slice(0, -1)
  else if (rem) clean += '='.repeat(4 - rem)
  return binaryToBytes(atob(clean))
}

export function qpToBytes(s: string): Uint8Array {
  const unfolded = s.replace(/=\r?\n/g, '')
  const out: number[] = []
  for (let i = 0; i < unfolded.length; i++) {
    const c = unfolded.charCodeAt(i)
    if (c === 61 && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
      out.push(parseInt(unfolded.slice(i + 1, i + 3), 16))
      i += 2
    } else if (c < 128) {
      out.push(c)
    } else {
      out.push(...te.encode(unfolded[i]))
    }
  }
  return new Uint8Array(out)
}

function decodeCharset(bytes: Uint8Array, charset?: string | null): string {
  const label = (charset || 'utf-8').trim().replace(/^"|"$/g, '').split('*')[0].toLowerCase() || 'utf-8'
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }
}

/** RFC 2047 encoded words, e.g. =?UTF-8?B?...?= (adjacent words are joined). */
export function decodeMimeWords(s: string): string {
  if (!s || !s.includes('=?')) return s || ''
  return s
    .replace(/(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?)/g, '$1')
    .replace(/=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g, (m, cs: string, enc: string, txt: string) => {
      try {
        const bytes = enc.toUpperCase() === 'B' ? b64ToBytes(txt) : qpToBytes(txt.replace(/_/g, ' '))
        return decodeCharset(bytes, cs)
      } catch {
        return m
      }
    })
}

// ---------------------------------------------------------------- IMAP

export interface ImapConfig {
  host: string
  port: number
  user: string
  pass: string
  /** Only for local tests against a self-signed server. */
  caCerts?: string[]
}

export interface ImapResponse {
  text: string
  literals: Uint8Array[]
}

export interface ImapFetchItem {
  uid: number
  size: number | null
  internalDate: string | null
  sections: Record<string, Uint8Array>
}

export class ImapError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

const MAX_LITERAL = 40 * 1024 * 1024

/** Growable byte buffer: appends are amortised O(1), so large literals are not copied repeatedly. */
class ByteQueue {
  private data = new Uint8Array(1 << 16)
  private start = 0
  private end = 0

  get length(): number {
    return this.end - this.start
  }

  push(chunk: Uint8Array): void {
    if (this.end + chunk.length > this.data.length) {
      const live = this.end - this.start
      const needed = live + chunk.length
      if (needed <= this.data.length) {
        this.data.copyWithin(0, this.start, this.end)
      } else {
        let cap = this.data.length
        while (cap < needed) cap *= 2
        const next = new Uint8Array(cap)
        next.set(this.data.subarray(this.start, this.end))
        this.data = next
      }
      this.start = 0
      this.end = live
    }
    this.data.set(chunk, this.end)
    this.end += chunk.length
  }

  /** Offset (relative to the unread data) of the next CRLF at or after `from`, or -1. */
  indexOfCrlf(from: number): number {
    for (let i = this.start + from; i < this.end - 1; i++) {
      if (this.data[i] === 13 && this.data[i + 1] === 10) return i - this.start
    }
    return -1
  }

  take(n: number): Uint8Array {
    const out = this.data.slice(this.start, this.start + n)
    this.start += n
    return out
  }

  skip(n: number): void {
    this.start += n
  }
}

export function imapQuote(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** IMAP SEARCH date, e.g. 5-Oct-2026 (UTC calendar day). */
export function imapDate(d: Date): string {
  return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`
}

/** Compact UID set, e.g. [1,2,3,7,9,10] -> "1:3,7,9:10". */
export function uidSet(uids: number[]): string {
  const s = [...new Set(uids.filter((u) => Number.isInteger(u) && u > 0))].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < s.length; i++) {
    const a = s[i]
    let b = a
    while (i + 1 < s.length && s[i + 1] === b + 1) b = s[++i]
    parts.push(a === b ? String(a) : `${a}:${b}`)
  }
  return parts.join(',')
}

/** IMAP INTERNALDATE ("12-Oct-2026 09:00:00 +0530") to ISO, or null. */
export function parseInternalDate(s: string | null | undefined): string | null {
  const m = (s || '').match(/^\s*(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})\s*$/)
  if (!m) return null
  const mon = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase())
  if (mon < 0) return null
  const offset = (Number(m[8]) * 60 + Number(m[9])) * 60_000
  const local = Date.UTC(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]))
  return new Date(m[7] === '+' ? local - offset : local + offset).toISOString()
}

export class AtsImap {
  private conn: Deno.TlsConn | null = null
  private q = new ByteQueue()
  private tagNo = 0

  /** `deadline` is an absolute Date.now() value; every network wait stops there. */
  constructor(private readonly deadline: number) {}

  private async timed<T>(p: Promise<T>, ms = this.deadline - Date.now()): Promise<T> {
    if (ms <= 0) {
      p.catch(() => undefined)
      throw new ImapError('imap_timeout')
    }
    let timer: number | undefined
    const settled = p.then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e }))
    const timeout = new Promise<{ timeout: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timeout: true }), ms)
    })
    try {
      const r = await Promise.race([settled, timeout])
      if ('timeout' in r) throw new ImapError('imap_timeout')
      if (!r.ok) throw r.e
      return r.v
    } finally {
      clearTimeout(timer)
    }
  }

  async connect(cfg: ImapConfig): Promise<void> {
    try {
      this.conn = await this.timed(Deno.connectTls({
        hostname: cfg.host,
        port: cfg.port,
        ...(cfg.caCerts ? { caCerts: cfg.caCerts } : {}),
      }))
    } catch (e) {
      throw e instanceof ImapError ? e : new ImapError('imap_connect_failed')
    }
    const greet = await this.readResponse()
    if (!/^\* (OK|PREAUTH)\b/i.test(greet.text)) throw new ImapError('imap_greeting')
    try {
      await this.command(`LOGIN ${imapQuote(cfg.user)} ${imapQuote(cfg.pass)}`)
    } catch (e) {
      if (e instanceof ImapError && /^imap_(no|bad)_login$/.test(e.code)) throw new ImapError('imap_login_failed')
      throw e
    }
  }

  private async fill(): Promise<void> {
    if (!this.conn) throw new ImapError('imap_closed')
    const chunk = new Uint8Array(65536)
    let n: number | null
    try {
      n = await this.timed(this.conn.read(chunk))
    } catch (e) {
      throw e instanceof ImapError ? e : new ImapError('imap_read_failed')
    }
    if (n === null) throw new ImapError('imap_closed')
    this.q.push(chunk.subarray(0, n))
  }

  /** One server response: a line, with any {n} literals read by byte count and replaced by \u0000i\u0000. */
  async readResponse(): Promise<ImapResponse> {
    let text = ''
    const literals: Uint8Array[] = []
    let scanned = 0
    for (;;) {
      const idx = this.q.indexOfCrlf(scanned)
      if (idx < 0) {
        scanned = Math.max(0, this.q.length - 1)
        await this.fill()
        continue
      }
      const line = bytesToBinary(this.q.take(idx))
      this.q.skip(2)
      scanned = 0
      const lit = line.match(/\{(\d+)\}$/)
      if (lit) {
        const n = Number(lit[1])
        if (n > MAX_LITERAL) throw new ImapError('imap_literal_too_large')
        while (this.q.length < n) await this.fill()
        literals.push(this.q.take(n))
        text += line.slice(0, line.length - lit[0].length) + `\u0000${literals.length - 1}\u0000`
        continue
      }
      return { text: text + line, literals }
    }
  }

  async command(cmd: string): Promise<ImapResponse[]> {
    if (!this.conn) throw new ImapError('imap_closed')
    const tag = `T${String(++this.tagNo).padStart(4, '0')}`
    const words = cmd.split(' ')
    const verb = (words[0].toUpperCase() === 'UID' ? `uid_${words[1] ?? ''}` : words[0]).toLowerCase()
    const data = te.encode(`${tag} ${cmd}\r\n`)
    let off = 0
    try {
      while (off < data.length) off += await this.timed(this.conn.write(data.subarray(off)))
    } catch (e) {
      throw e instanceof ImapError ? e : new ImapError('imap_write_failed')
    }
    const untagged: ImapResponse[] = []
    for (;;) {
      const r = await this.readResponse()
      if (r.text.startsWith(tag + ' ')) {
        const status = r.text.slice(tag.length + 1)
        if (/^OK\b/i.test(status)) return untagged
        throw new ImapError(`imap_${/^NO\b/i.test(status) ? 'no' : 'bad'}_${verb}`)
      }
      if (r.text.startsWith('+')) throw new ImapError('imap_unexpected_continuation')
      untagged.push(r)
    }
  }

  /** Read-only select. */
  async examine(mailbox = 'INBOX'): Promise<{ uidValidity: number; uidNext: number; exists: number }> {
    const res = await this.command(`EXAMINE ${imapQuote(mailbox)}`)
    let uidValidity = 0
    let uidNext = 0
    let exists = 0
    for (const r of res) {
      const v = r.text.match(/\[UIDVALIDITY (\d+)\]/i)
      if (v) uidValidity = Number(v[1])
      const n = r.text.match(/\[UIDNEXT (\d+)\]/i)
      if (n) uidNext = Number(n[1])
      const e = r.text.match(/^\* (\d+) EXISTS\b/i)
      if (e) exists = Number(e[1])
    }
    if (!uidNext && exists > 0) {
      const last = await this.uidFetch([], 'UID', '*')
      uidNext = Math.max(0, ...[...last.keys()]) + 1
    }
    if (!uidNext) uidNext = 1
    return { uidValidity, uidNext, exists }
  }

  async uidSearch(criteria: string): Promise<number[]> {
    const res = await this.command(`UID SEARCH ${criteria}`)
    const out: number[] = []
    for (const r of res) {
      const m = r.text.match(/^\* SEARCH\b(.*)$/i)
      if (!m) continue
      for (const t of m[1].trim().split(/\s+/)) {
        const n = Number(t)
        if (Number.isInteger(n) && n > 0) out.push(n)
      }
    }
    return [...new Set(out)].sort((a, b) => a - b)
  }

  /** UID FETCH; `set` overrides the UID list (e.g. "*"). Sections are keyed by the text inside BODY[...]. */
  async uidFetch(uids: number[], items: string, set?: string): Promise<Map<number, ImapFetchItem>> {
    const out = new Map<number, ImapFetchItem>()
    const target = set ?? uidSet(uids)
    if (!target) return out
    const res = await this.command(`UID FETCH ${target} (${items})`)
    for (const r of res) {
      if (!/^\* \d+ FETCH \(/i.test(r.text)) continue
      const uidM = r.text.match(/[( ]UID (\d+)/i)
      if (!uidM) continue
      const uid = Number(uidM[1])
      const sizeM = r.text.match(/[( ]RFC822\.SIZE (\d+)/i)
      const dateM = r.text.match(/[( ]INTERNALDATE "([^"]+)"/i)
      const sections: Record<string, Uint8Array> = {}
      const re = /BODY\[([^\]]*)\](?:<\d+>)? (?:\u0000(\d+)\u0000|NIL|"((?:[^"\\]|\\.)*)")/gi
      let m: RegExpExecArray | null
      while ((m = re.exec(r.text))) {
        const key = m[1].toUpperCase().replace(/\s+/g, ' ').trim()
        if (m[2] !== undefined) sections[key] = r.literals[Number(m[2])]
        else if (m[3] !== undefined) sections[key] = te.encode(m[3].replace(/\\(.)/g, '$1'))
        else sections[key] = new Uint8Array(0)
      }
      const prev = out.get(uid)
      out.set(uid, {
        uid,
        size: sizeM ? Number(sizeM[1]) : prev?.size ?? null,
        internalDate: dateM ? parseInternalDate(dateM[1]) : prev?.internalDate ?? null,
        sections: { ...(prev?.sections ?? {}), ...sections },
      })
    }
    return out
  }

  async close(): Promise<void> {
    if (!this.conn) return
    try {
      const tag = `T${String(++this.tagNo).padStart(4, '0')}`
      await this.timed(this.conn.write(te.encode(`${tag} LOGOUT\r\n`)), 2000)
    } catch {
      /* ignore */
    }
    try {
      this.conn.close()
    } catch {
      /* ignore */
    }
    this.conn = null
  }
}

/** First section whose key starts with `prefix` ("" = the whole message). */
export function sectionOf(item: ImapFetchItem | undefined, prefix: string): Uint8Array | null {
  if (!item) return null
  for (const [k, v] of Object.entries(item.sections)) {
    if (prefix === '' ? k === '' : k.startsWith(prefix)) return v
  }
  return null
}

// ---------------------------------------------------------------- headers and addresses

export interface MailAddress {
  name: string | null
  address: string
}

export interface MailHeader {
  fromAddress: string | null
  fromName: string | null
  /** First Reply-To address, if any. */
  replyTo: string | null
  to: string[]
  cc: string[]
  subject: string | null
  date: string | null
  messageId: string | null
  inReplyTo: string[]
  references: string[]
  automatic: boolean
  nullSender: boolean
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/

export const isEmail = (s: string | null | undefined): boolean => !!s && s.length <= 254 && EMAIL_RE.test(s)

/** Splits an address list on commas that are outside quotes, angle brackets and comments. */
export function parseAddressList(value: string): MailAddress[] {
  const out: MailAddress[] = []
  const parts: string[] = []
  let cur = ''
  let inQuote = false
  let angle = 0
  let paren = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (inQuote && ch === '\\' && i + 1 < value.length) {
      cur += ch + value[++i]
      continue
    }
    if (ch === '"' && !paren) inQuote = !inQuote
    else if (!inQuote && ch === '(') paren++
    else if (!inQuote && ch === ')' && paren) paren--
    else if (!inQuote && !paren && ch === '<') angle++
    else if (!inQuote && !paren && ch === '>' && angle) angle--
    if ((ch === ',' || ch === ';') && !inQuote && !angle && !paren) {
      parts.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  parts.push(cur)
  for (const raw of parts) {
    const p = raw.trim()
    if (!p) continue
    const m = p.match(/<([^<>]*)>/)
    let addr = (m ? m[1] : p.replace(/\([^)]*\)/g, '')).trim().replace(/^mailto:/i, '')
    if (!isEmail(addr)) continue
    addr = addr.toLowerCase()
    let name = m ? p.slice(0, m.index).trim() : (p.match(/\(([^)]*)\)/)?.[1] ?? '')
    if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) name = name.slice(1, -1)
    name = decodeMimeWords(name.replace(/\\(.)/g, '$1')).replace(/\s+/g, ' ').trim()
    out.push({ name: name || null, address: addr })
  }
  return out
}

/** All <message-id> tokens in a header value. */
export function extractIds(value: string | null | undefined): string[] {
  return [...(value || '').matchAll(/<[^<>\s]+>/g)].map((m) => m[0])
}

function parseDateHeader(v: string | null): string | null {
  if (!v) return null
  const d = new Date(v.replace(/\([^)]*\)/g, '').trim())
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export function parseHeaderFields(input: Uint8Array | string): Record<string, string[]> {
  const s = typeof input === 'string' ? input : utf8(input)
  const end = s.search(/\r?\n\r?\n/)
  const block = (end >= 0 ? s.slice(0, end) : s).replace(/\r?\n([ \t])/g, '$1')
  const out: Record<string, string[]> = {}
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const k = line.slice(0, i).trim().toLowerCase()
    ;(out[k] ||= []).push(line.slice(i + 1).trim())
  }
  return out
}

export function parseMailHeader(input: Uint8Array | string): MailHeader {
  const h = parseHeaderFields(input)
  const first = (k: string) => h[k]?.[0] ?? null
  const from = parseAddressList(first('from') ?? '')[0] ?? null
  const subject = first('subject')
  const auto = (first('auto-submitted') ?? '').toLowerCase().trim()
  const precedence = (first('precedence') ?? '').toLowerCase().trim()
  const returnPath = first('return-path')
  return {
    fromAddress: from?.address ?? null,
    fromName: from?.name ?? null,
    replyTo: parseAddressList((h['reply-to'] ?? []).join(', '))[0]?.address ?? null,
    to: (h['to'] ?? []).flatMap((v) => parseAddressList(v)).map((a) => a.address),
    cc: (h['cc'] ?? []).flatMap((v) => parseAddressList(v)).map((a) => a.address),
    subject: subject === null ? null : decodeMimeWords(subject).replace(/\s+/g, ' ').trim(),
    date: parseDateHeader(first('date')),
    messageId: extractIds(first('message-id'))[0] ?? null,
    inReplyTo: extractIds(first('in-reply-to')),
    references: extractIds((h['references'] ?? []).join(' ')),
    automatic: (auto !== '' && auto !== 'no') || !!h['x-autoreply'] || !!h['x-autorespond'] ||
      ['auto_reply', 'auto-reply', 'bulk', 'junk', 'list'].includes(precedence),
    nullSender: returnPath !== null && /^<\s*>$/.test(returnPath.trim()),
  }
}

/** Header fields the reader asks for (keep in sync with parseMailHeader). */
export const HEADER_FIELDS =
  'FROM REPLY-TO TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES AUTO-SUBMITTED X-AUTOREPLY X-AUTORESPOND PRECEDENCE RETURN-PATH'

// ---------------------------------------------------------------- matching

/** Message-IDs the ATS puts on its own emails: <ats.{uuid}@domain>. */
export const OUR_ID_RE = /^<ats\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[^<>\s]+>$/i

/** Matching key, same rule as public.ats_email_key: lower-case, no "+tag"; Gmail also ignores dots. */
export function emailKey(a: string): string {
  const s = String(a ?? '').trim().toLowerCase()
  const at = s.indexOf('@')
  if (at < 0) return s
  const local = s.slice(0, at).split('@')[0]
  const domain = s.slice(at + 1).split('@')[0]
  const base = local.split('+')[0]
  return domain === 'gmail.com' || domain === 'googlemail.com'
    ? `${base.replace(/\./g, '')}@gmail.com`
    : `${base}@${domain}`
}

export function ourIds(ids: string[]): string[] {
  return [...new Set(ids.filter((i) => OUR_ID_RE.test(i)))]
}

export function findOurIdsInText(s: string): string[] {
  return [...new Set([...s.matchAll(/<ats\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[^<>\s]+>/gi)].map((m) => m[0]))]
}

export function ourMessageId(id: string, fromAddress: string): string {
  const domain = (fromAddress.split('@')[1] || 'blynkex.com').toLowerCase().replace(/[^a-z0-9.-]/g, '') || 'blynkex.com'
  return `<ats.${id.toLowerCase()}@${domain}>`
}

export function isBounce(h: MailHeader): boolean {
  const local = (h.fromAddress ?? '').split('@')[0]
  if (/^(mailer-daemon|postmaster|mail-daemon)$/i.test(local)) return true
  return h.nullSender &&
    /(undeliver|delivery status|delivery failure|failure notice|returned mail|could not be delivered|not delivered)/i.test(h.subject ?? '')
}

export interface ThreadRef {
  candidateId: string
  applicationId: string | null
}

export type Classification =
  | { kind: 'self' }
  | { kind: 'bounce'; refs: string[] }
  | { kind: 'match'; candidateId: string; applicationId: string | null; via: 'thread' | 'sender'; otherAddress?: boolean }
  | { kind: 'internal' }
  | { kind: 'none' }

export interface ClassifyContext {
  selfAddresses: Set<string>
  threadByRef: Map<string, ThreadRef>
  /** Candidate id by exact address (email_norm) and by matching key (email_key). */
  candidateByEmail: Map<string, string>
  candidateByKey?: Map<string, string>
  /** Our company domains (from hr_mailboxes.from_address), e.g. blynkex.com. */
  internalDomains?: Set<string>
  /** Sender addresses that belong to employees (hr_employees.email, lower-case). */
  employeeAddresses?: Set<string>
}

/**
 * Who an email belongs to:
 * 1. sent from one of our own mailboxes -> ignored (self);
 * 2. a delivery failure -> marks our original email as bounced;
 * 3. the sender (From, else Reply-To) is a candidate (exact address or matching key) -> that candidate
 *    (via 'sender'; via 'thread' with the thread's application when the thread points to the same candidate);
 * 4. otherwise a reply in a thread the ATS started (In-Reply-To / References):
 *    from our company domain or an employee's address -> internal (ignored; colleagues replying-all);
 *    from any other address -> the thread's candidate, marked as sent from another address;
 * 5. anything else is ignored and never stored.
 */
export function classifyMessage(h: MailHeader, ctx: ClassifyContext): Classification {
  const from = h.fromAddress
  if (from && ctx.selfAddresses.has(from)) return { kind: 'self' }
  if (isBounce(h)) return { kind: 'bounce', refs: ourIds([...h.inReplyTo, ...h.references]) }
  const refs = ourIds([...h.inReplyTo, ...[...h.references].reverse()])
  let thread: ThreadRef | null = null
  for (const r of refs) {
    const t = ctx.threadByRef.get(r)
    if (t) { thread = t; break }
  }
  const findCandidate = (a: string | null) => {
    if (!a) return undefined
    return ctx.candidateByEmail.get(a) ?? ctx.candidateByKey?.get(emailKey(a))
  }
  const byFrom = findCandidate(from)
  // Reply-To is not authenticated (SPF/DKIM/DMARC check From only): a Reply-To-only match is marked otherAddress.
  const sender = byFrom ?? (h.replyTo && !ctx.selfAddresses.has(h.replyTo) ? findCandidate(h.replyTo) : undefined)
  if (sender) {
    const other = byFrom ? {} : { otherAddress: true }
    if (thread && thread.candidateId === sender) return { kind: 'match', candidateId: sender, applicationId: thread.applicationId, via: 'thread', ...other }
    return { kind: 'match', candidateId: sender, applicationId: null, via: 'sender', ...other }
  }
  if (thread) {
    const domain = (from ?? '').split('@')[1] ?? ''
    if (from && (ctx.internalDomains?.has(domain) || ctx.employeeAddresses?.has(from))) return { kind: 'internal' }
    return { kind: 'match', candidateId: thread.candidateId, applicationId: thread.applicationId, via: 'thread', otherAddress: true }
  }
  return { kind: 'none' }
}

// ---------------------------------------------------------------- MIME attachments

export type AttachmentSkip = 'type_not_allowed' | 'too_large' | 'limit' | 'unreadable'

export interface MailAttachment {
  filename: string
  ext: string
  contentType: string
  size: number
  bytes: Uint8Array | null
  skipped: AttachmentSkip | null
}

export interface MimeLeaf {
  head: Record<string, string>
  body: string
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function splitHeadBody(s: string): [string, string] {
  if (/^\r?\n/.test(s)) return ['', s.replace(/^\r?\n/, '')]
  const m = s.match(/\r?\n\r?\n/)
  if (!m || m.index === undefined) return [s, '']
  return [s.slice(0, m.index), s.slice(m.index + m[0].length)]
}

function parseHead(head: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of head.replace(/\r?\n([ \t])/g, '$1').split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const k = line.slice(0, i).trim().toLowerCase()
    if (!(k in out)) out[k] = line.slice(i + 1).trim()
  }
  return out
}

function parseParams(v: string): Map<string, string> {
  const out = new Map<string, string>()
  const parts: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (q && c === '\\' && i + 1 < v.length) {
      cur += c + v[++i]
      continue
    }
    if (c === '"') q = !q
    if (c === ';' && !q) {
      parts.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  parts.push(cur)
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq <= 0) continue
    const k = p.slice(0, eq).trim().toLowerCase()
    let val = p.slice(eq + 1).trim()
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\(.)/g, '$1')
    out.set(k, val)
  }
  return out
}

function pctBytes(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      out.push(...te.encode(s[i]))
    }
  }
  return out
}

/** A Content-Type / Content-Disposition parameter, with RFC 2231 (name*=, name*0*=) and RFC 2047 support. */
export function headerParam(value: string, name: string): string | null {
  const p = parseParams(value)
  const n = name.toLowerCase()
  const ext = p.get(`${n}*`)
  if (ext !== undefined) {
    const m = ext.match(/^([^']*)'[^']*'(.*)$/)
    return m ? decodeCharset(new Uint8Array(pctBytes(m[2])), m[1] || 'utf-8') : decodeCharset(new Uint8Array(pctBytes(ext)), 'utf-8')
  }
  if (p.has(`${n}*0`) || p.has(`${n}*0*`)) {
    const bytes: number[] = []
    let charset = 'utf-8'
    for (let i = 0; i < 100; i++) {
      const plain = p.get(`${n}*${i}`)
      const enc = p.get(`${n}*${i}*`)
      if (plain === undefined && enc === undefined) break
      if (enc !== undefined) {
        let piece = enc
        if (i === 0) {
          const m = enc.match(/^([^']*)'[^']*'(.*)$/)
          if (m) {
            charset = m[1] || 'utf-8'
            piece = m[2]
          }
        }
        bytes.push(...pctBytes(piece))
      } else {
        bytes.push(...te.encode(plain!))
      }
    }
    return decodeCharset(new Uint8Array(bytes), charset)
  }
  const plain = p.get(n)
  return plain === undefined ? null : decodeMimeWords(plain)
}

function splitMultipart(body: string, boundary: string): string[] {
  const candidates = [...new Set([boundary.trim(), boundary.trim().replace(/^-+/, '')])].filter(Boolean)
  for (const cand of candidates) {
    const re = new RegExp(`(?:^|\\r?\\n)--${reEsc(cand)}(--)?[ \\t]*(?:\\r?\\n|$)`, 'g')
    const parts: string[] = []
    let last = -1
    let m: RegExpExecArray | null
    while ((m = re.exec(body))) {
      if (last >= 0) parts.push(body.slice(last, m.index))
      if (m[1]) {
        last = -1
        break
      }
      last = re.lastIndex
    }
    if (last >= 0) parts.push(body.slice(last))
    if (parts.length) return parts
  }
  return []
}

export function walkMime(s: string, depth: number, out: MimeLeaf[]): void {
  const [headStr, body] = splitHeadBody(s)
  const head = parseHead(headStr)
  const ct = head['content-type'] ?? 'text/plain'
  const type = ct.split(';')[0].trim().toLowerCase()
  if (type.startsWith('multipart/') && depth < 10) {
    const b = headerParam(ct, 'boundary')
    if (b) {
      const parts = splitMultipart(body, b)
      if (parts.length) {
        for (const p of parts) walkMime(p, depth + 1, out)
        return
      }
    }
  }
  out.push({ head, body })
}

export function cleanFilename(name: string): string {
  const n = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_').replace(/\s+/g, ' ').trim()
  return (n || 'attachment').slice(0, 200)
}

/**
 * Attachments in a raw email. Allowed types are decoded (up to `maxCount`, each up to `maxBytes`);
 * other files are listed with the reason they were not kept. Embedded signature images are ignored.
 */
export function extractAttachments(
  raw: string,
  opts: { maxBytes?: number; maxCount?: number; allowedExt?: string[] } = {},
): MailAttachment[] {
  const maxBytes = opts.maxBytes ?? ATS_FILE_MAX_BYTES
  const maxCount = opts.maxCount ?? 5
  const allowed = opts.allowedExt ?? ATS_FILE_EXT
  const leaves: MimeLeaf[] = []
  walkMime(raw, 0, leaves)
  const out: MailAttachment[] = []
  let kept = 0
  for (const leaf of leaves) {
    const ct = leaf.head['content-type'] ?? 'text/plain'
    const cd = leaf.head['content-disposition'] ?? ''
    const type = ct.split(';')[0].trim().toLowerCase()
    const disp = cd.split(';')[0].trim().toLowerCase()
    let filename = (cd ? headerParam(cd, 'filename') : null) || headerParam(ct, 'name')
    if (!filename && disp !== 'attachment') continue
    if (type.startsWith('image/') && disp !== 'attachment' && leaf.head['content-id']) continue
    if (!filename && type === 'message/rfc822') filename = 'forwarded-message.eml'
    filename = cleanFilename(filename || 'attachment')
    const ext = (filename.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? '').toLowerCase()
    const enc = (leaf.head['content-transfer-encoding'] ?? '7bit').toLowerCase().trim()
    const approx = enc === 'base64'
      ? Math.floor((leaf.body.length - (leaf.body.match(/[^A-Za-z0-9+/]/g)?.length ?? 0)) * 3 / 4)
      : leaf.body.length
    const base = { filename, ext, contentType: ATS_MIME[ext] ?? (type || 'application/octet-stream'), size: approx, bytes: null }
    if (!allowed.includes(ext)) {
      out.push({ ...base, skipped: 'type_not_allowed' })
      continue
    }
    if (approx > maxBytes * 1.02) {
      out.push({ ...base, skipped: 'too_large' })
      continue
    }
    if (kept >= maxCount) {
      out.push({ ...base, skipped: 'limit' })
      continue
    }
    let bytes: Uint8Array
    try {
      bytes = enc === 'base64' ? b64ToBytes(leaf.body) : enc === 'quoted-printable' ? qpToBytes(leaf.body) : te.encode(leaf.body)
    } catch {
      out.push({ ...base, skipped: 'unreadable' })
      continue
    }
    if (!bytes.length) {
      out.push({ ...base, size: 0, skipped: 'unreadable' })
      continue
    }
    if (bytes.length > maxBytes) {
      out.push({ ...base, size: bytes.length, skipped: 'too_large' })
      continue
    }
    kept++
    out.push({ ...base, size: bytes.length, bytes, skipped: null })
  }
  return out
}

// ---------------------------------------------------------------- text and HTML

/** Plain text to simple HTML: escaped, links made clickable, blank lines become paragraphs. */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const link = (s: string) =>
    s.replace(/\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]']/g, (u) => `<a href="${u}" style="color:#0b6bcb;">${u}</a>`)
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p style="margin:0 0 12px;">${link(esc(p)).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d{1,7});/g, (m, n) => {
      const c = Number(n)
      return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m
    })
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Short ASCII file stem for storage paths. */
export function safeStem(name: string): string {
  const base = name.replace(/\.[^.]*$/, '').toLowerCase()
  return base.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file'
}

/** IST timestamp yyyyMMdd-HHmmss (same shape as uploads from the ATS screens). */
export function istStamp(d = new Date()): string {
  const ist = new Date(d.getTime() + 330 * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${ist.getUTCFullYear()}${p(ist.getUTCMonth() + 1)}${p(ist.getUTCDate())}-${p(ist.getUTCHours())}${p(ist.getUTCMinutes())}${p(ist.getUTCSeconds())}`
}

/** Error codes that are safe to store and show (no addresses, names or server text). */
export function errorCode(e: unknown): string {
  if (e instanceof ImapError) return e.code
  const msg = e instanceof Error ? e.message : String(e)
  if (/timed? ?out/i.test(msg)) return 'timeout'
  if (/auth|credential|password|535|534/i.test(msg)) return 'smtp_auth_failed'
  return 'unexpected_error'
}
