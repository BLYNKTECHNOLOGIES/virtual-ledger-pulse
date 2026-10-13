// deno-lint-ignore-file no-explicit-any
// ATS: emails about one interview, from the HR mailbox chosen in ATS settings. HR staff only.
// - The candidate gets the invitation, the update or the cancellation with a calendar invite. It is filed on the
//   candidate's Messages like any ATS email, so replies and retries work the same way.
// - Each interviewer gets their own calendar invite (or cancellation), with the candidate's resume if asked. These
//   are not filed on the candidate; the outcome is kept on ats_interview_panel.
// Body: { interviewId, action: "invite" | "update" | "cancel",
//         candidate?: { id, subject, body, templateCode? } | null, notifyPanel?: boolean, attachResume?: boolean }
// The subject and body may use {{placeholders}}; they are filled from the saved interview.
// index.ts only starts the server; the work is here so it can be tested without a server.
import { requireAuth } from '../_shared/require-auth.ts'
import { tidyMailFilename, tidyMailSubject } from '../_shared/mailBody.ts'
import { ATS_BUCKET, bytesToBase64, extractIds, isEmail, ourMessageId } from '../_shared/ats-mail.ts'
import { deliver, type MailFile, type OutgoingMail, sendMail } from '../_shared/ats-mail-deliver.ts'
import { buildIcs, icsSequence, interviewUid, panelUid } from '../_shared/ats-ics.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIONS = ['invite', 'update', 'cancel']
const RUN_MS = 100_000 // interviewers not reached by then are reported as "skipped" and can be sent again
const RESUME_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_COMPANY = 'Blynk Virtual Technologies'
const IST = 'Asia/Kolkata'

export interface NotifyOptions {
  /** Only for local tests against a fake SMTP server. */
  port?: number
  /** The app's address, for the "Open in the ATS" link in interviewer emails (taken from the request's Origin). */
  origin?: string | null
}

export async function handleNotify(req: Request, opts: NotifyOptions = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const gate = await requireAuth(req, { corsHeaders })
  if (!gate.ok) return gate.response
  const admin = gate.admin as any
  const { data: staff } = await admin.rpc('hr_is_hr_staff', { _user_id: gate.userId })
  if (!staff) return json({ error: 'forbidden' }, 403)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid', field: 'body' }, 400)
  }
  const r = await notifyInterview(admin, gate.userId, body, { ...opts, origin: opts.origin ?? req.headers.get('origin') })
  return json(r.body, r.status)
}

interface Ctx {
  iv: any
  company: string
  app: any
  cand: any
  jobTitle: string
  mailbox: any
  fromAddress: string
  domain: string
  origin: string | null
  start: Date
  end: Date
}

