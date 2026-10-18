import { describe, expect, it } from 'vitest';
import {
  cleanScope, clientLabel, copyChangeNote, expiryText, staleFlagForEdit, filterEntries, filterTopics, inr, isExpired, operatorReplyOf, optionChecked, pct, rankModels, replyLabel, sameScope, scopeSummary, toggleScope,
  type EntryLike,
} from './playbookAdmin';

describe('reply labels', () => {
  const names = (codes: string[]) => (codes.length ? codes.join(', ') : 'Any situation');
  it('names the client a reply is limited to', () => {
    expect(clientLabel(undefined)).toBeNull();
    expect(clientLabel(['approved'])).toBe('KYC done');
    expect(clientLabel(['new', 'linked'])).toBe('new or known client');
    expect(clientLabel(['new', 'approved'])).toBe('new client or KYC done');
  });
  it('tells apart replies of one question that differ only by client or side', () => {
    expect(replyLabel({ client_states: ['approved'] }, names)).toBe('Any situation · KYC done');
    expect(replyLabel({ client_states: ['new', 'linked'] }, names)).toBe('Any situation · new or known client');
    expect(replyLabel({ stages: ['sell.kyc'], client_states: ['new', 'linked'] }, names)).toBe('sell.kyc · new or known client');
    expect(replyLabel({ sides: ['BUY'] }, names)).toBe('We buy · Any situation');
    expect(replyLabel({ sides: ['SELL'], stages: ['sell.pay.ready'] }, names)).toBe('sell.pay.ready');
    expect(replyLabel({ categories: ['small'] }, names)).toBe('Any situation · small orders');
    expect(replyLabel(null, names)).toBe('Any situation');
  });
});

describe('scope helpers', () => {
  it('summarises a scope in plain words', () => {
    expect(scopeSummary({})).toBe('All orders');
    expect(scopeSummary(null)).toBe('All orders');
    expect(scopeSummary({ sides: ['SELL'], statuses: ['TRADING'] })).toBe('We sell · not paid yet');
    expect(scopeSummary({ statuses: ['CANCELLED', 'CANCELLED_BY_SYSTEM'], categories: ['small'] })).toBe('Cancelled · small orders');
    expect(scopeSummary({ client_states: ['approved'], account_ids: ['a1'] }, (id) => (id === 'a1' ? 'Blynk' : id))).toBe('KYC done · Blynk');
    expect(scopeSummary({ sides: ['SELL'], stages: ['sell.kyc.pending'], client_states: ['new'] }, undefined, (c) => (c[0] === 'sell.kyc.pending' ? 'KYC pending' : c.join()))).toBe('We sell · KYC pending · new client');
  });
  it('toggles options (several codes at once) and keeps the stored scope minimal', () => {
    let s = toggleScope({}, 'statuses', ['CANCELLED', 'CANCELLED_BY_SYSTEM']);
    expect(s).toEqual({ statuses: ['CANCELLED', 'CANCELLED_BY_SYSTEM'] });
    expect(optionChecked(s, 'statuses', ['CANCELLED', 'CANCELLED_BY_SYSTEM'])).toBe(true);
    s = toggleScope(s, 'sides', ['BUY']);
    s = toggleScope(s, 'statuses', ['CANCELLED', 'CANCELLED_BY_SYSTEM']);
    expect(s).toEqual({ sides: ['BUY'] });
    expect(cleanScope({ sides: [], statuses: ['TRADING', 'TRADING'] })).toEqual({ statuses: ['TRADING'] });
  });
  it('compares scopes regardless of order and empty lists', () => {
    expect(sameScope({ sides: ['SELL', 'BUY'], statuses: [] }, { sides: ['BUY', 'SELL'] })).toBe(true);
    expect(sameScope({}, null)).toBe(true);
    expect(sameScope({ sides: ['SELL'] }, { sides: ['BUY'] })).toBe(false);
  });
});

