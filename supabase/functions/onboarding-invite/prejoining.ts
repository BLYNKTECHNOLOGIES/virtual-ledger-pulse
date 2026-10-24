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
    const ref = String(body.offerReference || '').trim();
    const offer = onb.offer_policy_documents?.unsigned_offer;
    if (!ref || !onb.job_role || !offer?.file_url) throw new Error('Save designation, offer reference and approved unsigned offer PDF first');
    if (!/^employee-documents:\/\/onboarding\//.test(offer.file_url) || !offer.file_url.startsWith(`employee-documents://onboarding/${id}/`)) throw new Error('Offer must belong to this onboarding record');
    const firstDate = current.first_send_date || joiningSendDateIST(new Date());
    const dates = joiningChoices(firstDate);
    const date = String(body.joiningDate || dates[0]);
    if (!dates.includes(date)) throw new Error('Select one of the four upcoming joining batches');
    const { data: company } = await admin.from('hr_company_identity').select('*').limit(1).maybeSingle();
    if (!company?.letterhead_url && !company?.letterhead_path) throw new Error('Company letterhead must be configured');
    const version = Number(current.version || 0) + 1;
    const {data:oldInvite}=await admin.from('hr_onboarding_invites').select('payload').eq('onboarding_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    next = { enabled: true, state: 'published', version, first_send_date:current.first_send_date, offer_reference: ref, role_title: onb.job_role, company_name: company.legal_name, joining_date: date, joining_choices: dates, offer_file: offer, company, reviews: {}, published_at: new Date().toISOString(), published_by: userId, history: [...(current.history || []), ...(current.version ? [{ ...current, history: undefined, submission:oldInvite?.payload }] : [])] };
    extra = { date_of_joining: date };
  } else if (body.action === 'review-package') {
    if (!current.enabled || !['submitted','review','ready'].includes(current.state)) throw new Error('A current candidate submission is required');
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

export async function publicPackage(admin: any, onb: any) {
  const p = onb.prejoining || {};
  if (!p.enabled) return null;
  const company = p.company;
  let letterhead = company?.letterhead_url || null;
  if (company?.letterhead_path) {
    const { data } = await admin.storage.from('company-identity').createSignedUrl(company.letterhead_path,600);
    letterhead = data?.signedUrl;
  }
  const path = String(p.offer_file?.file_url || '').replace('employee-documents://','');
  let offerUrl = null;
  if (path.startsWith(`onboarding/${onb.id}/`)) {
    const { data } = await admin.storage.from('employee-documents').createSignedUrl(path,600);
    offerUrl = data?.signedUrl;
  }
  const reviews=Object.fromEntries(Object.entries(p.reviews || {}).map(([k,v])=>[k,{status:(v as any).status,note:(v as any).note}]));
  return { enabled:true, state:p.state, version:p.version, offer_reference:p.offer_reference, role_title:p.role_title, company_name:p.company_name, joining_date:p.joining_date, joining_choices:p.joining_choices, offer_url:offerUrl, reviews, letterhead_url:letterhead, margins:{ top:Number(company?.letterhead_margin_top_mm || 35), bottom:Number(company?.letterhead_margin_bottom_mm || 30), left:Number(company?.letterhead_margin_left_mm || 19), right:Number(company?.letterhead_margin_right_mm || 19) } };
}