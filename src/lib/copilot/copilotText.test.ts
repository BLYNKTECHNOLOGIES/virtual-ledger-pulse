import { describe, expect, it } from 'vitest';
import {
  buildCopilotPicks, contactAvailableNow, contactsUsed, cycleIndex, fillCopilotText, hasUnfilledToken, latestUnanswered, learnToast, modelLabel, PHONE_RE,
  maskPersonal, pickKey, sameText, statusLabel, teamLabel, unfilledTokens, type PanelMessage,
} from './copilotText';

describe('fillCopilotText', () => {
  it('fills order values and the picked contact numbers, leaving unknown tokens visible', () => {
    const out = fillCopilotText('Sir, please pay ₹{amount} for {orderNo}. KYC help: {contact:kyc}. RM: {contact:rm}.',
      { amount: 4500, orderNo: '2294' }, { kyc: { name: 'Chirag', phone: '9800011122', availableNow: true } });
    expect(out).toBe('Sir, please pay ₹4,500.00 for 2294. KYC help: 9800011122. RM: {contact:rm}.');
    expect(hasUnfilledToken(out)).toBe(true);
    expect(hasUnfilledToken('Sir, done.')).toBe(false);
  });
  it('lists the contact purposes a reply uses', () => {
    expect(contactsUsed('{contact:kyc} or {contact:support} or {contact:kyc}')).toEqual(['kyc', 'support']);
    expect(contactsUsed('Call {contact:payments}')).toEqual(['payments']);
    expect(unfilledTokens('Call {contact:payments}')).toEqual(['{contact:payments}']);
    expect(teamLabel('rm')).toBe('Relationship team');
    expect(teamLabel('payments', [{ code: 'payments', label: 'Payments team' }])).toBe('Payments team');
    expect(teamLabel('legal')).toBe('legal');
  });
  it('lists placeholders still to fill, once each', () => {
    expect(unfilledTokens('Call {contact:support} or {contact:support} about {orderNo}')).toEqual(['{contact:support}', '{orderNo}']);
    expect(unfilledTokens('Sir, {unknown} stays as typed')).toEqual([]);
  });
});

describe('maskPersonal (same results as the server maskPII)', () => {
  it('hides personal numbers and handles but keeps amounts and short numbers', () => {
    expect(maskPersonal('my upi is ravi.k@okaxis')).toBe('my upi is [upi]');
    expect(maskPersonal('mail me at ravi@gmail.com')).toBe('mail me at [email]');
    expect(maskPersonal('call 9876543210 or +91 98765 43210')).toBe('call [phone] or [phone]');
    expect(maskPersonal('PAN ABCDE1234F, IFSC HDFC0001234')).toBe('PAN [pan], IFSC [ifsc]');
    expect(maskPersonal('aadhaar 1234 5678 9012')).toBe('aadhaar [aadhaar]');
    expect(maskPersonal('UTR 412345678901 ref')).toBe('UTR [number] ref');
    expect(maskPersonal('paid 45,000 for order in 15 minutes')).toBe('paid 45,000 for order in 15 minutes');
    expect(maskPersonal('account 50100123456789')).toBe('account [number]');
    expect(maskPersonal('UTR 412345678901, ok. Ref 123456789.')).toBe('UTR [number], ok. Ref [number].');
    expect(maskPersonal('total 1,00,00,000.50')).toBe('total 1,00,00,000.50');
    expect(maskPersonal('Can I pay now?')).toBe('Can I pay now?');
  });
});

describe('statusLabel', () => {
  it('says the order status in plain words, from our side', () => {
    expect(statusLabel('TRADING', 'SELL')).toBe('not paid yet');
    expect(statusLabel('TRADING', 'BUY')).toBe('we have not paid yet');
    expect(statusLabel('BUYER_PAYED', 'SELL')).toBe('client marked paid');
    expect(statusLabel('APPEAL')).toBe('in appeal');
    expect(statusLabel('CANCELLED_BY_SYSTEM')).toBe('cancelled');
    expect(statusLabel('UNKNOWN')).toBeNull();
    expect(statusLabel('SOMETHING_NEW')).toBe('something new');
  });
});

