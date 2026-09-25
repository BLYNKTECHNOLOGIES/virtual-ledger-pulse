import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL = 'https://erp.blynkex.com';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('send'),
    user_id: z.string().uuid(),
    trust_level: z.enum(['office', 'view_only']),
    note: z.string().max(300).optional().nullable(),
  }),
  z.object({ action: z.literal('revoke'), invite_id: z.string().uuid() }),
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user) return json({ error: 'Invalid session' }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: canManage } = await admin.rpc('terminal_can_manage_devices', { p_user_id: me.user.id });
    if (!canManage) return json({ error: 'Only terminal user managers can do this' }, 403);

    if (body.action === 'revoke') {
      const { error } = await userClient.rpc('revoke_terminal_biometric_invite', { p_invite_id: body.invite_id });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    const { data: target } = await admin
      .from('users')
      .select('id, email, first_name, last_name, username')
      .eq('id', body.user_id)
      .maybeSingle();
    if (!target) return json({ error: 'User not found' }, 404);
    const email = String(target.email || '').trim();
    if (!email || !email.includes('@')) {
      return json({ error: 'This user has no email address on file — add one in User Management first.' }, 400);
    }

    const { data: rows, error: cErr } = await userClient.rpc('create_terminal_biometric_invite', {
      p_user_id: body.user_id,
      p_trust_level: body.trust_level,
      p_note: body.note ?? null,
      p_hours: 24,
    });
    if (cErr) return json({ error: cErr.message }, 400);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.token) return json({ error: 'Could not create invite' }, 500);

    await admin.from('terminal_biometric_invites').update({ sent_to_email: email }).eq('id', row.invite_id);

    const link = `${APP_URL}/terminal/register-device?token=${encodeURIComponent(row.token)}`;
    const name = [target.first_name, target.last_name].filter(Boolean).join(' ') || target.username || 'there';
    const levelText = body.trust_level === 'office'
      ? 'an <b>office device with full access</b>'
      : 'a <b>personal device with view-only access</b> (you can watch, but not act)';
    const expires = new Date(row.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const html = `<p>Hi ${esc(name)},</p>
<p>You have been invited to register your fingerprint for the Blynk P2P Trading Terminal as ${levelText}.</p>
<p>Open this link <b>on the computer you want to register</b>, sign in, and follow the steps:</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0891b2;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700">Register this device</a></p>
<p style="font-size:12px;color:#555">The link works once, for one device, until ${esc(expires)} IST. Do not forward it.</p>
${body.note ? `<p><i>Note from admin:</i> ${esc(body.note)}</p>` : ''}`;

    const mailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-hr-email`, {
      method: 'POST',
      headers: { Authorization: auth, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: 'terminal-biometric-invite',
        recipientEmail: email,
        subject: 'Register your device for the Blynk Trading Terminal',
        htmlBody: html,
      }),
    });
    if (!mailRes.ok) {
      const t = await mailRes.text();
      console.error('mail failed', mailRes.status, t);
      return json({ success: true, email_failed: true, invite_id: row.invite_id, link, sent_to: email, expires_at: row.expires_at });
    }
    return json({ success: true, invite_id: row.invite_id, sent_to: email, link, expires_at: row.expires_at });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
