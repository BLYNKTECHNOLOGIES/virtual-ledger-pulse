// Shared paginator: fetch ALL rows for a Supabase query, bypassing
// PostgREST's 1000-row default cap. Without this, large tables get silently
// truncated, undercounting/aggregating wrong values across the ERP.
//
// Usage:
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from("sales_orders").select("id, amount").eq(...).range(from, to)
//   );
export async function fetchAllRows<T = any>(
  builder: (from: number, to: number) => any,
  pageSize = 1000,
): Promise<T[]> {
  const PAGE = pageSize;
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await builder(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Fetch rows filtered by a potentially huge ID list, in chunks.
// PostgREST puts `.in()` filters in the URL, so a few thousand UUIDs blow past
// the gateway's header/URL limit ("Request Header Fields Too Large"). Monthly
// report ranges hit this easily — always chunk.
export async function fetchByIdsChunked<T = any>(
  build: (idsChunk: string[], from: number, to: number) => any,
  ids: string[],
  chunkSize = 150,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const rows = await fetchAllRows<T>((from, to) => build(chunk, from, to));
    out.push(...rows);
  }
  return out;
}
