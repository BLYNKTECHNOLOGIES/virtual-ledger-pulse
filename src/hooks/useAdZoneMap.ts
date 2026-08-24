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
export function useAdZoneSnapshots() {
  return useQuery({
    queryKey: ['terminal-ad-zone-map'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('terminal_ad_zone_map');
      if (error) throw error;
      const map = new Map<string, AdZone>();
      for (const row of (data || []) as Array<{ adv_no: string; zone: string }>) {
        if (row.adv_no) map.set(String(row.adv_no), row.zone === 'block' ? 'block' : 'p2p');
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
