import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { HR_BRAND, hrHeaderHtml, hrSignatureHtml, hrSignatureText } from '../_shared/hrSignature.ts';

const APP_URL = 'https://erp.blynkex.com';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

type Invite = {
  id: string;
  onboarding_id: string;
  status: string;
  expires_at: string;
  payload: Record<string, unknown>;
};

async function loadInvite(token: string): Promise<{ invite?: Invite; error?: string; status?: number }> {
  if (!token || typeof token !== 'string' || token.length < 20) {
    return { error: 'Invalid link', status: 404 };
  }
  const { data, error } = await admin
    .from('hr_onboarding_invites')
    .select('id, onboarding_id, status, expires_at, payload')
    .eq('token', token)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'This link is not valid.', status: 404 };
  if (new Date(data.expires_at).getTime() < Date.now() && data.status !== 'submitted') {
    return { error: 'This link has expired. Please ask HR for a new one.', status: 410 };
  }
  return { invite: data as Invite };
}

function validate(payload: Record<string, any>): string[] {
  const errs: string[] = [];
  const req = (k: string, label: string) => {
    if (!payload[k] || String(payload[k]).trim() === '') errs.push(`${label} is required`);
  };
  req('first_name', 'First name');
  req('last_name', 'Last name');
  req('date_of_birth', 'Date of birth');
  req('gender', 'Gender');
  req('marital_status', 'Marital status');
  req('phone', 'Mobile number');
  req('email', 'Email');
  req('address', 'Address');
  req('city', 'City');
  req('state', 'State');
  req('zip', 'PIN code');
  req('pan_number', 'PAN number');
  req('aadhaar_number', 'Aadhaar number');
  req('bank_account_name', 'Account holder name');
  req('bank_name', 'Bank name');
  req('bank_account_number', 'Account number');
  req('bank_ifsc', 'IFSC code');

  if (payload.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(payload.email))) errs.push('Email looks invalid');
  if (payload.phone && String(payload.phone).replace(/\D/g, '').length < 10) errs.push('Mobile number must have 10 digits');
  if (payload.pan_number && !PAN_RE.test(String(payload.pan_number).toUpperCase())) errs.push('PAN must be in the format ABCDE1234F');
  if (payload.aadhaar_number && String(payload.aadhaar_number).replace(/\D/g, '').length !== 12) errs.push('Aadhaar must be 12 digits');
  if (payload.bank_ifsc && !IFSC_RE.test(String(payload.bank_ifsc).toUpperCase())) errs.push('IFSC code looks invalid');
  if (payload.zip && String(payload.zip).replace(/\D/g, '').length !== 6) errs.push('PIN code must be 6 digits');
  if (
    payload.bank_account_number &&
    String(payload.bank_account_number) !== String(payload.bank_account_number_confirm || '')
  ) errs.push('Account numbers do not match');
  if (!payload.declaration_accepted) errs.push('Please accept the declaration');
  return errs;
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function requireHr(req: Request): Promise<{ userId?: string; error?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return { error: 'Unauthorized' };
  const { data, error } = await admin.auth.getClaims(authHeader.replace('Bearer ', ''));
  if (error || !data?.claims?.sub) return { error: 'Unauthorized' };
  const userId = String(data.claims.sub);
  const { data: isHr } = await admin.rpc('hr_is_hr_staff', { _user_id: userId });
  if (!isHr) return { error: 'Forbidden' };
  return { userId };
}