export async function notifyInterview(
  admin: any, userId: string, body: any, opts: NotifyOptions = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const started = Date.now()
  const interviewId = String(body?.interviewId ?? '')
  if (!UUID_RE.test(interviewId)) return { status: 400, body: { error: 'invalid', field: 'interviewId' } }
  const action = String(body?.action ?? '')
  if (!ACTIONS.includes(action)) return { status: 400, body: { error: 'invalid', field: 'action' } }

  const { data: settings } = await admin.from('ats_settings').select('mail_enabled, mail_mailbox_id, company_display_name').eq('id', true).maybeSingle()
  if (!settings?.mail_enabled || !settings.mail_mailbox_id) return { status: 409, body: { error: 'mail_disabled' } }
  const { data: mailbox } = await admin.from('hr_mailboxes')
    .select('id, from_address, from_name, smtp_host_secret, smtp_user_secret, smtp_pass_secret, is_active')
    .eq('id', settings.mail_mailbox_id).maybeSingle()
  const fromAddress = String(mailbox?.from_address || '').trim().toLowerCase()
  if (!mailbox?.is_active || !isEmail(fromAddress)) return { status: 409, body: { error: 'mailbox_unavailable' } }

  const { data: iv } = await admin.from('ats_interviews').select('*').eq('id', interviewId).maybeSingle()
  if (!iv) return { status: 404, body: { error: 'not_found' } }
  if (action === 'cancel' ? iv.status !== 'cancelled' : iv.status !== 'scheduled') {
    return { status: 409, body: { error: 'interview_closed' } }
  }
  const start = new Date(iv.starts_at)
  const end = new Date(iv.ends_at)
  if (action !== 'cancel' && end.getTime() <= Date.now()) return { status: 409, body: { error: 'interview_past' } }
  const { data: app } = await admin.from('ats_applications').select('id, candidate_id, job_id, position_text')
    .eq('id', iv.application_id).maybeSingle()
  const { data: cand } = await admin.from('ats_candidates')
    .select('id, full_name, ref_no, email, phone, merged_into_id, anonymized_at').eq('id', iv.candidate_id).maybeSingle()
  if (!app || !cand) return { status: 404, body: { error: 'not_found' } }
  let jobTitle = String(app.position_text ?? '').trim() || 'the open role'
  if (app.job_id) {
    const { data: job } = await admin.from('ats_jobs').select('title').eq('id', app.job_id).maybeSingle()
    if (job?.title) jobTitle = String(job.title)
  }
  const origin = typeof opts.origin === 'string' && /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(opts.origin) ? opts.origin : null
  const ctx: Ctx = {
    iv, app, cand, jobTitle, mailbox, fromAddress,
    company: String(settings.company_display_name ?? '').trim() || DEFAULT_COMPANY, domain: fromAddress.split('@')[1], origin, start, end,
  }

  const out: { candidate: Record<string, unknown> | null; panel: Record<string, unknown>[] } = { candidate: null, panel: [] }
  if (body?.candidate) out.candidate = await notifyCandidate(admin, userId, ctx, action, body.candidate, opts)
  if (body?.notifyPanel) out.panel = await notifyPanel(admin, ctx, action, !!body.attachResume, opts, started + RUN_MS)
  const count = (s: string) => out.panel.filter((p) => p.status === s).length
  console.log('ats-interview-notify', JSON.stringify({
    action, candidate: out.candidate?.status ?? null, candidate_error: out.candidate?.error ?? null,
    panel_sent: count('sent'), panel_cancelled: count('cancelled'), panel_failed: count('failed'),
    panel_no_email: count('no_email'), panel_skipped: count('skipped'), ms: Date.now() - started,
  }))
  return { status: 200, body: out }
}

// ---------------------------------------------------------------- candidate

