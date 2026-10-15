import { describe, expect, it } from 'vitest';
import { computeAdsRights } from './adsRights';

const of = (perms: string[]) => computeAdsRights((p) => perms.includes(p));

describe('AM-SEC-2 Ads page rights (same rights binance-ads checks)', () => {
  it('view-only user opens the page but every change control is off', () => {
    expect(of(['terminal_ads_view'])).toEqual({
      canView: true, canManage: false, canToggle: false, canRest: false, canExclude: false, canBulk: false,
    });
  });
  it('ops user with Manage + Toggle, no Rest Timer, no auto-pricing: edits and switches, cannot rest or exclude', () => {
    const r = of(['terminal_ads_view', 'terminal_ads_manage', 'terminal_ads_toggle']);
    expect(r.canManage && r.canToggle && r.canBulk).toBe(true);
    expect(r.canRest).toBe(false);
    expect(r.canExclude).toBe(false);
  });
  it('same ops user with terminal_pricing_manage may exclude/include from automation', () => {
    expect(of(['terminal_ads_view', 'terminal_ads_manage', 'terminal_ads_toggle', 'terminal_pricing_manage']).canExclude).toBe(true);
  });
  it('Toggle alone allows status switches and the bulk bar but not edits', () => {
    const r = of(['terminal_ads_view', 'terminal_ads_toggle']);
    expect([r.canToggle, r.canBulk, r.canManage]).toEqual([true, true, false]);
  });
  it('Rest Timer is its own right', () => {
    expect(of(['terminal_ads_view', 'terminal_ads_rest_timer']).canRest).toBe(true);
  });
  it('Super Admin (every right) keeps everything', () => {
    expect(Object.values(computeAdsRights(() => true)).every(Boolean)).toBe(true);
  });
  it('no Ads View right → page does not open', () => {
    expect(of(['terminal_ads_manage']).canView).toBe(false);
  });
});
