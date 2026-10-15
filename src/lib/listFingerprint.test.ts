import { describe, expect, test } from "vitest";
import { listFingerprint } from "./listFingerprint";

describe("listFingerprint", () => {
  test("same list, same key", () => {
    expect(listFingerprint(["22933894214527713280", "22933894214527713281"])).toBe(listFingerprint(["22933894214527713280", "22933894214527713281"]));
  });

  test("changes with content, order and boundaries", () => {
    const base = listFingerprint(["a1", "b2", "c3"]);
    expect(listFingerprint(["a1", "b2", "c4"])).not.toBe(base);
    expect(listFingerprint(["b2", "a1", "c3"])).not.toBe(base);
    expect(listFingerprint(["a1b2", "c3"])).not.toBe(base);
    expect(listFingerprint(["a1", "b2"])).not.toBe(base);
  });

  test("separators inside values can't make two lists look alike", () => {
    expect(listFingerprint(["a,b", "c"])).not.toBe(listFingerprint(["a", "b,c"]));
    expect(listFingerprint(["ab", ""])).not.toBe(listFingerprint(["a", "b"]));
    expect(listFingerprint([])).not.toBe(listFingerprint([""]));
    expect(listFingerprint([]).startsWith("0:")).toBe(true);
  });

  test("no collisions across 70,000 one-order changes of a year-sized list", () => {
    const year = Array.from({ length: 70_000 }, (_, i) => String(22_800_000_000_000_000_000n + BigInt(i * 7919)));
    const seen = new Set([listFingerprint(year)]);
    for (let i = 0; i < year.length; i += 997) {
      const changed = year.slice();
      changed[i] = changed[i].slice(0, -1) + (changed[i].endsWith("9") ? "0" : "9");
      seen.add(listFingerprint(changed));
      seen.add(listFingerprint(year.slice(0, i)));
    }
    expect(seen.size).toBe(1 + 2 * Math.ceil(year.length / 997));
  });

  test("a year of order numbers gives a short key", () => {
    const year = Array.from({ length: 70_000 }, (_, i) => String(22_800_000_000_000_000_000n + BigInt(i)));
    expect(listFingerprint(year).length).toBeLessThan(24);
  });
});
