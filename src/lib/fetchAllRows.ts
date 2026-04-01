import { supabase } from "@/integrations/supabase/client";

/**
 * Paginated fetcher that retrieves ALL rows from a Supabase table,
 * bypassing the default 1000-row limit.
 */
export async function fetchAllRows<T>(
  queryBuilder: any
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (data) {
      allData = allData.concat(data as T[]);
    }
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}
