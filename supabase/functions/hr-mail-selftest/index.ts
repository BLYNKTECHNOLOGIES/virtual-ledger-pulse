// TEMPORARY diagnostic function: verifies Gmail SMTP + IMAP credentials.
// Returns only pass/fail strings, never credential values. Deleted after use.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

Deno.serve(async () => {
  const user = Deno.env.get('HR_GMAIL_USER') || ''
  const pass = Deno.env.get('HR_GMAIL_APP_PASSWORD') || ''
  const host = Deno.env.get('HR_GMAIL_HOST') || 'smtp.gmail.com'
  const out: Record<string, unknown> = { userConfigured: !!user, passConfigured: !!pass, host }

  // --- SMTP ---
  try {
    const client = new SMTPClient({
      connection: { hostname: host, port: 465, tls: true, auth: { username: user, password: pass.replace(/\s+/g, '') } },
    })
    await client.send({
      from: `Blynk HR <${user}>`,
      to: user,
      subject: 'HRMS mailbox self-test',
      content: 'HRMS mailbox self-test',
      html: '<p>HRMS mailbox self-test — SMTP works.</p>',
    })
    await client.close()
    out.smtp = 'ok'
  } catch (e) {
    out.smtp = 'FAIL: ' + (e instanceof Error ? e.message : String(e))
  }

  // --- IMAP ---
  try {
    const conn = await Deno.connectTls({ hostname: 'imap.gmail.com', port: 993 })
    const dec = new TextDecoder(); const enc = new TextEncoder()
    const buf = new Uint8Array(8192)
    const read = async () => { const n = await conn.read(buf); return n ? dec.decode(buf.subarray(0, n)) : '' }
    await read()
    await conn.write(enc.encode(`a1 LOGIN "${user}" "${pass.replace(/\s+/g, '')}"\r\n`))
    const loginResp = await read()
    out.imap = loginResp.includes('a1 OK') ? 'ok' : 'FAIL: ' + loginResp.trim().slice(0, 200)
    try { await conn.write(enc.encode('a2 LOGOUT\r\n')) } catch { /* ignore */ }
    conn.close()
  } catch (e) {
    out.imap = 'FAIL: ' + (e instanceof Error ? e.message : String(e))
  }

  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})
