// deno-lint-ignore-file no-explicit-any
// ATS: picks up candidate emails from the HR mailbox and files them on the candidate, and sends queued
// automatic emails (acknowledgements and interview reminders, which it queues first when they are due).
// A candidate's calendar reply to an interview invite ("Accepted" / "Declined" / "Maybe") is recorded on the interview.
// Read-only towards the mailbox (EXAMINE + BODY.PEEK): nothing is marked read, moved or deleted, and the
// HR mailbox screens (hr_mailboxes.imap_last_uid, hr_mail_messages) are never touched; the ATS keeps its own
// position in ats_mail_state. Only emails that belong to a candidate are downloaded and stored.
// Called every 5 minutes by pg_cron (x-scheduler-secret) and by "Check now" in the ATS (HR staff only).
// Body { action: "candidate", candidateId, days } looks back for one candidate's older emails (HR staff only).
// index.ts only starts the server; the work is here so it can be tested without a server.
import { requireCaller } from '../_shared/require-caller.ts'
import {
  AtsImap, ATS_BUCKET, HEADER_FIELDS, ImapError, classifyMessage, errorCode, extractAttachments, findOurIdsInText, htmlToText,
  imapDate, imapQuote, istStamp, ourIds, parseMailHeader, parseMessage, safeStem, sectionOf, sha256Hex, utf8,
  type ImapFetchItem, type MailAttachment, type MailHeader, type ThreadRef,
} from '../_shared/ats-mail.ts'
import { sendQueued } from '../_shared/ats-mail-deliver.ts'
import { type CalendarReply, findCalendarReply, INTERVIEW_UID_RE } from '../_shared/ats-ics.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-scheduler-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const RUN_MS = 50_000 // stop well inside the lease (120 s) and the function time limit
const QUEUE_MS = 20_000 // time allowed for sending queued automatic emails at the start of a run
const HEADER_BATCH = 100 // headers fetched per IMAP round trip
const MAX_SCAN = 500 // emails looked at per run (headers only)
const MAX_FULL = 15 // candidate emails downloaded per run
const MAX_LOOKBACK = 50 // emails looked at by "find older emails" for one candidate
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024
const UNREADABLE_NOTE = 'The content of this email could not be shown in the ATS. Open it in the HR mailbox.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class SyncError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

interface Stats {
  scanned: number
  matched: number
  stored: number
  duplicates: number
  attachments_saved: number
  attachments_skipped: number
  bounces: number
  ignored_own: number
  gave_up: number
  pending: number
  queued_sent: number
  queued_failed: number
  queued_retrying: number
  reminders_queued: number
  rsvps: number
}

const newStats = (): Stats => ({
  scanned: 0, matched: 0, stored: 0, duplicates: 0, attachments_saved: 0, attachments_skipped: 0,
  bounces: 0, ignored_own: 0, gave_up: 0, pending: 0, queued_sent: 0, queued_failed: 0, queued_retrying: 0,
  reminders_queued: 0, rsvps: 0,
})

export async function handleSync(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const caller = await requireCaller(req, corsHeaders)
  if (!caller.ok) return caller.response
  const admin = caller.admin as any
  if (caller.kind === 'user') {
    const { data: staff } = await admin.rpc('hr_is_hr_staff', { _user_id: caller.userId })
    if (!staff) return json({ error: 'forbidden' }, 403)
  }
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    /* optional body */
  }

  if (body?.action === 'candidate') {
    if (caller.kind === 'scheduler') return json({ error: 'forbidden' }, 403)
    const candidateId = String(body.candidateId ?? '')
    if (!UUID_RE.test(candidateId)) return json({ error: 'invalid', field: 'candidateId' }, 400)
    const days = Math.min(365, Math.max(1, Math.floor(Number(body.days ?? 90)) || 90))
    const result = await runCandidateLookback(admin, { candidateId, days, source: caller.kind })
    return json(result, result.error === 'state_unavailable' ? 500 : 200)
  }

  const result = await runMailSync(admin, { source: caller.kind })
  return json(result, result.error === 'state_unavailable' ? 500 : 200)
}

