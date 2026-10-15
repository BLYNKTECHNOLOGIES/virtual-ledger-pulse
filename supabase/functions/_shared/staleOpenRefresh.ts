// TD-FIX-A (F4): bounded, per-account re-check of open orders older than the
// routine 24 h sync window. Pure module (no Deno / npm imports) so vitest can
// exercise it with fakes. Binance is the only source of a status: a status is
// written only when Binance returns that exact order number; absence never
// implies a final status.

export const FINAL_STATUSES = ["COMPLETED", "CANCELLED", "CANCELLED_BY_SYSTEM", "RELEASED", "EXPIRED"];
export const DAY_MS = 86_400_000;
export const BOUNDS = {
  perAccount: 20,
  recheckMinutes: 15,
  notReturnedBackoffMinutes: 24 * 60,
  accountUnavailableBackoffMinutes: 60,
  minCallGapMs: 250,
  timeBoxMs: 30_000,
  historyWindowMs: 5 * 60_000,
  historyMaxAgeMs: 180 * DAY_MS, // Binance listUserOrderHistory: past 6 months only
};

export function isFinalStatus(status: unknown): boolean {
  return FINAL_STATUSES.includes(String(status ?? "").trim().toUpperCase());
}

export interface StaleCandidate {
  order_number: string;
  exchange_account_id: string | null;
  trade_type: string | null;
  order_status: string | null;
  create_time: number;
  last_checked_at: string | null;
}

/** Same rule as the SQL selector; used by tests and as a defensive filter. */
export function selectStaleCandidates(rows: StaleCandidate[], nowMs: number, perAccount = BOUNDS.perAccount,
  nextCheckAt: Map<string, number> = new Map()): StaleCandidate[] {
  const eligible = rows.filter((r) =>
    !isFinalStatus(r.order_status) &&
    Number(r.create_time) < nowMs - DAY_MS &&
    Number(r.create_time) >= nowMs - 365 * DAY_MS &&
    (!nextCheckAt.has(r.order_number) || (nextCheckAt.get(r.order_number) as number) <= nowMs));
  const byAccount = new Map<string, StaleCandidate[]>();
  for (const r of eligible) {
    const k = r.exchange_account_id ?? "";
    if (!byAccount.has(k)) byAccount.set(k, []);
    byAccount.get(k)!.push(r);
  }
  const out: StaleCandidate[] = [];
  for (const list of byAccount.values()) {
    list.sort((a, b) => {
      const la = a.last_checked_at ? Date.parse(a.last_checked_at) : -Infinity;
      const lb = b.last_checked_at ? Date.parse(b.last_checked_at) : -Infinity;
      if (la !== lb) return la - lb;
      return Number(a.create_time) - Number(b.create_time);
    });
    out.push(...list.slice(0, perAccount));
  }
  return out;
}

export interface BinanceReply { ok: boolean; code?: string | number | null; message?: string | null; body?: any }

export interface CheckRecord {
  orderNumber: string;
  outcome: "changed" | "unchanged" | "not_returned" | "account_mismatch" | "account_unavailable" | "error";
  source: "history" | "detail" | null;
  rawCode: string | null;
  message: string | null;
  status: string | null;            // status Binance returned (null = write nothing)
  complaintStatus: string | null;
  hasActiveComplaint: boolean | null;
  rawData: any | null;              // history-shaped row (source=history)
  detailRaw: any | null;            // order detail (source=detail)
  backoffMinutes: number;
}

export interface RefreshDeps<Ctx> {
  now(): number;
  sleep(ms: number): Promise<void>;
  selectCandidates(nowMs: number, perAccount: number): Promise<StaleCandidate[]>;
  /** Strict: the row's own account only; never falls back. */
  resolveAccount(accountId: string | null): Promise<{ ok: true; ctx: Ctx } | { ok: false; reason: string }>;
  fetchHistory(ctx: Ctx, q: { tradeType: string | null; startTimestamp: number; endTimestamp: number }): Promise<BinanceReply>;
  fetchDetail(ctx: Ctx, orderNumber: string): Promise<BinanceReply>;
  /** Persists one check atomically; returns the stored outcome (e.g. 'superseded' when a final status won). */
  apply(rec: CheckRecord): Promise<string>;
  normalizeStatus(raw: unknown): string;
  hasActiveComplaint(order: any): boolean;
  unwrapList(body: any): any[];
  unwrapDetail(body: any): any;
}

export interface RefreshSummary {
  checked: number; changed: number; unchanged: number; notReturned: number; accountMismatch: number;
  accountUnavailable: number; superseded: number; errors: number; timedOut: boolean;
  notReturnedOrders: string[]; changedOrders: string[];
}

const ACCOUNT_MISMATCH_CODES = new Set(["83998"]);

function orderNo(o: any): string {
  return String(o?.orderNumber ?? o?.orderNo ?? o?.adOrderNo ?? o?.order_number ?? "");
}

