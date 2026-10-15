import { describe, it, expect, vi } from "vitest";
import {
  selectStaleCandidates, refreshStaleOpenOrders, isFinalStatus, DAY_MS, BOUNDS,
  type StaleCandidate, type RefreshDeps, type CheckRecord,
} from "../../supabase/functions/_shared/staleOpenRefresh";
import { mergeRefresherCompletions } from "./refresherCompletions";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const NOW = Date.UTC(2026, 9, 15, 20, 0, 0);
const MAP: Record<number, string> = { 1: "TRADING", 2: "BUYER_PAYED", 3: "BUYER_PAYED", 4: "COMPLETED", 5: "APPEAL", 6: "CANCELLED", 7: "CANCELLED_BY_SYSTEM" };
const norm = (raw: unknown) => /^\d+$/.test(String(raw)) ? MAP[Number(raw)] ?? "TRADING" : String(raw ?? "TRADING").toUpperCase();
const row = (n: string, p: Partial<StaleCandidate> = {}): StaleCandidate => ({
  order_number: n, exchange_account_id: "A", trade_type: "BUY", order_status: "BUYER_PAYED",
  create_time: NOW - 10 * DAY_MS, last_checked_at: null, ...p,
});

/** Fake DB with the same conditional write as apply_open_order_check. */
function fakeDeps(rows: StaleCandidate[], over: Partial<RefreshDeps<string>> = {}) {
  const db = new Map(rows.map((r) => [r.order_number, { ...r }]));
  const p2p = new Map<string, string>();
  const applied: (CheckRecord & { stored: string })[] = [];
  let t = NOW;
  const deps: RefreshDeps<string> = {
    now: () => t, sleep: async (ms) => { t += ms; },
    selectCandidates: async (n, per) => selectStaleCandidates([...db.values()], n, per),
    resolveAccount: async (id) => id === "A" || id === "B" ? { ok: true, ctx: id } : { ok: false, reason: "no credentials" },
    fetchHistory: async () => ({ ok: true, body: { data: [] } }),
    fetchDetail: async () => ({ ok: false, code: "-1", message: "not found" }),
    apply: async (rec) => {
      const r = db.get(rec.orderNumber)!;
      let stored: string = rec.outcome;
      if (rec.status) {
        if (rec.status === r.order_status) stored = "unchanged";
        else if (isFinalStatus(r.order_status)) stored = "superseded";
        else { r.order_status = rec.status; p2p.set(rec.orderNumber, rec.status); stored = "changed"; }
      }
      applied.push({ ...rec, stored });
      return stored;
    },
    normalizeStatus: norm, hasActiveComplaint: () => false,
    unwrapList: (b) => b?.data ?? [], unwrapDetail: (b) => b?.data ?? null,
    ...over,
  };
  return { deps, db, p2p, applied };
}