export interface SyncOptions {
  source: string
  /** Only for local tests against self-signed IMAP / SMTP servers. */
  imapCaCerts?: string[]
  smtpPort?: number
}

interface OpenedMailbox {
  mailboxId: string
  self: Set<string>
}

/** Mailbox chosen in ATS settings, checked and signed in (read-only). */
async function openMailbox(admin: any, mailboxId: string, imap: AtsImap, caCerts?: string[]): Promise<OpenedMailbox> {
  const { data: mailboxes, error: mbErr } = await admin.from('hr_mailboxes')
    .select('id, from_address, imap_host, imap_port, imap_enabled, imap_user_secret, imap_pass_secret, is_active')
  if (mbErr) throw new SyncError('mailbox_unavailable')
  const mailbox = (mailboxes ?? []).find((m: any) => m.id === mailboxId && m.is_active)
  if (!mailbox) throw new SyncError('mailbox_unavailable')
  if (!mailbox.imap_enabled || !mailbox.imap_host) throw new SyncError('receiving_off')
  // Same credential lookup as the HR mailbox reader (secret names are stored on hr_mailboxes).
  const user = (mailbox.imap_user_secret ? Deno.env.get(mailbox.imap_user_secret) : Deno.env.get('HR_SMTP_USER'))?.trim()
  const pass = (mailbox.imap_pass_secret ? Deno.env.get(mailbox.imap_pass_secret) : Deno.env.get('HR_SMTP_PASS'))
    ?.replace(/\s+/g, '')
  if (!user || !pass) throw new SyncError('mailbox_credentials_missing')
  const self = new Set<string>([
    user.toLowerCase(),
    ...(mailboxes ?? []).map((m: any) => String(m.from_address || '').trim().toLowerCase()).filter(Boolean),
  ])
  await imap.connect({ host: mailbox.imap_host, port: mailbox.imap_port || 993, user, pass, caCerts })
  return { mailboxId, self }
}

