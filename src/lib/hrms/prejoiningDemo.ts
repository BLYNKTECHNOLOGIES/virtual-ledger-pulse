export const DEMO_DOCUMENTS = [
  { key: 'offer', label: 'Signed offer', required: true },
  { key: 'pan', label: 'PAN card', required: true },
  { key: 'address', label: 'Aadhaar / address proof', required: true },
  { key: 'photo', label: 'Passport photograph', required: true },
  { key: 'bank', label: 'Cancelled cheque / passbook', required: true },
  { key: 'education', label: 'Educational certificate', required: false },
  { key: 'experience', label: 'Previous employment documents', required: false },
  { key: 'e2', label: 'Signed declaration E2', required: true },
  { key: 'pcc', label: 'PCC application proof', required: true },
] as const;
export type DemoReview = 'pending' | 'approved' | 'correction';
export function demoSubmissionProblems(files: Record<string, unknown>, confirmed: boolean, declared: boolean): string[] {
  const errors = DEMO_DOCUMENTS.filter(d => d.required && !files[d.key]).map(d => `${d.label} is required`);
  if (!confirmed) errors.push('Confirm your joining date');
  if (!declared) errors.push('Confirm the declaration');
  return errors;
}
export function demoReady(files: Record<string, unknown>, reviews: Record<string, DemoReview>, submitted: boolean, confirmed: boolean): boolean {
  return submitted && confirmed && reviews.details === 'approved' && DEMO_DOCUMENTS.every(d => !d.required || (Boolean(files[d.key]) && reviews[d.key] === 'approved'));
}
