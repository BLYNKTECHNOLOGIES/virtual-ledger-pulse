import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PREJOINING_DOCS, DISCLOSURES } from '@/lib/hrms/prejoining';
import { openStoredDocument, privateDocRef } from '@/lib/storedDoc';
import { toast } from 'sonner';
import { Check, Undo2, ExternalLink } from 'lucide-react';

const STATE_LABELS: Record<string,string> = {
  published: 'sent, waiting for the candidate',
  submitted: 'submitted, review below',
  review: 'in review',
  corrections: 'corrections requested',
  ready: 'ready to join',
  revision_required: 'needs a revised offer',
};

const fmtDate = (iso?: string) => iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)
  ? new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone:'Asia/Kolkata', weekday:'short', day:'numeric', month:'short', year:'numeric' })
  : iso || '—';

export function PrejoiningReview({id}:{id:string}) {
  const qc=useQueryClient();
  const [busy,setBusy]=useState(false);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const {data}=useQuery({queryKey:['prejoining-review',id],queryFn:async()=>{
    const {data:onb,error}=await (supabase as any).from('hr_employee_onboarding').select('id,prejoining,job_role,status').eq('id',id).single();
    if(error)throw error;
    const {data:invite}=await supabase.from('hr_onboarding_invites').select('payload,status').eq('onboarding_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    // The offer the package carries — the letter issued from Documents.
    const issuedId=onb?.prejoining?.offer_file?.issued_id;
    const {data:offer}=issuedId
      ? await (supabase as any).from('hr_documents_issued').select('id,reference_no,status,pdf_path,file_path').eq('id',issuedId).maybeSingle()
      : {data:null};
    return {onb,invite,offer};
  }});
  const p=data?.onb.prejoining || {}, payload=(data?.invite?.payload || {}) as Record<string,any>;
  const closed=['completed','cancelled'].includes(data?.onb.status);
  async function action(action:string,extra:Record<string,unknown>={}) {
    setBusy(true);try{
      const {data:res,error}=await supabase.functions.invoke('onboarding-invite',{body:{action,onboardingId:id,...extra}});
      if(error){let message=error.message;try{message=(await (error as any).context.json()).error || message;}catch{/* keep the generic message */}throw new Error(message);}
      if(res?.error)throw new Error(res.error);
      await qc.invalidateQueries({queryKey:['prejoining-review',id]}); await qc.invalidateQueries({queryKey:['onboarding_invite',id]});
      toast.success('Joining package updated');
    }catch(e){toast.error(e instanceof Error?e.message:'Could not update joining package');}finally{setBusy(false);}
  }
  const offer=data?.offer;
  const offerDoc=offer ? privateDocRef('hr-doc-issued', offer.pdf_path || offer.file_path) : (p.offer_file?.file_url || null);
  const offerStale=!!offer && !['issued','delivered'].includes(offer.status);
  return <section className="border-t border-border pt-4 space-y-4">
    <h3 className="font-semibold text-sm">Joining package {p.enabled && <span className="text-muted-foreground font-normal">· {STATE_LABELS[p.state] || p.state}</span>}</h3>
    {!p.enabled ? (
      <p className="text-xs text-muted-foreground">Not sent yet. Send the onboarding form with the offer letter to start it: the candidate signs the offer and E2, uploads them with their documents, and HR reviews everything before joining.</p>
    ) : (
      <div className="space-y-1.5 text-sm">
        <p className="break-words">Offer <span className="font-mono text-xs">{p.offer_reference}</span>{offerStale ? ` (${offer.status})` : ''} · joining {fmtDate(p.joining_date)} · version {p.version}</p>
        {p.joining_custom?.reason && <p className="text-xs text-muted-foreground break-words">Custom joining date: {p.joining_custom.reason}</p>}
        {offerDoc && <Button variant="ghost" size="sm" className="h-8 px-2" onClick={()=>openStoredDocument(offerDoc).catch(()=>toast.error('Could not open the offer letter'))}><ExternalLink className="h-4 w-4 mr-2"/>View offer letter</Button>}
        {(p.state==='revision_required' || offerStale) && <p className="text-xs text-destructive">The offer, joining date or designation changed after this package was sent. Use “Update and send again…” to send the current offer.</p>}
      </div>
    )}
    {p.enabled && data?.invite?.status==='submitted' && <div className="space-y-4">
      <dl className="text-sm grid sm:grid-cols-2 gap-2">{['first_name','last_name','email','phone','date_of_birth','address','city','state','zip','pan_number','aadhaar_number','bank_account_name','bank_name','bank_account_number','bank_ifsc'].map(k=><div key={k} className="min-w-0"><dt className="text-muted-foreground capitalize">{k.replace(/_/g,' ')}</dt><dd className="break-words">{payload[k] || '—'}</dd></div>)}</dl>
      {DISCLOSURES.map(d=><p className="text-sm break-words" key={d.key}><strong>{d.label}:</strong> {payload.e2_disclosures?.[d.key] || '—'}</p>)}
      {[{key:'details',label:'Personal details',required:true},...PREJOINING_DOCS].map(item=><div key={item.key} className="border-b border-border pb-3 space-y-2">
        <p className="text-sm font-medium">{item.label} · {p.reviews?.[item.key]?.status || 'Pending'}</p>
        {(payload.documents?.[item.key] || []).map((f:any)=><Button key={f.path} size="sm" variant="ghost" className="h-auto whitespace-normal text-left break-all" onClick={()=>openStoredDocument(`employee-documents://${f.path}`).catch(()=>toast.error('Could not open document'))}><ExternalLink className="w-4 h-4 mr-2 shrink-0"/>{f.name}</Button>)}
        {!closed && <><Textarea aria-label={`${item.label} review note`} rows={2} value={notes[item.key] || ''} placeholder="Correction reason" onChange={e=>setNotes({...notes,[item.key]:e.target.value})}/><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>action('review-package',{item:item.key,decision:'approved',note:notes[item.key]})}><Check className="w-4 h-4 mr-1"/>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>action('review-package',{item:item.key,decision:'correction',note:notes[item.key]})}><Undo2 className="w-4 h-4 mr-1"/>Needs correction</Button></div></>}
      </div>)}
      {!closed && <Button variant="outline" disabled={busy} onClick={()=>action('return-corrections')}>Return requested corrections</Button>}
      {p.state==='ready' && !p.arrival_confirmed_at && !closed && <Button disabled={busy} onClick={()=>action('confirm-arrival')}>Confirm actual arrival</Button>}
      {p.arrival_confirmed_at && <p className="text-sm text-muted-foreground">Actual arrival confirmed by HR.</p>}
    </div>}
  </section>;
}
