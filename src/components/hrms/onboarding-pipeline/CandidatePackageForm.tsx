import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Loader2 } from 'lucide-react';
import { DISCLOSURES } from '@/lib/hrms/prejoining';
import { E2_DECLARATIONS, E2_CONSENT, E2_OFFER_FIELDS, e2Values, generateE2 } from '@/lib/hrms/e2Document';
import { toast } from 'sonner';

/** The onboarding service answered and refused (link replaced, form closed or submitted…). */
class LinksRefused extends Error {}

/** Fresh signed links to the candidate's offer letter and the letterhead (signed links expire in minutes). */
async function packageLinks(token: string): Promise<{ offer_url: string | null; letterhead_url: string | null }> {
  const { data, error } = await supabase.functions.invoke('onboarding-invite', { body: { action: 'package-links', token } });
  let message = (data as any)?.error as string | undefined;
  if (error && !message && (error as any)?.context?.json) {
    try { message = (await (error as any).context.json())?.error; } catch { /* ignore */ }
  }
  if (message) throw new LinksRefused(message);
  if (error) throw new Error('Could not reach the onboarding service. Please try again.');
  return { offer_url: (data as any)?.offer_url || null, letterhead_url: (data as any)?.letterhead_url || null };
}

/** Open the offer in a tab opened straight away (popup blockers), cut from this page. */
async function openOffer(token: string) {
  const tab = window.open('', '_blank');
  if (tab) { try { tab.opener = null; } catch { /* ignore */ } }
  try {
    const { offer_url } = await packageLinks(token);
    if (!offer_url) throw new Error('Your offer letter is not available. Please contact HR.');
    if (tab && !tab.closed) tab.location.replace(offer_url);
    else window.open(offer_url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    if (tab && !tab.closed) tab.close();
    throw e;
  }
}

export function CandidatePackageForm({ form, pkg, set, token }: { form:Record<string,any>; pkg:Record<string,any>; set:(key:string,value:any)=>void; token:string }) {
  const [busy,setBusy]=useState(false);
  const [opening,setOpening]=useState(false);
  const offer = e2Values(form, pkg);
  const offerRows = E2_OFFER_FIELDS.filter(f => f.key !== 'company_legal_name' && offer[f.key]);
  return <section className="rounded-xl border border-border bg-background shadow-sm p-5 space-y-4">
    <h2 className="font-semibold text-foreground">Offer & joining confirmation</h2>
    <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {offerRows.map(f => <div key={f.key} className="min-w-0"><dt className="text-muted-foreground">{f.label}</dt><dd className="text-foreground break-words">{offer[f.key]}</dd></div>)}
    </dl>
    {pkg.offer_valid === false
      ? <p className="text-sm text-destructive">This offer letter is no longer available. Please contact HR for the current offer.</p>
      : <div className="space-y-1.5">
          <Button variant="outline" disabled={opening} onClick={async()=>{setOpening(true);try{await openOffer(token);}catch(e){toast.error(e instanceof Error?e.message:'Could not open your offer letter');}finally{setOpening(false);}}}>{opening?<Loader2 className="h-4 w-4 mr-2 animate-spin"/>:<Download className="h-4 w-4 mr-2"/>}Download offer letter</Button>
          <p className="text-xs text-muted-foreground">Print and sign the offer letter, then upload the signed copy under Documents.</p>
        </div>}
    <label className="flex gap-3 text-sm"><Checkbox checked={form.joining_confirmed===true} onCheckedChange={v=>set('joining_confirmed',v===true)}/><span>I intend to join on {offer.date_of_joining || 'the offered date'}.</span></label>
    <h2 className="font-semibold pt-4">E2 · Candidate Declaration and Consent</h2>
    <p className="text-sm text-muted-foreground">E2 carries your offer details and the details you entered in this form: name, date of birth, mobile, email, address and PAN.</p>
    <ol className="list-decimal pl-5 space-y-2 text-sm">{E2_DECLARATIONS.map(text=><li key={text}>{text}</li>)}</ol>
    <p className="text-sm leading-relaxed">{E2_CONSENT}</p>
    {DISCLOSURES.map(item=><div key={item.key}><Label htmlFor={`e2-${item.key}`}>{item.label}</Label><Textarea id={`e2-${item.key}`} className="mt-2 text-foreground" maxLength={2000} rows={2} placeholder="Disclose details, or write None" value={form.e2_disclosures?.[item.key] || ''} onChange={e=>set('e2_disclosures',{...form.e2_disclosures,[item.key]:e.target.value})}/></div>)}
    <label className="flex gap-3 text-sm"><Checkbox checked={form.e2_consent===true} onCheckedChange={v=>set('e2_consent',v===true)}/><span>I make the declarations above and authorise the verification described in E2.</span></label>
    <div className="space-y-1.5">
      <Button variant="outline" disabled={busy || pkg.offer_valid === false} onClick={async()=>{setBusy(true);try { let letterhead=pkg.letterhead_url; try { letterhead=(await packageLinks(token)).letterhead_url || letterhead; } catch(e) { if (e instanceof LinksRefused) throw e; /* service unreachable: the page's own letterhead link may still be valid */ } const blob=await generateE2(form,{...pkg,letterhead_url:letterhead});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`E2-${String(pkg.offer_reference||'declaration').replace(/[^a-z0-9-]/gi,'_')}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000); } catch(e){toast.error(e instanceof Error?e.message:'Could not prepare E2');} finally{setBusy(false);}}}>{busy?<Loader2 className="h-4 w-4 mr-2 animate-spin"/>:<Download className="h-4 w-4 mr-2"/>}Download completed E2 for signing</Button>
      <p className="text-xs text-muted-foreground">Sign the downloaded E2 and upload it under Documents.</p>
    </div>
  </section>;
}
