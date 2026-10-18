// deno-lint-ignore-file no-explicit-any
// Copilot · Rephrase (approvers and the operators an approver picked): rewords what is typed in an order chat's message
// box, and queues an operator's sent rewrite for the Playbook inbox. See handler.ts. Called by the Terminal chat only
// while someone is typing in it; there is no background trigger and nothing is ever sent to a client from here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { requireAuth } from '../_shared/require-auth.ts'
import { rateLimit } from '../_shared/cbt.ts'
import { makeStore } from '../_shared/copilot-store.ts'
import { makeAi } from '../_shared/copilot-ai.ts'
import { handleRephrase } from './handler.ts'

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
  // Rewrites and "sent" notes have allowances of their own (the daily rewrite allowance is checked in the handler).
  const key = body?.action === 'used' ? 'copilot-rephrase-used' : 'copilot-rephrase'
  if (!(await rateLimit(gate.admin, `${key}:${gate.userId}`, 120, 10))) return json({ error: 'too_many_requests' }, 429)
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) return json({ error: 'ai_not_configured' }, 503)
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const out = await handleRephrase({ store: makeStore(gate.admin, user), ai: makeAi(apiKey), now: () => new Date() }, gate.userId, body)
  return json(out.body, out.status)
})
