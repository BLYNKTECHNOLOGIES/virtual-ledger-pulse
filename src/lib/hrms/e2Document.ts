import { DISCLOSURES } from './prejoining';
import { toDataUri } from '@/lib/companyIdentity';
import { formatValue } from '@/lib/docResolvers';

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

/**
 * What E2 prints, named as in the shared variable dictionary (HRMS → Documents →
 * Variables). Offer facts come from the offer letter issued to the candidate and
 * frozen in the joining package; candidate facts come from their own form.
 * Aadhaar is never printed — only a masked copy is collected.
 */
export const E2_OFFER_FIELDS = [
  { key: 'reference_no', label: 'Offer reference', required: true },
  { key: 'designation', label: 'Position offered', required: true },
  { key: 'department', label: 'Department', required: false },
  { key: 'date_of_joining', label: 'Date of joining', required: true },
  { key: 'company_legal_name', label: 'Company', required: true },
] as const;
export const E2_CANDIDATE_FIELDS = [
  { key: 'employee_name', label: 'Full name' },
  { key: 'employee_date_of_birth', label: 'Date of birth' },
  { key: 'employee_phone', label: 'Mobile' },
  { key: 'employee_email', label: 'Email' },
  { key: 'employee_address', label: 'Address' },
  { key: 'employee_pan', label: 'PAN' },
] as const;

const DATE_FORMAT = 'DD MMM YYYY';
const trim = (v: unknown) => String(v ?? '').trim();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A calendar date as the dictionary prints it (DD MMM YYYY). YYYY-MM-DD values are
 * read as calendar days, never as UTC instants, so a candidate's browser in any time
 * zone prints the same day.
 */
export function e2Date(raw: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(raw));
  if (!m) return formatValue(raw, 'date', DATE_FORMAT);
  const year = Number(m[1]);
  const monthNo = Number(m[2]);
  const day = Number(m[3]);
  const month = MONTHS[monthNo - 1];
  // Real calendar days only (never "31 Feb"); UTC arithmetic, so no time zone moves the check.
  const real = !!month && day >= 1 && new Date(Date.UTC(year, monthNo - 1, day)).getUTCDate() === day;
  return real ? `${m[3]} ${month} ${m[1]}` : '';
}

/** Every E2 value, keyed by its dictionary variable. */
export function e2Values(form: Record<string, any>, pkg: Record<string, any>): Record<string, string> {
  return {
    reference_no: trim(pkg.offer_reference),
    designation: trim(pkg.role_title),
    department: trim(pkg.department),
    date_of_joining: e2Date(pkg.joining_date),
    company_legal_name: trim(pkg.company_name),
    employee_name: `${trim(form.first_name)} ${trim(form.last_name)}`.trim(),
    employee_date_of_birth: e2Date(form.date_of_birth),
    employee_phone: trim(form.phone),
    employee_email: trim(form.email),
    // Same composition as the dictionary's address variable.
    employee_address: [form.address, form.city, form.state, form.zip, form.country].map(trim).filter(Boolean).join(', '),
    employee_pan: trim(form.pan_number).toUpperCase(),
  };
}

/** What must be filled in before E2 can be prepared for signing. */
export function e2Problems(form: Record<string, any>, pkg: Record<string, any>): string[] {
  const v = e2Values(form, pkg);
  const errors: string[] = [];
  if (E2_OFFER_FIELDS.some(f => f.required && !v[f.key]) || !pkg.letterhead_url) {
    errors.push('The offer or company letterhead is unavailable. Ask HR to send the form again.');
  }
  if (!v.employee_name) errors.push('Enter your name');
  if (!v.employee_date_of_birth) errors.push('Enter your date of birth');
  if (trim(form.phone).replace(/\D/g, '').length < 10) errors.push('Enter your 10-digit mobile number');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.employee_email)) errors.push('Enter your email address');
  if (!trim(form.address) || !trim(form.city) || !trim(form.state) || trim(form.zip).replace(/\D/g, '').length !== 6) {
    errors.push('Enter your full address with city, state and 6-digit PIN code');
  }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.employee_pan)) errors.push('Enter your PAN in the format ABCDE1234F');
  if (DISCLOSURES.some(d => !trim(form.e2_disclosures?.[d.key]))) errors.push('Complete all four disclosures, writing None where applicable');
  return errors;
}

function detailsTable(title: string, rows: Array<[string, string]>): string {
  const cell = 'padding:4px 6px;border:1px solid #cfcfcf;vertical-align:middle;line-height:1.3;';
  return `<p style="margin:6px 0 4px;font-weight:bold;font-size:12px">${esc(title)}</p><table style="width:100%;border-collapse:collapse;font-size:12px;margin:0 0 8px">${rows.map(([label, value]) => `<tr><td style="${cell}width:32%;background:#f5f5f5">${esc(label)}</td><td style="${cell}overflow-wrap:anywhere"><b>${esc(value)}</b></td></tr>`).join('')}</table>`;
}

/** Each page is captured independently; long disclosures never invade the letterhead/footer. */
export async function generateE2(form: Record<string, any>, pkg: Record<string, any>): Promise<Blob> {
  const problems = e2Problems(form, pkg);
  if (problems.length) throw new Error(problems.slice(0, 3).join('. '));
  const v = e2Values(form, pkg);
  const name = v.employee_name;
  const letterheadUrl = String(pkg.letterhead_url).startsWith('/__l5e/') ? `https://erp.blynkex.com${pkg.letterhead_url}` : pkg.letterhead_url;
  const artwork = await toDataUri(letterheadUrl);
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
    append(`<p style="font-size:10px;margin:0 0 3px">ANNEXURE E2</p><h1 style="font-size:21px;margin:0 0 5px">Candidate Declaration and Consent</h1><p style="margin:0 0 8px">Sent with offer letter <b>${esc(v.reference_no)}</b>. Sign it and return it with your joining documents.</p>`);
    append(detailsTable('Offer', E2_OFFER_FIELDS.filter(f => v[f.key]).map(f => [f.label, v[f.key]])));
    append(detailsTable('Candidate', E2_CANDIDATE_FIELDS.map(f => [f.label, v[f.key]])));
    append(`<p style="margin:6px 0 8px">I, <b>${esc(name)}</b>, offered the role of <b>${esc(v.designation)}</b> at ${esc(v.company_legal_name)} (the “Company”), declare that:</p>`);
    E2_DECLARATIONS.forEach((text,i)=>append(`<p style="margin:0 0 7px"><b>${i+1}.</b> ${esc(text)}</p>`));
    append(`<p style="margin:9px 0 15px">${esc(E2_CONSENT)}</p><h2 style="font-size:14px;margin:0 0 8px">Disclosures (items 2 to 5)</h2>`);
    DISCLOSURES.forEach(item => {
      const text=String(form.e2_disclosures[item.key]);
      append(`<p style="margin:8px 0 3px;font-weight:bold">${esc(item.label)}</p>`);
      const chunks=text.match(/.{1,450}(?:\s|$)|.{1,450}/gs) || [text];
      chunks.forEach(chunk=>append(`<p style="margin:0 0 5px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(chunk)}</p>`));
    });
    append(`<div style="margin-top:35px"><p>__________________________________<br>Candidate’s signature</p><p>Name <b>${esc(name)}</b></p><p>Date __________________ &nbsp;&nbsp; Place __________________</p></div>`);
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
