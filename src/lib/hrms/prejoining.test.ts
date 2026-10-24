import { describe, it, expect } from 'vitest';
import { PREJOINING_DOCS, DISCLOSURES, joiningChoices, prejoiningProblems, prejoiningReady } from './prejoining';
const payload = { documents: Object.fromEntries(PREJOINING_DOCS.filter(d => d.required).map(d => [d.key, [{ path: d.key }]])), package_version: 2, joining_date: '2026-11-02', joining_confirmed: true, e2_consent: true, e2_disclosures: Object.fromEntries(DISCLOSURES.map(d => [d.key, 'None'])) };
const reviews = Object.fromEntries(['details', ...PREJOINING_DOCS.map(d => d.key)].map(k => [k, { status: 'approved' }]));
describe('approved prejoining rules', () => {
  it('never requires Annexure C', () => { expect(PREJOINING_DOCS.map(d => d.key)).toEqual(['signed_offer','pan_card','aadhaar','photo','cancelled_cheque','education','experience','signed_e2','pcc_application']); expect(prejoiningProblems(payload, 2, '2026-11-02')).toEqual([]); });
  it('requires signed E2 evidence', () => { expect(prejoiningProblems({ ...payload, documents: { ...payload.documents, signed_e2: [] } }, 2, '2026-11-02')).toContain('Signed declaration E2 is required'); });
  it('requires each disclosure rather than inferring None', () => { expect(prejoiningProblems({ ...payload, e2_disclosures: {} }, 2, '2026-11-02')).toHaveLength(4); });
  it('holds revised offers for new acceptance', () => { expect(prejoiningReady(payload, reviews, 3, '2026-11-02')).toBe(false); });
  it('requires explicit HR review, never just receipt', () => { expect(prejoiningReady(payload, {}, 2, '2026-11-02')).toBe(false); expect(prejoiningReady(payload, reviews, 2, '2026-11-02')).toBe(true); });
  it('blocks correction items', () => { expect(prejoiningReady(payload, { ...reviews, signed_e2: { status: 'correction' } }, 2, '2026-11-02')).toBe(false); });
  it('keeps the owner joining batches, not PDF calendar rules', () => { expect(joiningChoices('2026-10-24')).toEqual(['2026-11-02','2026-11-07','2026-11-14','2026-11-21']); });
});