describe('learnToast', () => {
  it('says what happened to the Playbook', () => {
    expect(learnToast({ action: 'created', title: 'TDS timing' })).toEqual({ title: 'Saved to Playbook', description: 'New question “TDS timing”', tone: 'success' });
    expect(learnToast({ action: 'variant', title: 'How long?', situation: 'Verification call' }).description).toBe('New reply for “How long?” (Verification call).');
    expect(learnToast({ action: 'widened', title: 'How long?', situation: 'KYC pending', phrasing: 'added' }).description)
      .toBe('“How long?” now also applies here (KYC pending). The client’s wording was added as another way of asking.');
    expect(learnToast({ action: 'conflict', title: 'TDS timing' }).tone).toBe('warning');
    expect(learnToast({ action: 'promoted', title: 'Paying bank' }).description).toBe('“Paying bank” is now approved.');
  });
  it('names the step a reply was saved under when it was used again or confirmed', () => {
    expect(learnToast({ action: 'merged', title: 'Can I pay now?', situation: 'KYC pending' }).description).toBe('Reply for “Can I pay now?” (KYC pending) used again.');
    expect(learnToast({ action: 'promoted', title: 'Can I pay now?', situation: 'Checking KYC' }).description).toBe('“Can I pay now?” (Checking KYC) is now approved.');
    expect(learnToast({ action: 'merged', title: 'TDS timing' }).description).toBe('Reply for “TDS timing” used again.');
  });
});

describe('buildCopilotPicks', () => {
  const fill = (t: string) => t.replace('{amount}', '4,500');
  const playbook = [
    { entryId: 'e1', title: 'Can I pay now?', text: 'Please wait, sir.' },
    { entryId: 'e2', title: 'Can I pay now?', text: 'Conflicting.', conflict: true },
  ];
  const drafts = [{ callId: 'c1', text: 'Draft A for {amount}', blocked: false }, { callId: 'c2', text: 'Blocked', blocked: true }];
  const alternatives = [
    { entryId: 'e3', title: 'Can I pay now?', text: 'Sir, please share the KYC details first.', steps: ['sell.kyc.pending'], stepLabels: ['KYC pending'] },
    { entryId: 'e4', title: 'Can I pay now?', text: 'We are checking.', steps: ['sell.kyc.review', 'sell.kyc.call'], stepLabels: ['Checking KYC', 'Verification call'] },
  ];
  it('in the panel\'s order: this step\'s replies, the drafts, then the replies for other steps; conflicts and blocked drafts are left out', () => {
    const picks = buildCopilotPicks({ playbook, drafts, alternatives, requestId: 'r1', side: 'SELL', detected: 'sell.kyc.call', fill });
    expect(picks.map((p) => p.entryId ?? p.callId)).toEqual(['e1', 'c1', 'e3', 'e4']);
    expect(picks[1].text).toBe('Draft A for 4,500');
    expect(picks.every((p) => p.requestId === 'r1')).toBe(true);
  });
  it('a reply for another step carries its first listed step; this step\'s replies and drafts carry none', () => {
    const picks = buildCopilotPicks({ playbook, drafts, alternatives, requestId: 'r1', side: 'SELL', detected: 'sell.kyc.call', fill });
    expect(picks[0].situation).toBeUndefined();
    expect(picks[1].situation).toBeUndefined();
    expect(picks[2].situation).toEqual({ code: 'sell.kyc.pending', label: 'KYC pending', side: 'SELL', detected: 'sell.kyc.call' });
    expect(picks[3].situation).toEqual({ code: 'sell.kyc.review', label: 'Checking KYC', side: 'SELL', detected: 'sell.kyc.call' });
  });
  it('tells suggestions apart by identity, not text, and compares sent text loosely', () => {
    const same = buildCopilotPicks({ playbook: [{ entryId: 'e1', title: 'Q', text: 'Please wait, sir.' }], drafts: [],
      alternatives: [{ entryId: 'e9', title: 'Q', text: 'Please wait, sir.', steps: ['sell.kyc.review'], stepLabels: ['Checking KYC'] }], requestId: 'r', side: 'SELL', detected: null, fill });
    expect(pickKey(same[0])).not.toBe(pickKey(same[1]));
    expect(same.findIndex((p) => pickKey(p) === pickKey(same[1]))).toBe(1);
    expect(sameText('  Please  wait, Sir. ', 'please wait, sir.')).toBe(true);
    expect(sameText('Please wait, sir. Thanks', 'Please wait, sir.')).toBe(false);
    const unlogged = buildCopilotPicks({ playbook: [], drafts: [{ callId: null, text: 'A', blocked: false }, { callId: null, text: 'B', blocked: false }], requestId: null, side: 'SELL', detected: null, fill });
    expect(pickKey(unlogged[0])).not.toBe(pickKey(unlogged[1]));
  });
  it('without a known side, replies for other steps are not offered (a step cannot be set)', () => {
    expect(buildCopilotPicks({ playbook, drafts, alternatives, requestId: null, side: null, detected: null, fill }).map((p) => p.entryId ?? p.callId)).toEqual(['e1', 'c1']);
    expect(buildCopilotPicks({ playbook: [], drafts: [], alternatives: undefined, requestId: null, side: 'BUY', detected: null, fill })).toEqual([]);
  });
});

