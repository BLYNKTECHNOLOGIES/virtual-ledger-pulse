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

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:24px 14px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e6ecf3;border-radius:12px;border-collapse:separate;"><tr><td>${hrHeaderHtml()}</td></tr><tr><td style="padding:20px 22px;"><div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${B.blue};background:#f0f9ff;display:inline-block;padding:4px 10px;border-radius:999px;">Action required</div><h1 style="margin:12px 0 8px;font-size:18px;line-height:1.35;color:${B.ink};font-weight:700;">Complete your onboarding details</h1><p style="margin:0 0 14px;font-size:13.5px;color:#475569;line-height:1.6;">Dear ${esc(name || 'Colleague')}, please complete your onboarding form.</p><a href="${link}" style="display:inline-block;background:${B.blue};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:700;">Open onboarding form</a><p style="margin:14px 0 0;font-size:12px;color:#64748b;">Valid until ${esc(expiry)}.</p>${hrSignatureHtml('Automated notice · Employee onboarding')}</td></tr></table><div style="text-align:center;font-size:10.5px;color:#94a3b8;padding:14px 6px;">Blynk Virtual Technologies Pvt. Ltd. · HRMS automated notification</div></div></body></html>`;

  const text = `Complete your onboarding details\n\nDear ${name || 'Colleague'}, please complete your onboarding form.\n\n${link}\n\nValid until ${expiry}.\n\n${hrSignatureText('Automated notice · Employee onboarding')}`;


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

// ── Candidate submission → HR onboarding draft ──────────────────────────────
// Candidate document keys map onto the Stage 3 checklist keys so uploads show
// up where HR already reviews them.
const DOC_KEY_MAP: Record<string, string> = {
  pan_card: 'pan',
  aadhaar: 'aadhaar',
  photo: 'passport_photo',
  cancelled_cheque: 'bank_details',
  education: 'educational_certificate',
  experience: 'experience_letter',
};

function publicUrl(path: string): string {
  return `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/employee-documents/${path}`;
}

async function mergeIntoOnboarding(onboardingId: string, p: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  const { data: onb } = await admin
    .from('hr_employee_onboarding')
    .select('id, documents')
    .eq('id', onboardingId)
    .maybeSingle();
  if (!onb) return { ok: false, error: 'Onboarding record not found' };

  const docs: Record<string, any> = (onb.documents && typeof onb.documents === 'object') ? { ...onb.documents } : {};
  const files: Record<string, Array<{ path: string; name: string }>> = p.documents || {};

  const setDoc = (key: string, patch: Record<string, any>) => {
    docs[key] = { received: false, value: '', ...(docs[key] || {}), ...patch };
  };

  for (const [srcKey, list] of Object.entries(files)) {
    const target = DOC_KEY_MAP[srcKey];
    if (!target || !Array.isArray(list) || list.length === 0) continue;
    setDoc(target, {
      received: true,
      file_url: publicUrl(list[0].path),
      file_name: list[0].name,
      extra_files: list.slice(1).map((f) => ({ url: publicUrl(f.path), name: f.name })),
      source: 'candidate_form',
    });
  }
  if (p.pan_number) setDoc('pan', { value: String(p.pan_number).toUpperCase(), source: 'candidate_form' });
  if (p.aadhaar_number) setDoc('aadhaar', { value: String(p.aadhaar_number), source: 'candidate_form' });
  if (p.uan_number) setDoc('uan', { value: String(p.uan_number), received: true, source: 'candidate_form' });
  if (p.esic_number) setDoc('esic', { value: String(p.esic_number), received: true, source: 'candidate_form' });
  if (p.pf_number) setDoc('pf_account_number', { value: String(p.pf_number), received: true, source: 'candidate_form' });

  const update: Record<string, any> = {
    first_name: p.first_name || undefined,
    last_name: p.last_name || undefined,
    email: p.email || undefined,
    phone: p.phone || undefined,
    gender: p.gender || undefined,
    marital_status: p.marital_status || undefined,
    date_of_birth: p.date_of_birth || undefined,
    documents: docs,
    bank_details: {
      account_number: String(p.bank_account_number || '').trim(),
      ifsc_code: String(p.bank_ifsc || '').trim().toUpperCase(),
      bank_name: String(p.bank_name || '').trim() || null,
      branch: String(p.bank_branch || '').trim() || null,
      account_holder: String(p.bank_account_name || '').trim() || null,
      address: [p.address, p.city, p.state, p.zip, p.country].filter(Boolean).join(', ') || null,
      source: 'candidate_form',
    },
    updated_at: new Date().toISOString(),
  };
  for (const k of Object.keys(update)) if (update[k] === undefined) delete update[k];

  const { error } = await admin.from('hr_employee_onboarding').update(update).eq('id', onboardingId);
  if (error) return { ok: false, error: error.message };

  await admin.from('hr_onboarding_audit_log').insert({
    onboarding_id: onboardingId,
    action: 'candidate_form_submitted',
    stage: 1,
    changed_fields: { fields: Object.keys(update), documents: Object.keys(files) },
  }).then(() => {}, () => {});

  return { ok: true };
}

async function notifyHr(onboardingId: string, p: Record<string, any>) {
  try {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'A candidate';
    const { data: staff } = await admin
      .from('user_roles')
      .select('user_id, roles!inner(name)');
    const targets = (staff || [])
      .filter((r: any) => {
        const n = String(r.roles?.name || '').toLowerCase();
        return n === 'super admin' || n === 'admin' || n === 'hr' || n.startsWith('hr ') || n.endsWith(' hr');
      })
      .map((r: any) => r.user_id);
    const unique = [...new Set(targets)];
    if (!unique.length) return;
    await admin.from('hr_notifications').insert(
      unique.map((uid) => ({
        user_id: uid,
        type: 'onboarding_form_submitted',
        title: 'Onboarding form submitted',
        message: `${name} completed the candidate self-service onboarding form.`,
        link: `/hrms/onboarding-pipeline?id=${onboardingId}`,
        is_read: false,
      })),
    );
  } catch (e) {
    console.error('notifyHr failed', e);
  }
}

Deno.serve(async (req) => {

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const token = String(body?.token || '');

    // ── HR-authenticated actions ──
    if (action === 'sample') {
      const to = String(body?.recipientEmail || '').trim().toLowerCase();
      // Preview sends are restricted to internal company mailboxes only.
      if (!/^[a-z0-9._%+-]+@blynkex\.com$/.test(to)) {
        const auth = await requireHr(req);
        if (auth.error) return json({ error: auth.error }, auth.error === 'Forbidden' ? 403 : 401);
      }
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

      // Push the candidate's answers into the HR onboarding draft and alert HR.
      const merge = await mergeIntoOnboarding(invite.onboarding_id, normalized);
      await notifyHr(invite.onboarding_id, normalized);
      return json({ ok: true, merged: merge.ok, mergeError: merge.error });
    }


    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('onboarding-invite error', e);
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