describe('entries list', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const e = (over: Partial<EntryLike>): EntryLike => ({
    id: 'x', title: 'x', status: 'approved', reply_en: null, reply_hi: null, conflict_open: false, use_count: 0,
    updated_at: '2026-10-01T00:00:00Z', last_used_at: null, expires_at: null, ...over,
  });
  const rows = [
    e({ id: 'a', title: 'TDS timing', reply_en: 'Sir, 1% TDS…', use_count: 5 }),
    e({ id: 'b', title: 'Are you there?', status: 'tentative', expires_at: '2026-12-01T00:00:00Z', use_count: 0, updated_at: '2026-10-14T00:00:00Z' }),
    e({ id: 'c', title: 'Old', status: 'retired', use_count: 9 }),
    e({ id: 'd', title: 'Expired', status: 'tentative', expires_at: '2026-10-10T00:00:00Z' }),
    e({ id: 'f', title: 'Conflicting', conflict_open: true, use_count: 2, reply_hi: 'Kripya payment karein' }),
  ];
  it('filters by status, conflicts and expiry, and searches titles and both replies', () => {
    expect(filterEntries(rows, 'active', '', 'used', now).map((r) => r.id)).toEqual(['a', 'f', 'b']);
    expect(filterEntries(rows, 'retired', '', 'used', now).map((r) => r.id)).toEqual(['c']);
    expect(filterEntries(rows, 'conflicts', '', 'used', now).map((r) => r.id)).toEqual(['f']);
    expect(filterEntries([...rows, e({ id: 'g', status: 'retired', conflict_open: true })], 'conflicts', '', 'used', now).map((r) => r.id)).toEqual(['f']);
    expect(filterEntries(rows, 'all', 'tds', 'used', now).map((r) => r.id)).toEqual(['a']);
    expect(filterEntries(rows, 'all', 'kripya', 'used', now).map((r) => r.id)).toEqual(['f']);
    expect(filterEntries(rows, 'tentative', '', 'recent', now).map((r) => r.id)).toEqual(['b', 'd']);
    expect(filterEntries(rows, 'all', '', 'title', now).map((r) => r.id)).toEqual(['b', 'f', 'd', 'c', 'a']);
  });
  it('knows when a tentative trial has ended', () => {
    expect(isExpired(rows[3], now)).toBe(true);
    expect(isExpired(rows[1], now)).toBe(false);
    // now = 15 Oct 17:30 IST
    expect(expiryText('2026-10-15T14:00:00Z', now)).toBe('trial ends today'); // 19:30 IST the same day
    expect(expiryText('2026-10-15T20:00:00Z', now)).toBe('trial ends tomorrow'); // 01:30 IST on the 16th
    expect(expiryText('2026-10-16T19:00:00Z', now)).toBe('trial ends in 2 days'); // 00:30 IST on the 17th
    expect(expiryText('2026-10-25T12:00:00Z', now)).toBe('trial ends in 10 days');
    expect(expiryText('2026-10-01T00:00:00Z', now)).toBe('trial ended');
  });
});

describe('stats helpers', () => {
  it('formats percentages and rupees', () => {
    expect(pct(1, 3)).toBe('33%');
    expect(pct(0, 0)).toBe('—');
    expect(inr(12345.678)).toBe('₹12,346');
    expect(inr(9.7, 2)).toBe('₹9.70');
  });
  it('ranks models by drafts taken without edits, then by use', () => {
    const ranked = rankModels([
      { model: 'b', drafts: 10, held_back: 0, new_policy: 0, used: 6, approved: 1, unedited: 3, rejected: 2, avg_latency_ms: 3000, cost_inr: 14 },
      { model: 'a', drafts: 10, held_back: 1, new_policy: 2, used: 4, approved: 0, unedited: 4, rejected: 1, avg_latency_ms: 6000, cost_inr: 40 },
      { model: 'c', drafts: 0, held_back: 0, new_policy: 0, used: 0, approved: 0, unedited: 0, rejected: 0, avg_latency_ms: null, cost_inr: 0 },
    ]);
    expect(ranked.map((m) => m.model)).toEqual(['a', 'b', 'c']);
    expect(ranked[0].uneditedPct).toBe('40%');
    expect(ranked[1].takenPct).toBe('70%');
    expect(ranked[1].costPerTaken).toBe(2);
    expect(ranked[2].costPerTaken).toBeNull();
  });
});