export async function runMailSync(admin: any, opts: SyncOptions): Promise<Record<string, unknown>> {
  const started = Date.now()
  const deadline = started + RUN_MS

  const { data: settings } = await admin.from('ats_settings')
    .select('mail_enabled, mail_mailbox_id, mail_backfill_days').eq('id', true).maybeSingle()
  if (!settings?.mail_enabled || !settings.mail_mailbox_id) return { ok: true, skipped: 'disabled' }
  const mailboxId: string = settings.mail_mailbox_id

  const owner = crypto.randomUUID()
  const { data: claimed, error: claimErr } = await admin.rpc('ats_mail_claim', {
    p_mailbox_id: mailboxId, p_owner: owner, p_seconds: 120,
  })
  if (claimErr) return { ok: false, error: 'state_unavailable' }
  if (!claimed) return { ok: true, skipped: 'busy' }

  // An email left in "sending" by an interrupted run is marked failed so HR can resend it.
  await admin.from('ats_messages').update({ status: 'failed', error: 'interrupted' })
    .eq('direction', 'outbound').eq('status', 'sending').lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString())

  const stats = newStats()
  // Interview reminders that are due are queued, then automatic emails that are due go out first; they do not
  // depend on reading the mailbox.
  const { data: reminders, error: remErr } = await admin.rpc('ats_queue_interview_reminders')
  if (remErr) console.error('ats-mail-sync reminders failed', remErr.code ?? 'error')
  stats.reminders_queued = Number(reminders ?? 0)
  try {
    const q = await sendQueued(admin, { deadline: started + QUEUE_MS, port: opts.smtpPort })
    stats.queued_sent = q.sent
    stats.queued_failed = q.failed
    stats.queued_retrying = q.retrying
  } catch (e) {
    console.error('ats-mail-sync queue failed', errorCode(e))
  }

  let lastUid = Number(claimed.last_uid ?? 0)
  let uidValidity: number | null = claimed.uid_validity ? Number(claimed.uid_validity) : null
  let startedAt: string | null = claimed.started_at ?? null
  // A candidate email that failed to save in the previous run is retried once, then skipped.
  const retryUid = Number(claimed.last_stats?.retry_uid ?? 0) || null
  let failedUid: number | null = null
  let errCode: string | null = null
  const imap = new AtsImap(deadline)

  try {
    const { self } = await openMailbox(admin, mailboxId, imap, opts.imapCaCerts)
    const box = await imap.examine('INBOX')
    if (!uidValidity || uidValidity !== box.uidValidity) {
      // First run, or the mailbox was rebuilt: start from the look-back window, never from all old mail.
      let start = Math.max(0, box.uidNext - 1)
      const days = Number(settings.mail_backfill_days ?? 0)
      if (days > 0) {
        const since = await imap.uidSearch(`SINCE ${imapDate(new Date(Date.now() - days * 86_400_000))}`)
        if (since.length) start = Math.min(start, since[0] - 1)
      }
      lastUid = start
      uidValidity = box.uidValidity
      startedAt = new Date().toISOString()
    }

    const pending = (await imap.uidSearch(`UID ${lastUid + 1}:*`)).filter((u) => u > lastUid)
    const queue = pending.slice(0, MAX_SCAN)
    let downloads = 0
    let stop = false

    for (let i = 0; i < queue.length && !stop; i += HEADER_BATCH) {
      if (Date.now() > deadline - 10_000) break
      const chunk = queue.slice(i, i + HEADER_BATCH)
      const { fetched, headers } = await fetchHeaders(imap, chunk)
      const ctx = await lookupContext(admin, [...headers.values()], self)

      for (const uid of chunk) {
        if (Date.now() > deadline - 6_000) {
          stop = true
          break
        }
        const h = headers.get(uid)
        if (!h) {
          lastUid = uid // removed from the mailbox meanwhile
          continue
        }
        stats.scanned++
        const c = classifyMessage(h, ctx)
        if (c.kind === 'self') {
          stats.ignored_own++
          lastUid = uid
          continue
        }
        if (c.kind === 'none') {
          lastUid = uid
          continue
        }
        if (c.kind === 'bounce') {
          let refs = c.refs
          if (!refs.length && (fetched.get(uid)?.size ?? 0) <= 2 * 1024 * 1024) {
            const body = sectionOf((await imap.uidFetch([uid], 'UID BODY.PEEK[]')).get(uid), '')
            if (body) refs = findOurIdsInText(utf8(body))
          }
          if (refs.length) {
            const { data: hit } = await admin.from('ats_messages')
              .update({ status: 'bounced', error: 'bounced' })
              .in('message_id', refs).eq('direction', 'outbound').eq('status', 'sent').select('id')
            stats.bounces += hit?.length ?? 0
          }
          lastUid = uid
          continue
        }
        stats.matched++
        if (downloads >= MAX_FULL) {
          stop = true
          break
        }
        downloads++
        const outcome = await storeOne(admin, imap, uid, uidValidity!, h, fetched.get(uid)!, c, mailboxId, stats)
        if (outcome === 'retry') {
          if (retryUid === uid) {
            stats.gave_up++ // failed twice in a row: skip it so newer emails are not held up
            lastUid = uid
            continue
          }
          failedUid = uid
          stop = true
          break
        }
        lastUid = uid
      }
    }
    stats.pending = pending.filter((u) => u > lastUid).length
  } catch (e) {
    errCode = e instanceof SyncError ? e.code : errorCode(e)
    console.error('ats-mail-sync failed', errCode)
  } finally {
    await imap.close()
  }

  const now = new Date().toISOString()
  await admin.from('ats_mail_state').update({
    uid_validity: uidValidity,
    last_uid: lastUid,
    started_at: startedAt,
    ...(errCode ? { last_error: errCode, last_error_at: now } : { last_ok_at: now, last_error: null, last_error_at: null }),
    last_stats: { ...stats, retry_uid: failedUid, ms: Date.now() - started, source: opts.source },
    lease_until: null,
    lease_owner: null,
    updated_at: now,
  }).eq('mailbox_id', mailboxId).eq('lease_owner', owner)

  console.log('ats-mail-sync', JSON.stringify({ ok: !errCode, error: errCode, ...stats, ms: Date.now() - started }))
  return { ok: !errCode, error: errCode, ...stats }
}

