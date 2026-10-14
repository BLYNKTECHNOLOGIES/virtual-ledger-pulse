// deno-lint-ignore-file no-explicit-any
// ATS: writes a short reply draft for HR from the recent emails with one candidate. HR staff only; off by default.
// Nothing is sent and nothing is stored. Context is built here from the database only, with no contact details,
// salary, notes, ratings, ref numbers, meeting links, pick-a-time links or files. Logs hold counts and timings only.
import { requireAuth } from '../_shared/require-auth.ts'
import { rateLimit } from '../_shared/cbt.ts'
import { stripQuoted } from '../_shared/ats-intent.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ist = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso)) + ' IST'

/** Removes things the AI must never see from free text. */
export function scrub(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]*\/interview\/pick\/[A-Za-z0-9_-]+/gi, '[pick-a-time link]')
    .replace(/\/interview\/pick\/[A-Za-z0-9_-]+/gi, '[pick-a-time link]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(\+?\d[\d\s-]{8,}\d)/g, '[phone]')
}

const SYSTEM = (company: string, first: string) =>
  `You write short email replies for the HR team of ${company} to a job candidate. Rules: 1) Reply to what the candidate last wrote. 2) Use only the facts given; never invent dates, times, salary, selection decisions, offers or promises. If a time is needed and none is given, ask the candidate for two or three times that suit them. 3) If the candidate wrote in Hinglish, reply in simple Hinglish; otherwise reply in simple, polite English. 4) Start with 'Dear ${first},'. 5) At most 120 words. 6) No signature and no sender name: the signature is added automatically; end with 'Warm regards,'. 7) Plain text only. Return strict JSON: {"body": string}.`

