import { requireAuth } from '../_shared/require-auth.ts'
import { fetchMessages, parseMessage } from '../_shared/imap-client.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

function stripHtml(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const auth = await requireAuth(req, { corsHeaders })
  if (!auth.ok) return auth.response
  const admin = auth.admin

  let body: any = {}
  try { body = await req.json() } catch { /* optional body */ }

  const query = admin.from('hr_mailboxes').select('*').eq('imap_enabled', true).eq('is_active', true)
  if (body.mailboxId) query.eq('id', body.mailboxId)
  const { data: mailboxes } = await query

  if (!mailboxes?.length) {
    return json({ success: true, mailboxes: 0, inserted: 0, note: 'No IMAP-enabled mailbox configured' })
  }

  let inserted = 0
  const errors: Array<{ mailbox: string; error: string }> = []

  for (const mb of mailboxes) {
    const host = mb.imap_host
    const user = (mb.imap_user_secret ? Deno.env.get(mb.imap_user_secret) : Deno.env.get('HR_SMTP_USER'))?.trim()
    const pass = (mb.imap_pass_secret ? Deno.env.get(mb.imap_pass_secret) : Deno.env.get('HR_SMTP_PASS'))?.replace(/\s+/g, '')

    if (!host || !user || !pass) {
      const msg = 'IMAP host or credentials missing'
      errors.push({ mailbox: mb.from_address, error: msg })
      await admin.from('hr_mailboxes').update({ imap_last_error: msg }).eq('id', mb.id)
      continue
    }

    try {
      const messages = await fetchMessages(
        { host, port: mb.imap_port || 993, user, pass },
        Number(mb.imap_last_uid || 0),
        Number(body.limit) || 30,
      )

      let maxUid = Number(mb.imap_last_uid || 0)
      for (const m of messages) {
        const p = parseMessage(m.raw)
        const snippetSource = p.text || (p.html ? stripHtml(p.html) : '')

        let matchedEmployeeId: string | null = null
        if (p.fromAddress) {
          const { data: emp } = await admin
            .from('hr_employees')
            .select('id')
            .ilike('email', p.fromAddress)
            .maybeSingle()
          matchedEmployeeId = emp?.id || null
        }

        const { error } = await admin.from('hr_mail_messages').upsert({
          mailbox_id: mb.id,
          imap_uid: m.uid,
          message_id_header: p.messageId,
          from_address: p.fromAddress,
          from_name: p.fromName,
          to_addresses: p.to,
          subject: p.subject,
          snippet: snippetSource.slice(0, 300),
          body_html: p.html,
          body_text: p.text,
          received_at: p.date,
          has_attachments: p.hasAttachments,
          matched_employee_id: matchedEmployeeId,
        }, { onConflict: 'mailbox_id,imap_uid', ignoreDuplicates: true })

        if (!error) inserted++
        if (m.uid > maxUid) maxUid = m.uid
      }

      await admin.from('hr_mailboxes').update({
        imap_last_uid: maxUid,
        imap_last_sync_at: new Date().toISOString(),
        imap_last_error: null,
      }).eq('id', mb.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('IMAP fetch failed', mb.from_address, msg)
      errors.push({ mailbox: mb.from_address, error: msg })
      await admin.from('hr_mailboxes').update({ imap_last_error: msg }).eq('id', mb.id)
    }
  }

  return json({ success: errors.length === 0, mailboxes: mailboxes.length, inserted, errors })
})