async function notifyCandidate(
  admin: any, userId: string, ctx: Ctx, action: string, c: any, opts: NotifyOptions,
): Promise<Record<string, unknown>> {
  const id = String(c?.id ?? '')
  if (!UUID_RE.test(id)) return { status: 'failed', error: 'invalid', field: 'id' }
  // The same id again (for example a retry after a network error): report the first attempt instead of sending twice.
  const { data: prev } = await admin.from('ats_messages').select('id, status, error, candidate_id').eq('id', id).maybeSingle()
  if (prev) {
    if (prev.candidate_id !== ctx.cand.id) return { status: 'failed', error: 'invalid', field: 'id' }
    return { id: prev.id, status: prev.status, ...(prev.error ? { error: prev.error } : {}) }
  }
  if (ctx.cand.merged_into_id || ctx.cand.anonymized_at) return { status: 'skipped', error: 'candidate_closed' }
  const to = String(ctx.cand.email ?? '').trim().toLowerCase()
  if (!isEmail(to)) return { status: 'skipped', error: 'no_email' }

  const { data: filled, error: fillErr } = await admin.rpc('ats_render_interview_text', {
    p_interview_id: ctx.iv.id, p_subject: String(c.subject ?? ''), p_body: String(c.body ?? ''),
  })
  if (fillErr || !filled) return { status: 'failed', error: 'save_failed' }
  const subject = tidyMailSubject(String(filled.subject ?? ''), 200)
  const text = String(filled.body ?? '').replace(/\r\n?/g, '\n').trim()
  if (!subject) return { status: 'failed', error: 'invalid', field: 'subject' }
  if (!text || text.length > 20_000) return { status: 'failed', error: 'invalid', field: 'body' }
  if (/\{\{\s*[\w.]+\s*\}\}/.test(`${subject}\n${text}`)) return { status: 'failed', error: 'invalid', field: 'placeholders' }
  const templateCode = typeof c.templateCode === 'string' && c.templateCode.length <= 80 ? c.templateCode : null

  // Continue the email thread about this interview, if there is one.
  const { data: parents } = await admin.from('ats_messages').select('message_id, references_header')
    .eq('interview_id', ctx.iv.id).eq('direction', 'outbound').eq('status', 'sent')
    .order('created_at', { ascending: false }).limit(1)
  const parent = parents?.[0]?.message_id ? parents[0] : null
  const references = parent ? [...extractIds(parent.references_header), parent.message_id].slice(-10).join(' ') : null

  const cancel = action === 'cancel'
  const ics = buildIcs({
    method: cancel ? 'CANCEL' : 'REQUEST',
    uid: interviewUid(ctx.iv.id, ctx.domain),
    sequence: icsSequence(),
    start: ctx.start,
    end: ctx.end,
    summary: `Interview: ${ctx.jobTitle} - ${ctx.company}`,
    description: [
      `Interview for ${ctx.jobTitle} at ${ctx.company}.`,
      cancel ? 'This interview has been cancelled.' : candidateWhere(ctx),
      ...(!cancel && ctx.iv.candidate_note ? [String(ctx.iv.candidate_note)] : []),
      'To change the time, reply to the invitation email.',
    ].join('\n'),
    location: calendarLocation(ctx),
    url: ctx.iv.mode === 'video' ? ctx.iv.meeting_url : null,
    organizer: { email: ctx.fromAddress, name: ctx.mailbox.from_name || 'HR' },
    attendees: [{ email: to, name: ctx.cand.full_name }],
  })

  const { data: actorName } = await admin.rpc('ats_actor_name', { p_uid: userId })
  const { data: row, error: insErr } = await admin.from('ats_messages').insert({
    id,
    candidate_id: ctx.cand.id,
    application_id: ctx.app.id,
    interview_id: ctx.iv.id,
    direction: 'outbound',
    status: 'sending',
    purpose: 'interview',
    template_code: templateCode,
    is_automatic: false,
    mailbox_id: ctx.mailbox.id,
    from_address: ctx.fromAddress,
    from_name: ctx.mailbox.from_name,
    to_addresses: [to],
    subject,
    body_text: text,
    message_id: ourMessageId(id, ctx.fromAddress),
    in_reply_to: parent?.message_id ?? null,
    references_header: references,
    attachments: [],
    calendar_ics: ics,
    calendar_revision: ctx.iv.revision,
    attempts: 1,
    created_by: userId,
    created_by_name: actorName ?? null,
  }).select('*').single()
  if (insErr || !row) {
    const { data: again } = await admin.from('ats_messages').select('id, status, candidate_id').eq('id', id).maybeSingle()
    if (again && again.candidate_id === ctx.cand.id) return { id: again.id, status: again.status }
    return { status: 'failed', error: 'save_failed' }
  }
  const r = await deliver(admin, ctx.mailbox, row, { port: opts.port })
  return { id: row.id, status: r.ok ? 'sent' : 'failed', ...(r.ok ? {} : { error: r.code }) }
}

// ---------------------------------------------------------------- interviewers

interface PanelJob {
  m: any
  kind: 'request' | 'cancel'
  removed: boolean
}

