import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Loader2 } from 'lucide-react';
import { DISCLOSURES } from '@/lib/hrms/prejoining';
import { E2_DECLARATIONS, E2_CONSENT, generateE2 } from '@/lib/hrms/e2Document';
import { toast } from 'sonner';

export function CandidatePackageForm({ form, pkg, set }: { form:Record<string,any>; pkg:Record<string,any>; set:(key:string,value:any)=>void }) {
  const [busy,setBusy]=useState(false);
  return <section className="border-y border-border py-5 space-y-4">
    <h2 className="font-semibold text-foreground">Offer & joining confirmation</h2>
    <p className="text-sm text-muted-foreground">{pkg.role_title} · {pkg.offer_reference}</p>
    <p className="text-sm">Joining: {new Date(`${pkg.joining_date}T00:00:00+05:30`).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'long',year:'numeric'})}</p>
    <Button variant="outline" disabled={!pkg.offer_url} onClick={()=>window.open(pkg.offer_url,'_blank','noopener,noreferrer')}><Download className="h-4 w-4 mr-2"/>Download offer</Button>
    <label className="flex gap-3 text-sm"><Checkbox checked={form.joining_confirmed===true} onCheckedChange={v=>set('joining_confirmed',v===true)}/><span>I intend to join on the offered date.</span></label>
    <h2 className="font-semibold pt-4">E2 · Candidate Declaration and Consent</h2>
    <ol className="list-decimal pl-5 space-y-2 text-sm">{E2_DECLARATIONS.map(text=><li key={text}>{text}</li>)}</ol>
    <p className="text-sm leading-relaxed">{E2_CONSENT}</p>
    {DISCLOSURES.map(item=><div key={item.key}><Label htmlFor={`e2-${item.key}`}>{item.label}</Label><Textarea id={`e2-${item.key}`} className="mt-2 text-foreground" maxLength={2000} rows={2} placeholder="Disclose details, or write None" value={form.e2_disclosures?.[item.key] || ''} onChange={e=>set('e2_disclosures',{...form.e2_disclosures,[item.key]:e.target.value})}/></div>)}
    <label className="flex gap-3 text-sm"><Checkbox checked={form.e2_consent===true} onCheckedChange={v=>set('e2_consent',v===true)}/><span>I make the declarations above and authorise the verification described in E2.</span></label>
    <Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try { const blob=await generateE2(form,pkg);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`E2-${pkg.offer_reference.replace(/[^a-z0-9-]/gi,'_')}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000); } catch(e){toast.error(e instanceof Error?e.message:'Could not prepare E2');} finally{setBusy(false);}}}>{busy?<Loader2 className="h-4 w-4 mr-2 animate-spin"/>:<Download className="h-4 w-4 mr-2"/>}Download completed E2 for signing</Button>
  </section>;
}