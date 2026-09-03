import { supabase } from "@/integrations/supabase/client";

/**
 * Paginated fetcher that retrieves ALL rows from a Supabase query,
 * bypassing the default 1000-row limit.
 *
 * Usage: Pass a function that builds the query (without .range()):
 *   fetchAllRows(() => supabase.from('table').select('*').eq('status', 'COMPLETED'))
 *
 * IMPORTANT: the loop advances by the number of rows the server actually
 * returned, not by the requested page size. PostgREST can enforce its own
 * `max-rows` cap (smaller than our page size); assuming a full page in that
 * case stopped the loop after the first page and silently truncated results.
 *
 * Also note: the caller's query should end with a UNIQUE tiebreaker in its
 * ORDER BY (e.g. `.order('name').order('id')`). Offset paging over a
 * non-unique sort key can reshuffle ties between requests and drop rows.
 */
export async function fetchAllPaginated<T>(
  buildQuery: () => any
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 500; // hard safety stop (500k rows)
  let allData: T[] = [];
  let from = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data as T[]) || [];
    allData = allData.concat(rows);
    if (rows.length === 0) break;
    from += rows.length;
  }

  return allData;
}
