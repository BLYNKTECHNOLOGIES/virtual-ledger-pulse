// AM-FIX-2 / AM-FIX-3 — Terminal "Take rest": one server-side path for starting
// and ending a rest. Pure logic with injected storage + Binance calls so it can
// be tested without touching live ads. binance-ads wires the real implementations.

export const AD_STATUS = { ONLINE: 1, PRIVATE: 2, OFFLINE: 3 } as const;

/** A rest whose start has not finished after this long is treated as crashed. */
export const START_STALE_MS = 5 * 60_000;

export const MSG_STILL_STARTING = "The rest is still starting — try again in a few seconds.";
export const MSG_LAST_STILL_ENDING = "The last rest is still being ended — try again in a minute.";
export const MSG_ALREADY_RUNNING = "A rest is already running.";

export interface RestAdSnapshot {
  advNo: string;
  advStatus: number; // status before the rest (1 or 2), read live from Binance
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
  start_completed_at?: string | null;
  ended_at?: string | null;
}

export interface AdOutcome {
  advNo: string;
  accountId: string | null;
  reason?: string;
  wasPrivate?: boolean;
}

/** One ad as Binance reports it right now. status null = could not be read. */
export interface LiveAd {
  advNo: string;
  status: number | null; // 1 Online, 2 Private (online + userSetVisible=1), 3 Offline, other
  reason?: string;
}

export interface RestStore {
  getActiveTimer(): Promise<RestTimerRow | null>;
  insertTimer(row: { started_by: string; duration_minutes: number; deactivated_ad_nos: string[]; deactivated_ad_statuses: RestAdSnapshot[] }): Promise<RestTimerRow>;
  /**
   * Atomic: records the ads that went off and marks the start finished, ONLY
   * while the timer is still active. Returns false when the timer had already
   * ended. keepActive=false closes the row (nothing went off).
   */
  completeStart(id: string, snapshots: RestAdSnapshot[], keepActive: boolean): Promise<boolean>;
  /** Atomic claim: UPDATE … SET is_active=false, ended_at=now WHERE id=? AND is_active AND start finished (or stale) RETURNING *. */
  claimTimer(id: string, staleBeforeIso: string): Promise<RestTimerRow | null>;
  /** advNos with a manual status change logged after `sinceIso`. Throws when the check can't be done. */
  handChangedAdvNos(advNos: string[], sinceIso: string): Promise<Set<string>>;
  latestSnapshotAccount(advNo: string): Promise<string | null>;
  insertLog(entry: { action_type: string; user_id: string | null; user_name: string; metadata: Record<string, unknown> }): Promise<void>;
}

export interface RestBinance {
  /** Switch one ad on its own account. Private uses advStatus 2 with fromStatus 3. Must time out. */
  setStatus(accountId: string | null, advNo: string, status: number, fromStatus?: number): Promise<{ ok: boolean; reason?: string }>;
  /** Live status (1 Online, 2 Private, 3 Offline…) or null when it can't be read. */
  getStatus(accountId: string | null, advNo: string): Promise<number | null>;
  /** Every ad on the account with its live status. Throws when the list can't be read. */
  listLive(accountId: string | null): Promise<LiveAd[]>;
}

export interface RestDeps {
  store: RestStore;
  binance: RestBinance;
  primaryAccountId: string | null;
  now?: () => Date;
}

const timerEnd = (t: RestTimerRow) => new Date(t.started_at).getTime() + t.duration_minutes * 60_000;
export const isStarting = (t: RestTimerRow, nowMs: number) =>
  !t.start_completed_at && nowMs - new Date(t.started_at).getTime() < START_STALE_MS;

const isOn = (s: number | null) => s === AD_STATUS.ONLINE || s === AD_STATUS.PRIVATE;

async function safeGet(deps: RestDeps, acct: string | null, advNo: string): Promise<number | null> {
  try { return await deps.binance.getStatus(acct, advNo); } catch { return null; }
}

/** Switch off; on a failed/unclear reply, decide from the live status. */
async function switchOff(deps: RestDeps, acct: string | null, advNo: string): Promise<{ ok: boolean; reason?: string; readBack?: boolean }> {
  let r: { ok: boolean; reason?: string };
  try { r = await deps.binance.setStatus(acct, advNo, AD_STATUS.OFFLINE); }
  catch (e) { r = { ok: false, reason: (e as Error).message }; }
  if (r.ok) return r;
  const live = await safeGet(deps, acct, advNo);
  if (live === AD_STATUS.OFFLINE) return { ok: true, readBack: true };
  return { ok: false, reason: (r.reason || "refused by Binance") + (live === null ? " (current state could not be read)" : "") };
}

