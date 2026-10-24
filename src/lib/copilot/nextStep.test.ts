import { describe, expect, it } from 'vitest';
import { buildCopilotPicks, fillCopilotText, hintText, learnToast, mergeRefresh, refreshAfterMessage, unfilledTokens, waitingChip } from './copilotText';
import { fillTemplate, greetingFor, tdsSplit } from '@/lib/fill-template';

describe('the amount after TDS (buy orders only)', () => {
  it('is 1% to the paisa, as finance books it', () => {
    expect(tdsSplit(4500)).toEqual({ tds: 45, net: 4455 });
    expect(tdsSplit(12345.67)).toEqual({ tds: 123.46, net: 12222.21 });
    expect(tdsSplit(100.5)).toEqual({ tds: 1.01, net: 99.49 });
    expect(tdsSplit(0)).toBeNull();
  });
  it('fills {net_amount} and {tds_amount} on buy orders and leaves them visible on sell orders', () => {
    const text = 'Sir, 1% TDS (₹{tds_amount}) is deducted, so we will pay you ₹{net_amount}.';
    expect(fillTemplate(text, { amount: 4500, side: 'BUY' })).toBe('Sir, 1% TDS (₹45.00) is deducted, so we will pay you ₹4,455.00.');
    const sell = fillTemplate(text, { amount: 4500, side: 'SELL' });
    expect(sell).toBe(text);
    expect(unfilledTokens(sell)).toEqual(['{tds_amount}', '{net_amount}']);
    expect(fillTemplate(text, { amount: null, side: 'BUY' })).toBe(text);
  });
  it('reads an amount with Indian digit grouping (quick replies too)', () => {
    expect(fillTemplate('Pay ₹{amount}', { amount: '4,500.00' })).toBe('Pay ₹4,500.00');
    expect(fillTemplate('Pay ₹{amount}', { amount: '1,25,000' })).toBe('Pay ₹1,25,000.00');
    expect(fillTemplate('We pay ₹{net_amount}', { amount: '48,250', side: 'buy' })).toBe('We pay ₹47,767.50');
    expect(fillTemplate('Pay ₹{amount}', { amount: 'abc' })).toBe('Pay ₹{amount}');
  });
  it('fills {greeting} by the time in India', () => {
    expect(greetingFor(new Date('2026-10-24T03:30:00Z'))).toBe('Good morning'); // 09:00 IST
    expect(greetingFor(new Date('2026-10-24T08:30:00Z'))).toBe('Good afternoon'); // 14:00 IST
    expect(greetingFor(new Date('2026-10-24T14:30:00Z'))).toBe('Good evening'); // 20:00 IST
    expect(greetingFor(new Date('2026-10-23T22:30:00Z'))).toBe('Good morning'); // 04:00 IST
    expect(greetingFor(new Date('2026-10-24T06:30:00Z'))).toBe('Good afternoon'); // 12:00 IST
    expect(greetingFor(new Date('2026-10-24T11:30:00Z'))).toBe('Good evening'); // 17:00 IST
    expect(greetingFor(new Date('2026-10-24T18:30:00Z'))).toBe('Good evening'); // 00:00 IST
    expect(fillTemplate('{greeting}, sir.', {}, new Date('2026-10-24T14:30:00Z'))).toBe('Good evening, sir.');
    expect(unfilledTokens(fillCopilotText('{greeting}, sir.', {}, {}))).toEqual([]);
    expect(unfilledTokens('{greeting}, sir.')).toEqual(['{greeting}']);
  });
});

describe('the next step in the composer', () => {
  const fill = (t: string) => t;
  const playbook = [{ entryId: 'e1', title: 'Why KYC?', text: 'Sir, KYC is needed.' }];
  const script = [
    { entryId: 's2', label: 'Paying bank', text: 'Which bank will you use to pay, sir?', option: true, key: 'paying_bank' },
    { entryId: 's1', label: 'Source of funds', text: 'May I know your source of funds, sir?', key: 'source_of_funds' },
  ];
  it('comes first when the client asked nothing, after the replies when they asked a question; the next step before options', () => {
    const asked = buildCopilotPicks({ playbook, drafts: [], requestId: 'r1', side: 'SELL', detected: null, fill, script });
    expect(asked.map((p) => p.entryId)).toEqual(['e1', 's1', 's2']);
    const answered = buildCopilotPicks({ playbook: [], drafts: [], requestId: null, side: 'SELL', detected: null, fill, script, scriptFirst: true });
    expect(answered.map((p) => p.entryId)).toEqual(['s1', 's2']);
    // a step carries its key: sent as it is, it counts as a use of that step (copilot-learn stepKey)
    expect(answered[0]).toEqual({ kind: 'entry', entryId: 's1', requestId: null, text: 'May I know your source of funds, sir?', title: 'Source of funds', step: 'source_of_funds' });
    expect(asked[0].step).toBeUndefined();
  });
  it('is not offered twice when the same entry is already a reply', () => {
    const picks = buildCopilotPicks({ playbook: [{ entryId: 's1', title: 'Source', text: 'x' }], drafts: [], requestId: 'r', side: 'SELL', detected: null, fill, script });
    expect(picks.map((p) => p.entryId)).toEqual(['s1', 's2']);
    // offered as the reply to the client's question: saved the usual way (its client wordings keep growing)
    expect(picks.map((p) => p.step ?? null)).toEqual([null, 'paying_bank']);
  });
});

