/**
 * Binance P2P market zones.
 *
 * Zone is selected on the public search API with `classifies`:
 *   P2P zone   -> ["mass", "profession"]
 *   Block zone -> ["block"]
 *
 * Our own ads carry the zone in their `classify` field (`profession` / `block`)
 * as returned by the ads listing. The two zones are separate order books with
 * different top merchants and different price levels, so every competitive
 * calculation must stay inside one zone.
 */
export type AdZone = 'p2p' | 'block';

export const ZONE_LABEL: Record<AdZone, string> = {
  p2p: 'P2P zone',
  block: 'Block zone',
};

export const ZONE_SHORT: Record<AdZone, string> = {
  p2p: 'P2P',
  block: 'Block',
};

/** Zone of one of our own ads, derived from its Binance `classify` field. */
export function adZone(ad: { classify?: string | null }): AdZone {
  return String(ad?.classify || '').toLowerCase() === 'block' ? 'block' : 'p2p';
}

export function isBlockZoneAd(ad: { classify?: string | null }): boolean {
  return adZone(ad) === 'block';
}

/** Alias kept for the ad tables/boards that read "is this a Block-zone ad?". */
export const isBlockAd = isBlockZoneAd;


/** `classifies` payload for the Binance public search API. */
export function zoneClassifies(zone: AdZone): string[] {
  return zone === 'block' ? ['block'] : ['mass', 'profession'];
}

/** The `classify` value to send when creating/updating an ad in a zone. */
export function zoneClassify(zone: AdZone): 'block' | 'profession' {
  return zone === 'block' ? 'block' : 'profession';
}

/** Distinct zones present in a selection of ads. */
export function zonesOf(ads: Array<{ classify?: string | null }>): AdZone[] {
  return Array.from(new Set(ads.map(adZone)));
}

/**
 * Zones the account may publish ads in, read strictly from Binance's
 * `getAvailableAdsCategory` response. The payload shape is not documented as a
 * fixed schema, so we scan it for the classify tokens Binance itself uses
 * (`block`, `profession`, `mass`) instead of assuming a key path. When Binance
 * reports nothing usable we return an empty list and the caller must show that
 * as "not reported" rather than assuming eligibility.
 */
export function parseAvailableZones(payload: unknown): AdZone[] {
  const tokens = new Set<string>();

  const walk = (node: unknown, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (typeof node === 'string') {
      const v = node.trim().toLowerCase();
      if (v === 'block' || v === 'profession' || v === 'mass') tokens.add(v);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    if (typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach((n) => walk(n, depth + 1));
    }
  };

  walk(payload);

  const zones: AdZone[] = [];
  if (tokens.has('profession') || tokens.has('mass')) zones.push('p2p');
  if (tokens.has('block')) zones.push('block');
  return zones;
}

