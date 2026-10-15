// deno-lint-ignore-file no-explicit-any
// Copilot v2 draft engine (approvers only). See handler.ts. Called by the Terminal chat panel only while an
// approver has the chat open; there is no background trigger.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { requireAuth } from '../_shared/require-auth.ts'
import { rateLimit } from '../_shared/cbt.ts'
import { makeStore } from '../_shared/copilot-store.ts'
import { makeAi } from '../_shared/copilot-ai.ts'
import { handleDraft } from './handler.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const gate = await requireAuth(req, { corsHeaders })
  if (!gate.ok) return gate.response
  let body: any
  try { body = await req.json() } catch { return json({ error: 'invalid', field: 'body' }, 400) }
  if (!(await rateLimit(gate.admin, `copilot-draft:${gate.userId}`, 90, 10))) return json({ error: 'too_many_requests' }, 429)
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) return json({ error: 'ai_not_configured' }, 503)
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const out = await handleDraft({ store: makeStore(gate.admin, user), ai: makeAi(key), now: () => new Date() }, gate.userId, body)
  return json(out.body, out.status)
})