describe('the waiting clock and Binance actions', () => {
  const at = Date.parse('2026-10-24T14:30:00Z');
  it('turns amber at 3 minutes and red at 5; long waits in hours; none on a closed order', () => {
    expect(waitingChip(null, at)).toBeNull();
    expect(waitingChip(new Date(at - 30_000).toISOString(), at)).toMatchObject({ label: 'Client waiting <1 min', tone: 'muted' });
    expect(waitingChip(new Date(at - 3 * 60_000).toISOString(), at)).toMatchObject({ label: 'Client waiting 3 min', tone: 'amber' });
    expect(waitingChip(new Date(at - 5 * 60_000 - 1).toISOString(), at)).toMatchObject({ label: 'Client waiting 5 min', tone: 'red' });
    expect(waitingChip(new Date(at - 125 * 60_000).toISOString(), at)?.label).toBe('Client waiting 2 h 5 min');
    expect(waitingChip(new Date(at - 60_000).toISOString(), at)?.title).toBe('The client has been waiting for our reply since 19:59');
    expect(waitingChip(new Date(at - 60_000).toISOString(), at, false)).toBeNull();
  });
  it('never says "share the payment details" unless the client is known to be verified', () => {
    expect(hintText('share_details', true).label).toBe('Verify the client in Binance, then share the payment details');
    expect(hintText('share_details', undefined).label).toBe('Verify the client in Binance, then share the payment details');
    expect(hintText('share_details', null).label).toBe('Verify the client in Binance, then share the payment details');
    expect(hintText('share_details', false).label).toBe('Share the payment details');
    expect(hintText('extend_time', true).label).toBe('Extend the payment time in Binance');
    expect(hintText('send_proof', null).label).toBe('Send the payment screenshot first');
  });
});

describe('reading the next step again quietly', () => {
  type Contact = { name: string; phone: string; availableNow: boolean };
  type Shown = { status: string; next?: unknown; context?: unknown; playbook: string[]; contacts?: Partial<Record<string, Contact>>; missingContacts?: string[] };
  const shown: Shown = {
    status: 'ready', next: { offers: [1] }, context: { situation: 'sell.kyc.review' }, playbook: ['reply'],
    contacts: { kyc: { name: 'A', phone: '1', availableNow: true }, rm: { name: 'R', phone: '2', availableNow: true } }, missingContacts: ['support'],
  };
  it('takes the next step and the order facts, keeps the suggestions, and the refresh\'s view of each team it names', () => {
    const out = mergeRefresh(shown, {
      next: { offers: [2] }, context: { situation: 'sell.kyc.call' },
      contacts: { support: { name: 'S', phone: '3', availableNow: true } }, missingContacts: ['kyc'],
    });
    expect(out.next).toEqual({ offers: [2] });
    expect(out.context).toEqual({ situation: 'sell.kyc.call' });
    expect(out.playbook).toEqual(['reply']);
    expect(Object.keys(out.contacts).sort()).toEqual(['rm', 'support']);
    expect(out.missingContacts).toEqual(['kyc']);
  });
  it('a refresh that names no team leaves the numbers as they were', () => {
    const out = mergeRefresh(shown, { next: undefined, context: undefined, contacts: {}, missingContacts: [] });
    expect(out.contacts).toEqual(shown.contacts); expect(out.missingContacts).toEqual(['support']); expect(out.next).toEqual(shown.next);
  });
  it('after our further messages and Binance notices only; not the chat\'s first messages, a client message or our reply to one', () => {
    expect(refreshAfterMessage({ prevChat: 'm1', chat: 'm2', prevTrigger: null, trigger: null })).toBe(true);
    expect(refreshAfterMessage({ prevChat: 'm1', chat: 'm2', prevTrigger: 'c1', trigger: 'c1' })).toBe(true);
    expect(refreshAfterMessage({ prevChat: '', chat: 'm1', prevTrigger: null, trigger: null })).toBe(false);
    expect(refreshAfterMessage({ prevChat: 'm1', chat: 'm2', prevTrigger: null, trigger: 'c2' })).toBe(false);
    expect(refreshAfterMessage({ prevChat: 'm1', chat: 'm2', prevTrigger: 'c1', trigger: null })).toBe(false);
    expect(refreshAfterMessage({ prevChat: 'm1', chat: 'm1', prevTrigger: null, trigger: null })).toBe(false);
  });
});

describe('what saving a step or a non-question says', () => {
  it('a step is counted, an edited step is sent as written, a non-question is not saved, a repeat is already saved', () => {
    expect(learnToast({ action: 'merged', kind: 'step', title: 'Source of funds' })).toEqual({ title: 'Script step used', description: '“Source of funds” counted as used.', tone: 'success' });
    expect(learnToast({ action: 'promoted', kind: 'step', title: 'Greeting' }).description).toBe('Script step “Greeting” is now approved.');
    expect(learnToast({ action: 'skipped', reason: 'step_edited', kind: 'step', title: 'Greeting' }).title).toBe('Sent as you wrote it');
    expect(learnToast({ action: 'skipped', reason: 'no_question' })).toMatchObject({ title: 'Not saved to the Playbook', tone: 'info' });
    expect(learnToast({ action: 'created', title: 'TDS', repeated: true })).toMatchObject({ title: 'Already saved', tone: 'info' });
    expect(learnToast({ action: 'skipped', reason: 'step_empty', kind: 'step', title: 'Greeting' })).toMatchObject({ title: 'Not counted', description: 'Script step “Greeting” has no saved words in this language yet.' });
    expect(learnToast({ action: 'skipped', reason: 'something_new' }).description).toBe('Nothing was saved.');
  });
});
