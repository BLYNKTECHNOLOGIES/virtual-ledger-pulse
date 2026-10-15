// AM-FIX-2 — Terminal "Take rest": one server-side path for starting and ending
// a rest. Pure logic with injected storage + Binance calls so it can be tested
// without touching live ads. binance-ads wires the real implementations.

export const AD_STATUS = { ONLINE: 1, PRIVATE: 2, OFFLINE: 3 } as const;

export interface RestAdInput {
  advNo: string;
  advStatus: number; // 1 Online, 2 Private
  accountId?: string | null;
}

export interface RestAdSnapshot {
  advNo: string;
  advStatus: number; // status before the rest (1 or 2)
  accountId: string | null;
}

export interface RestTimerRow {
  id: string;
  started_at: string;
  duration_minutes: number;
  started_by: string | null;
  is_active: boolean;
  deactivated_ad_nos: string[] | null;
  deactivated_ad_statuses: RestAdSnapshot[] | null;
}

export interface AdOutcome {
  advNo: string;
  accountId: string | null;
  reason?: string;
  wasPrivate?: boolean;
}

export interface RestStore {
  getActiveTimer(): Promise<RestTimerRow | null>;
  insertTimer(row: { started_by: string; duration_minutes: number; deactivated_ad_nos: string[]; deactivated_ad_statuses: RestAdSnapshot[] }): Promise<RestTimerRow>;
  updateTimerAds(id: string, snapshots: RestAdSnapshot[], keepActive: boolean): Promise<void>;
  /** Atomic: UPDATE … SET is_active=false WHERE id=? AND is_active [AND expired] RETURNING *. */
  claimTimer(id: string): Promise<RestTimerRow | null>;
  /** advNos with a manual status change logged after `sinceIso`. */
  handChangedAdvNos(advNos: string[], sinceIso: string): Promise<Set<string>>;
  latestSnapshotAccount(advNo: string): Promise<string | null>;
  insertLog(entry: { action_type: string; user_id: string | null; user_name: string; metadata: Record<string, unknown> }): Promise<void>;
}

export interface RestBinance {
  /** Switch one ad on its own account. Private uses advStatus 2 with fromStatus 3. */
  setStatus(accountId: string | null, advNo: string, status: number, fromStatus?: number): Promise<{ ok: boolean; reason?: string }>;
  /** Current Binance advStatus (1/3…) or null when unknown. */
  getStatus(accountId: string | null, advNo: string): Promise<number | null>;
}

export interface RestDeps {
  store: RestStore;
  binance: RestBinance;
  primaryAccountId: string | null;
  now?: () => Date;
}

const timerEnd = (t: RestTimerRow) => new Date(t.started_at).getTime() + t.duration_minutes * 60_000;

