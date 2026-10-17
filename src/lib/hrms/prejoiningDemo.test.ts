import { describe, expect, it } from 'vitest';
import { DEMO_DOCUMENTS, demoReady, demoSubmissionProblems, type DemoReview } from './prejoiningDemo';
const files = Object.fromEntries(DEMO_DOCUMENTS.map(d => [d.key, 'sample.pdf']));
const approved: Record<string, DemoReview> = Object.fromEntries([...DEMO_DOCUMENTS.map(d => [d.key, 'approved' as const]), ['details', 'approved' as const]]);
describe('prejoining preview rules', () => {
  it('requires signed offer, E2 and PCC', () => { expect(demoSubmissionProblems({ ...files, offer: undefined, e2: undefined, pcc: undefined }, true, true)).toEqual(['Signed offer is required', 'Signed declaration E2 is required', 'PCC application proof is required']); });
  it('requires joining confirmation', () => { expect(demoSubmissionProblems(files, false, true)).toEqual(['Confirm your joining date']); });
  it('requires declaration', () => { expect(demoSubmissionProblems(files, true, false)).toEqual(['Confirm the declaration']); });
  it('does not make unreviewed evidence ready', () => { expect(demoReady(files, {}, true, true)).toBe(false); });
  it('requires review of details', () => { expect(demoReady(files, { ...approved, details: 'pending' }, true, true)).toBe(false); });
  it('blocks corrections', () => { expect(demoReady(files, { ...approved, pcc: 'correction' }, true, true)).toBe(false); });
  it('requires submission', () => { expect(demoReady(files, approved, false, true)).toBe(false); expect(demoReady(files, approved, true, true)).toBe(true); });
});