/** Restore; on a failed/unclear reply, decide from the live status. */
async function restoreOne(deps: RestDeps, acct: string | null, advNo: string, wasPrivate: boolean): Promise<{ ok: boolean; reason?: string; readBack?: boolean }> {
  let r: { ok: boolean; reason?: string };
  try {
    r = wasPrivate
      ? await deps.binance.setStatus(acct, advNo, AD_STATUS.PRIVATE, AD_STATUS.OFFLINE)
      : await deps.binance.setStatus(acct, advNo, AD_STATUS.ONLINE);
  } catch (e) { r = { ok: false, reason: (e as Error).message }; }
  if (r.ok) return r;
  const live = await safeGet(deps, acct, advNo);
  if (wasPrivate && live === AD_STATUS.PRIVATE) return { ok: true, readBack: true };
  if (!wasPrivate && live === AD_STATUS.ONLINE) return { ok: true, readBack: true };
  if (wasPrivate && live === AD_STATUS.ONLINE) return { ok: false, reason: "came back on as public, not Private — check it in the Binance app" };
  return { ok: false, reason: (r.reason || "refused by Binance") + (live === null ? " (current state could not be read)" : "") };
}

export async function startAdRest(
  deps: RestDeps,
  args: { accountIds: (string | null)[]; userId: string | null; userName: string; durationMinutes?: number },
) {
  const now = (deps.now ?? (() => new Date()))();
  const existing = await deps.store.getActiveTimer();
  if (existing) throw new Error(timerEnd(existing) > now.getTime() ? MSG_ALREADY_RUNNING : MSG_LAST_STILL_ENDING);

  const accounts = [...new Set((args.accountIds.length ? args.accountIds : [deps.primaryAccountId]).map((a) => a || deps.primaryAccountId))];

  // Live state from Binance, per account — never the browser's cached list.
  const intended: RestAdSnapshot[] = [];
  const unreadable: AdOutcome[] = [];
  const seen = new Set<string>();
  await Promise.all(accounts.map(async (acct) => {
    let list: LiveAd[];
    try { list = await deps.binance.listLive(acct); }
    catch (e) { unreadable.push({ advNo: "*", accountId: acct, reason: `could not read this account's ads: ${(e as Error).message}` }); return; }
    for (const a of list) {
      const advNo = String(a.advNo || "");
      if (!advNo || seen.has(advNo)) continue;
      seen.add(advNo);
      if (a.status === null) unreadable.push({ advNo, accountId: acct, reason: a.reason || "could not read its current state" });
      else if (isOn(a.status)) intended.push({ advNo, advStatus: a.status, accountId: acct });
    }
  }));
  if (intended.length === 0) {
    const extra = unreadable.length ? ` ${unreadable.length} could not be read.` : "";
    throw new Error(`No ads are on right now on Binance.${extra}`);
  }

  // Row first: ads are never switched off without a timer that lists them.
  let timer: RestTimerRow;
  try {
    timer = await deps.store.insertTimer({
      started_by: args.userName,
      duration_minutes: args.durationMinutes ?? 60,
      deactivated_ad_nos: intended.map((s) => s.advNo),
      deactivated_ad_statuses: intended,
    });
  } catch (e) {
    if (/duplicate key|ad_rest_timer_active_idx|unique/i.test((e as Error).message)) throw new Error(MSG_LAST_STILL_ENDING);
    throw e;
  }

  const off: RestAdSnapshot[] = [];
  const failed: AdOutcome[] = [];
  const byAccount = new Map<string | null, RestAdSnapshot[]>();
  for (const s of intended) byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
  await Promise.all([...byAccount.entries()].map(async ([acct, list]) => {
    for (const s of list) {
      const r = await switchOff(deps, acct, s.advNo);
      if (r.ok) off.push(s);
      else failed.push({ advNo: s.advNo, accountId: acct, wasPrivate: s.advStatus === AD_STATUS.PRIVATE, reason: r.reason });
    }
  }));

  const order = new Map(intended.map((s, i) => [s.advNo, i]));
  off.sort((a, b) => order.get(a.advNo)! - order.get(b.advNo)!);
  const stillActive = await deps.store.completeStart(timer.id, off, off.length > 0);

  // The timer was ended while we were switching ads off: bring those back now.
  const restoredAfterEnd: AdOutcome[] = [];
  const lostAfterEnd: AdOutcome[] = [];
  if (!stillActive && off.length > 0) {
    for (const s of off) {
      const wasPrivate = s.advStatus === AD_STATUS.PRIVATE;
      const r = await restoreOne(deps, s.accountId, s.advNo, wasPrivate);
      (r.ok ? restoredAfterEnd : lostAfterEnd).push({ advNo: s.advNo, accountId: s.accountId, wasPrivate, ...(r.ok ? {} : { reason: r.reason }) });
    }
  }
  const started = stillActive && off.length > 0;

  await deps.store.insertLog({
    action_type: "ad.rest_started",
    user_id: args.userId,
    user_name: args.userName,
    metadata: {
      timer_id: timer.id,
      deactivatedCount: started ? off.length : 0,
      advNos: off.map((s) => s.advNo),
      snapshot: off,
      failed,
      unreadable,
      started,
      ...(stillActive ? {} : { ended_during_start: true, restoredAfterEnd, lostAfterEnd }),
    },
  });

  return {
    timerId: timer.id, started, switchedOff: started ? off : [], failed, unreadable,
    ...(stillActive ? {} : { endedDuringStart: true, restoredAfterEnd, lostAfterEnd }),
  };
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
  if (isStarting(active, now.getTime())) {
    return { claimed: false as const, starting: true, reason: MSG_STILL_STARTING };
  }
  // The automatic end only fires once the hour is over (expiry never reverts).
  if (args.mode === "automatic" && timerEnd(active) > now.getTime()) {
    return { claimed: false as const, reason: "The rest has not finished yet." };
  }
  const timer = await deps.store.claimTimer(active.id, new Date(now.getTime() - START_STALE_MS).toISOString());
  if (!timer) {
    const again = await deps.store.getActiveTimer();
    if (again && again.id === active.id && isStarting(again, now.getTime())) {
      return { claimed: false as const, starting: true, reason: MSG_STILL_STARTING };
    }
    return { claimed: false as const, reason: "This rest was already ended." };
  }

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

  // Hand-change check: retry once; if it still can't be done, don't restore blindly.
  let handChanged: Set<string> | null = null;
  let handCheckError = "";
  for (let i = 0; i < 2 && handChanged === null; i++) {
    try { handChanged = await deps.store.handChangedAdvNos(snaps.map((s) => s.advNo), timer.started_at); }
    catch (e) { handCheckError = (e as Error).message; }
  }

  const restored: AdOutcome[] = [];
  const skipped: AdOutcome[] = [];
  const failed: AdOutcome[] = [];

  if (handChanged === null) {
    for (const s of snaps) failed.push({
      advNo: s.advNo, accountId: s.accountId, wasPrivate: s.advStatus === AD_STATUS.PRIVATE,
      reason: `not switched back on: could not check whether it was changed by hand during the rest (${handCheckError || "lookup failed"})`,
    });
  } else {
    const changed = handChanged;
    const byAccount = new Map<string | null, typeof snaps>();
    for (const s of snaps) byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
    await Promise.all([...byAccount.entries()].map(async ([acct, list]) => {
      for (const s of list) {
        const wasPrivate = s.advStatus === AD_STATUS.PRIVATE;
        if (changed.has(s.advNo)) {
          skipped.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: "changed by hand during the rest" });
          continue;
        }
        const current = await safeGet(deps, acct, s.advNo);
        if (current !== null && current !== AD_STATUS.OFFLINE) {
          skipped.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: "already back on (not offline any more)" });
          continue;
        }
        const r = await restoreOne(deps, acct, s.advNo, wasPrivate);
        if (r.ok) restored.push({ advNo: s.advNo, accountId: acct, wasPrivate });
        else failed.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: r.reason || "refused by Binance" });
      }
    }));
  }

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
      const { data, error } = await admin.from("ad_rest_timer")
        .insert({ ...row, is_active: true, start_completed_at: null }).select("*").single();
      if (error) throw new Error(`Could not start the rest: ${error.message}`);
      return data;
    },
    async completeStart(id, snapshots, keepActive) {
      const nowIso = new Date().toISOString();
      const { data, error } = await admin.from("ad_rest_timer").update({
        deactivated_ad_nos: snapshots.map((s) => s.advNo),
        deactivated_ad_statuses: snapshots,
        start_completed_at: nowIso,
        ...(keepActive ? {} : { is_active: false, ended_at: nowIso }),
      }).eq("id", id).eq("is_active", true).select("id");
      if (error) throw new Error(error.message);
      if ((data ?? []).length > 0) return true;
      // Already ended: still record what went off, for the audit trail.
      await admin.from("ad_rest_timer").update({ start_completed_at: nowIso }).eq("id", id);
      return false;
    },
    async claimTimer(id, staleBeforeIso) {
      // Single UPDATE … WHERE is_active AND (start finished OR stale) RETURNING:
      // the row lock makes a concurrent caller (or a running start) serialize.
      const { data, error } = await admin.from("ad_rest_timer")
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq("id", id).eq("is_active", true)
        .or(`start_completed_at.not.is.null,started_at.lt.${staleBeforeIso}`)
        .select("*");
      if (error) throw new Error(error.message);
      return (data ?? [])[0] ?? null;
    },
    async handChangedAdvNos(advNos, sinceIso) {
      const out = new Set<string>();
      if (!advNos.length) return out;
      const { data, error } = await admin.from("ad_action_logs").select("adv_no, metadata, action_type")
        .in("action_type", ["ad.status_changed", "ad.bulk_status_changed", "ad.updated"])
        .gt("created_at", sinceIso).limit(1000);
      if (error) throw new Error(error.message);
      const want = new Set(advNos);
      for (const row of data ?? []) {
        // Edit-dialog saves count only when they changed the status.
        if (row.action_type === "ad.updated" && !row.metadata?.statusChanged) continue;
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
