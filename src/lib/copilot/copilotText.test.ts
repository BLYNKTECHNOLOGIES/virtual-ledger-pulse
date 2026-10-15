import { describe, expect, it } from 'vitest';
import {
  contactAvailableNow, contactsUsed, cycleIndex, fillCopilotText, hasUnfilledToken, latestUnanswered, learnToast, modelLabel, PHONE_RE,
  maskPersonal, statusLabel, teamLabel, unfilledTokens, type PanelMessage,
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
