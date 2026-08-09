import { createClient } from 'npm:@supabase/supabase-js@2'
import { syncHrMailboxes } from '../_shared/hr-mail-sync.ts'

// Temporary diagnostic: runs the shared HR mailbox IMAP sync with service-role
// access so shared-account routing can be verified without a browser session.
Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const result = await syncHrMailboxes(admin, { limit: 30 })
  return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