export const DRAFT_MODEL = 'google/gemini-3-flash-preview'
export const draftRequest = (company: string, first: string, userMsg: string) => ({
  model: DRAFT_MODEL,
  messages: [{ role: 'system', content: SYSTEM(company, first) }, { role: 'user', content: userMsg }],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'reply_draft', strict: true,
      schema: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'], additionalProperties: false },
    },
  },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const t0 = Date.now()
  const log = (outcome: string, extra: Record<string, number> = {}) =>
    console.log(JSON.stringify({ fn: 'ats-reply-draft', outcome, ms: Date.now() - t0, ...extra }))

  const gate = await requireAuth(req, { corsHeaders })
  if (!gate.ok) return gate.response
  const db = gate.admin as any
  const { data: staff } = await db.rpc('hr_is_hr_staff', { _user_id: gate.userId })
  if (!staff) return json({ error: 'forbidden' }, 403)

  const { data: settings } = await db.from('ats_settings').select('ai_drafts_enabled, mail_enabled').eq('id', true).maybeSingle()
  if (!settings?.ai_drafts_enabled) { log('ai_off'); return json({ error: 'ai_off' }, 409) }
  if (!settings?.mail_enabled) { log('mail_disabled'); return json({ error: 'mail_disabled' }, 409) }

  let body: any
  try { body = await req.json() } catch { return json({ error: 'invalid', field: 'body' }, 400) }
  const candidateId = String(body?.candidateId ?? '')
  if (!UUID_RE.test(candidateId)) return json({ error: 'invalid', field: 'candidateId' }, 400)
  let applicationId: string | null = body?.applicationId ? String(body.applicationId) : null
  if (applicationId && !UUID_RE.test(applicationId)) return json({ error: 'invalid', field: 'applicationId' }, 400)

  if (!(await rateLimit(db, `ai-draft:${gate.userId}`, 30, 60))) { log('ai_busy_limit'); return json({ error: 'ai_busy' }, 429) }

  try {
    const { data: msgs } = await db.from('ats_messages')
      .select('direction, body_text, received_at, sent_at, created_at, status, intent, intent_data, application_id')
      .eq('candidate_id', candidateId).eq('is_automatic', false)
      .or('direction.eq.inbound,status.eq.sent')
      .order('created_at', { ascending: false }).limit(6)
    const recent = [...(msgs ?? [])].reverse()
    if (!recent.some((m: any) => m.direction === 'inbound')) { log('nothing_to_reply'); return json({ error: 'nothing_to_reply' }, 409) }

    if (!applicationId) {
      const { data: app } = await db.from('ats_applications').select('id').eq('candidate_id', candidateId)
        .order('applied_at', { ascending: false }).limit(1).maybeSingle()
      applicationId = app?.id ?? null
    } else {
      const { data: app } = await db.from('ats_applications').select('id').eq('id', applicationId).eq('candidate_id', candidateId).maybeSingle()
      if (!app) return json({ error: 'not_found' }, 404)
    }

    const { data: tv } = await db.rpc('ats_template_values', { p_application_id: applicationId, p_candidate_id: candidateId, p_interview_id: null })
    const v = (tv ?? {}) as Record<string, string>
    const facts: Record<string, string> = {}
    for (const k of ['first_name', 'job_title', 'company_name', 'office_address', 'stage_name']) {
      if (v[k] && String(v[k]).trim()) facts[k] = String(v[k]).trim()
    }

    let interview: Record<string, string> | null = null
    if (applicationId) {
      const { data: iv } = await db.from('ats_interviews').select('title, mode, starts_at, location')
        .eq('application_id', applicationId).eq('status', 'scheduled').gt('ends_at', new Date().toISOString())
        .order('starts_at').limit(1).maybeSingle()
      if (iv) {
        interview = {
          title: String(iv.title ?? 'Interview'), when: ist(iv.starts_at), mode: String(iv.mode),
          place: iv.mode === 'in_person' ? scrub(String(iv.location || facts.office_address || 'our office')) : iv.mode === 'video' ? 'video call' : 'phone call',
        }
      }
    }

    const lastIn = [...recent].reverse().find((m: any) => m.direction === 'inbound')
    const times = Array.isArray(lastIn?.intent_data?.times)
      ? lastIn.intent_data.times.map((t: any) => String(t?.label ?? '')).filter(Boolean).slice(0, 3) : []

    const thread = recent.map((m: any) => {
      const raw = m.direction === 'inbound' ? stripQuoted(String(m.body_text ?? '')) : String(m.body_text ?? '')
      return {
        from: m.direction === 'inbound' ? 'Candidate' : 'HR',
        at: ist(m.received_at ?? m.sent_at ?? m.created_at),
        text: scrub(raw).slice(0, 1500),
      }
    })

    const userMsg = JSON.stringify({
      facts,
      next_interview: interview,
      latest_reply: { intent: lastIn?.intent ?? null, proposed_times: times },
      emails: thread,
    })

    const key = Deno.env.get('LOVABLE_API_KEY')
    if (!key) { log('no_key'); return json({ error: 'ai_failed' }, 500) }
    // Gemini on the Lovable AI gateway (same model and endpoint as staff-chat); strict JSON reply.
    let text: string
    try {
      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify(draftRequest(facts.company_name || 'our company', facts.first_name || 'Candidate', userMsg)),
      })
      if (!resp.ok) {
        log('gateway_error', { status: resp.status, emails: thread.length })
        return resp.status === 429 || resp.status === 402 ? json({ error: 'ai_busy' }, 429) : json({ error: 'ai_failed' }, 502)
      }
      const out = await resp.json()
      text = String(out?.choices?.[0]?.message?.content ?? '')
    } catch (_e) {
      log('gateway_error', { status: 0, emails: thread.length })
      return json({ error: 'ai_failed' }, 502)
    }
    let parsed: any
    try {
      parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    } catch { log('unreadable'); return json({ error: 'ai_failed' }, 502) }
    const out = typeof parsed?.body === 'string' ? parsed.body.replace(/\{\{[^}]*\}\}/g, '').trim().slice(0, 2000) : ''
    if (!out) { log('empty'); return json({ error: 'ai_failed' }, 502) }
    log('ok', { emails: thread.length, facts: Object.keys(facts).length, chars: out.length })
    return json({ body: out })
  } catch (_e) {
    log('error')
    return json({ error: 'ai_failed' }, 500)
  }
})
