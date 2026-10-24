import { DISCLOSURES } from './prejoining';
import { toDataUri } from '@/lib/companyIdentity';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));
export const E2_DECLARATIONS = [
  'The information and documents I have given the Company are true and complete.',
  'No criminal case is pending against me and I have not been convicted of any offence, except as disclosed below.',
  'No bank account in my name is frozen or under lien by any law-enforcement agency, except as disclosed below.',
  'My personal accounts on P2P platforms and crypto exchanges are listed below. If I have none, I write “None”.',
  'I have no family or business relationship with any client or counterparty of the Company, except as disclosed below.',
  'I will submit my Police Clearance Certificate within 30 days of joining.',
];
export const E2_CONSENT = 'I authorise the Company, and any agency it appoints, to verify my identity, address, education, employment history, references and police record, and to screen my name against sanctions and adverse-media sources. My data will be used only for employment purposes, as permitted under the Digital Personal Data Protection Act, 2023, and kept in my personnel file. I understand that a false or incomplete declaration makes my offer void and, if found after joining, is grounds for termination.';

/** Each page is captured independently; long disclosures never invade the letterhead/footer. */
export async function generateE2(form: Record<string, any>, pkg: Record<string, any>): Promise<Blob> {
  if (!pkg.offer_reference || !pkg.role_title || !pkg.letterhead_url) throw new Error('The offer or company letterhead is unavailable. Ask HR to republish.');
  const name = `${form.first_name || ''} ${form.last_name || ''}`.trim();
  if (!name) throw new Error('Enter your name before downloading E2');
  for (const item of DISCLOSURES) if (!String(form.e2_disclosures?.[item.key] || '').trim()) throw new Error('Complete all four disclosures, writing None where applicable');
  const artwork = await toDataUri(pkg.letterhead_url);
  if (!artwork) throw new Error('Could not load the company letterhead. Retry the download.');
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const pdf = new jsPDF({ unit:'mm',format:'a4' });
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(host);
  const margins = pkg.margins || { top:35,bottom:30,left:19,right:19 };
  const scale = 794 / 210;
  const pages: HTMLElement[] = [];
  let body: HTMLElement;
  const newPage = () => {
    const page = document.createElement('div');
    page.style.cssText = 'position:relative;width:794px;height:1123px;background:white;color:#111;font-family:Arial,sans-serif;font-size:13px;line-height:1.42;';
    const art = document.createElement('img'); art.src = artwork; art.style.cssText='position:absolute;inset:0;width:100%;height:100%;'; page.appendChild(art);
    body = document.createElement('div');
    body.style.cssText = `position:absolute;top:${margins.top*scale}px;bottom:${margins.bottom*scale}px;left:${margins.left*scale}px;right:${margins.right*scale}px;overflow:hidden;`;
    page.appendChild(body); host.appendChild(page); pages.push(page);
  };
  newPage();
  const append = (html:string) => {
    const block=document.createElement('div'); block.innerHTML=html; body.appendChild(block);
    if (body.scrollHeight > body.clientHeight) { block.remove(); newPage(); body.appendChild(block); }
    if (body.scrollHeight > body.clientHeight) throw new Error('The disclosure is too long. Shorten it before downloading E2.');
  };
  try {
    append(`<p style="font-size:10px;margin:0 0 3px">ANNEXURE E2</p><h1 style="font-size:21px;margin:0 0 5px">Candidate Declaration and Consent</h1><p style="margin:0 0 12px">Sent with the offer letter. Return it signed with the joining documents.</p><p>Ref: <b>${esc(pkg.offer_reference)}</b></p><p>I, <b>${esc(name)}</b>, offered the role of <b>${esc(pkg.role_title)}</b> at ${esc(pkg.company_name)} (the “Company”), declare that:</p>`);
    E2_DECLARATIONS.forEach((text,i)=>append(`<p style="margin:0 0 7px"><b>${i+1}.</b> ${esc(text)}</p>`));
    append(`<p style="margin:9px 0 15px">${esc(E2_CONSENT)}</p><h2 style="font-size:14px;margin:0 0 8px">Disclosures (items 2 to 5)</h2>`);
    DISCLOSURES.forEach(item => {
      const text=String(form.e2_disclosures[item.key]);
      append(`<p style="margin:8px 0 3px;font-weight:bold">${esc(item.label)}</p>`);
      const chunks=text.match(/.{1,450}(?:\s|$)|.{1,450}/gs) || [text];
      chunks.forEach(chunk=>append(`<p style="margin:0 0 5px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(chunk)}</p>`));
    });
    append(`<div style="margin-top:35px"><p>__________________________________<br>Candidate’s signature</p><p>Name <b>${esc(name)}</b> &nbsp;&nbsp; Date __________________</p></div>`);
    for (let i=0;i<pages.length;i++) {
      const page=pages[i];
      await Promise.all(Array.from(page.querySelectorAll('img')).map(img=>img.decode()));
      const canvas=await html2canvas(page,{scale:2,logging:false,backgroundColor:'#ffffff',width:794,height:1123});
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',0,0,210,297);
    }
    return pdf.output('blob');
  } finally { host.remove(); }
}