import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const COLS = [
  'client_code','client_name','nickname','source','resolved_userno','distinct_usernos_on_nick',
  'verified_name','order_count','completed_count','turnover','first_order','last_order',
  'proposed_action','anchor_userno','distinct_usernos_on_client','order_numbers','client_uuid',
]

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(url, key)

  const onlySplits = new URL(req.url).searchParams.get('splits') === '1'

  const all: Record<string, unknown>[] = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await supabase
      .from('client_nickname_merge_audit_report')
      .select('*')
      .order('distinct_usernos_on_client', { ascending: false })
      .order('client_code', { ascending: true })
      .order('order_count', { ascending: false })
      .range(from, from + page - 1)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    all.push(...(data ?? []))
    if (!data || data.length < page) break
    from += page
  }

  let rows = all
  if (onlySplits) {
    const splitClients = new Set(
      all.filter((r) => Number(r.distinct_usernos_on_client) > 1).map((r) => r.client_uuid),
    )
    rows = all.filter((r) => splitClients.has(r.client_uuid))
  }

  const lines = [COLS.join(',')]
  for (const r of rows) lines.push(COLS.map((c) => csvCell(r[c])).join(','))
  const csv = lines.join('\n')

  return new Response(csv, {
    headers: { ...corsHeaders, 'Content-Type': 'text/csv', 'X-Row-Count': String(rows.length) },
  })
})
