import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

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
  req('declaration_name', 'Signature (full name)');

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const token = String(body?.token || '');

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