describe('questions list', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const e = (over: Partial<EntryLike>): EntryLike => ({
    id: 'x', title: 'x', status: 'approved', reply_en: 'r', reply_hi: null, conflict_open: false, use_count: 0,
    updated_at: '2026-10-01T00:00:00Z', last_used_at: null, expires_at: null, ...over,
  });
  const topics = [
    { id: 't1', title: 'Can I pay now?', phrasings: 12, replies: [e({ id: 'a', status: 'tentative', expires_at: '2026-12-01T00:00:00Z' }), e({ id: 'b', use_count: 4, reply_hi_stale: true })] },
    { id: 't2', title: 'Why TDS', phrasings: 9, replies: [e({ id: 'c', status: 'retired', reply_en: 'Section 194S' })] },
    { id: 't3', title: 'How long', phrasings: 12, replies: [e({ id: 'd', conflict_open: true, use_count: 1 })] },
  ];
  it('shows a question when any reply matches; searches replies; sorts by total use', () => {
    expect(filterTopics(topics, 'active', '', 'used', now).map((t) => t.id)).toEqual(['t1', 't3']);
    expect(filterTopics(topics, 'retired', '', 'used', now).map((t) => t.id)).toEqual(['t2']);
    expect(filterTopics(topics, 'conflicts', '', 'used', now).map((t) => t.id)).toEqual(['t3']);
    expect(filterTopics(topics, 'outdated', '', 'used', now).map((t) => t.id)).toEqual(['t1']);
    expect(filterTopics(topics, 'all', '194s', 'used', now).map((t) => t.id)).toEqual(['t2']);
    expect(filterTopics(topics, 'all', '', 'title', now).map((t) => t.id)).toEqual(['t1', 't3', 't2']);
  });
});

describe('copyChangeNote and staleFlagForEdit', () => {
  const e = { reply_en: 'Sir, it is shared every quarter.', reply_hi: 'Sir, har quarter share hota hai.', reply_en_auto: false, reply_hi_auto: true }
  it('an edit of one copy leaves the other out of date, also when the edited copy was written by the AI', () => {
    expect(copyChangeNote(e, 'Sir, it is emailed every quarter.', e.reply_hi)).toBe('Saving marks the Hindi copy out of date until it is rewritten or kept.')
    expect(staleFlagForEdit(e, 'Sir, it is emailed every quarter.', e.reply_hi)).toEqual({}) // the database flags a person's copy itself
    expect(copyChangeNote(e, e.reply_en, 'Sir, har quarter email hota hai.')).toBe('Saving marks the English copy out of date until it is rewritten or kept.')
    expect(staleFlagForEdit(e, e.reply_en, 'Sir, har quarter email hota hai.')).toEqual({ reply_en_stale: true })
  })
  it('nothing when both or neither change, a copy is missing, or the other is already out of date', () => {
    expect(copyChangeNote(e, e.reply_en, e.reply_hi)).toBeNull()
    expect(copyChangeNote(e, 'a', 'b')).toBeNull()
    expect(copyChangeNote({ ...e, reply_hi: null }, 'x', '')).toBeNull()
    expect(copyChangeNote({ ...e, reply_hi_stale: true }, 'x', e.reply_hi)).toBeNull()
    expect(staleFlagForEdit({ ...e, reply_en_stale: true }, e.reply_en, 'x')).toEqual({})
  })
})

describe('operatorReplyOf', () => {
  it('reads an operator reply from an inbox item, tolerating odd data', () => {
    expect(operatorReplyOf({
      rough: ' imps nahi, upi pe karo ', sent: 'Sir, IMPS is not available. Kindly pay via UPI.', suggestion: 'Sir, IMPS is not available right now. Please pay via UPI.', edited: true, sent_at: 1792000000000,
      situation_label: 'Client can pay', chat: [{ from: 'client', text: 'bank details?', at: '18 Oct, 14:30' }, { from: 'us' }, null, 'x'],
    })).toEqual({
      rough: 'imps nahi, upi pe karo', sent: 'Sir, IMPS is not available. Kindly pay via UPI.', suggestion: 'Sir, IMPS is not available right now. Please pay via UPI.', edited: true, sentAt: 1792000000000,
      situationLabel: 'Client can pay', chat: [{ from: 'client', text: 'bank details?', at: '18 Oct, 14:30' }],
    });
    expect(operatorReplyOf({ sent: '  ' })).toBeNull();
    expect(operatorReplyOf(null)).toBeNull();
    expect(operatorReplyOf(['x'])).toBeNull();
    expect(operatorReplyOf({ sent: 'Sir, ok.', sent_at: 'soon', rough: '' })).toMatchObject({ rough: null, sentAt: null, edited: false, chat: [] });
  });
});
