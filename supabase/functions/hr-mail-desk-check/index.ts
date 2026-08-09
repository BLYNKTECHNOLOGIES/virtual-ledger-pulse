import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

// Temporary diagnostic: sends a message TO hr.desk@blynkex.com so inbox routing can be verified.
Deno.serve(async () => {
  const host = Deno.env.get('HR_GMAIL_HOST') || 'smtp.gmail.com'
  const user = (Deno.env.get('HR_GMAIL_USER') || '').trim()
  const pass = (Deno.env.get('HR_GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '')
  const out: Record<string, unknown> = { user }
  try {
    const client = new SMTPClient({
      connection: { hostname: host, port: 465, tls: true, auth: { username: user, password: pass } },
    })
    await client.send({
      from: `HR <${user}>`,
      to: 'hr.desk@blynkex.com',
      subject: 'HR Desk inbox routing test',
      content: 'This message is addressed to hr.desk@blynkex.com.',
    })
    await client.close()
    out.sent = 'ok'
  } catch (e) {
    out.sent = `failed: ${e instanceof Error ? e.message : String(e)}`
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
