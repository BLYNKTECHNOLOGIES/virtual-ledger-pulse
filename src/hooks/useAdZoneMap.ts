import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdZone, adZone } from '@/lib/adZone';

/**
 * advNo -> market zone map for our OWN ads.
 *
 * Zone is never inferred: it comes from the Binance `classify` field, either
 * from the live ads listing (current ads) or from the last captured ad state
 * snapshot (ads that are closed/deleted on Binance but still referenced by
 * historical orders). Ads with no captured classify stay unattributed.
 */
// PostgREST returns at most 1,000 rows per request; the zone history keeps every ad ever seen.
const ZONE_PAGE_SIZE = 1000;

export function useAdZoneSnapshots() {
  return useQuery({
    queryKey: ['terminal-ad-zone-map'],
    queryFn: async () => {
      const map = new Map<string, AdZone>();
      for (let from = 0; ; from += ZONE_PAGE_SIZE) {
        const { data, error } = await supabase.rpc('terminal_ad_zone_map').order('adv_no').range(from, from + ZONE_PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data || []) as Array<{ adv_no: string; zone: string }>;
        for (const row of rows) {
          if (row.adv_no) map.set(String(row.adv_no), row.zone === 'block' ? 'block' : 'p2p');
        }
        if (rows.length < ZONE_PAGE_SIZE) break;
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Merges live ads (authoritative) over historical snapshot zones. */
export function useAdZoneMap(liveAds: Array<{ advNo?: string; classify?: string | null }> = []) {
  const { data: snapshotMap } = useAdZoneSnapshots();

  return useMemo(() => {
    const map = new Map<string, AdZone>(snapshotMap ? Array.from(snapshotMap.entries()) : []);
    for (const ad of liveAds) {
      const advNo = String(ad?.advNo || '');
      if (!advNo) continue;
      if (ad.classify) map.set(advNo, adZone(ad));
    }
    return map;
  }, [snapshotMap, liveAds]);
}
