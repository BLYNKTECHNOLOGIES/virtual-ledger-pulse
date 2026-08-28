import { useQuery } from "@tanstack/react-query";
import { usersDirectory } from "@/lib/usersDirectory";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v?: string | null) => !!v && UUID_RE.test(v.trim());

/**
 * Resolve raw user UUIDs to human-readable staff names.
 * Non-UUID values (already-stored names, "system-backfill", emails) pass through untouched.
 */
export function useUserNames(rawIds: (string | null | undefined)[]) {
  const ids = Array.from(
    new Set(rawIds.filter((v): v is string => isUuid(v)).map((v) => v.trim()))
  ).sort();

  const { data } = useQuery({
    queryKey: ["user-display-names", ids],
    queryFn: async () => {
      const map: Record<string, string> = {};
      if (ids.length === 0) return map;
      const { data, error } = await usersDirectory()
        .select("id, username, first_name, last_name")
        .in("id", ids);
      if (error) throw error;
      (data || []).forEach((u: any) => {
        const full = `${u.first_name || ""} ${u.last_name || ""}`.trim();
        const label = full || u.username || "";
        if (u?.id && label) map[u.id] = label;
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
