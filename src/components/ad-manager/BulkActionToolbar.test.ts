import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdsRightsProvider, computeAdsRights } from './adsRights';

// The toolbar's imports reach the Supabase client, which reads localStorage at load.
const mem = new Map<string, string>();
(globalThis as any).localStorage ??= { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 };
const { BulkActionToolbar } = await import('./BulkActionToolbar');

const noop = () => {};
const ads = [
  { advNo: '1', tradeType: 'BUY', priceType: 2, advStatus: 1 },
  { advNo: '2', tradeType: 'BUY', priceType: 2, advStatus: 3 },
] as never[];

function render(perms: string[]) {
  const html = renderToStaticMarkup(createElement(AdsRightsProvider, {
    rights: computeAdsRights((p) => perms.includes(p)),
    children: createElement(BulkActionToolbar, {
      selectedAds: ads, onClearSelection: noop, onBulkEditLimits: noop, onBulkEditPaymentMethods: noop,
      onBulkFloatingPrice: noop, onBulkPriceLadder: noop, onBulkHybridAdjust: noop, onBulkRiskGuard: noop,
      onBulkMaxQuantity: noop, onBulkActivate: noop, onBulkDeactivate: noop,
    }),
  }));
  // Desktop row only (the phone menu content is not rendered until opened).
  return html.slice(html.indexOf('hidden flex-wrap'));
}

describe('AM-SEC-2b desktop bulk bar follows the Manage right', () => {
  it('Toggle-only user: no edit buttons, reason shown, Activate/Deactivate stay', () => {
    const h = render(['terminal_ads_view', 'terminal_ads_toggle']);
    for (const label of ['Price ladder', 'Floating %', 'Order limits', 'Max quantity', 'Payment methods', 'Risk guard']) {
      expect(h).not.toContain(label);
    }
    expect(h).toContain("Needs the Ads &#x27;Manage&#x27; right");
    expect(h).toContain('Activate');
    expect(h).toContain('Deactivate');
  });
  it('Manage user: edit buttons present', () => {
    const h = render(['terminal_ads_view', 'terminal_ads_manage']);
    expect(h).toContain('Order limits');
    expect(h).toContain('Risk guard');
  });
});
