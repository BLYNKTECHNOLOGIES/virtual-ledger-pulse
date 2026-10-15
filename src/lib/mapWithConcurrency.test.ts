import { describe, expect, test } from "vitest";
import { mapWithConcurrency } from "./mapWithConcurrency";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  test("keeps input order whatever finishes first", async () => {
    const out = await mapWithConcurrency([30, 5, 20, 1, 10], 3, async (ms, i) => {
      await wait(ms);
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10"]);
  });

  test("never has more than `limit` calls in flight, and uses all of them", async () => {
    let inFlight = 0;
    let most = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await wait(5);
      inFlight--;
    });
    expect(most).toBe(4);
  });

  test("empty input resolves to an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  test("first failure rejects and no new calls start after it", async () => {
    const started: number[] = [];
    const run = mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 2, async (n) => {
      started.push(n);
      await wait(5);
      if (n === 3) throw new Error("page 3 failed");
      return n;
    });
    await expect(run).rejects.toThrow("page 3 failed");
    await wait(30);
    expect(started.length).toBeLessThanOrEqual(5);
    expect(started).not.toContain(11);
  });

  test("a missing or invalid limit still runs every item, one at a time", async () => {
    for (const limit of [Number.NaN, 0, -2, undefined as unknown as number]) {
      let inFlight = 0;
      let most = 0;
      const out = await mapWithConcurrency([1, 2, 3], limit, async (n) => {
        inFlight++;
        most = Math.max(most, inFlight);
        await wait(2);
        inFlight--;
        return n * 2;
      });
      expect(out).toEqual([2, 4, 6]);
      expect(most).toBe(1);
    }
  });

  test("an infinite limit runs every item at once", async () => {
    let inFlight = 0;
    let most = 0;
    await mapWithConcurrency([1, 2, 3, 4], Infinity, async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await wait(5);
      inFlight--;
    });
    expect(most).toBe(4);
  });

  test("a limit above the item count runs every item at once", async () => {
    let inFlight = 0;
    let most = 0;
    await mapWithConcurrency([1, 2, 3], 10, async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await wait(5);
      inFlight--;
    });
    expect(most).toBe(3);
  });
});
