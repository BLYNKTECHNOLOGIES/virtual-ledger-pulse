import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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

  try {
    const body = await req.json()
    recipientEmail = body.recipientEmail || body.recipient_email
    subject = body.subject
    htmlBody = body.htmlBody || body.html_body
    templateName = body.templateName || body.template_name || 'hr_email'
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

    await client.send({
      from: `HR - Blynk Virtual Technologies <${smtpUser}>`,
      to: recipientEmail,
      subject,
      content: "Please view this email in an HTML-compatible client.",
      html: htmlBody,
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
