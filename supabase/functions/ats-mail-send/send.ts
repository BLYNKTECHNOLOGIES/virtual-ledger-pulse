// deno-lint-ignore-file no-explicit-any
// ATS: sends one email to a candidate from the HR mailbox chosen in ATS settings and files it on the candidate.
// HR staff only. Plain text in, branded HTML out (same shell and signature as every HR mail).
// Each email carries its own Message-ID (<ats.{id}@domain>) so the candidate's reply can be matched to it.
// Body: { id, candidateId, applicationId?, subject, body, purpose?, templateCode?, replyToId?, fileIds? }
//    or { retryId } to resend a failed email.
// index.ts only starts the server; the work is here so it can be tested without a server.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { requireAuth } from '../_shared/require-auth.ts'
import { hrSignatureText, wrapHrEmail } from '../_shared/hrSignature.ts'
import { tidyMailAddress, tidyMailFilename, tidyMailHtml, tidyMailSubject, tidyMailText } from '../_shared/mailBody.ts'
import { ATS_BUCKET, bytesToBase64, errorCode, extractIds, isEmail, ourMessageId, textToHtml } from '../_shared/ats-mail.ts'

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
const SMTP_TIMEOUT_MS = 30_000

class SendError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

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

  let row: any
  if (body?.retryId) {
    // ---- Resend a failed email (same row, same Message-ID)
    const retryId = String(body.retryId)
    if (!UUID_RE.test(retryId)) return json({ error: 'invalid', field: 'retryId' }, 400)
    const { data: prev } = await admin.from('ats_messages').select('*').eq('id', retryId).eq('direction', 'outbound').maybeSingle()
    if (!prev) return json({ error: 'not_found' }, 404)
    if (prev.status !== 'failed') return json({ id: prev.id, status: prev.status })
    const { data: claimed } = await admin.from('ats_messages')
      .update({ status: 'sending', error: null, attempts: Number(prev.attempts ?? 0) + 1 })
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

export async function deliver(admin: any, mailbox: any, row: any, opts: { port?: number } = {}): Promise<{ ok: boolean; code?: string }> {
  const host = Deno.env.get(mailbox.smtp_host_secret || '') || Deno.env.get('HR_SMTP_HOST')
  const user = (Deno.env.get(mailbox.smtp_user_secret || '') || Deno.env.get('HR_SMTP_USER') || '').trim()
  const pass = (Deno.env.get(mailbox.smtp_pass_secret || '') || Deno.env.get('HR_SMTP_PASS') || '').replace(/\s+/g, '')
  let code: string | null = null
  if (!host || !user || !pass) {
    code = 'smtp_not_configured'
  } else {
    try {
      const files: { filename: string; content: string; encoding: 'base64'; contentType: string }[] = []
      for (const a of row.attachments ?? []) {
        if (!a?.storage_path) continue
        const { data: blob, error } = await admin.storage.from(ATS_BUCKET).download(a.storage_path)
        if (error || !blob) throw new SendError('attachment_missing')
        files.push({
          filename: tidyMailFilename(a.name || 'attachment'),
          content: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
          encoding: 'base64',
          contentType: a.mime || 'application/octet-stream',
        })
      }
      const client = new SMTPClient({
        connection: { hostname: host, port: opts.port ?? 465, tls: true, auth: { username: user, password: pass } },
      })
      try {
        await withTimeout(client.send({
          from: `${tidyMailAddress(mailbox.from_name || 'HR')} <${row.from_address}>`,
          to: row.to_addresses[0],
          subject: tidyMailSubject(row.subject, 200),
          content: tidyMailText(`${row.body_text}\n\n${hrSignatureText()}`),
          html: tidyMailHtml(wrapHrEmail(textToHtml(row.body_text))),
          attachments: files.length ? (files as any) : undefined,
          headers: {
            'Message-ID': row.message_id,
            ...(row.in_reply_to ? { 'In-Reply-To': row.in_reply_to, References: row.references_header || row.in_reply_to } : {}),
          },
        }), SMTP_TIMEOUT_MS)
      } finally {
        try {
          await client.close()
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      code = e instanceof SendError ? e.code : errorCode(e) === 'unexpected_error' ? 'smtp_failed' : errorCode(e)
      console.error('ats-mail-send failed', code)
    }
  }
  if (code) {
    await admin.from('ats_messages').update({ status: 'failed', error: code }).eq('id', row.id)
    return { ok: false, code }
  }
  await admin.from('ats_messages').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', row.id)
  return { ok: true }
}

/** Rejects after `ms`; the slow promise's own failure is absorbed so it cannot crash the function. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined
  const settled = p.then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e }))
  const timeout = new Promise<{ timeout: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timeout: true }), ms)
  })
  try {
    const r = await Promise.race([settled, timeout])
    if ('timeout' in r) throw new SendError('smtp_timeout')
    if (!r.ok) throw r.e
    return r.v
  } finally {
    clearTimeout(timer)
  }
}
