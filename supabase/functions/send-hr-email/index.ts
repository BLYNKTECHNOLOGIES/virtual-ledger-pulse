import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const CAREERS_RECIPIENT = 'hr.desk@blynkex.com'

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function nl2br(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return escapeHtml(value).replace(/\n/g, '<br/>')
}

interface CareersApplicationData {
  fullName?: string
  name?: string
  email?: string
  phone?: string
  role?: string
  position?: string
  jobTitle?: string
  department?: string
  experience?: string
  experienceYears?: string | number
  currentCompany?: string
  currentLocation?: string
  noticePeriod?: string
  expectedSalary?: string
  currentSalary?: string
  linkedin?: string
  portfolio?: string
  coverLetter?: string
  message?: string
  source?: string
  [key: string]: unknown
}

const KNOWN_LABELS: Record<string, string> = {
  fullName: 'Full Name',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  role: 'Role Applied For',
  position: 'Position',
  jobTitle: 'Job Title',
  department: 'Department',
  experience: 'Experience',
  experienceYears: 'Years of Experience',
  currentCompany: 'Current Company',
  currentLocation: 'Current Location',
  noticePeriod: 'Notice Period',
  expectedSalary: 'Expected Salary',
  currentSalary: 'Current Salary',
  linkedin: 'LinkedIn',
  portfolio: 'Portfolio / Website',
  coverLetter: 'Cover Letter',
  message: 'Message',
  source: 'Source',
}

