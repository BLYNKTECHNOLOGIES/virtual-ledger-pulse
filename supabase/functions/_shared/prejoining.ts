import { nextJoiningBatch } from './joiningBatch.ts';

export const PREJOINING_DOCS = [
  { key: 'signed_offer', label: 'Signed offer', required: true },
  { key: 'pan_card', label: 'PAN card', required: true },
  { key: 'aadhaar', label: 'Masked Aadhaar / address proof', required: true },
  { key: 'photo', label: 'Passport-size photograph', required: true },
  { key: 'cancelled_cheque', label: 'Cancelled cheque / passbook', required: true },
  { key: 'education', label: 'Educational certificates', required: false },
  { key: 'experience', label: 'Previous employment documents', required: false },
  { key: 'signed_e2', label: 'Signed declaration E2', required: true },
  { key: 'pcc_application', label: 'PCC application proof', required: true },
] as const;
export const DISCLOSURES = [
  { key: 'criminal', label: 'Pending criminal cases or convictions (item 2)' },
  { key: 'bank', label: 'Bank accounts frozen or under law-enforcement lien (item 3)' },
  { key: 'platforms', label: 'Personal P2P platform and crypto exchange accounts (item 4)' },
  { key: 'relationships', label: 'Family or business relationships with company clients or counterparties (item 5)' },
] as const;
export function joiningChoices(reference: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 4; i++) { reference = nextJoiningBatch(reference); dates.push(reference); }
  return dates;
}
export function prejoiningProblems(p: Record<string, any>, version: number, joiningDate: string): string[] {
  const errors = PREJOINING_DOCS.filter(d => d.required && !p.documents?.[d.key]?.length).map(d => `${d.label} is required`);
  if (p.package_version !== version) errors.push('The offer has changed. Reload and sign the current offer and E2.');
  if (p.joining_date !== joiningDate || p.joining_confirmed !== true) errors.push('Confirm the current offered joining date');
  if (p.e2_consent !== true) errors.push('Accept the E2 declaration and consent');
  for (const d of DISCLOSURES) if (!String(p.e2_disclosures?.[d.key] || '').trim()) errors.push(`${d.label}: disclose details or write None`);
  return errors;
}
export function prejoiningReady(p: Record<string, any>, reviews: Record<string, any>, version: number, date: string): boolean {
  return prejoiningProblems(p, version, date).length === 0 && reviews.details?.status === 'approved' && PREJOINING_DOCS.every(d => !d.required || reviews[d.key]?.status === 'approved');
}