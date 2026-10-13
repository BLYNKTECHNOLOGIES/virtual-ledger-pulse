// deno-lint-ignore-file no-explicit-any
// ATS public: a candidate opens a pick-a-time link (no login) and picks one of the offered interview times.
// Body: { action: 'view' | 'book', token, start? }. Only the token's sha256 is used; the token is never logged or stored.
// The page data never contains contact details or notes.
import { admin, corsHeaders, ipHash, json, rateLimit, sha256Hex } from '../_shared/cbt.ts'
import { notifyInterview } from '../_shared/ats-interview-notify.ts'

const REASONS: Record<string, string> = {
  mail_disabled: 'candidate email is off',
  mailbox_unavailable: "the HR mailbox isn't available",
  no_email: 'the candidate has no email address',
  candidate_closed: 'the candidate record is closed',
}

const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ status: 'error' }, 405)
  const t0 = Date.now()
  let action = 'unknown'
  const done = (body: Record<string, unknown>, status = 200) => {
    console.log(JSON.stringify({ action, outcome: body.status, ms: Date.now() - t0 }))
    return json(body, status)
  }
  try {
    let body: any
    try { body = await req.json() } catch { return done({ status: 'invalid' }) }
    action = body?.action === 'book' ? 'book' : body?.action === 'view' ? 'view' : 'unknown'
    if (action === 'unknown') return done({ status: 'invalid' })
    const token = typeof body?.token === 'string' ? body.token : ''
    if (!TOKEN_RE.test(token)) return done({ status: 'invalid' })

    const db = admin() as any
    const ip = await ipHash(req)
    const ok = action === 'view'
      ? await rateLimit(db, `pick-view:${ip}`, 60, 15)
      : await rateLimit(db, `pick-book:${ip}`, 10, 15)
    if (!ok) return done({ status: 'busy' }, 429)

    const hash = await sha256Hex(token)
    if (action === 'view') {
      const { data, error } = await db.rpc('ats_slot_offer_view', { p_token_hash: hash })
      if (error) return done({ status: 'error' }, 500)
      return done(data ?? { status: 'invalid' })
    }

    const start = typeof body?.start === 'string' ? new Date(body.start) : null
    if (!start || isNaN(start.getTime())) return done({ status: 'invalid' })
    const { data: r, error } = await db.rpc('ats_book_slot', { p_token_hash: hash, p_start: start.toISOString() })
    if (error) {
      const m = String(error.message ?? '')
      if (m.includes('ATS_SLOT_GONE')) return done({ status: 'gone' }, 409)
      if (m.includes('ATS_OFFER_CLOSED')) return done({ status: 'closed' }, 409)
      if (m.includes('ATS_SELF_SCHEDULE_OFF')) return done({ status: 'off' }, 409)
      return done({ status: 'error' }, 500)
    }

    // Confirmation email exactly like the Schedule interview dialog, to the candidate only (awaited, so the page
    // never claims an email that wasn't sent). A failure never undoes the booking.
    const action2 = r.moved ? 'update' : 'invite'
    let emailed = false
    let reason = 'sending failed (see Messages)'
    let opts: Record<string, unknown> = { actorName: 'ATS (automatic)', automatic: true, origin: null }
    try {
      const code = r.moved ? 'interview-rescheduled' : 'interview-scheduled'
      const [{ data: tpl }, { data: settings }] = await Promise.all([
        db.from('ats_email_templates').select('subject, body').eq('code', code).maybeSingle(),
        db.from('ats_settings').select('public_app_url').eq('id', true).maybeSingle(),
      ])
      opts = { ...opts, origin: settings?.public_app_url ?? null }
      if (!tpl) {
        reason = 'the confirmation template is missing'
      } else {
        const res = await notifyInterview(db, null, {
          interviewId: r.interview_id, action: action2,
          candidate: { id: crypto.randomUUID(), subject: tpl.subject, body: tpl.body, templateCode: code },
          notifyPanel: false, attachResume: false,
        }, opts)
        const c = (res.body as any)?.candidate
        emailed = res.status === 200 && c?.status === 'sent'
        const err = String((res.body as any)?.error ?? c?.error ?? c?.status ?? '')
        reason = REASONS[err] ?? reason
      }
    } catch (_e) {
      console.log(JSON.stringify({ action, outcome: 'email_failed' }))
    }

    if (!emailed) {
      try {
        const { data: iv } = await db.from('ats_interviews').select('candidate_id, application_id').eq('id', r.interview_id).maybeSingle()
        if (iv) {
          const { data: app } = await db.from('ats_applications').select('job_id').eq('id', iv.application_id).maybeSingle()
          await db.from('ats_events').insert({
            candidate_id: iv.candidate_id, application_id: iv.application_id, job_id: app?.job_id ?? null,
            event_type: 'email_failed', actor_name: 'ATS (automatic)',
            summary: `Confirmation of the picked time was not emailed: ${reason}`,
            data: { interview_id: r.interview_id, reason },
          })
          await db.from('ats_conversation_state').upsert({
            candidate_id: iv.candidate_id, follow_up_at: new Date().toISOString(), done_at: null, snoozed_until: null,
            updated_at: new Date().toISOString(), updated_by: null, updated_by_name: 'Candidate picked a time',
          }, { onConflict: 'candidate_id' })
        }
      } catch (_e) {
        console.log(JSON.stringify({ action, outcome: 'flag_failed' }))
      }
    }

    // Interviewer invites go out after the reply, so the candidate doesn't wait.
    if (r.notify_panel) {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime?.waitUntil(
        notifyInterview(db, null, { interviewId: r.interview_id, action: action2, candidate: null, notifyPanel: true, attachResume: false }, opts).catch(() => {}),
      )
    }
    return done({ status: 'booked', start: r.start, place: r.place, moved: !!r.moved, emailed })
  } catch (_e) {
    return done({ status: 'error' }, 500)
  }
})
