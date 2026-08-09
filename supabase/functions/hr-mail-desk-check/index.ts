import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"
import { fetchMessages, parseMessage } from '../_shared/imap-client.ts'

// Temporary diagnostic: can hr@ credentials send AS hr.desk@blynkex.com (alias)?
Deno.serve(async () => {
  const host = Deno.env.get('HR_GMAIL_HOST') || 'smtp.gmail.com'
  const user = (Deno.env.get('HR_GMAIL_USER') || '').trim()
  const pass = (Deno.env.get('HR_GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '')
  const out: Record<string, unknown> = { host, user, hasPass: !!pass }

  try {
    const client = new SMTPClient({
      connection: { hostname: host, port: 465, tls: true, auth: { username: user, password: pass } },
    })
    await client.send({
      from: `HR Desk <hr.desk@blynkex.com>`,
      to: user,
      subject: 'HR Desk alias self-test',
      content: 'Alias send test from HRMS mailbox.',
    })
    await client.close()
    out.aliasSend = 'ok'
  } catch (e) {
    out.aliasSend = `failed: ${e instanceof Error ? e.message : String(e)}`
  }

  try {
    const msgs = await fetchMessages({ host: 'imap.gmail.com', port: 993, user, pass }, 0, 5)
    out.imap = `ok, ${msgs.length} message(s)`
    out.subjects = msgs.map((m) => parseMessage(m.raw).subject)
  } catch (e) {
    out.imap = `failed: ${e instanceof Error ? e.message : String(e)}`
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
