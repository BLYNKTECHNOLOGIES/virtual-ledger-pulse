// TEMPORARY diagnostic: verifies IMAP fetch/parse pipeline against Gmail. Deleted after use.
import { fetchMessages, parseMessage } from '../_shared/imap-client.ts'

Deno.serve(async () => {
  const user = (Deno.env.get('HR_GMAIL_USER') || '').trim()
  const pass = (Deno.env.get('HR_GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '')
  try {
    const msgs = await fetchMessages({ host: 'imap.gmail.com', port: 993, user, pass }, 0, 3)
    const parsed = msgs.map((m) => {
      const p = parseMessage(m.raw)
      return { uid: m.uid, from: p.fromAddress, subject: p.subject, date: p.date, hasHtml: !!p.html }
    })
    return new Response(JSON.stringify({ count: msgs.length, parsed }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { headers: { 'Content-Type': 'application/json' } })
  }
})