async function mailInvite(to: string, name: string, link: string, expiresAt: string) {
  const { data: mailbox } = await admin
    .from('hr_mailboxes').select('*').eq('is_active', true).order('created_at').limit(1).maybeSingle();
  if (!mailbox) throw new Error('No active HR mailbox configured');

  const host = Deno.env.get(mailbox.smtp_host_secret || '') || Deno.env.get('HR_SMTP_HOST');
  const user = (Deno.env.get(mailbox.smtp_user_secret || '') || Deno.env.get('HR_SMTP_USER') || '').trim();
  const pass = (Deno.env.get(mailbox.smtp_pass_secret || '') || Deno.env.get('HR_SMTP_PASS') || '').replace(/\s+/g, '');
  if (!host || !user || !pass) throw new Error('SMTP credentials are not configured for the HR mailbox');

  const B = HR_BRAND;
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const expiry = new Date(expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:24px 14px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e6ecf3;border-radius:12px;border-collapse:separate;"><tr><td>${hrHeaderHtml()}</td></tr><tr><td style="padding:20px 22px;"><div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${B.blue};background:#f0f9ff;display:inline-block;padding:4px 10px;border-radius:999px;">Action required</div><h1 style="margin:12px 0 8px;font-size:18px;line-height:1.35;color:${B.ink};font-weight:700;">Complete your onboarding details</h1><p style="margin:0 0 14px;font-size:13.5px;color:#475569;line-height:1.6;">Dear ${esc(name || 'Colleague')}, please complete your onboarding form. No login required.</p><a href="${link}" style="display:inline-block;background:${B.blue};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;">Open onboarding form</a><p style="margin:14px 0 0;font-size:12px;color:#64748b;">Valid until ${esc(expiry)}.</p>${hrSignatureHtml('Automated notice · Employee onboarding')}</td></tr></table><div style="text-align:center;font-size:10.5px;color:#94a3b8;padding:14px 6px;">Blynk Virtual Technologies Pvt. Ltd. · HRMS automated notification</div></div></body></html>`;

  const text = `Complete your onboarding details\n\nDear ${name || 'Colleague'}, please complete your onboarding form. No login required.\n\n${link}\n\nValid until ${expiry}.\n\n${hrSignatureText('Automated notice · Employee onboarding')}`;


  const client = new SMTPClient({ connection: { hostname: host, port: 465, tls: true, auth: { username: user, password: pass } } });
  try {
    await client.send({
      from: `${mailbox.from_name || 'Blynkex HR'} <${mailbox.from_address || user}>`,
      to,
      subject: 'Complete your onboarding details - Blynk',
      content: text,
      html,
    });
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
  await admin.from('hr_email_send_log').insert({
    message_id: `onboarding-invite-${crypto.randomUUID()}`,
    template_name: 'onboarding-invite',
    recipient_email: to,
    subject: 'Complete your onboarding details - Blynk',
    status: 'sent',
    metadata: { link },
  });
  return mailbox.from_address || user;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const token = String(body?.token || '');

    // ── HR-authenticated actions ──
    if (action === 'sample') {
      const auth = await requireHr(req);
      if (auth.error) return json({ error: auth.error }, auth.error === 'Forbidden' ? 403 : 401);
      const to = String(body?.recipientEmail || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'A valid email is required' }, 400);
      const sentFrom = await mailInvite(
        to,
        String(body?.name || 'Colleague'),
        `${APP_URL}/onboarding/apply/sample-preview-token`,
        new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
      );
      return json({ ok: true, sentTo: to, sentFrom });
    }

    if (action === 'issue' || action === 'send') {

      const auth = await requireHr(req);
      if (auth.error) return json({ error: auth.error }, auth.error === 'Forbidden' ? 403 : 401);

      const onboardingId = String(body?.onboardingId || '');
      if (!onboardingId) return json({ error: 'onboardingId is required' }, 400);

      const { data: onb } = await admin
        .from('hr_employee_onboarding')
        .select('id, first_name, last_name, email')
        .eq('id', onboardingId)
        .maybeSingle();
      if (!onb) return json({ error: 'Onboarding record not found' }, 404);

      let { data: existing } = await admin
        .from('hr_onboarding_invites')
        .select('id, token, status, expires_at, submitted_at')
        .eq('onboarding_id', onboardingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const expired = existing && new Date(existing.expires_at).getTime() < Date.now();
      if (!existing || body?.reissue === true || (expired && existing.status !== 'submitted')) {
        const { data: created, error: cErr } = await admin
          .from('hr_onboarding_invites')
          .insert({
            onboarding_id: onboardingId,
            token: newToken(),
            created_by: auth.userId,
            expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
          })
          .select('id, token, status, expires_at, submitted_at')
          .single();
        if (cErr) return json({ error: cErr.message }, 500);
        existing = created;
      }

      const link = `${APP_URL}/onboarding/apply/${existing!.token}`;

      if (action === 'send') {
        const to = String(body?.recipientEmail || onb.email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'A valid candidate email is required' }, 400);
        const sentFrom = await mailInvite(to, `${onb.first_name || ''} ${onb.last_name || ''}`.trim(), link, existing!.expires_at);
        await admin.from('hr_onboarding_invites').update({ emailed_at: new Date().toISOString() }).eq('id', existing!.id);
        return json({ ok: true, link, sentTo: to, sentFrom, invite: existing });
      }

      return json({ ok: true, link, invite: existing });
    }

    const { invite, error, status } = await loadInvite(token);
    if (!invite) return json({ error }, status || 400);

    if (action === 'get') {
      if (invite.status === 'pending') {
        await admin
          .from('hr_onboarding_invites')
          .update({ status: 'opened', opened_at: new Date().toISOString() })
          .eq('id', invite.id);
      }
      const { data: onb } = await admin
        .from('hr_employee_onboarding')
        .select('first_name, last_name, email, phone')
        .eq('id', invite.onboarding_id)
        .maybeSingle();

      const prefill = {
        first_name: onb?.first_name || '',
        last_name: onb?.last_name || '',
        email: onb?.email || '',
        phone: onb?.phone || '',
      };
      return json({
        status: invite.status === 'pending' ? 'opened' : invite.status,
        submitted: invite.status === 'submitted',
        payload: { ...prefill, ...(invite.payload || {}) },
      });
    }

    if (invite.status === 'submitted') {
      return json({ error: 'This form has already been submitted.' }, 409);
    }

    if (action === 'save') {
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const { error: upErr } = await admin
        .from('hr_onboarding_invites')
        .update({ payload })
        .eq('id', invite.id);
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true });
    }

    if (action === 'upload-url') {
      const field = String(body?.field || '').replace(/[^a-z0-9_-]/gi, '');
      const filename = String(body?.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      if (!field) return json({ error: 'Missing field' }, 400);
      const path = `onboarding/${invite.onboarding_id}/self/${field}/${Date.now()}-${filename}`;
      const { data, error: sErr } = await admin.storage
        .from('employee-documents')
        .createSignedUploadUrl(path);
      if (sErr) return json({ error: sErr.message }, 500);
      return json({ path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === 'submit') {
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const errs = validate(payload);
      if (errs.length) return json({ error: 'Please fix the highlighted fields', details: errs }, 400);

      const normalized = {
        ...payload,
        pan_number: String(payload.pan_number).toUpperCase(),
        bank_ifsc: String(payload.bank_ifsc).toUpperCase(),
        submitted_from_ip: req.headers.get('x-forwarded-for') || null,
      };

      const { error: upErr } = await admin
        .from('hr_onboarding_invites')
        .update({ payload: normalized, status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', invite.id);
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('onboarding-invite error', e);
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
