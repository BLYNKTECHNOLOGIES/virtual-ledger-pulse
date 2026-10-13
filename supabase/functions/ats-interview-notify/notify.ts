// deno-lint-ignore-file no-explicit-any
// ATS: emails about one interview, from the HR mailbox chosen in ATS settings. HR staff only.
// - The candidate gets the invitation, the update or the cancellation with a calendar invite. It is filed on the
//   candidate's Messages like any ATS email, so replies and retries work the same way.
// - Each interviewer gets their own calendar invite (or cancellation), with the candidate's resume if asked. These
//   are not filed on the candidate; the outcome is kept on ats_interview_panel.
// Body: { interviewId, action: "invite" | "update" | "cancel",
//         candidate?: { id, subject, body, templateCode? } | null, notifyPanel?: boolean, attachResume?: boolean }
// The subject and body may use {{placeholders}}; they are filled from the saved interview.
// index.ts only starts the server; the work is here so it can be tested without a server.
import { requireAuth } from '../_shared/require-auth.ts'
import { notifyInterview, type NotifyOptions } from '../_shared/ats-interview-notify.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

export type { NotifyOptions }
export { durationText, istDateText, istShortDate, istTimeText, notifyInterview } from '../_shared/ats-interview-notify.ts'

export async function handleNotify(req: Request, opts: NotifyOptions = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const gate = await requireAuth(req, { corsHeaders })
  if (!gate.ok) return gate.response
  const admin = gate.admin as any
  const { data: staff } = await admin.rpc('hr_is_hr_staff', { _user_id: gate.userId })
  if (!staff) return json({ error: 'forbidden' }, 403)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid', field: 'body' }, 400)
  }
  const r = await notifyInterview(admin, gate.userId, body, { ...opts, origin: opts.origin ?? req.headers.get('origin') })
  return json(r.body, r.status)
}