async function notifyPanel(
  admin: any, ctx: Ctx, action: string, attachResume: boolean, opts: NotifyOptions, deadline: number,
): Promise<Record<string, unknown>[]> {
  const { data: members } = await admin.from('ats_interview_panel').select('*').eq('interview_id', ctx.iv.id)
    .order('created_at', { ascending: true })
  const all: any[] = members ?? []
  const active = all.filter((m) => !m.removed_at)
  const jobs: PanelJob[] = []
  if (action === 'cancel') {
    for (const m of all) if (m.invite_status === 'sent' && !m.cancel_sent_at) jobs.push({ m, kind: 'cancel', removed: !!m.removed_at })
  } else {
    // Invite whoever does not have this version yet; cancel the invite of anyone taken off the panel.
    for (const m of active) {
      if (!(m.invite_status === 'sent' && m.invited_revision === ctx.iv.revision)) jobs.push({ m, kind: 'request', removed: false })
    }
    for (const m of all) {
      if (m.removed_at && m.invite_status === 'sent' && !m.cancel_sent_at) jobs.push({ m, kind: 'cancel', removed: true })
    }
  }
  const names = active.map((m) => String(m.name))
  let resume: MailFile | null = null
  if (attachResume && jobs.some((j) => j.kind === 'request')) resume = await primaryResume(admin, ctx.cand.id)

  const results: Record<string, unknown>[] = []
  for (const j of jobs) {
    if (Date.now() > deadline) {
      results.push({ panel_id: j.m.id, status: 'skipped', error: 'timeout' })
      continue
    }
    const email = String(j.m.email ?? '').trim().toLowerCase()
    if (!isEmail(email)) {
      if (j.kind === 'request') await admin.from('ats_interview_panel').update({ invite_status: 'no_email', invite_error: null }).eq('id', j.m.id)
      results.push({ panel_id: j.m.id, status: 'no_email' })
      continue
    }
    const code = await sendMail(ctx.mailbox, panelMail(ctx, j, email, names, j.kind === 'request' ? resume : null), { port: opts.port })
    const now = new Date().toISOString()
    if (j.kind === 'request') {
      await admin.from('ats_interview_panel').update(code
        ? { invite_status: 'failed', invite_error: code }
        : { invite_status: 'sent', invite_error: null, invited_revision: ctx.iv.revision, invited_at: now, cancel_sent_at: null })
        .eq('id', j.m.id)
    } else {
      await admin.from('ats_interview_panel').update(code ? { invite_error: code } : { cancel_sent_at: now, invite_error: null })
        .eq('id', j.m.id)
    }
    results.push({ panel_id: j.m.id, status: code ? 'failed' : j.kind === 'request' ? 'sent' : 'cancelled', ...(code ? { error: code } : {}) })
  }
  return results
}

/** The candidate's main resume (or newest resume) as an attachment, if it is small enough. */
async function primaryResume(admin: any, candidateId: string): Promise<MailFile | null> {
  const { data: files } = await admin.from('ats_files').select('file_name, storage_path, mime_type, size_bytes')
    .eq('candidate_id', candidateId).eq('kind', 'resume')
    .order('is_primary', { ascending: false }).order('created_at', { ascending: false }).limit(1)
  const f = files?.[0]
  if (!f?.storage_path || Number(f.size_bytes ?? 0) > RESUME_MAX_BYTES) return null
  const { data: blob, error } = await admin.storage.from(ATS_BUCKET).download(f.storage_path)
  if (error || !blob) return null
  return {
    filename: tidyMailFilename(f.file_name || 'resume.pdf', 'resume.pdf'),
    content: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    encoding: 'base64',
    contentType: f.mime_type || 'application/octet-stream',
  }
}

