import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PREJOINING_DOCS, joiningChoices, DISCLOSURES } from '@/lib/hrms/prejoining';
import { joiningSendDateIST } from '@/lib/hrms/joiningBatch';
import { openStoredDocument } from '@/lib/storedDoc';
import { smartUpload } from '@/lib/resumable-upload';
import { toast } from 'sonner';
import { Check, Undo2, Upload, ExternalLink } from 'lucide-react';

export function PrejoiningReview({id}:{id:string}) {
  const qc=useQueryClient();
  const [busy,setBusy]=useState(false), [reference,setReference]=useState(''), [date,setDate]=useState('');
  const [notes,setNotes]=useState<Record<string,string>>({});
  const {data}=useQuery({queryKey:['prejoining-review',id],queryFn:async()=>{
    const {data:onb,error}=await (supabase as any).from('hr_employee_onboarding').select('id,prejoining,offer_policy_documents,job_role,status').eq('id',id).single();
    if(error)throw error;
    const {data:invite}=await supabase.from('hr_onboarding_invites').select('payload,status').eq('onboarding_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    return {onb,invite};
  }});
  const p=data?.onb.prejoining || {}, payload=(data?.invite?.payload || {}) as Record<string,any>;
  const closed=['completed','cancelled'].includes(data?.onb.status);
  async function action(action:string,extra:Record<string,unknown>={}) {
    setBusy(true);try{
      const {data:res,error}=await supabase.functions.invoke('onboarding-invite',{body:{action,onboardingId:id,...extra}});
      if(error){try{throw new Error((await (error as any).context.json()).error);}catch(e){throw e;}}
      if(res?.error)throw new Error(res.error);
      await qc.invalidateQueries({queryKey:['prejoining-review',id]}); await qc.invalidateQueries({queryKey:['onboarding_invite',id]});
      toast.success('Joining package updated');
    }catch(e){toast.error(e instanceof Error?e.message:'Could not update joining package');}finally{setBusy(false);}
  }
  const choices=joiningChoices(p.first_send_date || joiningSendDateIST(new Date()));
  return <section className="border-t border-border pt-4 space-y-4">
    <h3 className="font-semibold text-sm">Optional pre-joining package {p.enabled && <span className="text-muted-foreground">· {p.state}</span>}</h3>
    {!closed && <div className="space-y-3">
      <Label>Offer reference<Input className="mt-1 text-foreground" value={reference || p.offer_reference || ''} onChange={e=>setReference(e.target.value)}/></Label>
      <Label className="block">Offered joining batch<select className="mt-1 w-full border border-input rounded-md bg-background text-foreground h-10 px-3" value={date || p.joining_date || choices[0]} onChange={e=>setDate(e.target.value)}>{choices.map(d=><option key={d} value={d}>{d}</option>)}</select></Label>
      <label className="flex gap-2 items-center text-sm"><Upload className="w-4 h-4"/>Approved unsigned offer PDF<input type="file" accept="application/pdf" disabled={busy} className="min-w-0 max-w-full" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);try{const path=await smartUpload({bucket:'employee-documents',path:`onboarding/${id}/offer_policy/unsigned_offer/${Date.now()}.pdf`,file,contentType:'application/pdf'});const {error}=await (supabase as any).from('hr_employee_onboarding').update({offer_policy_documents:{...data?.onb.offer_policy_documents,unsigned_offer:{file_url:`employee-documents://${path}`,file_name:file.name,received:false}}}).eq('id',id);if(error)throw error;await qc.invalidateQueries({queryKey:['prejoining-review',id]});toast.success('Offer saved');}catch(e){toast.error(e instanceof Error?e.message:'Upload failed');}finally{setBusy(false);}}}/></label>
      {data?.onb.offer_policy_documents?.unsigned_offer?.file_url && <Button variant="ghost" size="sm" onClick={()=>openStoredDocument(data.onb.offer_policy_documents.unsigned_offer.file_url)}><ExternalLink className="h-4 w-4 mr-2"/>View approved offer</Button>}
      <Button variant="outline" disabled={busy} onClick={()=>action('publish-package',{offerReference:reference || p.offer_reference,joiningDate:date || p.joining_date || choices[0]})}>{p.enabled?'Republish revised package':'Enable & publish package'}</Button>
    </div>}
    {p.enabled && data?.invite?.status==='submitted' && <div className="space-y-4">
      <dl className="text-sm grid sm:grid-cols-2 gap-2">{['first_name','last_name','email','phone','date_of_birth','address','city','state','zip','pan_number','aadhaar_number','bank_account_name','bank_name','bank_account_number','bank_ifsc'].map(k=><div key={k} className="min-w-0"><dt className="text-muted-foreground capitalize">{k.replaceAll('_',' ')}</dt><dd className="break-words">{payload[k] || '—'}</dd></div>)}</dl>
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