/**
 * "Find older emails" for one candidate: looks back `days` for emails from the candidate's address and files
 * any that are not in the ATS yet. Does not move the regular reading position.
 */
export async function runCandidateLookback(
  admin: any, opts: { candidateId: string; days: number; source: string; imapCaCerts?: string[] },
): Promise<Record<string, unknown>> {
  const started = Date.now()
  const { data: settings } = await admin.from('ats_settings').select('mail_enabled, mail_mailbox_id').eq('id', true).maybeSingle()
  if (!settings?.mail_enabled || !settings.mail_mailbox_id) return { ok: true, skipped: 'disabled' }
  const mailboxId: string = settings.mail_mailbox_id
  const { data: cand } = await admin.from('ats_candidates').select('id, email_norm, merged_into_id, anonymized_at')
    .eq('id', opts.candidateId).maybeSingle()
  if (!cand) return { ok: false, error: 'not_found' }
  if (!cand.email_norm || cand.merged_into_id || cand.anonymized_at) return { ok: false, error: 'no_email' }

  const owner = crypto.randomUUID()
  const { data: claimed, error: claimErr } = await admin.rpc('ats_mail_claim', {
    p_mailbox_id: mailboxId, p_owner: owner, p_seconds: 120,
  })
  if (claimErr) return { ok: false, error: 'state_unavailable' }
  if (!claimed) return { ok: true, skipped: 'busy' }

  const stats = newStats()
  let errCode: string | null = null
  const imap = new AtsImap(started + RUN_MS)
  try {
    const { self } = await openMailbox(admin, mailboxId, imap, opts.imapCaCerts)
    const box = await imap.examine('INBOX')
    const since = imapDate(new Date(Date.now() - opts.days * 86_400_000))
    const uids = (await imap.uidSearch(`SINCE ${since} FROM ${imapQuote(cand.email_norm)}`)).slice(-MAX_LOOKBACK)
    const { fetched, headers } = await fetchHeaders(imap, uids)
    // Only this candidate's own address counts here (SEARCH FROM also matches longer addresses).
    const ctx = { selfAddresses: self, threadByRef: new Map<string, ThreadRef>(), candidateByEmail: new Map([[cand.email_norm, cand.id]]) }
    for (const uid of uids) {
      if (Date.now() > started + RUN_MS - 6_000) break
      const h = headers.get(uid)
      if (!h) continue
      stats.scanned++
      const c = classifyMessage(h, ctx)
      if (c.kind !== 'match') continue
      stats.matched++
      const outcome = await storeOne(admin, imap, uid, box.uidValidity, h, fetched.get(uid)!, c, mailboxId, stats)
      if (outcome === 'retry') stats.gave_up++
    }
  } catch (e) {
    errCode = e instanceof SyncError ? e.code : errorCode(e)
    console.error('ats-mail-sync lookback failed', errCode)
  } finally {
    await imap.close()
  }
  await admin.from('ats_mail_state').update({ lease_until: null, lease_owner: null, updated_at: new Date().toISOString() })
    .eq('mailbox_id', mailboxId).eq('lease_owner', owner)
  console.log('ats-mail-sync lookback', JSON.stringify({ ok: !errCode, error: errCode, ...stats, ms: Date.now() - started }))
  return { ok: !errCode, error: errCode, ...stats }
}

