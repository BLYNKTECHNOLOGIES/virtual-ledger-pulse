import { describe, expect, it } from "vitest";
import { limitRules, stepLimit, type LimitKind, type LimitRow } from "../../../supabase/functions/_shared/cbt-limits";

// Mirrors _shared/cbt.ts checkLimits against an in-memory table.
function makeStore() {
  const rows = new Map<string, LimitRow>();
  const check = (kind: LimitKind, ip: string, dev: string | null, now: Date) => {
    for (const r of limitRules(kind, ip, dev)) {
      const s = stepLimit(rows.get(r.key) ?? null, now, r.limit, r.windowMinutes);
      if (!s.allowed) return false;
      rows.set(r.key, s.next);
    }
    return true;
  };
  const clear = (kind: LimitKind, ip: string, dev: string | null) =>
    rows.delete(limitRules(kind, ip, dev)[0].key);
  return { check, clear };
}

const IP = "office-ip-hash";
const t0 = new Date("2026-10-15T04:30:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);

describe("Quiz rate limits", () => {
  it("60 candidates behind one connection can validate, register and resume within an hour", () => {
    const s = makeStore();
    for (let i = 0; i < 60; i++) {
      const dev = `device-${String(i).padStart(12, "0")}`;
      const m = i; // one candidate a minute
      expect(s.check("validate", IP, dev, at(m))).toBe(true);
      s.clear("validate", IP, dev); // a correct code clears the browser's counter
      expect(s.check("register", IP, dev, at(m))).toBe(true);
      expect(s.check("resume", IP, dev, at(m))).toBe(true);
    }
  });

  it("one browser guessing codes is refused on the 6th wrong code within 15 minutes", () => {
    const s = makeStore();
    const dev = "guessing-browser-0001";
    const results = [0, 1, 2, 3, 4, 5].map((m) => s.check("validate", IP, dev, at(m)));
    expect(results).toEqual([true, true, true, true, true, false]);
    // another PC in the same office is not affected
    expect(s.check("validate", IP, "other-browser-00001", at(6))).toBe(true);
  });

  it("scripted abuse from one IP is still capped even with fresh device ids", () => {
    const s = makeStore();
    let ok = 0;
    for (let i = 0; i < 500; i++) if (s.check("register", IP, `bot-${String(i).padStart(14, "0")}`, at(0))) ok++;
    expect(ok).toBe(300);
  });
});
