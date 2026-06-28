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
