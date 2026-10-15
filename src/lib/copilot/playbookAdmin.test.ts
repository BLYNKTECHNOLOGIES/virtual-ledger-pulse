import { describe, expect, it } from 'vitest';
import {
  cleanScope, expiryText, filterEntries, inr, isExpired, optionChecked, pct, rankModels, sameScope, scopeSummary, toggleScope,
  type EntryLike,
} from './playbookAdmin';

describe('scope helpers', () => {
  it('summarises a scope in plain words', () => {
    expect(scopeSummary({})).toBe('All orders');
    expect(scopeSummary(null)).toBe('All orders');
    expect(scopeSummary({ sides: ['SELL'], statuses: ['TRADING'] })).toBe('We sell · not paid yet');
    expect(scopeSummary({ statuses: ['CANCELLED', 'CANCELLED_BY_SYSTEM'], categories: ['small'] })).toBe('Cancelled · small orders');
    expect(scopeSummary({ client_states: ['approved'], account_ids: ['a1'] }, (id) => (id === 'a1' ? 'Blynk' : id))).toBe('Approved client · Blynk');
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