export async function refreshStaleOpenOrders<Ctx>(deps: RefreshDeps<Ctx>): Promise<RefreshSummary> {
  const started = deps.now();
  const s: RefreshSummary = { checked: 0, changed: 0, unchanged: 0, notReturned: 0, accountMismatch: 0,
    accountUnavailable: 0, superseded: 0, errors: 0, timedOut: false, notReturnedOrders: [], changedOrders: [] };
  const candidates = await deps.selectCandidates(started, BOUNDS.perAccount);
  // Defensive: re-apply the rule client-side so a selector bug can't re-read final rows.
  const rows = selectStaleCandidates(candidates, started, BOUNDS.perAccount);

  let lastCall = 0;
  const pace = async () => {
    const wait = lastCall + BOUNDS.minCallGapMs - deps.now();
    if (lastCall > 0 && wait > 0) await deps.sleep(wait);
    lastCall = deps.now();
  };

  const byAccount = new Map<string, StaleCandidate[]>();
  for (const r of rows) {
    const k = r.exchange_account_id ?? "";
    if (!byAccount.has(k)) byAccount.set(k, []);
    byAccount.get(k)!.push(r);
  }

  const record = async (rec: CheckRecord) => {
    let stored = rec.outcome as string;
    try { stored = await deps.apply(rec); } catch (e) { stored = "error"; rec.message = String((e as Error)?.message ?? e); }
    s.checked++;
    if (stored === "changed") { s.changed++; s.changedOrders.push(rec.orderNumber); }
    else if (stored === "unchanged") s.unchanged++;
    else if (stored === "not_returned") { s.notReturned++; s.notReturnedOrders.push(rec.orderNumber); }
    else if (stored === "account_mismatch") s.accountMismatch++;
    else if (stored === "account_unavailable") s.accountUnavailable++;
    else if (stored === "superseded") s.superseded++;
    else s.errors++;
  };

  const base = (orderNumber: string): CheckRecord => ({ orderNumber, outcome: "error", source: null, rawCode: null,
    message: null, status: null, complaintStatus: null, hasActiveComplaint: null, rawData: null, detailRaw: null,
    backoffMinutes: BOUNDS.recheckMinutes });

  outer: for (const [accountKey, list] of byAccount) {
    const acct = await deps.resolveAccount(accountKey || null);
    if (!acct.ok) {
      for (const r of list) {
        await record({ ...base(r.order_number), outcome: "account_unavailable", message: (acct as { ok: false; reason: string }).reason,
          backoffMinutes: BOUNDS.accountUnavailableBackoffMinutes });
      }
      continue;
    }
    for (const r of list) {
      if (deps.now() - started > BOUNDS.timeBoxMs) { s.timedOut = true; break outer; }
      const rec = base(r.order_number);
      try {
        const ageMs = started - Number(r.create_time);
        let found: any = null;
        if (ageMs <= BOUNDS.historyMaxAgeMs) {
          await pace();
          const h = await deps.fetchHistory(acct.ctx, {
            tradeType: r.trade_type ? String(r.trade_type).toUpperCase() : null,
            startTimestamp: Number(r.create_time) - BOUNDS.historyWindowMs,
            endTimestamp: Number(r.create_time) + BOUNDS.historyWindowMs,
          });
          if (h.ok) found = deps.unwrapList(h.body).find((o) => orderNo(o) === r.order_number) ?? null;
        }
        if (found) {
          rec.source = "history";
          rec.status = deps.normalizeStatus(found.orderStatus ?? found.status);
          rec.complaintStatus = found.complaintStatus ?? found.complainStatus ?? found.appealStatus ?? null;
          rec.hasActiveComplaint = deps.hasActiveComplaint(found);
          rec.rawData = found;
        } else {
          await pace();
          const d = await deps.fetchDetail(acct.ctx, r.order_number);
          const detail = d.ok ? deps.unwrapDetail(d.body) : null;
          const codeStr = d.code === undefined || d.code === null ? "" : String(d.code);
          if (ACCOUNT_MISMATCH_CODES.has(codeStr)) {
            rec.outcome = "account_mismatch"; rec.source = "detail";
            rec.message = `${codeStr}: ${d.message ?? ""}`; rec.backoffMinutes = BOUNDS.notReturnedBackoffMinutes;
          } else if (detail && orderNo(detail) === r.order_number) {
            const raw = detail.orderStatus ?? detail.status ?? detail.tradeStatus;
            rec.source = "detail";
            rec.rawCode = raw === undefined || raw === null ? null : String(raw);
            rec.status = deps.normalizeStatus(raw);
            rec.complaintStatus = detail.complaintStatus ?? detail.complainStatus ?? detail.appealStatus ?? null;
            rec.hasActiveComplaint = deps.hasActiveComplaint(detail);
            rec.detailRaw = detail;
          } else {
            rec.outcome = "not_returned"; rec.source = "detail";
            rec.message = `${codeStr || "no_order"}: ${d.message ?? (detail ? `returned ${orderNo(detail) || "no order number"}` : "empty")}`;
            rec.backoffMinutes = BOUNDS.notReturnedBackoffMinutes;
          }
        }
        if (rec.status) rec.outcome = isFinalStatus(rec.status) || rec.status !== String(r.order_status ?? "").toUpperCase() ? "changed" : "unchanged";
      } catch (e) {
        rec.outcome = "error"; rec.message = String((e as Error)?.message ?? e); rec.status = null;
      }
      await record(rec);
    }
  }
  return s;
}