describe("TD-FIX-A stale open-order refresher", () => {
  it("(a) never selects final rows", () => {
    const rows = ["COMPLETED", "CANCELLED", "CANCELLED_BY_SYSTEM", "RELEASED", "EXPIRED", "completed"].map((s, i) => row(`f${i}`, { order_status: s }));
    expect(selectStaleCandidates([...rows, row("open")], NOW).map((r) => r.order_number)).toEqual(["open"]);
  });

  it("(b) only rows older than 24 h and within 1 year", () => {
    const rows = [row("fresh", { create_time: NOW - DAY_MS + 1000 }), row("edge", { create_time: NOW - DAY_MS - 1 }),
      row("old", { create_time: NOW - 366 * DAY_MS }), row("empty", { order_status: "" }), row("num", { order_status: "2" })];
    expect(selectStaleCandidates(rows, NOW).map((r) => r.order_number).sort()).toEqual(["edge", "empty", "num"]);
  });

  it("(c) per-account cap of 20, oldest-checked first", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`a${i}`, { last_checked_at: new Date(NOW - i * 60_000 - 3600_000).toISOString() }));
    rows.push(row("never"), row("b1", { exchange_account_id: "B" }));
    const sel = selectStaleCandidates(rows, NOW);
    const a = sel.filter((r) => r.exchange_account_id === "A");
    expect(a).toHaveLength(BOUNDS.perAccount);
    expect(a[0].order_number).toBe("never");
    expect(a[1].order_number).toBe("a29");
    expect(sel.some((r) => r.order_number === "b1")).toBe(true);
    // back-off respected
    expect(selectStaleCandidates([row("x")], NOW, 20, new Map([["x", NOW + 60_000]]))).toHaveLength(0);
  });

  it("(d) not-returned order: unchanged, logged, backed off a day", async () => {
    const { deps, db, applied } = fakeDeps([row("713280")]);
    const s = await refreshStaleOpenOrders(deps);
    expect(db.get("713280")!.order_status).toBe("BUYER_PAYED");
    expect(applied[0]).toMatchObject({ outcome: "not_returned", status: null, backoffMinutes: 1440, source: "detail" });
    expect(applied[0].message).toContain("-1");
    expect(s.notReturnedOrders).toEqual(["713280"]);
  });

  it("(e) unavailable account is skipped, no Binance call, no fallback", async () => {
    const hist = vi.fn(), det = vi.fn();
    const { deps, applied } = fakeDeps([row("z", { exchange_account_id: "C" })], { fetchHistory: hist as any, fetchDetail: det as any });
    const s = await refreshStaleOpenOrders(deps);
    expect(hist).not.toHaveBeenCalled(); expect(det).not.toHaveBeenCalled();
    expect(applied[0].outcome).toBe("account_unavailable");
    expect(s.accountUnavailable).toBe(1);
  });

  it("(f) confirmed final status is written to history and P2P (history, then detail + raw code)", async () => {
    const { deps, db, p2p, applied } = fakeDeps([row("h1"), row("d1", { create_time: NOW - 200 * DAY_MS })], {
      fetchHistory: async () => ({ ok: true, body: { data: [{ orderNumber: "h1", orderStatus: "COMPLETED" }] } }),
      fetchDetail: async (_c, n) => ({ ok: true, code: "000000", body: { data: { orderNumber: n, orderStatus: 4 } } }),
    });
    const s = await refreshStaleOpenOrders(deps);
    expect(db.get("h1")!.order_status).toBe("COMPLETED"); expect(p2p.get("h1")).toBe("COMPLETED");
    expect(db.get("d1")!.order_status).toBe("COMPLETED"); expect(p2p.get("d1")).toBe("COMPLETED");
    expect(applied.find((a) => a.orderNumber === "h1")!.source).toBe("history");
    expect(applied.find((a) => a.orderNumber === "d1")).toMatchObject({ source: "detail", rawCode: "4" });
    expect(s.changed).toBe(2);
  });

  it("(f2) detail returning a different order number writes nothing", async () => {
    const { deps, db } = fakeDeps([row("q")], { fetchDetail: async () => ({ ok: true, code: "000000", body: { data: { orderNumber: "other", orderStatus: 4 } } }) });
    await refreshStaleOpenOrders(deps);
    expect(db.get("q")!.order_status).toBe("BUYER_PAYED");
  });

  it("(g) a concurrent final write wins", async () => {
    const holder: any = {};
    const { deps, db, applied } = fakeDeps([row("c")], {
      fetchHistory: async () => { holder.db.get("c").order_status = "CANCELLED"; return { ok: true, body: { data: [{ orderNumber: "c", orderStatus: "COMPLETED" }] } }; },
    });
    holder.db = db;
    const s = await refreshStaleOpenOrders(deps);
    expect(db.get("c")!.order_status).toBe("CANCELLED");
    expect(applied[0].stored).toBe("superseded");
    expect(s.changed).toBe(0);
  });

  it("(h) refresher-completed order older than 7 days enters ERP selection exactly once", () => {
    const old = { order_number: "713280", create_time: NOW - 28 * DAY_MS };
    const recent = [{ order_number: "r1", create_time: NOW - DAY_MS }];
    const first = mergeRefresherCompletions(recent, [old, old]);
    expect(first.filter((o) => o.order_number === "713280")).toHaveLength(1);
    expect(first.find((o) => o.order_number === "713280")!.create_time).toBe(old.create_time);
    // second ERP run: unique binance_order_number de-dup keeps it once
    const queue = new Set<string>();
    for (const run of [first, mergeRefresherCompletions(recent, [old])]) for (const o of run) queue.add(o.order_number);
    expect([...queue].filter((n) => n === "713280")).toHaveLength(1);
  });

  it("paces Binance calls ≥250 ms apart", async () => {
    const times: number[] = [];
    const { deps } = fakeDeps([row("p1"), row("p2")]);
    const orig = deps.fetchDetail;
    deps.fetchHistory = async () => { times.push(deps.now()); return { ok: true, body: { data: [] } }; };
    deps.fetchDetail = async (c, n) => { times.push(deps.now()); return orig(c, n); };
    await refreshStaleOpenOrders(deps);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(250);
  });
});