function buildCareersHtml(data: CareersApplicationData): string {
  const applicantName = data.fullName || data.name || 'Applicant'
  const role = data.role || data.position || data.jobTitle || 'Not specified'

  const fieldOrder = [
    'fullName', 'name', 'email', 'phone',
    'role', 'position', 'jobTitle', 'department',
    'experience', 'experienceYears', 'currentCompany', 'currentLocation',
    'noticePeriod', 'currentSalary', 'expectedSalary',
    'linkedin', 'portfolio', 'source',
  ]

  const seen = new Set<string>()
  const rows: string[] = []

  for (const key of fieldOrder) {
    if (data[key] === undefined || data[key] === null || data[key] === '') continue
    seen.add(key)
    const label = KNOWN_LABELS[key] || key
    rows.push(`
      <tr>
        <td style="padding:8px 12px;background:#f6f8fa;border:1px solid #e5e7eb;font-weight:600;color:#111827;width:38%;">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${escapeHtml(data[key])}</td>
      </tr>`)
  }

  // Any extra fields not in known list (but skip resume/file blobs and long text handled separately)
  const skipExtras = new Set(['coverLetter', 'message', 'resume', 'resumeBase64', 'resumeFileName', 'resumeMimeType', 'fullName', 'name'])
  for (const [key, value] of Object.entries(data)) {
    if (seen.has(key) || skipExtras.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'object') continue
    const label = KNOWN_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
    rows.push(`
      <tr>
        <td style="padding:8px 12px;background:#f6f8fa;border:1px solid #e5e7eb;font-weight:600;color:#111827;width:38%;">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${escapeHtml(value)}</td>
      </tr>`)
  }

  const longText = data.coverLetter || data.message
  const longTextBlock = longText
    ? `
      <h3 style="font-size:15px;color:#111827;margin:24px 0 8px;">Cover Letter / Message</h3>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;color:#111827;line-height:1.55;font-size:14px;white-space:pre-wrap;">${nl2br(longText)}</div>`
    : ''

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr><td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#0f172a;padding:20px 24px;color:#ffffff;">
              <div style="font-size:18px;font-weight:700;">New Careers Application</div>
              <div style="font-size:13px;opacity:0.85;margin-top:4px;">Blynk Virtual Technologies — Careers</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 4px;font-size:14px;color:#374151;">A new application has been submitted via the Careers page.</p>
              <p style="margin:0 0 18px;font-size:15px;color:#111827;"><strong>${escapeHtml(applicantName)}</strong> has applied for <strong>${escapeHtml(role)}</strong>.</p>

              <h3 style="font-size:15px;color:#111827;margin:8px 0 8px;">Applicant Details</h3>
              <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
                ${rows.join('')}
              </table>

              ${longTextBlock}

              <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">Submitted at ${new Date().toISOString()}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:14px 24px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
              This is an automated notification from the Blynk Careers form. Reply directly to the applicant at ${escapeHtml(data.email || '—')}.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const smtpHost = Deno.env.get('HR_SMTP_HOST')
  const smtpUser = Deno.env.get('HR_SMTP_USER')
  const smtpPass = Deno.env.get('HR_SMTP_PASS')

  if (!supabaseUrl || !supabaseServiceKey || !smtpHost || !smtpUser || !smtpPass) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let recipientEmail: string
  let subject: string
  let htmlBody: string
  let templateName: string
  let idempotencyKey: string
  let messageId: string
  let templateData: CareersApplicationData | undefined
  let attachments: Array<{ filename: string; content: string; contentType?: string; encoding?: string }> | undefined
  let replyTo: string | undefined

  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name || 'hr_email'
    templateData = body.templateData || body.template_data
    attachments = body.attachments
    replyTo = body.replyTo || body.reply_to

    if (templateName === 'careers-application') {
      const data = (templateData || {}) as CareersApplicationData
      recipientEmail = body.recipientEmail || body.recipient_email || CAREERS_RECIPIENT
      const applicantName = data.fullName || data.name || 'Applicant'
      const role = data.role || data.position || data.jobTitle || 'Unspecified Role'
      subject = body.subject || `New Application — ${role} — ${applicantName}`
      htmlBody = buildCareersHtml(data)
      if (!replyTo && data.email) replyTo = String(data.email)
    } else {
      recipientEmail = body.recipientEmail || body.recipient_email
      subject = body.subject
      htmlBody = body.htmlBody || body.html_body
    }

    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!recipientEmail || !subject || !htmlBody) {
    return new Response(
      JSON.stringify({ error: 'recipientEmail, subject, and htmlBody are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Log pending
  await supabase.from('hr_email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: recipientEmail,
    subject,
    status: 'pending',
  })

  try {
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: 465,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPass,
        },
      },
    })

    // Build attachments for denomailer (base64 encoded content)
    const mailAttachments = (attachments || [])
      .filter(a => a && a.filename && a.content)
      .map(a => ({
        filename: a.filename,
        content: a.content,
        encoding: (a.encoding as 'base64') || 'base64',
        contentType: a.contentType || 'application/octet-stream',
      }))

    // CC standard HR oversight recipients on every HR email, deduped against the primary recipient.
    const HR_CC_RECIPIENTS = [
      'shubham.singh@blynkex.com',
      'hr.desk@blynkex.com',
      'abhisheksingh@blynkex.com',
    ]
    const primaryLower = String(recipientEmail).trim().toLowerCase()
    const ccList = HR_CC_RECIPIENTS.filter(addr => addr.toLowerCase() !== primaryLower)

    await client.send({
      from: `HR - Blynk Virtual Technologies <${smtpUser}>`,
      to: recipientEmail,
      cc: ccList.length ? ccList : undefined,
      replyTo: replyTo,
      subject,
      content: "Please view this email in an HTML-compatible client.",
      html: htmlBody,
      attachments: mailAttachments.length ? mailAttachments as any : undefined,
    })

    await client.close()

    // Log success
    await supabase.from('hr_email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipientEmail,
      subject,
      status: 'sent',
    })

    console.log('HR email sent successfully', { recipientEmail, templateName, messageId })

    return new Response(
      JSON.stringify({ success: true, messageId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('HR email send failed', { recipientEmail, templateName, error: errorMessage })

    // Log failure
    await supabase.from('hr_email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipientEmail,
      subject,
      status: 'failed',
      error_message: errorMessage,
    })

    return new Response(
      JSON.stringify({ error: 'Failed to send email', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