async function fetchHeaders(imap: AtsImap, uids: number[]) {
  const fetched = await imap.uidFetch(uids, `UID RFC822.SIZE INTERNALDATE BODY.PEEK[HEADER.FIELDS (${HEADER_FIELDS})]`)
  const headers = new Map<number, MailHeader>()
  for (const uid of uids) {
    const raw = sectionOf(fetched.get(uid), 'HEADER.FIELDS')
    if (raw) headers.set(uid, parseMailHeader(raw))
  }
  return { fetched, headers }
}

/** Which of these emails continue an ATS thread, and which senders are candidates (batched lookups). */
async function lookupContext(admin: any, headers: MailHeader[], self: Set<string>) {
  const threadByRef = new Map<string, ThreadRef>()
  const candidateByEmail = new Map<string, string>()
  const refs = [...new Set(headers.flatMap((h) => ourIds([...h.inReplyTo, ...h.references])))]
  for (let i = 0; i < refs.length; i += 50) {
    const { data, error } = await admin.from('ats_messages')
      .select('message_id, candidate_id, application_id')
      .eq('direction', 'outbound').in('message_id', refs.slice(i, i + 50))
    if (error) throw new SyncError('lookup_failed')
    for (const r of data ?? []) threadByRef.set(r.message_id, { candidateId: r.candidate_id, applicationId: r.application_id })
  }
  const emails = [...new Set(headers.map((h) => h.fromAddress).filter((a): a is string => !!a && !self.has(a)))]
  for (let i = 0; i < emails.length; i += 100) {
    const { data, error } = await admin.from('ats_candidates')
      .select('id, email_norm')
      .in('email_norm', emails.slice(i, i + 100))
      .is('merged_into_id', null).is('anonymized_at', null)
    if (error) throw new SyncError('lookup_failed')
    for (const r of data ?? []) candidateByEmail.set(r.email_norm, r.id)
  }
  return { selfAddresses: self, threadByRef, candidateByEmail }
}

