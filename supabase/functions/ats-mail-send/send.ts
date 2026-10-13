// deno-lint-ignore-file no-explicit-any
// ATS: sends one email to a candidate from the HR mailbox chosen in ATS settings and files it on the candidate.
// HR staff only. Plain text in, branded HTML out (same shell and signature as every HR mail; see _shared/ats-mail-deliver.ts).
// Each email carries its own Message-ID (<ats.{id}@domain>) so the candidate's reply can be matched to it.
// Body: { id, candidateId, applicationId?, subject, body, purpose?, templateCode?, replyToId?, fileIds? }
//    or { retryId } to resend a failed email (an interview email only while the interview has not changed since).
// index.ts only starts the server; the work is here so it can be tested without a server.
import { requireAuth } from '../_shared/require-auth.ts'
import { tidyMailSubject } from '../_shared/mailBody.ts'
import { extractIds, isEmail, ourMessageId } from '../_shared/ats-mail.ts'
import { deliver, sendMail } from '../_shared/ats-mail-deliver.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PURPOSES = ['general', 'acknowledgement', 'rejection', 'interview', 'offer']
const MAX_ATTACH_FILES = 5
const MAX_ATTACH_BYTES = 15 * 1024 * 1024

export async function handleSend(req: Request): Promise<Response> {
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

  const { data: settings } = await admin.from('ats_settings').select('mail_enabled, mail_mailbox_id').eq('id', true).maybeSingle()
  if (!settings?.mail_enabled || !settings.mail_mailbox_id) return json({ error: 'mail_disabled' }, 409)
  const { data: mailbox } = await admin.from('hr_mailboxes')
    .select('id, from_address, from_name, smtp_host_secret, smtp_user_secret, smtp_pass_secret, is_active')
    .eq('id', settings.mail_mailbox_id).maybeSingle()
  if (!mailbox?.is_active || !isEmail(String(mailbox.from_address || '').trim())) return json({ error: 'mailbox_unavailable' }, 409)

  if (body?.test) {
    // ---- "Send me a test": only to the signed-in user's own address; nothing is filed in ats_messages.
    const subject = tidyMailSubject(String(body.test?.subject ?? ''), 200)
    const text = String(body.test?.body ?? '').replace(/\r\n?/g, '\n').trim()
    if (!subject) return json({ error: 'invalid', field: 'subject' }, 400)
    if (!text || text.length > 20_000) return json({ error: 'invalid', field: 'body' }, 400)
    if (/\{\{\s*[\w.]+\s*\}\}/.test(`${subject}\n${text}`)) return json({ error: 'invalid', field: 'placeholders' }, 400)
    const { data: u } = await admin.auth.admin.getUserById(gate.userId)
    const to = String(u?.user?.email ?? '').trim().toLowerCase()
    if (!isEmail(to)) return json({ error: 'no_email' }, 400)
    const fromAddress = String(mailbox.from_address).trim().toLowerCase()
    const code = await sendMail(mailbox, {
      fromAddress,
      to,
      subject: tidyMailSubject(`[Test] ${subject}`, 200),
      text,
      messageId: `<ats-test.${crypto.randomUUID()}@${fromAddress.split('@')[1]}>`,
    })
    console.log('ats-mail-send test', JSON.stringify({ ok: !code, error: code ?? null }))
    return json(code ? { status: 'failed', error: code } : { status: 'sent', to })
  }

  let row: any
  if (body?.retryId) {
    // ---- Resend a failed email (same row, same Message-ID)
    const retryId = String(body.retryId)
    if (!UUID_RE.test(retryId)) return json({ error: 'invalid', field: 'retryId' }, 400)
    const { data: prev } = await admin.from('ats_messages').select('*').eq('id', retryId).eq('direction', 'outbound').maybeSingle()
    if (!prev) return json({ error: 'not_found' }, 404)
    if (prev.status !== 'failed') return json({ id: prev.id, status: prev.status })
    // A pick-a-time email's link may have been replaced by a newer one: never resend it.
    if (prev.template_code === 'interview-pick-a-slot') return json({ error: 'outdated' }, 409)
    if (await interviewEmailOutdated(admin, prev)) return json({ error: 'outdated' }, 409)
    // The resend goes to the candidate's CURRENT address.
    const { data: cand } = await admin.from('ats_candidates')
      .select('email, merged_into_id, anonymized_at').eq('id', prev.candidate_id).maybeSingle()
    if (!cand || cand.merged_into_id || cand.anonymized_at) return json({ error: 'candidate_closed' }, 409)
    const to = String(cand.email ?? '').trim().toLowerCase()
    if (!isEmail(to)) return json({ error: 'no_email' }, 400)
    const changed = to !== String(prev.to_addresses?.[0] ?? '').trim().toLowerCase()
    // An interview invite names the old address as the calendar attendee, so it can't simply be redirected.
    if (changed && prev.calendar_ics) return json({ error: 'outdated' }, 409)
    const { data: claimed } = await admin.from('ats_messages')
      .update({ status: 'sending', error: null, attempts: Number(prev.attempts ?? 0) + 1, ...(changed ? { to_addresses: [to] } : {}) })
      .eq('id', prev.id).eq('status', 'failed').select('*').maybeSingle()
    if (!claimed) return json({ id: prev.id, status: 'sending' })
    row = claimed
  } else {
    // ---- New email
    const id = String(body?.id ?? '')
    const candidateId = String(body?.candidateId ?? '')
    if (!UUID_RE.test(id)) return json({ error: 'invalid', field: 'id' }, 400)
    if (!UUID_RE.test(candidateId)) return json({ error: 'invalid', field: 'candidateId' }, 400)
    const subject = tidyMailSubject(String(body?.subject ?? ''), 200)
    const text = String(body?.body ?? '').replace(/\r\n?/g, '\n').trim()
    if (!subject) return json({ error: 'invalid', field: 'subject' }, 400)
    if (!text || text.length > 20_000) return json({ error: 'invalid', field: 'body' }, 400)
    if (/\{\{\s*[\w.]+\s*\}\}/.test(`${subject}\n${text}`)) return json({ error: 'invalid', field: 'placeholders' }, 400)
    const purpose = PURPOSES.includes(body?.purpose) ? body.purpose : 'general'
    const templateCode = typeof body?.templateCode === 'string' && body.templateCode.length <= 80 ? body.templateCode : null

    const { data: cand } = await admin.from('ats_candidates')
      .select('id, email, merged_into_id, anonymized_at').eq('id', candidateId).maybeSingle()
    if (!cand) return json({ error: 'not_found' }, 404)
    if (cand.merged_into_id || cand.anonymized_at) return json({ error: 'candidate_closed' }, 409)
    const to = String(cand.email ?? '').trim().toLowerCase()
    if (!isEmail(to)) return json({ error: 'no_email' }, 400)

    let applicationId: string | null = UUID_RE.test(String(body?.applicationId ?? '')) ? String(body.applicationId) : null
    if (applicationId) {
      const { data: app } = await admin.from('ats_applications').select('id')
        .eq('id', applicationId).eq('candidate_id', candidateId).maybeSingle()
      if (!app) applicationId = null
    }

    let inReplyTo: string | null = null
    let references: string | null = null
    if (UUID_RE.test(String(body?.replyToId ?? ''))) {
      const { data: parent } = await admin.from('ats_messages')
        .select('message_id, references_header, candidate_id').eq('id', String(body.replyToId)).maybeSingle()
      if (parent && parent.candidate_id === candidateId && parent.message_id) {
        inReplyTo = parent.message_id
        references = [...extractIds(parent.references_header), parent.message_id].slice(-10).join(' ')
      }
    }

    const fileIds: string[] = Array.isArray(body?.fileIds)
      ? [...new Set<string>(body.fileIds.map((x: unknown) => String(x)).filter((x: string) => UUID_RE.test(x)))]
      : []
    if (fileIds.length > MAX_ATTACH_FILES) return json({ error: 'invalid', field: 'attachments' }, 400)
    let attachments: Record<string, unknown>[] = []
    if (fileIds.length) {
      const { data: files } = await admin.from('ats_files')
        .select('id, file_name, storage_path, mime_type, size_bytes').eq('candidate_id', candidateId).in('id', fileIds)
      if ((files ?? []).length !== fileIds.length) return json({ error: 'invalid', field: 'attachments' }, 400)
      const total = (files ?? []).reduce((s: number, f: any) => s + Number(f.size_bytes ?? 0), 0)
      if (total > MAX_ATTACH_BYTES) return json({ error: 'attachments_too_large' }, 400)
      attachments = (files ?? []).map((f: any) => ({
        file_id: f.id, name: f.file_name, size: f.size_bytes, mime: f.mime_type, storage_path: f.storage_path,
      }))
    }

    const { data: actorName } = await admin.rpc('ats_actor_name', { p_uid: gate.userId })
    const fromAddress = String(mailbox.from_address).trim().toLowerCase()
    const { data: created, error: insErr } = await admin.from('ats_messages').insert({
      id,
      candidate_id: candidateId,
      application_id: applicationId,
      direction: 'outbound',
      status: 'sending',
      purpose,
      template_code: templateCode,
      is_automatic: false,
      mailbox_id: mailbox.id,
      from_address: fromAddress,
      from_name: mailbox.from_name,
      to_addresses: [to],
      subject,
      body_text: text,
      message_id: ourMessageId(id, fromAddress),
      in_reply_to: inReplyTo,
      references_header: references,
      attachments,
      attempts: 1,
      created_by: gate.userId,
      created_by_name: actorName ?? null,
    }).select('*').single()
    if (insErr) {
      // The same id again (for example a double click): report the first attempt instead of sending twice.
      const { data: prev } = await admin.from('ats_messages').select('id, status, candidate_id').eq('id', id).maybeSingle()
      if (prev && prev.candidate_id === candidateId) return json({ id: prev.id, status: prev.status })
      return json({ error: 'save_failed' }, 500)
    }
    row = created
  }

  const result = await deliver(admin, mailbox, row)
  console.log('ats-mail-send', JSON.stringify({ ok: result.ok, error: result.code ?? null, attachments: (row.attachments ?? []).length }))
  return json({ id: row.id, status: result.ok ? 'sent' : 'failed', ...(result.ok ? {} : { error: result.code }) })
}

/** An interview email (with its calendar invite) is only resent while the interview is still as it describes. */
/** A reminder (interview email without a calendar invite) is resent only while the interview is still ahead and unchanged. */
export async function interviewEmailOutdated(admin: any, prev: any): Promise<boolean> {
  if (!prev?.calendar_ics) {
    if (!prev?.interview_id) return false
    const { data: iv } = await admin.from('ats_interviews').select('revision, status, starts_at').eq('id', prev.interview_id).maybeSingle()
    if (!iv || iv.status !== 'scheduled') return true
    if (new Date(iv.starts_at).getTime() <= Date.now()) return true
    return prev.calendar_revision != null && iv.revision !== prev.calendar_revision
  }
  if (!prev.interview_id) return true
  const { data: iv } = await admin.from('ats_interviews').select('revision').eq('id', prev.interview_id).maybeSingle()
  return !iv || iv.revision !== prev.calendar_revision
}
