import { describe, expect, it } from 'vitest';
import { covers, markableSituations, situationLabel, situationTree, stagesSummary, toggleStage, unknownStages, type SituationRow } from './situations';

const row = (code: string, side: 'BUY' | 'SELL' | null, label: string, sort: number, detectable = true): SituationRow =>
  ({ code, side, label, description: '', detectable, sort, active: true });
const ROWS: SituationRow[] = [
  row('sell.kyc', 'SELL', 'KYC and verification', 10, false), row('sell.kyc.pending', 'SELL', 'KYC pending', 11),
  row('sell.kyc.review', 'SELL', 'Checking KYC', 12), row('sell.kyc.call', 'SELL', 'Verification call', 13),
  row('sell.pay', 'SELL', 'Payment', 20, false), row('sell.pay.ready', 'SELL', 'Client can pay', 21), row('sell.pay.checking', 'SELL', 'Checking payment', 22),
  row('buy.details', 'BUY', 'Details pending', 30), row('buy.pay', 'BUY', 'Payment', 40, false), row('buy.pay.cooling', 'BUY', 'Beneficiary activation', 42),
  row('done', null, 'Completed', 90), row('cancelled', null, 'Cancelled', 91),
];

describe('situations', () => {
  it('a reply for a group covers its steps, including ones added later', () => {
    expect(covers('sell.kyc', 'sell.kyc.call')).toBe(true);
    expect(covers('sell.kyc', 'sell.kyc.call.video')).toBe(true);
    expect(covers('sell.kyc.call', 'sell.kyc')).toBe(false);
    expect(covers('sell.kyc', 'sell.kycx')).toBe(false);
  });
  it('labels and summaries read naturally', () => {
    expect(situationLabel('sell.kyc', ROWS)).toBe('KYC and verification (any step)');
    expect(situationLabel(null, ROWS)).toBe('Any situation');
    expect(stagesSummary(['sell.kyc.call', 'sell.kyc.review'], ROWS)).toBe('Checking KYC, Verification call');
    expect(stagesSummary([], ROWS)).toBe('Any situation');
  });
  it('groups steps under their group for one side; common situations stay at the end', () => {
    const tree = situationTree(ROWS, ['SELL']);
    expect(tree.map((g) => [g.group?.code ?? null, g.items.map((i) => i.code)])).toEqual([
      ['sell.kyc', ['sell.kyc.pending', 'sell.kyc.review', 'sell.kyc.call']],
      ['sell.pay', ['sell.pay.ready', 'sell.pay.checking']],
      [null, ['done', 'cancelled']],
    ]);
  });
  it('only detectable, non-status situations of the side can be set for a chat', () => {
    expect(markableSituations(ROWS, 'SELL').map((r) => r.code)).toEqual(['sell.kyc.pending', 'sell.kyc.review', 'sell.kyc.call', 'sell.pay.ready']);
    expect(markableSituations(ROWS, 'BUY').map((r) => r.code)).toEqual(['buy.details', 'buy.pay.cooling']);
  });
  it('picking a group replaces its steps; unknown codes are reported', () => {
    expect(toggleStage(['sell.kyc.pending', 'sell.pay.ready'], 'sell.kyc')).toEqual(['sell.pay.ready', 'sell.kyc']);
    expect(toggleStage(['sell.kyc'], 'sell.kyc')).toEqual([]);
    expect(unknownStages(['sell.kyc.rm', 'sell.kyc'], ROWS)).toEqual(['sell.kyc.rm']);
  });
});
