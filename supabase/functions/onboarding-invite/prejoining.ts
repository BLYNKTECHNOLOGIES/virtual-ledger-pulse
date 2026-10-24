import { joiningSendDateIST } from '../_shared/joiningBatch.ts';
import { joiningChoices, PREJOINING_DOCS, prejoiningProblems, prejoiningReady } from '../_shared/prejoining.ts';

export async function handlePrejoining(admin: any, body: any, userId: string) {
  const id = String(body.onboardingId || '');
  const { data: onb, error } = await admin.from('hr_employee_onboarding').select('*').eq('id', id).single();
  if (error || !onb || ['completed','cancelled'].includes(onb.status)) throw new Error('Open onboarding record required');
  const current = onb.prejoining || {};
  let next = { ...current };
  let extra: Record<string, unknown> = {};
  if (body.action === 'publish-package') {
    if (!onb.job_role) throw new Error('Save the designation first');
    // Only upcoming batches can be offered: a revision never states a joining date that has passed.
    const dates = joiningChoices(joiningSendDateIST(new Date()));
    const date = String(body.joiningDate || dates[0]);
    const custom = !dates.includes(date);
    const customReason = String(body.customReason || '').trim().slice(0, 500);
    if (custom) {
      // Uncommon cases: HR may offer any future date, but must record why.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error('Enter a valid joining date');
      if (date <= joiningSendDateIST(new Date())) throw new Error('A custom joining date must be after today (IST)');
      if (customReason.length < 5) throw new Error('Give a reason for the custom joining date');
    }
    const { data: company } = await admin.from('hr_company_identity').select('*').limit(1).maybeSingle();
    if (!company?.letterhead_url && !company?.letterhead_path) throw new Error('Company letterhead must be configured');
    // Checked before the offer letter is issued, so a refusal never uses up a reference number.
    if (body.dryRun === true) return { ok: true, dryRun: true, joiningDate: date, custom };
    // The offer is the letter issued from Documents for this onboarding record —
    // its reference, designation and joining date are what the candidate signs.
    // liveOffer also refuses an offer that is not the candidate's newest (another HR user may have issued one meanwhile).
    const offer = await liveOffer(admin, id, String(body.offerIssuedId || ''));
    const snap = (offer.values_snapshot && typeof offer.values_snapshot === 'object') ? offer.values_snapshot : {};
    if (snap.joining_date_iso && snap.joining_date_iso !== date) throw new Error('The offer letter states a different joining date. Issue a revised offer.');
    const version = Number(current.version || 0) + 1;
    const {data:oldInvite}=await admin.from('hr_onboarding_invites').select('payload').eq('onboarding_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    let department = String(snap.department || '');
    if (!department && onb.department_id) {
      const { data: dept } = await admin.from('departments').select('name').eq('id', onb.department_id).maybeSingle();
      department = String(dept?.name || '');
    }
    next = { enabled: true, state: 'published', version, offer_reference: offer.reference_no, role_title: String(snap.designation || onb.job_role), department, company_name: company.legal_name, joining_date: date, joining_choices: dates, joining_custom: custom ? { reason: customReason, set_by: userId, set_at: new Date().toISOString() } : null, offer_file: { issued_id: offer.id, reference_no: offer.reference_no, file_name: `${String(offer.reference_no).replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf` }, company, reviews: {}, published_at: new Date().toISOString(), published_by: userId, history: [...(current.history || []), ...(current.version ? [{ ...current, history: undefined, submission:oldInvite?.payload }] : [])] };
    extra = { date_of_joining: date };
  } else if (body.action === 'review-package') {
    if (!current.enabled || !['submitted','review','ready'].includes(current.state)) throw new Error('A current candidate submission is required');
    await requireLiveOffer(admin, id, current);
    const { data: inv } = await admin.from('hr_onboarding_invites').select('payload').eq('onboarding_id', id).eq('status','submitted').order('submitted_at',{ascending:false}).limit(1).maybeSingle();
    if (!inv || prejoiningProblems(inv.payload, current.version, current.joining_date).length) throw new Error('The submission does not match the current package');
    const key = String(body.item || '');
    if (key !== 'details' && !PREJOINING_DOCS.some(d => d.key === key)) throw new Error('Unknown review item');
    if (!['approved','correction'].includes(body.decision)) throw new Error('Invalid review decision');
    const note = String(body.note || '').trim().slice(0,2000);
    if (body.decision === 'correction' && !note) throw new Error('Correction reason is required');
    const reviews = { ...(current.reviews || {}), [key]: { status: body.decision, note, reviewed_by: userId, reviewed_at: new Date().toISOString() } };
    next = { ...current, reviews, state: prejoiningReady(inv.payload, reviews, current.version, current.joining_date) ? 'ready' : 'review' };
  } else if (body.action === 'return-corrections') {
    if (!current.enabled || !Object.values(current.reviews || {}).some((r: any) => r.status === 'correction')) throw new Error('Mark at least one item for correction first');
    next = {...current,state:'corrections',arrival_confirmed_at:null,arrival_confirmed_by:null};
  } else if (body.action === 'confirm-arrival') {
    if (current.state !== 'ready' || current.joining_date > joiningSendDateIST(new Date())) throw new Error('HR must complete review and wait until the joining date');
    await requireLiveOffer(admin, id, current);
    next = { ...current, arrival_confirmed_at: new Date().toISOString(), arrival_confirmed_by: userId };
  } else throw new Error('Unknown package action');
  const { data: saved, error: saveError } = await admin.from('hr_employee_onboarding').update({ ...extra, prejoining: next, updated_at: new Date().toISOString() }).eq('id', id).eq('updated_at',onb.updated_at).select('id').maybeSingle();
  if (saveError || !saved) throw new Error(saveError?.message || 'The onboarding changed. Reload before saving.');
  if (body.action === 'return-corrections' || body.action === 'publish-package') {
    const { error: inviteError } = await admin.from('hr_onboarding_invites').update({ status:'opened', submitted_at:null }).eq('onboarding_id',id);
    if (inviteError) throw new Error(inviteError.message);
  }
  await admin.from('hr_onboarding_audit_log').insert({ onboarding_id:id, action:body.action, stage:1, performed_by:userId, changed_fields:{ version:next.version, item:body.item, decision:body.decision } });
  return { ok:true, prejoining:next };
}

/** A package built on an issued offer can only move forward while that offer is still valid. */
async function requireLiveOffer(admin: any, onboardingId: string, p: Record<string, any>) {
  if (!p.offer_file?.issued_id) return; // packages from before offers were issued from Documents
  await liveOffer(admin, onboardingId, String(p.offer_file.issued_id));
}

/** The offer cannot be used (missing, revoked, replaced, not the newest, no PDF yet) — as opposed to a failed read. */
export class OfferRefused extends Error {}

/** The candidate's newest live offer: created_at, then id (the order the browser uses). */
async function newestLiveOffer(admin: any, onboardingId: string): Promise<{ id: string; reference_no: string } | null> {
  const { data, error } = await admin.from('hr_documents_issued').select('id,reference_no').eq('onboarding_id', onboardingId).eq('category', 'offer').in('status', ['issued','delivered']).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * The offer letter issued from Documents for this onboarding record, while it is still valid.
 * One live offer per candidate: only the newest is published, served, emailed or reviewed, so a
 * revision issued but not yet sent (a failed or concurrent send) never lets the older terms go out.
 */
export async function liveOffer(admin: any, onboardingId: string, issuedId: string) {
  if (!issuedId) throw new Error('Issue the offer letter for this candidate first');
  const { data: offer, error } = await admin.from('hr_documents_issued').select('id,onboarding_id,category,status,reference_no,pdf_path,values_snapshot').eq('id', issuedId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!offer || offer.onboarding_id !== onboardingId || String(offer.category || '').toLowerCase() !== 'offer') throw new OfferRefused('Issue the offer letter for this candidate first');
  if (!['issued','delivered'].includes(offer.status)) throw new OfferRefused('The offer in this joining package was revoked or replaced. Send the current offer with "Update and send again…".');
  const newest = await newestLiveOffer(admin, onboardingId);
  if (newest && newest.id !== offer.id) throw new OfferRefused(`A newer offer, ${newest.reference_no}, was issued for this candidate. Send it with "Update and send again…".`);
  if (!offer.pdf_path) throw new OfferRefused('The offer letter PDF is not ready yet. Try again in a minute.');
  return offer;
}

export async function publicPackage(admin: any, onb: any) {
  const p = onb.prejoining || {};
  if (!p.enabled) return null;
  const company = p.company;
  let letterhead = company?.letterhead_url || null;
  if (company?.letterhead_path) {
    const { data } = await admin.storage.from('company-identity').createSignedUrl(company.letterhead_path,600);
    letterhead = data?.signedUrl;
  }
  let offerUrl: string | null = null;
  let offerValid = true;
  if (p.offer_file?.issued_id) {
    // Read the letter fresh: a revoked or replaced offer is never handed out.
    try {
      const offer = await liveOffer(admin, onb.id, String(p.offer_file.issued_id));
      const { data } = await admin.storage.from('hr-doc-issued').createSignedUrl(offer.pdf_path, 600);
      offerUrl = data?.signedUrl || null;
    } catch (e) {
      // A read error is not a withdrawn offer: let it fail (the candidate retries) instead.
      if (!(e instanceof OfferRefused)) throw e;
      offerValid = false;
    }
  } else {
    // Packages published before offers were issued from Documents carry an uploaded PDF.
    const path = String(p.offer_file?.file_url || '').replace('employee-documents://','');
    if (path.startsWith(`onboarding/${onb.id}/`)) {
      const { data } = await admin.storage.from('employee-documents').createSignedUrl(path,600);
      offerUrl = data?.signedUrl;
    }
  }
  const reviews=Object.fromEntries(Object.entries(p.reviews || {}).map(([k,v])=>[k,{status:(v as any).status,note:(v as any).note}]));
  return { enabled:true, state:p.state, version:p.version, offer_reference:p.offer_reference, role_title:p.role_title, department:p.department || '', company_name:p.company_name, joining_date:p.joining_date, joining_choices:p.joining_choices, offer_url:offerUrl, offer_valid:offerValid, reviews, letterhead_url:letterhead, margins:{ top:Number(company?.letterhead_margin_top_mm || 35), bottom:Number(company?.letterhead_margin_bottom_mm || 30), left:Number(company?.letterhead_margin_left_mm || 19), right:Number(company?.letterhead_margin_right_mm || 19) } };
}