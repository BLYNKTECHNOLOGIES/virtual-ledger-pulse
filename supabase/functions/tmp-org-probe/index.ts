import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(url, service);

  const email = 'abhisheksingh@blynkex.com';
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr) {
    return new Response(JSON.stringify({ stage: 'link', error: linkErr.message }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(url, anon);
  const { data: sess, error: otpErr } = await userClient.auth.verifyOtp({
    token_hash: (link as any).properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr) {
    return new Response(JSON.stringify({ stage: 'otp', error: otpErr.message }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await userClient.rpc('hr_org_chart_directory');
  const rows = (data as any[]) || [];
  const withMgr = rows.filter((r) => r.reporting_manager_id).length;
  await userClient.auth.signOut();

  return new Response(
    JSON.stringify({
      count: rows.length,
      withMgr,
      sample: rows.slice(0, 3),
      error: error?.message ?? null,
      user: sess?.user?.email,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