export async function startAdRest(
  deps: RestDeps,
  args: { ads: RestAdInput[]; userId: string | null; userName: string; durationMinutes?: number },
) {
  const now = (deps.now ?? (() => new Date()))();
  const existing = await deps.store.getActiveTimer();
  if (existing && timerEnd(existing) > now.getTime()) {
    throw new Error("A rest is already running.");
  }
  const intended: RestAdSnapshot[] = [];
  const seen = new Set<string>();
  for (const a of args.ads) {
    const advNo = String(a.advNo || "");
    const st = Number(a.advStatus);
    if (!advNo || seen.has(advNo) || (st !== AD_STATUS.ONLINE && st !== AD_STATUS.PRIVATE)) continue;
    seen.add(advNo);
    intended.push({ advNo, advStatus: st, accountId: a.accountId || deps.primaryAccountId });
  }
  if (intended.length === 0) throw new Error("No active ads to switch off.");

  // Row first: ads are never switched off without a timer that lists them.
  const timer = await deps.store.insertTimer({
    started_by: args.userName,
    duration_minutes: args.durationMinutes ?? 60,
    deactivated_ad_nos: intended.map((s) => s.advNo),
    deactivated_ad_statuses: intended,
  });

  const off: RestAdSnapshot[] = [];
  const failed: AdOutcome[] = [];
  // One set of calls per account, each with that account's id.
  const byAccount = new Map<string | null, RestAdSnapshot[]>();
  for (const s of intended) byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
  await Promise.all([...byAccount.entries()].map(async ([acct, list]) => {
    for (const s of list) {
      let r: { ok: boolean; reason?: string };
      try { r = await deps.binance.setStatus(acct, s.advNo, AD_STATUS.OFFLINE); }
      catch (e) { r = { ok: false, reason: (e as Error).message }; }
      if (r.ok) off.push(s);
      else failed.push({ advNo: s.advNo, accountId: acct, reason: r.reason || "refused by Binance" });
    }
  }));

  const order = new Map(intended.map((s, i) => [s.advNo, i]));
  off.sort((a, b) => order.get(a.advNo)! - order.get(b.advNo)!);
  await deps.store.updateTimerAds(timer.id, off, off.length > 0);

  await deps.store.insertLog({
    action_type: "ad.rest_started",
    user_id: args.userId,
    user_name: args.userName,
    metadata: {
      timer_id: timer.id,
      deactivatedCount: off.length,
      advNos: off.map((s) => s.advNo),
      snapshot: off,
      failed,
      started: off.length > 0,
    },
  });

  return { timerId: timer.id, started: off.length > 0, switchedOff: off, failed };
}

export async function endAdRest(
  deps: RestDeps,
  args: { timerId?: string | null; mode: "manual" | "automatic"; userId: string | null; userName: string },
) {
  const now = (deps.now ?? (() => new Date()))();
  const active = await deps.store.getActiveTimer();
  if (!active || (args.timerId && active.id !== args.timerId)) {
    return { claimed: false as const, reason: "This rest was already ended." };
  }
  // The automatic end only fires once the hour is over (expiry never reverts).
  if (args.mode === "automatic" && timerEnd(active) > now.getTime()) {
    return { claimed: false as const, reason: "The rest has not finished yet." };
  }
  const timer = await deps.store.claimTimer(active.id);
  if (!timer) return { claimed: false as const, reason: "This rest was already ended." };

  // Snapshot: new rows carry {advNo, advStatus, accountId}; very old rows only advNos.
  const raw: any[] = Array.isArray(timer.deactivated_ad_statuses) && timer.deactivated_ad_statuses.length
    ? timer.deactivated_ad_statuses
    : (timer.deactivated_ad_nos || []).map((advNo) => ({ advNo, advStatus: AD_STATUS.ONLINE }));
  const snaps: (RestAdSnapshot & { accountSource: string })[] = [];
  for (const r of raw) {
    let accountId: string | null = r?.accountId ?? null;
    let accountSource = "snapshot";
    if (!accountId) {
      accountId = await deps.store.latestSnapshotAccount(String(r.advNo));
      accountSource = accountId ? "latest_ad_state_snapshot" : "primary_account";
      if (!accountId) accountId = deps.primaryAccountId;
    }
    snaps.push({ advNo: String(r.advNo), advStatus: Number(r.advStatus) === AD_STATUS.PRIVATE ? 2 : 1, accountId, accountSource });
  }

  const handChanged = await deps.store.handChangedAdvNos(snaps.map((s) => s.advNo), timer.started_at);
  const restored: AdOutcome[] = [];
  const skipped: AdOutcome[] = [];
  const failed: AdOutcome[] = [];

  const byAccount = new Map<string | null, typeof snaps>();
  for (const s of snaps) byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
  await Promise.all([...byAccount.entries()].map(async ([acct, list]) => {
    for (const s of list) {
      const wasPrivate = s.advStatus === AD_STATUS.PRIVATE;
      if (handChanged.has(s.advNo)) {
        skipped.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: "changed by hand during the rest" });
        continue;
      }
      let current: number | null = null;
      try { current = await deps.binance.getStatus(acct, s.advNo); } catch { current = null; }
      if (current !== null && current !== AD_STATUS.OFFLINE) {
        skipped.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: "already back on (not offline any more)" });
        continue;
      }
      let r: { ok: boolean; reason?: string };
      try {
        r = wasPrivate
          ? await deps.binance.setStatus(acct, s.advNo, AD_STATUS.PRIVATE, AD_STATUS.OFFLINE)
          : await deps.binance.setStatus(acct, s.advNo, AD_STATUS.ONLINE);
      } catch (e) { r = { ok: false, reason: (e as Error).message }; }
      if (r.ok) restored.push({ advNo: s.advNo, accountId: acct, wasPrivate });
      else failed.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: r.reason || "refused by Binance" });
    }
  }));

  const metadata = {
    timer_id: timer.id,
    mode: args.mode,
    ended_by: args.mode === "automatic" ? "automatic" : args.userName,
    started_by: timer.started_by,
    started_at: timer.started_at,
    restored,
    skipped,
    failed,
    account_fallbacks: snaps.filter((s) => s.accountSource !== "snapshot").map((s) => ({ advNo: s.advNo, source: s.accountSource })),
  };
  await deps.store.insertLog({
    action_type: "ad.rest_ended",
    user_id: args.mode === "automatic" ? null : args.userId,
    user_name: args.mode === "automatic" ? "automatic" : args.userName,
    metadata,
  });
  return { claimed: true as const, ...metadata };
}

