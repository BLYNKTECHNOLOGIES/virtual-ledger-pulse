// deno-lint-ignore-file no-explicit-any
// ATS: delivers one candidate email row (ats_messages) through the HR mailbox over SMTP, and sends queued
// automatic emails (acknowledgements). Used by ats-mail-send (HR clicks Send) and ats-mail-sync (every 5 minutes).
// Owned by the ATS module; the HR signature and mail-safety helpers are imported, not changed.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { hrSignatureText, wrapHrEmail } from './hrSignature.ts'
import { tidyMailAddress, tidyMailFilename, tidyMailHtml, tidyMailSubject, tidyMailText } from './mailBody.ts'
import { ATS_BUCKET, bytesToBase64, errorCode, textToHtml } from './ats-mail.ts'

const SMTP_TIMEOUT_MS = 30_000
const QUEUE_RETRY_MINUTES = [10, 60] // automatic emails: 3 attempts in total, then "failed"

export class SendError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export interface DeliverOptions {
  /** Only for local tests against a fake SMTP server. */
  port?: number
  /** On failure, put the email back in the queue to try again after this many minutes (instead of "failed"). */
  retryInMinutes?: number
}

/** Sends the row and records the outcome on it: sent, failed, or queued again (automatic emails). */
export async function deliver(admin: any, mailbox: any, row: any, opts: DeliverOptions = {}): Promise<{ ok: boolean; code?: string }> {
  const host = Deno.env.get(mailbox?.smtp_host_secret || '') || Deno.env.get('HR_SMTP_HOST')
  const user = (Deno.env.get(mailbox?.smtp_user_secret || '') || Deno.env.get('HR_SMTP_USER') || '').trim()
  const pass = (Deno.env.get(mailbox?.smtp_pass_secret || '') || Deno.env.get('HR_SMTP_PASS') || '').replace(/\s+/g, '')
  let code: string | null = null
  if (!mailbox) {
    code = 'mailbox_unavailable'
  } else if (!host || !user || !pass) {
    code = 'smtp_not_configured'
  } else if (/\{\{\s*[\w.]+\s*\}\}/.test(`${row.subject ?? ''}\n${row.body_text ?? ''}`)) {
    code = 'invalid_template'
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
      console.error('ats-mail deliver failed', code)
    }
  }
  if (code) {
    const retry = opts.retryInMinutes && !['invalid_template', 'mailbox_unavailable'].includes(code)
    await admin.from('ats_messages').update(retry
      ? { status: 'queued', error: code, next_attempt_at: new Date(Date.now() + opts.retryInMinutes! * 60_000).toISOString() }
      : { status: 'failed', error: code }).eq('id', row.id)
    return { ok: false, code }
  }
  await admin.from('ats_messages').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', row.id)
  return { ok: true }
}

/** Sends queued automatic emails that are due (oldest first), until `deadline`. */
export async function sendQueued(
  admin: any,
  opts: { deadline: number; limit?: number; port?: number },
): Promise<{ sent: number; failed: number; retrying: number }> {
  const out = { sent: 0, failed: 0, retrying: 0 }
  const { data: due, error } = await admin.from('ats_messages').select('id, attempts, mailbox_id')
    .eq('direction', 'outbound').eq('status', 'queued').lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true }).limit(opts.limit ?? 10)
  if (error || !due?.length) return out
  const mailboxes = new Map<string, any>()
  for (const d of due) {
    if (Date.now() > opts.deadline) break
    const attempt = Number(d.attempts ?? 0) + 1
    const { data: row } = await admin.from('ats_messages')
      .update({ status: 'sending', attempts: attempt, error: null })
      .eq('id', d.id).eq('status', 'queued').select('*').maybeSingle()
    if (!row) continue // taken by another run
    if (row.mailbox_id && !mailboxes.has(row.mailbox_id)) {
      const { data: mb } = await admin.from('hr_mailboxes')
        .select('id, from_address, from_name, smtp_host_secret, smtp_user_secret, smtp_pass_secret, is_active')
        .eq('id', row.mailbox_id).maybeSingle()
      mailboxes.set(row.mailbox_id, mb?.is_active ? mb : null)
    }
    const retryInMinutes = QUEUE_RETRY_MINUTES[attempt - 1]
    const r = await deliver(admin, mailboxes.get(row.mailbox_id) ?? null, row, { port: opts.port, retryInMinutes })
    if (r.ok) out.sent++
    else if (retryInMinutes && !['invalid_template', 'mailbox_unavailable'].includes(r.code ?? '')) out.retrying++
    else out.failed++
  }
  return out
}

/** Rejects after `ms`; the slow promise's own failure is absorbed so it cannot crash the function. */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
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