function panelMail(ctx: Ctx, j: PanelJob, email: string, names: string[], resume: MailFile | null): OutgoingMail {
  const first = String(j.m.name ?? '').trim().split(/\s+/)[0] || 'there'
  const who = String(ctx.cand.full_name ?? '').trim() || 'the candidate'
  const when = `${istDateText(ctx.start)}, ${istTimeText(ctx.start)}`
  const short = `${istShortDate(ctx.start)}, ${istTimeText(ctx.start)}`
  const link = ctx.origin ? `${ctx.origin}/hrms/ats/candidates/${ctx.cand.id}?app=${ctx.app.id}` : null
  const cancel = j.kind === 'cancel'
  let subject: string
  let text: string
  if (cancel) {
    subject = `Cancelled: Interview with ${who}, ${short}`
    text = j.removed
      ? `Hi ${first},\n\nYou are no longer on the interview panel for ${who} (${ctx.jobTitle}) on ${when}. The calendar invite has been cancelled.`
      : `Hi ${first},\n\nThe interview with ${who} (${ctx.jobTitle}) on ${when} has been cancelled.` +
        (ctx.iv.cancel_reason ? `\n\nReason: ${ctx.iv.cancel_reason}` : '') + '\n\nThe calendar invite has been cancelled too.'
  } else {
    const updated = !!j.m.invited_at
    subject = `${updated ? 'Updated: ' : ''}Interview: ${who} for ${ctx.jobTitle}, ${short}`
    text = [
      `Hi ${first},`,
      '',
      updated
        ? `The interview with ${who} (${ctx.cand.ref_no}) has changed. The latest details are below.`
        : `You are on the interview panel for ${who} (${ctx.cand.ref_no}), who applied for ${ctx.jobTitle}.`,
      '',
      `Round: ${ctx.iv.title}`,
      `When: ${when} (${durationText(ctx)})`,
      panelWhere(ctx),
      `Panel: ${names.join(', ')}`,
      ...(ctx.iv.internal_note ? ['', `Note from HR: ${ctx.iv.internal_note}`] : []),
      '',
      ...(resume ? ["The candidate's resume is attached."] : []),
      ...(link ? [`Open in the ATS: ${link}`] : []),
      'A calendar invite is attached.',
    ].join('\n')
  }
  const ics = buildIcs({
    method: cancel ? 'CANCEL' : 'REQUEST',
    uid: panelUid(ctx.iv.id, j.m.id, ctx.domain),
    sequence: icsSequence(),
    start: ctx.start,
    end: ctx.end,
    summary: `Interview: ${who} (${ctx.iv.title})`,
    description: [
      `Candidate: ${who} (${ctx.cand.ref_no})`,
      `Role: ${ctx.jobTitle}`,
      cancel ? 'This interview has been cancelled.' : panelWhere(ctx),
      `Panel: ${names.join(', ')}`,
      ...(ctx.iv.internal_note && !cancel ? [`Note from HR: ${ctx.iv.internal_note}`] : []),
      ...(link ? [link] : []),
    ].join('\n'),
    location: calendarLocation(ctx),
    url: ctx.iv.mode === 'video' ? ctx.iv.meeting_url : null,
    organizer: { email: ctx.fromAddress, name: ctx.mailbox.from_name || 'HR' },
    attendees: [{ email, name: j.m.name }],
  })
  return {
    fromAddress: ctx.fromAddress,
    to: email,
    subject,
    text,
    // Not an <ats.…> id: replies to interviewer emails are never filed on the candidate.
    messageId: `<ats-panel.${crypto.randomUUID()}@${ctx.domain}>`,
    files: resume ? [resume] : [],
    calendar: { ics, method: cancel ? 'CANCEL' : 'REQUEST' },
  }
}

// ---------------------------------------------------------------- wording

function candidateWhere(ctx: Ctx): string {
  if (ctx.iv.mode === 'in_person') return `Venue: ${ctx.iv.location}`
  if (ctx.iv.mode === 'video') return `Video call: ${ctx.iv.meeting_url}`
  return `Phone call: we will call you on ${String(ctx.cand.phone ?? '').trim() || 'the number you shared with us'}`
}

function panelWhere(ctx: Ctx): string {
  if (ctx.iv.mode === 'in_person') return `Where: ${ctx.iv.location}`
  if (ctx.iv.mode === 'video') return `Video call: ${ctx.iv.meeting_url}`
  const phone = String(ctx.cand.phone ?? '').trim()
  return phone ? `Phone call: call the candidate on ${phone}` : "Phone call: the candidate's number is not in the ATS yet"
}

function calendarLocation(ctx: Ctx): string {
  if (ctx.iv.mode === 'in_person') return String(ctx.iv.location ?? '')
  if (ctx.iv.mode === 'video') return String(ctx.iv.meeting_url ?? '')
  return 'Phone call'
}

export function durationText(ctx: { start: Date; end: Date }): string {
  const m = Math.round((ctx.end.getTime() - ctx.start.getTime()) / 60_000)
  if (m < 60) return `${m} minutes`
  const h = Math.floor(m / 60)
  const rest = m % 60
  const hours = `${h} ${h === 1 ? 'hour' : 'hours'}`
  return rest ? `${hours} ${rest} minutes` : hours
}

function istParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(d)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/** "Wednesday, 21 October 2026" */
export function istDateText(d: Date): string {
  const p = istParts(d)
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`
}

/** "Wed 21 Oct" */
export function istShortDate(d: Date): string {
  const p = istParts(d)
  return `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)}`
}

/** "11:30 AM IST" */
export function istTimeText(d: Date): string {
  const p = istParts(d)
  return `${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toUpperCase()} IST`
}
