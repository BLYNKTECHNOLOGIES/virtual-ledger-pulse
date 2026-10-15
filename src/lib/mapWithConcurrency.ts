/**
 * Runs `task` for every item with at most `limit` calls in flight. Results keep
 * the input order. After the first failure no new calls start, and the promise
 * rejects with that error (calls already in flight are left to finish).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await task(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };

  const wanted = limit === Infinity ? items.length : Number.isFinite(limit) ? Math.floor(limit) : 1;
  const workers = Math.max(1, Math.min(wanted, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
