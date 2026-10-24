import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { HR_BRAND, hrHeaderHtml, hrSignatureHtml, hrSignatureText, wrapHrEmail } from '../_shared/hrSignature.ts';
import { handlePrejoining, publicPackage } from './prejoining.ts';
import { PREJOINING_DOCS, prejoiningProblems } from '../_shared/prejoining.ts';
import { joiningSendDateIST } from '../_shared/joiningBatch.ts';
import { tidyMailHtml, tidyMailText, tidyMailSubject, tidyMailAddress } from '../_shared/mailBody.ts'

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
  // Last name is optional (single-name candidates).
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
      from: `${tidyMailAddress(mailbox.from_name || 'Blynkex HR')} <${mailbox.from_address || user}>`,
      to,
      subject: 'Complete your onboarding details - Blynk',
      content: tidyMailText(text),
      html: wrapHrEmail(html, { refNote: 'Employee onboarding' }),
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
    metadata: { onboarding_invitation: true },
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
  signed_offer: 'signed_offer',
  signed_e2: 'signed_e2',
  pcc_application: 'pcc_application',
};

// Public-form upload rules: only the form's document keys, only document/photo
// extensions (the signed URL lets the uploader pick the content type, so the
// extension in the path is what we enforce), and a per-field file cap.
const UPLOAD_FIELDS = new Set(Object.keys(DOC_KEY_MAP));
const UPLOAD_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'];
const MAX_FILES_PER_FIELD = 10;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
const BUCKET = 'employee-documents';

function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

async function listFieldObjects(onboardingId: string, field: string): Promise<Map<string, string>> {
  const { data } = await admin.storage.from(BUCKET).list(`onboarding/${onboardingId}/self/${field}`, { limit: 1000 });
  return new Map((data || []).filter((o: any) => o.id).map((o: any) => [o.name as string, String(o.metadata?.mimetype || '').toLowerCase()]));
}
async function listFieldFolder(onboardingId: string, field: string): Promise<Set<string>> {
  return new Set((await listFieldObjects(onboardingId, field)).keys());
}
/** Stored content type must be an allowed one; HEIC/HEIF may report none. */
function mimeAllowed(mime: string, ext: string): boolean {
  if (ALLOWED_MIME.has(mime)) return true;
  return (mime === '' || mime === 'application/octet-stream') && (ext === 'heic' || ext === 'heif');
}

/** Keep only document paths inside this onboarding's own folder for that field that really exist. */
async function sanitizeDocuments(onboardingId: string, docs: unknown): Promise<Record<string, Array<{ path: string; name: string }>>> {
  const out: Record<string, Array<{ path: string; name: string }>> = {};
  if (!docs || typeof docs !== 'object') return out;
  for (const [field, list] of Object.entries(docs as Record<string, unknown>)) {
    if (!UPLOAD_FIELDS.has(field) || !Array.isArray(list)) continue;
    const prefix = `onboarding/${onboardingId}/self/${field}/`;
    const existing = await listFieldObjects(onboardingId, field);
    const kept: Array<{ path: string; name: string }> = [];
    for (const f of list) {
      const path = typeof (f as any)?.path === 'string' ? (f as any).path : '';
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (!rest || rest.includes('/') || !existing.has(rest)) continue;
      const ext = fileExt(rest);
      if (!UPLOAD_EXT.includes(ext)) continue;
      if (!mimeAllowed(existing.get(rest) || '', ext)) continue;
      const name = String((f as any)?.name || rest).slice(0, 200);
      if (!kept.some((k) => k.path === path)) kept.push({ path, name });
    }
    if (kept.length) out[field] = kept.slice(0, MAX_FILES_PER_FIELD);
  }
  return out;
}

