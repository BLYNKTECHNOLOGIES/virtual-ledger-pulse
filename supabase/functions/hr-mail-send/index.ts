import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"
import { requireAuth } from '../_shared/require-auth.ts'
import { appendHrSignatureHtml, hrSignatureText } from '../_shared/hrSignature.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

interface RecipientInput { email?: string; employee_id?: string | null; name?: string | null }

function fillPlaceholders(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const auth = await requireAuth(req, { corsHeaders })
  if (!auth.ok) return auth.response
  const admin = auth.admin

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = body.action || 'send'

  // ---- Resend failures of an existing campaign -------------------------
  let campaignId: string | null = null
  let campaign: any = null

  if (action === 'resend_failed') {
    campaignId = body.campaignId
    if (!campaignId) return json({ error: 'campaignId is required' }, 400)
    const { data } = await admin.from('hr_mail_campaigns').select('*').eq('id', campaignId).maybeSingle()
    if (!data) return json({ error: 'Campaign not found' }, 404)
    campaign = data
  } else {
    // ---- Validate a fresh send ----------------------------------------
    const subject = String(body.subject || '').trim()
    const bodyHtml = String(body.bodyHtml || '').trim()
    const mailboxId = body.mailboxId as string | undefined
    const recipientMode = body.recipientMode === 'all' ? 'all' : 'selected'

    if (!subject || subject.length > 300) return json({ error: 'Subject is required (max 300 chars)' }, 400)
    if (!bodyHtml) return json({ error: 'Message body is required' }, 400)
    if (!mailboxId) return json({ error: 'A sender mailbox must be selected' }, 400)

    const { data: mailbox } = await admin.from('hr_mailboxes').select('*').eq('id', mailboxId).maybeSingle()
    if (!mailbox || !mailbox.is_active) return json({ error: 'Sender mailbox not found or inactive' }, 400)

    // Resolve recipients SERVER-SIDE
    let recipients: RecipientInput[] = []
    if (recipientMode === 'all') {
      const { data: emps } = await admin
        .from('hr_employees')
        .select('id, first_name, last_name, email, badge_id')
        .eq('is_active', true)
        .not('email', 'is', null)
      recipients = (emps || [])
        .filter((e: any) => e.email)
        .map((e: any) => ({
          email: String(e.email).trim(),
          employee_id: e.id,
          name: [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
        }))
    } else {
      const ids: string[] = Array.isArray(body.employeeIds) ? body.employeeIds.filter((x: any) => typeof x === 'string') : []
      const extras: string[] = Array.isArray(body.extraEmails) ? body.extraEmails.filter((x: any) => typeof x === 'string') : []
      if (ids.length) {
        const { data: emps } = await admin
          .from('hr_employees')
          .select('id, first_name, last_name, email')
          .in('id', ids)
        recipients = (emps || [])
          .filter((e: any) => e.email)
          .map((e: any) => ({
            email: String(e.email).trim(),
            employee_id: e.id,
            name: [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
          }))
      }
      for (const raw of extras) {
        const email = raw.trim()
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) recipients.push({ email, employee_id: null, name: null })
      }
    }

    // Dedup by lowercase email
    const seen = new Set<string>()
    recipients = recipients.filter((r) => {
      const k = (r.email || '').toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })

    if (!recipients.length) return json({ error: 'No valid recipients resolved' }, 400)

    const { data: created, error: campErr } = await admin
      .from('hr_mail_campaigns')
      .insert({
        mailbox_id: mailbox.id,
        from_address: mailbox.from_address,
        subject,
        body_html: bodyHtml,
        recipient_mode: recipientMode,
        attachment_paths: Array.isArray(body.attachmentPaths) ? body.attachmentPaths : [],
        in_reply_to_message_id: body.inReplyToMessageId || null,
        total_count: recipients.length,
        status: 'sending',
        sent_by: auth.userId,
        sent_by_name: body.sentByName || auth.email,
      })
      .select('*')
      .single()

    if (campErr || !created) return json({ error: 'Failed to create campaign', details: campErr?.message }, 500)
    campaign = created
    campaignId = created.id

    // Write recipient rows FIRST (idempotency anchor)
    const rows = recipients.map((r) => ({
      campaign_id: campaignId,
      employee_id: r.employee_id || null,
      employee_name: r.name || null,
      email: r.email!,
      status: 'pending',
    }))
    for (let i = 0; i < rows.length; i += 200) {
      await admin.from('hr_mail_campaign_recipients').upsert(rows.slice(i, i + 200), { onConflict: 'campaign_id,email' })
    }
  }

  // ---- Load mailbox + credentials --------------------------------------
  const { data: mailbox } = await admin.from('hr_mailboxes').select('*').eq('id', campaign.mailbox_id).maybeSingle()
  if (!mailbox) return json({ error: 'Sender mailbox missing' }, 400)

  const smtpHost = Deno.env.get(mailbox.smtp_host_secret) || Deno.env.get('HR_SMTP_HOST')
  const smtpUser = (Deno.env.get(mailbox.smtp_user_secret) || Deno.env.get('HR_SMTP_USER') || '').trim()
  const smtpPass = (Deno.env.get(mailbox.smtp_pass_secret) || Deno.env.get('HR_SMTP_PASS') || '').replace(/\s+/g, '')
  if (!smtpHost || !smtpUser || !smtpPass) return json({ error: 'SMTP credentials are not configured for this mailbox' }, 500)

  // ---- Load attachments from storage -----------------------------------
  const attachments: Array<{ filename: string; content: string; encoding: 'base64'; contentType: string }> = []
  for (const path of (campaign.attachment_paths || [])) {
    const { data: file, error } = await admin.storage.from('hr-mail').download(path)
    if (error || !file) continue
    const buf = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < buf.length; i += 8192) {
      binary += String.fromCharCode(...buf.subarray(i, i + 8192))
    }
    attachments.push({
      filename: path.split('/').pop() || 'attachment',
      content: btoa(binary),
      encoding: 'base64',
      contentType: (file as Blob).type || 'application/octet-stream',
    })
  }

  // ---- Pending recipients only (idempotent on retry) -------------------
  const { data: pending } = await admin
    .from('hr_mail_campaign_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .in('status', action === 'resend_failed' ? ['failed', 'pending'] : ['pending'])
    .limit(500)

  const list = pending || []
  let sent = 0
  let failed = 0

  const client = new SMTPClient({
    connection: { hostname: smtpHost, port: 465, tls: true, auth: { username: smtpUser, password: smtpPass } },
  })

  for (const r of list) {
    const vars = {
      employee_name: r.employee_name || 'Team',
      employee_email: r.email,
      first_name: (r.employee_name || '').split(' ')[0] || 'Team',
    }
    try {
      await client.send({
        from: `${mailbox.from_name || 'HR'} <${mailbox.from_address || smtpUser}>`,
        to: r.email,
        cc: (mailbox.cc_addresses || []).filter((a: string) => a.toLowerCase() !== r.email.toLowerCase()),
        subject: fillPlaceholders(campaign.subject, vars),
        content: 'Please view this email in an HTML-compatible client.',
        html: fillPlaceholders(campaign.body_html, vars),
        attachments: attachments.length ? (attachments as any) : undefined,
      })
      sent++
      await admin.from('hr_mail_campaign_recipients')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
        .eq('id', r.id)
      await admin.from('hr_email_send_log').insert({
        message_id: crypto.randomUUID(),
        template_name: 'hr-mailbox',
        recipient_email: r.email,
        subject: campaign.subject,
        status: 'sent',
      })
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      await admin.from('hr_mail_campaign_recipients')
        .update({ status: 'failed', error_message: msg })
        .eq('id', r.id)
      await admin.from('hr_email_send_log').insert({
        message_id: crypto.randomUUID(),
        template_name: 'hr-mailbox',
        recipient_email: r.email,
        subject: campaign.subject,
        status: 'failed',
        error_message: msg,
      })
    }
  }

  try { await client.close() } catch { /* ignore */ }

  const { count: sentTotal } = await admin
    .from('hr_mail_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'sent')
  const { count: failedTotal } = await admin
    .from('hr_mail_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'failed')

  await admin.from('hr_mail_campaigns').update({
    sent_count: sentTotal || 0,
    failed_count: failedTotal || 0,
    status: (failedTotal || 0) > 0 ? 'completed_with_errors' : 'completed',
  }).eq('id', campaignId)

  return json({ success: true, campaignId, sentThisRun: sent, failedThisRun: failed, sentTotal, failedTotal })
})
