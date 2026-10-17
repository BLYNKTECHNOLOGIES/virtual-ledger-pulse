import { describe, expect, it } from 'vitest';
import {
  buildCopilotPicks, clientSummary, contactAvailableNow, contactsUsed, cycleIndex, deadlineChips, deadlineContext, fillCopilotText, hasUnfilledToken,
  istClock, kycReload, latestUnanswered, learnToast, modelLabel, orderStatusCode, PHONE_RE, maskPersonal, pickKey, sameText, statusLabel, waitForLiveKyc,
  teamLabel, unfilledTokens, type PanelMessage,
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
      .toBe('“How long?” now also applies here (KYC pending). The client’s wording was added as another way of asking, so a similar message can match without AI next time.');
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

describe('deadlineChips', () => {
  const now = Date.parse('2026-10-15T15:00:00Z'); // 20:30 IST
  const at = (min: number) => new Date(now + min * 60_000).toISOString();
  it('says who must pay by when, with whole minutes left (never more than the clock allows), getting amber then red', () => {
    expect(deadlineChips({ side: 'SELL', pay_by: at(25) }, now)).toEqual([{
      key: 'pay', label: 'Client pays by 20:55 · 25 min', main: 'Client pays by 20:55', left: '25 min', tone: 'muted',
      title: 'Binance cancels the order if the client has not paid and marked it paid by 20:55.',
    }]);
    expect(deadlineChips({ side: 'BUY', pay_by: at(6.5) }, now)[0]).toMatchObject({ label: 'We pay by 20:36 · 6 min', tone: 'amber' });
    expect(deadlineChips({ side: 'BUY', pay_by: at(2.5) }, now)[0]).toMatchObject({ label: 'We pay by 20:32 · 2 min', tone: 'red' });
    expect(deadlineChips({ side: 'SELL', pay_by: at(0.5) }, now)[0].label).toBe('Client pays by 20:30 · <1 min');
    expect(deadlineChips({ side: 'SELL', pay_by: at(-1) }, now)[0]).toMatchObject({ label: "Client's pay time over", tone: 'red' });
    expect(deadlineChips({ side: 'BUY', pay_by: at(-1) }, now)[0].label).toBe('Our pay time over');
    expect(deadlineChips({ side: 'SELL', pay_by: at(60) }, now)[0].label).toBe('Client pays by 21:30 · 1 h');
  });
  it('before verification on a sell order the pay deadline reads as the order expiring, never as time to pay', () => {
    expect(deadlineChips({ side: 'SELL', pay_by: at(6.5), kyc_pending: true }, now)[0]).toMatchObject({
      label: 'Order expires 20:36 · 6 min', tone: 'amber',
    });
    expect(deadlineChips({ side: 'SELL', pay_by: at(6.5), kyc_pending: true }, now)[0].title).toContain("don't ask them to pay");
    expect(deadlineChips({ side: 'SELL', pay_by: at(-2), kyc_pending: true }, now)[0].label).toBe('Order time over');
  });
  it('once marked paid: our release time on sell orders (passed, not "release now"), the client\'s on buy orders', () => {
    expect(deadlineChips({ side: 'SELL', release_by: at(14) }, now).map((c) => [c.label, c.tone])).toEqual([['Release by 20:44 · 14 min', 'muted']]);
    expect(deadlineChips({ side: 'SELL', release_by: at(-7) }, now)[0]).toMatchObject({ label: 'Release time passed · 7 min ago', tone: 'red' });
    expect(deadlineChips({ side: 'SELL', release_by: at(-7) }, now)[0].title).toMatch(/^Check that the money has arrived/);
    expect(deadlineChips({ side: 'BUY', release_by: at(3) }, now)[0]).toMatchObject({ label: 'Client releases by 20:33 · 3 min', tone: 'amber' });
    expect(deadlineChips({ side: 'BUY', release_by: at(-7) }, now)[0].label).toBe('Client release overdue · 7 min');
    expect(deadlineChips({ side: 'BUY', release_by: at(-0.5) }, now)[0].label).toBe('Client release time up');
    expect(deadlineChips({ side: 'BUY', release_by: at(-30 * 1440) }, now)[0].label).toBe('Client release overdue · 30 days');
  });
  it("our appeal case's check-in timer; the date when not today; nothing without data", () => {
    expect(deadlineChips({ appeal_case: { status: 'respond_by_set', response_due: at(95) } }, now)[0]).toMatchObject({ label: 'Appeal check-in due 22:05 · 1 h 35 min', tone: 'amber' });
    expect(deadlineChips({ appeal_case: { status: 'respond_by_set', response_due: at(-12) } }, now)[0]).toMatchObject({ label: 'Appeal check-in overdue · 12 min', tone: 'red' });
    expect(deadlineChips({ appeal_case: { status: 'respond_by_set', response_due: at(4 * 60) } }, now)[0].label).toBe('Appeal check-in due 16 Oct 00:30 · 4 h');
    expect(deadlineChips({ appeal_case: { status: 'requested', response_due: null } }, now)[0].label).toBe('Appeal requested');
    expect(deadlineChips({ appeal_case: { status: 'under_appeal', response_due: null } }, now)[0].label).toBe('Appeal open · no check-in timer');
    expect(deadlineChips({ side: 'SELL', pay_by: 'not a time' }, now)).toEqual([]);
    expect(deadlineChips(null, now)).toEqual([]);
    expect(istClock(now)).toBe('20:30');
    expect(istClock(now + 4 * 3_600_000, now)).toBe('16 Oct 00:30');
  });
});

describe('deadlineContext and the KYC reload rule', () => {
  const t = Date.parse('2026-10-15T15:10:00Z');
  const iso = new Date(t).toISOString();
  it("uses the screen's live values for the current status, then the server's last answer", () => {
    expect(deadlineContext({ tradeType: 'SELL', orderStatus: 'TRADING', live: { payBy: t, kycVerify: 2 }, server: null }))
      .toEqual({ side: 'SELL', pay_by: iso, release_by: null, appeal_case: null, kyc_pending: false });
    expect(deadlineContext({ tradeType: 'buy', orderStatus: '2', live: { payBy: t }, server: { release_by: iso, appeal_case: { status: 'requested', response_due: null } } }))
      .toMatchObject({ side: 'BUY', pay_by: null, release_by: iso, appeal_case: { status: 'requested', response_due: null } });
    const later = new Date(t + 60_000).toISOString();
    expect(deadlineContext({ tradeType: 'SELL', orderStatus: 'BUYER_PAYED', live: { releaseBy: t + 60_000 }, server: { release_by: iso } }).release_by).toBe(later);
    expect(deadlineContext({ tradeType: 'SELL', orderStatus: 'COMPLETED', live: { payBy: t, releaseBy: t }, server: { pay_by: iso } })).toMatchObject({ pay_by: null, release_by: null });
    expect(deadlineContext({ tradeType: 'SELL', orderStatus: 'APPEAL', live: { payBy: t }, server: { pay_by: iso } })).toMatchObject({ pay_by: null, release_by: null });
    expect(deadlineContext({ tradeType: null, orderStatus: null, live: null, server: { side: 'SELL', pay_by: iso } })).toMatchObject({ side: 'SELL', pay_by: iso });
    // seconds instead of milliseconds, or junk, are not shown (and never break the panel)
    expect(deadlineContext({ tradeType: 'SELL', orderStatus: 'TRADING', live: { payBy: Math.round(t / 1000) }, server: null }).pay_by).toBeNull();
    expect(deadlineContext({ tradeType: 'SELL', orderStatus: 'TRADING', live: { payBy: 9e15 }, server: null }).pay_by).toBeNull();
    expect([orderStatusCode(1), orderStatusCode('buyer_payed'), orderStatusCode(''), orderStatusCode('IN_APPEAL')]).toEqual(['TRADING', 'BUYER_PAYED', null, 'APPEAL']);
  });
  it("follows the server's step decision (the one the drafts follow); Binance's live field only adds caution", () => {
    const k = (live: number | null, server: Record<string, unknown> | null) => deadlineContext({ tradeType: 'SELL', orderStatus: 'TRADING', live: { kycVerify: live }, server: server as never }).kyc_pending;
    // no answer yet: Binance's live field alone; unknown counts as not verified
    expect([k(1, null), k(2, null), k(0, null), k(null, null)]).toEqual([true, false, false, true]);
    // the server's decision: KYC required, or the chat's Verified notice next to Binance's stale stored "required"
    expect(k(null, { binance_kyc: 1, situation: 'sell.kyc.pending', before_verification: true })).toBe(true);
    expect(k(null, { binance_kyc: 1, situation: 'sell.pay.ready', before_verification: false })).toBe(false);
    // a re-check after Binance's "verified" that the server already knew: still before verification
    expect(k(2, { binance_kyc: 2, situation: 'sell.kyc.pending', before_verification: true })).toBe(true);
    // "required, not verified" the answer did not know: not verified, whatever it said
    expect(k(1, { binance_kyc: null, situation: 'sell.pay.ready', before_verification: false })).toBe(true);
    // verified, or no extra KYC, since the answer: the server's step stands until the facts are reloaded (at once), since
    // a re-check or our own KYC may still apply
    expect(k(2, { binance_kyc: 1, situation: 'sell.kyc.call', before_verification: true })).toBe(true);
    expect(k(0, { binance_kyc: null, situation: 'sell.kyc.review', before_verification: true })).toBe(true);
    expect(k(0, { binance_kyc: null, situation: 'sell.pay.ready', before_verification: false })).toBe(false);
    // a lower live value is no news (the field only moves up)
    expect(k(1, { binance_kyc: 2, situation: 'sell.pay.ready', before_verification: false })).toBe(false);
    // an older server without the decision: its situation
    expect([k(null, { situation: 'sell.kyc.review' }), k(null, { situation: 'sell.pay.ready' })]).toEqual([true, false]);
  });
  it("asks again once when Binance's value reaches the screen for an open sell order: suggestions, or the facts only", () => {
    const base = { side: 'SELL', status: 'TRADING', live: 2, sent: null, answered: 1, waiting: true, pending: false, factsOnly: false };
    expect(kycReload(base)).toBe('suggest');
    expect(kycReload({ ...base, sent: 1 })).toBe('suggest');
    expect(kycReload({ ...base, sent: 2 })).toBeNull();
    expect(kycReload({ ...base, answered: 2 })).toBeNull();
    // nothing to answer: the order facts again when that is all the panel shows; drafts asked for by hand are kept
    expect(kycReload({ ...base, waiting: false, factsOnly: true })).toBe('context');
    expect(kycReload({ ...base, waiting: false, factsOnly: false })).toBeNull();
    // a request about to go out, or running, carries the value
    expect(kycReload({ ...base, pending: true })).toBeNull();
    expect(kycReload({ ...base, status: 'BUYER_PAYED' })).toBeNull();
    expect(kycReload({ ...base, side: 'BUY' })).toBeNull();
    // any value when the answer did not know the field; nothing when it did
    expect(kycReload({ ...base, live: 0, answered: null })).toBe('suggest');
    expect(kycReload({ ...base, live: 1, answered: null, waiting: false, factsOnly: true })).toBe('context');
    expect(kycReload({ ...base, live: 1, answered: 1 })).toBeNull();
    expect(kycReload({ ...base, live: null })).toBeNull();
  });
  it("waits for Binance's live extra-KYC value only on an open sell order whose detail is still loading", () => {
    const base = { side: 'SELL', status: 'TRADING', live: null, loading: true };
    expect(waitForLiveKyc(base)).toBe(true);
    expect(waitForLiveKyc({ ...base, live: 1 })).toBe(false);
    expect(waitForLiveKyc({ ...base, loading: false })).toBe(false);
    expect(waitForLiveKyc({ ...base, side: 'BUY' })).toBe(false);
    expect(waitForLiveKyc({ ...base, status: '2' })).toBe(false);
  });
});

describe('clientSummary', () => {
  it('one line of what we hold, plus warnings for a name mismatch, past appeals and a pending limit request', () => {
    const r = clientSummary({ on_file: ['aadhaar', 'pan', 'phone'], earlier_orders: 4, appeals: 1, name_check: 'mismatch', limit_request_pending: true });
    expect(r.text).toBe('4 earlier orders · on file: Aadhaar, PAN, phone');
    expect(r.warnings.map((w) => w.label)).toEqual(["Name differs from client record", "1 appeal on this client's orders", 'Limit request pending']);
  });
  it('a first order and nothing on file; no warnings for a partial name match; nothing for a new client', () => {
    expect(clientSummary({ on_file: [], earlier_orders: 0, appeals: 0, name_check: 'partial', limit_request_pending: false }))
      .toEqual({ text: 'first order on this side · nothing on file', warnings: [] });
    expect(clientSummary({ on_file: ['vkyc'], earlier_orders: null, appeals: null, name_check: null, limit_request_pending: false }).text).toBe('on file: VKYC');
    expect(clientSummary(null)).toEqual({ text: null, warnings: [] });
  });
});