describe('modelLabel and cycleIndex', () => {
  it('names models', () => {
    expect(modelLabel('openai/gpt-6-astra')).toBe('GPT-6 Astra');
    expect(modelLabel('google/some-new-model')).toBe('Some New Model');
  });
  it('cycles both ways', () => {
    expect(cycleIndex(3, -1, 1)).toBe(0);
    expect(cycleIndex(3, -1, -1)).toBe(2);
    expect(cycleIndex(3, 2, 1)).toBe(0);
    expect(cycleIndex(0, -1, 1)).toBe(-1);
  });
});

describe('latestUnanswered', () => {
  const m = (over: Partial<PanelMessage>): PanelMessage => ({ id: 'archive-1', senderType: 'counterparty', text: 'hi', timestamp: 1_792_000_000_000, ...over });
  it('returns the client message after our last human reply, with a hint for live messages only', () => {
    expect(latestUnanswered([m({ senderType: 'operator', text: 'Hello sir' }), m({ id: 'binance-55', text: 'payment done' })]))
      .toEqual({ key: `${Math.floor(1_792_000_000_000 / 5000)}|payment done`, hint: { id: '55', text: 'payment done' } });
    expect(latestUnanswered([m({ text: 'payment done' })])?.hint).toBeNull();
  });
  it('ignores auto-replies, cards, system notices and failed sends; our human reply answers it', () => {
    const client = m({ id: 'binance-9', text: 'hello' });
    expect(latestUnanswered([client, m({ senderType: 'operator', messageType: 'auto_reply', text: 'auto' }), m({ senderType: 'system', text: 'x' })])?.hint?.id).toBe('9');
    expect(latestUnanswered([client, m({ senderType: 'operator', source: 'local', _deliveryStatus: 'failed', text: 'oops' })])?.hint?.id).toBe('9');
    expect(latestUnanswered([client, m({ senderType: 'operator', text: 'Hello sir' })])).toBeNull();
    expect(latestUnanswered([m({ text: null, imageUrl: 'https://x/y.jpg' })])?.key.endsWith('|[image]')).toBe(true);
  });
});

describe('contactAvailableNow (same rule as the database picker)', () => {
  const wedNoon = new Date('2026-10-14T06:30:00Z'); // Wed 12:00 IST
  const wedLate = new Date('2026-10-14T18:00:00Z'); // Wed 23:30 IST
  const sunNoon = new Date('2026-10-18T06:30:00Z'); // Sun 12:00 IST
  const asha = { days: [1, 2, 3, 4, 5, 6], available_from: '10:00', available_to: '19:00' };
  const bhanu = { days: [1, 2, 3, 4, 5, 6, 7], available_from: '19:00:00', available_to: '02:00:00' };
  const chirag = { days: [1, 2, 3, 4, 5, 6, 7], available_from: null, available_to: null };
  it('matches the database results', () => {
    expect([asha, chirag, bhanu].map((c) => contactAvailableNow(c, wedNoon))).toEqual([true, true, false]);
    expect([asha, chirag, bhanu].map((c) => contactAvailableNow(c, wedLate))).toEqual([false, true, true]);
    expect([asha, chirag, bhanu].map((c) => contactAvailableNow(c, sunNoon))).toEqual([false, true, false]);
    expect(contactAvailableNow({ ...chirag, is_active: false }, wedNoon)).toBe(false);
  });
  it('validates phone numbers like the database', () => {
    expect(['+91 98765 43210', '9800011122', '+919812345678'].every((p) => PHONE_RE.test(p))).toBe(true);
    expect(['call me', '12345', '+91-'].some((p) => PHONE_RE.test(p))).toBe(false);
  });
});
