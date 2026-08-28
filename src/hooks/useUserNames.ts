import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v?: string | null) => !!v && UUID_RE.test(v.trim());

/**
 * Resolve raw user UUIDs to human-readable staff names.
 * Non-UUID values (already-stored names, "system-backfill", emails) pass through.
 */
export function useUserNames(rawIds: (string | null | undefined)[]) {
  const ids = Array.from(
    new Set(rawIds.filter((v): v is string => isUuid(v)).map((v) => v.trim()))
  ).sort();

  const { data } = useQuery({
    queryKey: ["user-display-names", ids],
    queryFn: async () => {
      if (ids.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase.rpc("get_user_display_names", {
        _ids: ids,
      });
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        if (row?.id && row?.display_name) map[row.id] = row.display_name;
      });
      return map;
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const nameFor = (value?: string | null, fallback = "—") => {
    if (!value) return fallback;
    const v = value.trim();
    if (!isUuid(v)) return v;
    return data?.[v] || `${v.slice(0, 8)}…`;
  };

  return { nameFor, namesById: data || {} };
}
