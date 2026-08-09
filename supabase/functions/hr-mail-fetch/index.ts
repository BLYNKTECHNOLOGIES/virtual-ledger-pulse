import { requireAuth } from '../_shared/require-auth.ts'
import { syncHrMailboxes } from '../_shared/hr-mail-sync.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const auth = await requireAuth(req, { corsHeaders })
  if (!auth.ok) return auth.response

  let body: any = {}
  try { body = await req.json() } catch { /* optional body */ }

  const result = await syncHrMailboxes(auth.admin, { mailboxId: body.mailboxId, limit: body.limit })
  return json(result)
})
