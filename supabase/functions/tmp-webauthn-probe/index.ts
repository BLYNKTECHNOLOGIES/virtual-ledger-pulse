import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await supabase.rpc('get_webauthn_credentials', {
    p_user_id: '2b623da8-4ad5-4d3c-bef7-a2976657c5f3',
  });
  return new Response(
    JSON.stringify({ count: data?.length ?? null, error: error?.message ?? null }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
