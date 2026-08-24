/**
 * Shared Binance P2P zone + merchant-badge helpers for edge functions.
 *
 * Zone is selected on the public search API with `classifies`:
 *   P2P zone   -> ["mass", "profession"]
 *   Block zone -> ["block"]
 * Our own ads carry the zone in `adv.classify` (`profession` / `block`).
 * The two zones are separate order books, so competitive maths must stay inside one zone.
 */
export type AdZone = "p2p" | "block";

export function normalizeZone(zone: unknown): AdZone {
  return String(zone || "p2p").toLowerCase() === "block" ? "block" : "p2p";
}

/** Zone of an ad/search row, derived from its Binance `classify` value. */
export function classifyZone(classify: unknown): AdZone {
  return String(classify || "").toLowerCase() === "block" ? "block" : "p2p";
}

/** `classifies` payload for the Binance public search API. */
export function zoneClassifies(zone: AdZone): string[] {
  return zone === "block" ? ["block"] : ["mass", "profession"];
}

/** Badges carried by an advertiser, normalized (Block / Shield / …). */
export function advertiserBadges(item: any): string[] {
  const raw: unknown[] = Array.isArray(item?.advertiser?.badges) ? item.advertiser.badges : [];
  const set = new Set(raw.map((b) => String(b).trim()).filter(Boolean));
  if (String(item?.advertiser?.userIdentity || "").toUpperCase() === "BLOCK_MERCHANT") set.add("Block");
  return Array.from(set);
}
