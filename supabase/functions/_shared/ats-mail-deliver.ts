// deno-lint-ignore-file no-explicit-any
// ATS: sends email through the HR mailbox over SMTP. deliver() sends one candidate email row (ats_messages) and
// records the outcome on it; sendQueued() sends queued automatic emails (acknowledgements, interview reminders);
// sendMail() is the plain send used by both and by the interview emails to interviewers.
// Owned by the ATS module; the HR signature and mail-safety helpers are imported, not changed.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { quotedPrintableEncode } from 'https://deno.land/x/denomailer@1.6.0/config/mail/encoding.ts'
import { hrSignatureText, wrapHrEmail } from './hrSignature.ts'
import { tidyMailAddress, tidyMailFilename, tidyMailHtml, tidyMailSubject, tidyMailText } from './mailBody.ts'
import { ATS_BUCKET, bytesToBase64, errorCode, textToHtml } from './ats-mail.ts'
import { secretByName } from './mailbox-secrets.ts'

const SMTP_TIMEOUT_MS = 30_000
const QUEUE_RETRY_MINUTES = [10, 60] // automatic emails: 3 attempts in total, then "failed"
const te = new TextEncoder()

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

export interface MailFile {
  filename: string
  content: string
  encoding: 'base64'
  contentType: string
}

export interface OutgoingMail {
  fromAddress: string
  to: string
  subject: string
  /** Plain text without the signature; the HR signature and the branded HTML shell are added here. */
  text: string
  messageId: string
  inReplyTo?: string | null
  references?: string | null
  files?: MailFile[]
  /** A calendar invite (iCalendar text with CRLF line endings) sent inline and as invite.ics. */
  calendar?: { ics: string; method: 'REQUEST' | 'CANCEL' } | null
}

/**
 * Quoted-printable body that survives SMTP: a line that starts with "." (also after a soft line break) has the
 * dot encoded as =2E, because mail servers drop a leading dot that the sender did not double.
 */
export function qpBody(s: string): string {
  return quotedPrintableEncode(s).replace(/(^|\n)\./g, '$1=2E')
}

/** Base64 in 76-character lines. */
export function base64Lines(s: string): string {
  return (bytesToBase64(te.encode(s)).match(/.{1,76}/g) ?? []).join('\r\n')
}

/** SMTP sign-in for the mailbox (secret names are stored on hr_mailboxes), or null when it is not set up. */
function smtpLogin(mailbox: any): { host: string; user: string; pass: string } | null {
  const host = secretByName(mailbox?.smtp_host_secret) || Deno.env.get('HR_SMTP_HOST')
  const user = (secretByName(mailbox?.smtp_user_secret) || Deno.env.get('HR_SMTP_USER') || '').trim()
  const pass = (secretByName(mailbox?.smtp_pass_secret) || Deno.env.get('HR_SMTP_PASS') || '').replace(/\s+/g, '')
  return host && user && pass ? { host, user, pass } : null
}

const sendErrorCode = (e: unknown) => e instanceof SendError ? e.code : errorCode(e) === 'unexpected_error' ? 'smtp_failed' : errorCode(e)

/** Sends one email from the HR mailbox. Returns null when it was accepted by the mail server, else an error code. */
export async function sendMail(mailbox: any, mail: OutgoingMail, opts: { port?: number } = {}): Promise<string | null> {
  if (!mailbox) return 'mailbox_unavailable'
  const login = smtpLogin(mailbox)
  if (!login) return 'smtp_not_configured'
  const { host, user, pass } = login
  try {
    const text = tidyMailText(`${mail.text}\n\n${hrSignatureText()}`)
    const html = tidyMailHtml(wrapHrEmail(textToHtml(mail.text)))
    const parts = [
      { mimeType: 'text/plain; charset="utf-8"', content: qpBody(text), transferEncoding: 'quoted-printable' },
      { mimeType: 'text/html; charset="utf-8"', content: qpBody(html), transferEncoding: 'quoted-printable' },
    ]
    const files: MailFile[] = [...(mail.files ?? [])]
    if (mail.calendar) {
      // As calendar apps send invites: the calendar part last in the alternatives, plus the same file attached.
      parts.push({
        mimeType: `text/calendar; charset="utf-8"; method=${mail.calendar.method}`,
        content: base64Lines(mail.calendar.ics),
        transferEncoding: 'base64',
      })
      files.push({ filename: 'invite.ics', content: bytesToBase64(te.encode(mail.calendar.ics)), encoding: 'base64', contentType: 'application/ics' })
    }
    const client = new SMTPClient({
      connection: { hostname: host, port: opts.port ?? 465, tls: true, auth: { username: user, password: pass } },
    })
    try {
      await withTimeout(client.send({
        from: `${tidyMailAddress(mailbox.from_name || 'HR')} <${mail.fromAddress}>`,
        to: mail.to,
        subject: tidyMailSubject(mail.subject, 200),
        mimeContent: parts,
        attachments: files.length ? (files as any) : undefined,
        headers: {
          'Message-ID': mail.messageId,
          ...(mail.inReplyTo ? { 'In-Reply-To': mail.inReplyTo, References: mail.references || mail.inReplyTo } : {}),
        },
      }), SMTP_TIMEOUT_MS)
    } finally {
      try {
        await client.close()
      } catch {
        /* ignore */
      }
    }
    return null
  } catch (e) {
    const code = sendErrorCode(e)
    console.error('ats-mail send failed', code)
    return code
  }
}

/** Sends the row and records the outcome on it: sent, failed, or queued again (automatic emails). */
export async function deliver(admin: any, mailbox: any, row: any, opts: DeliverOptions = {}): Promise<{ ok: boolean; code?: string }> {
  let code: string | null = null
  if (!mailbox) {
    code = 'mailbox_unavailable'
  } else if (!smtpLogin(mailbox)) {
    code = 'smtp_not_configured'
  } else if (/\{\{\s*[\w.]+\s*\}\}/.test(`${row.subject ?? ''}\n${row.body_text ?? ''}`)) {
    code = 'invalid_template'
  } else {
    const files: MailFile[] = []
    try {
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
    } catch (e) {
      code = sendErrorCode(e)
      console.error('ats-mail deliver failed', code)
    }
    if (!code) {
      const ics = typeof row.calendar_ics === 'string' && row.calendar_ics ? row.calendar_ics : null
      code = await sendMail(mailbox, {
        fromAddress: row.from_address,
        to: row.to_addresses[0],
        subject: row.subject,
        text: row.body_text,
        messageId: row.message_id,
        inReplyTo: row.in_reply_to,
        references: row.references_header,
        files,
        calendar: ics ? { ics, method: /\r?\nMETHOD:CANCEL\r?\n/.test(ics) ? 'CANCEL' : 'REQUEST' } : null,
      }, { port: opts.port })
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
