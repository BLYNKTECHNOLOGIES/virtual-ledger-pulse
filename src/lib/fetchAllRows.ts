import { supabase } from "@/integrations/supabase/client";

/**
 * Paginated fetcher that retrieves ALL rows from a Supabase query,
 * bypassing the default 1000-row limit.
 * 
 * Usage: Pass a function that builds the query (without .range()):
 *   fetchAllRows(() => supabase.from('table').select('*').eq('status', 'COMPLETED'))
 */
export async function fetchAllPaginated<T>(
  buildQuery: () => any
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (data) {
      allData = allData.concat(data as T[]);
    }
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}
