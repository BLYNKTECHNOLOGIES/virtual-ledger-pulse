// AM-SEC-2 — which Ads controls this user may use. Read from Terminal rights
// (get_terminal_permissions; Super Admin has every right) — the same rights
// binance-ads checks on the server, so screen and server agree.
import { createContext, useContext, type ReactNode } from 'react';

export interface AdsRights {
  canView: boolean;
  /** Create, edit, duplicate, quick/inline price edit, every bulk edit. */
  canManage: boolean;
  /** Status switches, bulk Activate / Deactivate (Toggle or Manage). */
  canToggle: boolean;
  /** Take rest, Resume ads, Resume ads now. */
  canRest: boolean;
  /** Exclude / Include from automation (auto-pricing right). */
  canExclude: boolean;
  /** Row checkboxes + bulk bar: at least one bulk action is allowed. */
  canBulk: boolean;
}

export const NO_RIGHT = {
  manage: "Needs the Ads 'Manage' right",
  toggle: "Needs the Ads 'Toggle On/Off' right",
  rest: "Needs the Ads 'Rest Timer' right",
  exclude: "Needs the auto-pricing 'Manage' right",
} as const;

export function computeAdsRights(has: (perm: string) => boolean): AdsRights {
  const canManage = has('terminal_ads_manage');
  const canToggle = canManage || has('terminal_ads_toggle');
  return {
    canView: has('terminal_ads_view'),
    canManage,
    canToggle,
    canRest: has('terminal_ads_rest_timer'),
    canExclude: has('terminal_pricing_manage'),
    canBulk: canManage || canToggle,
  };
}

const DENY: AdsRights = { canView: false, canManage: false, canToggle: false, canRest: false, canExclude: false, canBulk: false };
const AdsRightsContext = createContext<AdsRights>(DENY);

export function AdsRightsProvider({ rights, children }: { rights: AdsRights; children: ReactNode }) {
  return <AdsRightsContext.Provider value={rights}>{children}</AdsRightsContext.Provider>;
}

/** Fails closed: outside a provider every control is denied. */
export function useAdsRights() {
  return useContext(AdsRightsContext);
}