/** Supabase-backed store (service role client). */
export function supabaseRestStore(admin: any): RestStore {
  return {
    async getActiveTimer() {
      const { data, error } = await admin.from("ad_rest_timer").select("*").eq("is_active", true)
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async insertTimer(row) {
      const { data, error } = await admin.from("ad_rest_timer").insert({ ...row, is_active: true }).select("*").single();
      if (error) throw new Error(`Could not start the rest: ${error.message}`);
      return data;
    },
    async updateTimerAds(id, snapshots, keepActive) {
      const { error } = await admin.from("ad_rest_timer").update({
        deactivated_ad_nos: snapshots.map((s) => s.advNo),
        deactivated_ad_statuses: snapshots,
        ...(keepActive ? {} : { is_active: false }),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async claimTimer(id) {
      // Single UPDATE … WHERE is_active RETURNING: Postgres row lock makes a
      // second concurrent caller see is_active=false and get zero rows.
      const { data, error } = await admin.from("ad_rest_timer").update({ is_active: false })
        .eq("id", id).eq("is_active", true).select("*");
      if (error) throw new Error(error.message);
      return (data ?? [])[0] ?? null;
    },
    async handChangedAdvNos(advNos, sinceIso) {
      const out = new Set<string>();
      if (!advNos.length) return out;
      const { data } = await admin.from("ad_action_logs").select("adv_no, metadata, action_type")
        .in("action_type", ["ad.status_changed", "ad.bulk_status_changed"])
        .gt("created_at", sinceIso).limit(1000);
      const want = new Set(advNos);
      for (const row of data ?? []) {
        if (row.adv_no && want.has(row.adv_no)) out.add(row.adv_no);
        const list = row.metadata?.advNos;
        if (Array.isArray(list)) for (const a of list) if (want.has(String(a))) out.add(String(a));
      }
      return out;
    },
    async latestSnapshotAccount(advNo) {
      const { data } = await admin.from("binance_ad_state_snapshots").select("exchange_account_id")
        .eq("adv_no", advNo).not("exchange_account_id", "is", null)
        .order("captured_at", { ascending: false }).limit(1).maybeSingle();
      return data?.exchange_account_id ?? null;
    },
    async insertLog(entry) {
      const { error } = await admin.from("ad_action_logs").insert(entry);
      if (error) console.error("ad rest log insert failed:", error.message);
    },
  };
}