/** Downloads one candidate email, saves allowed attachments to ats-files and stores everything in one call. */
async function storeOne(
  admin: any, imap: AtsImap, uid: number, uidValidity: number, h: MailHeader, meta: ImapFetchItem,
  c: { candidateId: string; applicationId: string | null }, mailboxId: string, stats: Stats,
): Promise<'stored' | 'duplicate' | 'skipped' | 'retry'> {
  const messageId = h.messageId ?? `<ats-noid.${uidValidity}.${uid}@${mailboxId}>`
  const { data: existing, error: exErr } = await admin.from('ats_messages').select('id').eq('message_id', messageId).maybeSingle()
  if (exErr) return 'retry'
  if (existing) {
    stats.duplicates++
    return 'duplicate'
  }

  let raw: string | null = null
  let unreadable = false
  if ((meta.size ?? 0) > MAX_MESSAGE_BYTES) {
    unreadable = true
  } else {
    try {
      const body = sectionOf((await imap.uidFetch([uid], 'UID BODY.PEEK[]')).get(uid), '')
      if (body) raw = utf8(body)
      else unreadable = true
    } catch (e) {
      // The server refused this one email: keep its headers. Connection problems stop the run instead.
      if (e instanceof ImapError && /^imap_(no|bad)_|^imap_literal_too_large$/.test(e.code)) unreadable = true
      else throw e
    }
  }

  let text: string | null = null
  let html: string | null = null
  let attachments: MailAttachment[] = []
  if (raw) {
    try {
      const p = parseMessage(raw)
      text = p.text
      html = p.html
    } catch {
      unreadable = true
    }
    try {
      attachments = extractAttachments(raw)
    } catch {
      attachments = []
    }
  }
  if (!text && html) text = htmlToText(html)
  text = (text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 200_000)
  if (!text && unreadable) text = UNREADABLE_NOTE
  if (html && html.length > 1_000_000) html = null

  const { data: known, error: fErr } = await admin.from('ats_files').select('id, sha256, kind').eq('candidate_id', c.candidateId)
  if (fErr) return 'retry'
  const bySha = new Map<string, string>()
  for (const f of known ?? []) if (f.sha256) bySha.set(f.sha256, f.id)
  let hasResume = (known ?? []).some((f: any) => f.kind === 'resume')
  const seen = new Set<string>()
  const files: Record<string, unknown>[] = []
  const listed: Record<string, unknown>[] = []
  const uploaded: string[] = []
  const stamp = istStamp()

  for (const a of attachments) {
    if (a.ext === 'ics') continue // calendar data (an invite or a reply to one) is read separately, not kept as a file
    if (a.skipped || !a.bytes) {
      listed.push({ name: a.filename, mime: a.contentType, size: a.size, skipped: a.skipped ?? 'unreadable' })
      stats.attachments_skipped++
      continue
    }
    const sha = await sha256Hex(a.bytes)
    if (bySha.has(sha) || seen.has(sha)) {
      listed.push({ name: a.filename, mime: a.contentType, size: a.size, duplicate: true, ...(bySha.has(sha) ? { file_id: bySha.get(sha) } : {}) })
      continue
    }
    seen.add(sha)
    const path = `candidates/${c.candidateId}/${stamp}-mail-${crypto.randomUUID().slice(0, 6)}-${safeStem(a.filename)}.${a.ext}`.toLowerCase()
    const up = await admin.storage.from(ATS_BUCKET).upload(path, a.bytes, { contentType: a.contentType, upsert: false })
    if (up.error) {
      listed.push({ name: a.filename, mime: a.contentType, size: a.size, skipped: 'upload_failed' })
      stats.attachments_skipped++
      continue
    }
    uploaded.push(path)
    const resume = ['pdf', 'doc', 'docx'].includes(a.ext) && (/(resume|cv|curriculum|bio[\s_-]?data)/i.test(a.filename) || !hasResume)
    if (resume) hasResume = true
    files.push({
      kind: resume ? 'resume' : 'other', file_name: a.filename.slice(0, 255), storage_path: path,
      mime_type: a.contentType, size_bytes: a.bytes.length, sha256: sha,
    })
    listed.push({ name: a.filename, mime: a.contentType, size: a.bytes.length, storage_path: path })
  }

  const { data, error } = await admin.rpc('ats_mail_store_inbound', {
    p: {
      candidate_id: c.candidateId,
      application_id: c.applicationId,
      mailbox_id: mailboxId,
      from_address: h.fromAddress,
      from_name: h.fromName,
      to_addresses: h.to,
      cc_addresses: h.cc,
      subject: h.subject ?? '',
      body_text: text,
      body_html: html,
      message_id: messageId,
      in_reply_to: h.inReplyTo[0] ?? null,
      references_header: h.references.slice(-20).join(' ') || null,
      imap_uid: uid,
      received_at: meta.internalDate ?? h.date ?? null,
      is_automatic: h.automatic,
      attachments: listed,
      files,
    },
  })
  if (error || !data?.stored) {
    if (uploaded.length) await admin.storage.from(ATS_BUCKET).remove(uploaded)
    if (error) return 'retry'
    if (data?.reason === 'duplicate') {
      stats.duplicates++
      return 'duplicate'
    }
    return 'skipped'
  }
  stats.stored++
  stats.attachments_saved += files.length
  if (raw) await recordCalendarReply(admin, raw, stats)
  return 'stored'
}

/** "Accepted / Declined / Maybe" from the candidate's calendar app, for an interview invite sent by the ATS. */
async function recordCalendarReply(admin: any, raw: string, stats: Stats): Promise<void> {
  let reply: CalendarReply | null = null
  try {
    reply = findCalendarReply(raw)
  } catch {
    return
  }
  const m = reply ? INTERVIEW_UID_RE.exec(reply.uid) : null
  if (!reply || !m) return
  const { data: ok } = await admin.rpc('ats_interview_rsvp', {
    p_interview_id: m[1].toLowerCase(), p_attendee: reply.attendee, p_partstat: reply.partstat,
  })
  if (ok) stats.rsvps++
}