// `employee-documents` is a PRIVATE bucket: a /object/public/ URL returns
// NoSuchBucket. Store the bucket-scoped reference instead; the app signs it on
// read (see src/lib/storedDoc.ts).
function publicUrl(path: string): string {
  return `employee-documents://${path}`;
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
      // Same shape as the first file so the employee-documents sync picks them up.
      extra_files: list.slice(1).map((f) => ({ file_url: publicUrl(f.path), file_name: f.name })),
      source: 'candidate_form',
    });
  }
  if (p.pan_number) setDoc('pan', { value: String(p.pan_number).toUpperCase(), received: true, source: 'candidate_form' });
  if (p.aadhaar_number) setDoc('aadhaar', { value: String(p.aadhaar_number), received: true, source: 'candidate_form' });
  // Candidate-declared previous employer is shown inside the experience-letter row.
  if (p.previous_employer) setDoc('experience_letter', { value: String(p.previous_employer).trim(), source: 'candidate_form' });
  if (p.uan_number) setDoc('uan', { value: String(p.uan_number), received: true, source: 'candidate_form' });
  if (p.esic_number) setDoc('esic', { value: String(p.esic_number), received: true, source: 'candidate_form' });
  if (p.pf_number) setDoc('pf_account_number', { value: String(p.pf_number), received: true, source: 'candidate_form' });

  const update: Record<string, any> = {
    first_name: p.first_name || undefined,
    last_name: String(p.last_name ?? '').trim(),
    email: p.email || undefined,
    phone: p.phone || undefined,
    gender: p.gender || undefined,
    marital_status: p.marital_status ? (String(p.marital_status).charAt(0).toUpperCase() + String(p.marital_status).slice(1).toLowerCase()) : undefined,
    date_of_birth: p.date_of_birth || undefined,
    // Candidate-supplied residential address — persisted on the draft so it
    // survives into the finalized hr_employees row (not only bank_details).
    address: p.address || undefined,
    city: p.city || undefined,
    state: p.state || undefined,
    zip: p.zip || undefined,
    country: p.country || undefined,
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

    if (['publish-package','review-package','return-corrections','confirm-arrival'].includes(action)) {
      const auth = await requireHr(req);
      if (auth.error || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, auth.error === 'Forbidden' ? 403 : 401);
      try { return json(await handlePrejoining(admin, body, auth.userId)); }
      catch (e) { return json({ error: e instanceof Error ? e.message : 'Package action failed' }, 400); }
    }

    // ── HR-authenticated actions ──
    if (action === 'sample') {
      const to = String(body?.recipientEmail || '').trim().toLowerCase();
      // Always HR-gated — no domain-based bypass (the HR mailbox must never be an open relay).
      {
        const auth = await requireHr(req);
        if (auth.error) return json({ error: auth.error }, auth.error === 'Forbidden' ? 403 : 401);
      }
      if (!/^[a-z0-9._%+-]+@blynkex\.com$/.test(to)) {
        return json({ error: 'Sample sends are restricted to internal @blynkex.com mailboxes' }, 400);
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

    // HR can re-pull an already-submitted candidate form into the draft.
    if (action === 'reimport') {
      const auth = await requireHr(req);
      if (auth.error) return json({ error: auth.error }, auth.error === 'Forbidden' ? 403 : 401);
      const onboardingId = String(body?.onboardingId || '');
      if (!onboardingId) return json({ error: 'onboardingId is required' }, 400);
      const { data: inv } = await admin
        .from('hr_onboarding_invites')
        .select('payload, status')
        .eq('onboarding_id', onboardingId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!inv?.payload) return json({ error: 'No submitted candidate form found' }, 404);
      const { data: reviewOnb } = await admin.from('hr_employee_onboarding').select('prejoining').eq('id',onboardingId).single();
      if (reviewOnb?.prejoining?.enabled && reviewOnb.prejoining.state !== 'ready') return json({ error: 'Complete HR review before importing the pre-joining submission' },409);
      const r = await mergeIntoOnboarding(onboardingId, inv.payload as Record<string, any>);
      if (!r.ok) return json({ error: r.error || 'Merge failed' }, 500);
      return json({ ok: true });
    }

    if (action === 'issue' || action === 'send') {

      const auth = await requireHr(req);
      if (auth.error) return json({ error: auth.error }, auth.error === 'Forbidden' ? 403 : 401);

      const onboardingId = String(body?.onboardingId || '');
      if (!onboardingId) return json({ error: 'onboardingId is required' }, 400);

      const { data: onb } = await admin
        .from('hr_employee_onboarding')
        .select('id, first_name, last_name, email, status, prejoining')
        .eq('id', onboardingId)
        .maybeSingle();
      if (!onb) return json({ error: 'Onboarding record not found' }, 404);
      if (['completed','cancelled'].includes(onb.status)) return json({ error:'Onboarding is closed' },409);
      if (body?.reissue === true) {
        // Rotate the bearer link, but never discard submitted evidence.
        const { error: rotateError } = await admin.from('hr_onboarding_invites').update({ token:newToken(), expires_at:new Date(Date.now()+14*86400000).toISOString() }).eq('onboarding_id',onboardingId);
        if (rotateError) return json({ error:rotateError.message },500);
      }

      let { data: existing } = await admin
        .from('hr_onboarding_invites')
        .select('id, token, status, expires_at, submitted_at')
        .eq('onboarding_id', onboardingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const expired = existing && new Date(existing.expires_at).getTime() < Date.now();
      if (!existing || (expired && existing.status !== 'submitted')) {
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

      if (!existing) return json({ error:'Could not create invitation' },500);
      const link = `${APP_URL}/onboarding/apply/${existing.token}`;

      if (action === 'send') {
        const to = String(body?.recipientEmail || onb.email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'A valid candidate email is required' }, 400);
        if (onb.prejoining?.enabled && onb.prejoining.joining_date <= joiningSendDateIST(new Date()) && !onb.prejoining.first_send_date) return json({ error:'Revise the offer to an upcoming joining batch before first sending' },409);
        const sentFrom = await mailInvite(to, `${onb.first_name || ''} ${onb.last_name || ''}`.trim(), link, existing.expires_at);
        await admin.from('hr_onboarding_invites').update({ emailed_at: new Date().toISOString() }).eq('id', existing.id);
        if (onb.prejoining?.enabled && !onb.prejoining.first_send_date) await admin.from('hr_employee_onboarding').update({ prejoining:{ ...onb.prejoining, first_send_date:joiningSendDateIST(new Date()) } }).eq('id',onboardingId);
        return json({ ok: true, link, sentTo: to, sentFrom, invite: existing });
      }

      return json({ ok: true, link, invite: existing });
    }

    const { invite, error, status } = await loadInvite(token);
    if (!invite) return json({ error }, status || 400);
    const { data: candidateOnb } = await admin.from('hr_employee_onboarding').select('id,first_name,last_name,email,phone,status,job_role,prejoining').eq('id',invite.onboarding_id).maybeSingle();
    if (!candidateOnb || ['completed','cancelled'].includes(candidateOnb.status)) return json({ error:'This onboarding link is closed' },410);
    const packageData = await publicPackage(admin,candidateOnb);

    if (action === 'get') {
      // A submitted form never returns the candidate's data again.
      if (invite.status === 'submitted') return json({ status: 'submitted', submitted: true, package:packageData ? { state:packageData.state, reviews:packageData.reviews } : null });
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
        submitted: false,
        payload: { ...prefill, ...(invite.payload || {}) },
        package:packageData,
      });
    }

    if (invite.status === 'submitted') {
      return json({ error: 'This form has already been submitted.' }, 409);
    }

    if (action === 'save') {
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      if (packageData?.enabled && Number(payload.package_version) !== packageData.version) return json({ error:'Reload the current offer before saving' },409);
      const { error: upErr } = await admin
        .from('hr_onboarding_invites')
        .update({ payload })
        .eq('id', invite.id);
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true });
    }

    if (action === 'upload-url') {
      const field = String(body?.field || '');
      if (!UPLOAD_FIELDS.has(field)) return json({ error: 'Unknown document type' }, 400);
      if (!packageData?.enabled && ['signed_e2','signed_offer','pcc_application'].includes(field)) return json({ error:'Pre-joining is not enabled' },400);
      const filename = String(body?.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      if (!UPLOAD_EXT.includes(fileExt(filename))) {
        return json({ error: 'Only PDF or photo files (JPG, PNG, WEBP, HEIC) can be uploaded.' }, 400);
      }
      const existing = await listFieldFolder(invite.onboarding_id, field);
      if (existing.size >= MAX_FILES_PER_FIELD) {
        return json({ error: `You can upload up to ${MAX_FILES_PER_FIELD} files for this document.` }, 400);
      }
      const path = `onboarding/${invite.onboarding_id}/self/${field}/${Date.now()}-${filename}`;
      const { data, error: sErr } = await admin.storage
        .from('employee-documents')
        .createSignedUploadUrl(path);
      if (sErr) return json({ error: sErr.message }, 500);
      return json({ path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === 'submit') {
      const raw = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      // Candidates often paste values with stray leading/trailing whitespace
      // (mobile keyboards add a trailing space). Trim every string before
      // validating so a space never blocks a submission.
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) payload[k] = typeof v === 'string' ? v.trim() : v;

      const errs = validate(payload);
      if (errs.length) return json({ error: 'Please fix the highlighted fields', details: errs }, 400);

      const normalized = {
        ...payload,
        documents: await sanitizeDocuments(invite.onboarding_id, payload.documents),
        pan_number: String(payload.pan_number).toUpperCase(),
        bank_ifsc: String(payload.bank_ifsc).toUpperCase(),
        submitted_from_ip: req.headers.get('x-forwarded-for') || null,
      };

      if (packageData?.enabled) {
        const problems = prejoiningProblems(normalized, packageData.version, packageData.joining_date);
        if (problems.length) return json({ error:'Complete the current joining package', details:problems },400);
        if (candidateOnb.prejoining.state === 'corrections') {
          // Approved evidence remains unchanged; only requested corrections may replace it.
          for (const [key,review] of Object.entries(candidateOnb.prejoining.reviews || {})) {
            if ((review as any).status === 'approved' && key !== 'details' && JSON.stringify(normalized.documents?.[key]) !== JSON.stringify((invite.payload as any)?.documents?.[key])) return json({ error:'An approved document cannot be replaced during corrections' },409);
          }
        }
      }


      const { error: upErr } = await admin
        .from('hr_onboarding_invites')
        .update({ payload: normalized, status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', invite.id).neq('status','submitted').select('id').maybeSingle();
      if (upErr) return json({ error: upErr.message }, 500);

      // Push the candidate's answers into the HR onboarding draft and alert HR.
      if (packageData?.enabled) {
        const reviews = { ...(candidateOnb.prejoining.reviews || {}) };
        for (const key of ['details', ...PREJOINING_DOCS.map(d => d.key)]) if (reviews[key]?.status !== 'approved') reviews[key] = { status:'pending' };
        const { error: stateError } = await admin.from('hr_employee_onboarding').update({ prejoining:{ ...candidateOnb.prejoining, reviews, state:'submitted', submitted_at:new Date().toISOString() } }).eq('id',invite.onboarding_id);
        if (stateError) return json({ error:stateError.message },500);
        await notifyHr(invite.onboarding_id, normalized);
        return json({ ok:true, merged:false, pendingReview:true });
      }
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
