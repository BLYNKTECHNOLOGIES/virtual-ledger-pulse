// AM-FIX-2 / AM-FIX-3 — Terminal "Take rest": one server-side path for starting
// and ending a rest. Pure logic with injected storage + Binance calls so it can
// be tested without touching live ads. binance-ads wires the real implementations.

export const AD_STATUS = { ONLINE: 1, PRIVATE: 2, OFFLINE: 3 } as const;

/** A rest whose start has not finished after this long is treated as crashed. */
export const START_STALE_MS = 5 * 60_000;
/**
 * AM-FIX-5: an end that has not renewed its lease for this long is picked up again.
 * Longer than the edge function's maximum run time (400 s), and renewed after every
 * ad, so a recovery never overlaps a run that can still be alive.
 */
export const END_LEASE_MS = 7 * 60_000;
/** AM-FIX-5: wait before re-reading an ad whose switch-off had no clear answer. */
export const UNCLEAR_RECHECK_MS = 3_000;
/** AM-FIX-5: pause before the single retry of a rate-limited call. */
export const RATE_LIMIT_RETRY_MS = 1_500;
/** AM-FIX-5: an unfinished end older than this no longer blocks new rests. */
export const UNFINISHED_BLOCK_MS = 24 * 60 * 60_000;
/** Ads handled at the same time per account (start and end). */
export const PER_ACCOUNT_PARALLEL = 4;

export const MSG_STILL_STARTING = "The rest is still starting — try again in a few seconds.";
export const MSG_LAST_STILL_ENDING = "The last rest is still being ended — try again in a minute.";
export const MSG_ALREADY_RUNNING = "A rest is already running.";
export const MSG_UNCLEAR_OFF = "no clear answer from Binance at first — confirmed off when re-checked";
export const MSG_UNCLEAR_STILL_ON = "no clear answer — still on, check it";
export const MSG_UNCLEAR_UNKNOWN = "no clear answer and its current state could not be read — kept in the rest; check it in the Binance app";
export const MSG_NOTHING_OFF = "No rest started: Binance did not confirm any ad as switched off.";
export const MSG_PRIVATE_SWITCHED_OFF = "Private refused — switched back off; switch it on as Private in the Binance app";

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
  end_lease_at?: string | null;
  end_completed_at?: string | null;
  ended_by_mode?: string | null;
  ended_by_user_id?: string | null;
  ended_by_name?: string | null;
}

export interface EndedBy { mode: "manual" | "automatic"; userId: string | null; userName: string }

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
  /** Atomic claim: UPDATE … SET is_active=false, ended_at=now, end_lease_at=now WHERE id=? AND is_active AND start finished (or stale) RETURNING *. */
  claimTimer(id: string, staleBeforeIso: string, by: EndedBy): Promise<RestTimerRow | null>;
  /** AM-FIX-5: true while an earlier end (claimed after `sinceIso`) has not finished. */
  hasUnfinishedEnd(sinceIso: string): Promise<boolean>;
  /** AM-FIX-5: SET end_lease_at=now WHERE id=? AND end_completed_at IS NULL. */
  renewEndLease(id: string): Promise<void>;
  getTimer(id: string): Promise<RestTimerRow | null>;
  /** Atomic re-claim of an end that stopped part-way: UPDATE … SET end_lease_at=now WHERE id=? AND NOT is_active AND end_completed_at IS NULL AND end_lease_at < leaseStale RETURNING *. */
  claimUnfinishedEnd(id: string, leaseStaleBeforeIso: string): Promise<RestTimerRow | null>;
  /** Atomic: SET end_completed_at=now WHERE id=? AND end_completed_at IS NULL. True only for the first caller. */
  finishEnd(id: string): Promise<boolean>;
  /** advNos with a manual status change logged after `sinceIso`. Throws when the check can't be done. */
  handChangedAdvNos(advNos: string[], sinceIso: string): Promise<Set<string>>;
  latestSnapshotAccount(advNo: string): Promise<string | null>;
  insertLog(entry: { action_type: string; user_id: string | null; user_name: string; metadata: Record<string, unknown> }): Promise<void>;
}

export interface RestBinance {
  /** Switch one ad on its own account. Private uses advStatus 2 with fromStatus 3. Must time out. */
  /** unclear = no reply / timeout / unreadable reply: Binance may or may not have applied it. */
  setStatus(accountId: string | null, advNo: string, status: number, fromStatus?: number): Promise<{ ok: boolean; reason?: string; unclear?: boolean }>;
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
  /** Injected wait (tests use a short one). */
  sleep?: (ms: number) => Promise<void>;
}

const sleepOf = (deps: RestDeps) => deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
const isRateLimited = (reason?: string) => /rate.?limit|too many requests|\b429\b|-1003/i.test(reason || "");

/** AM-FIX-5: one setStatus call, retried once after a short pause when Binance rate-limits. */
async function callStatus(deps: RestDeps, acct: string | null, advNo: string, status: number, fromStatus?: number) {
  let r: { ok: boolean; reason?: string; unclear?: boolean };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      r = fromStatus !== undefined
        ? await deps.binance.setStatus(acct, advNo, status, fromStatus)
        : await deps.binance.setStatus(acct, advNo, status);
    } catch (e) { r = { ok: false, unclear: true, reason: (e as Error).message }; }
    if (r.ok || !isRateLimited(r.reason) || attempt === 1) return r;
    await sleepOf(deps)(RATE_LIMIT_RETRY_MS);
  }
  return r!;
}

const timerEnd = (t: RestTimerRow) => new Date(t.started_at).getTime() + t.duration_minutes * 60_000;
export const isStarting = (t: RestTimerRow, nowMs: number) =>
  !t.start_completed_at && nowMs - new Date(t.started_at).getTime() < START_STALE_MS;

async function inBatches<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(fn));
}

const isOn = (s: number | null) => s === AD_STATUS.ONLINE || s === AD_STATUS.PRIVATE;

async function safeGet(deps: RestDeps, acct: string | null, advNo: string): Promise<number | null> {
  try { return await deps.binance.getStatus(acct, advNo); } catch { return null; }
}

/** Switch off; on a failed/unclear reply, decide from the live status. */
async function switchOff(deps: RestDeps, acct: string | null, advNo: string): Promise<{ ok: boolean; reason?: string; readBack?: boolean; unclear?: boolean }> {
  const r = await callStatus(deps, acct, advNo, AD_STATUS.OFFLINE);
  if (r.ok) return r;
  const live = await safeGet(deps, acct, advNo);
  if (live === AD_STATUS.OFFLINE) return { ok: true, readBack: true };
  // No clear answer — the switch-off may still land; the caller re-reads it later.
  if (r.unclear) return { ok: false, unclear: true, reason: r.reason };
  return { ok: false, reason: (r.reason || "refused by Binance") + (live === null ? " (current state could not be read)" : "") };
}

/** Restore; on a failed/unclear reply, decide from the live status. */
async function restoreOne(deps: RestDeps, acct: string | null, advNo: string, wasPrivate: boolean): Promise<{ ok: boolean; reason?: string; readBack?: boolean }> {
  const r = wasPrivate
    ? await callStatus(deps, acct, advNo, AD_STATUS.PRIVATE, AD_STATUS.OFFLINE)
    : await callStatus(deps, acct, advNo, AD_STATUS.ONLINE);
  if (r.ok) return r;
  const live = await safeGet(deps, acct, advNo);
  if (wasPrivate && live === AD_STATUS.PRIVATE) return { ok: true, readBack: true };
  if (!wasPrivate && live === AD_STATUS.ONLINE) return { ok: true, readBack: true };
  if (wasPrivate && live === AD_STATUS.ONLINE) {
    // AM-FIX-4: a Private ad must never be left public (e.g. the revert after a
    // refused Private failed, or the call was cut off mid-way). Switch it off.
    const off = await switchOff(deps, acct, advNo);
    if (off.ok) return { ok: false, reason: MSG_PRIVATE_SWITCHED_OFF };
    return { ok: false, reason: `Private refused and it could not be switched back off (${off.reason || "no clear answer"}) — it may be ONLINE AND PUBLIC now; switch it off or make it Private in the Binance app` };
  }
  if (wasPrivate && live === null) {
    return { ok: false, reason: `${r.reason || "Private refused"} — its current state could not be read; check in the Binance app that it is not public` };
  }
  return { ok: false, reason: (r.reason || "refused by Binance") + (live === null ? " (current state could not be read)" : "") };
}

/** Accounts a start covers: accountIds, else (AM-FIX-2 tabs) ads[].accountId; empty → primary. */
export function restAccountsFromPayload(payload: any): (string | null)[] {
  const raw = Array.isArray(payload?.accountIds)
    ? payload.accountIds
    : Array.isArray(payload?.ads) ? [...new Set(payload.ads.map((a: any) => a?.accountId || null))] : [];
  return raw.map((x: any) => (x ? String(x) : null)).slice(0, 10);
}

export async function startAdRest(
  deps: RestDeps,
  args: { accountIds: (string | null)[]; userId: string | null; userName: string; durationMinutes?: number },
) {
  const now = (deps.now ?? (() => new Date()))();
  const existing = await deps.store.getActiveTimer();
  if (existing) throw new Error(timerEnd(existing) > now.getTime() ? MSG_ALREADY_RUNNING : MSG_LAST_STILL_ENDING);
  // AM-FIX-5: an earlier end that has not finished would otherwise recover onto this rest's ads.
  if (await deps.store.hasUnfinishedEnd(new Date(now.getTime() - UNFINISHED_BLOCK_MS).toISOString())) {
    throw new Error(MSG_LAST_STILL_ENDING);
  }

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
    if (/duplicate key|ad_rest_timer_active_idx|unique/i.test((e as Error).message)) {
      // Lost a race with another start, or the last rest is still being ended.
      const other = await deps.store.getActiveTimer().catch(() => null);
      throw new Error(other && timerEnd(other) > now.getTime() ? MSG_ALREADY_RUNNING : MSG_LAST_STILL_ENDING);
    }
    throw e;
  }

  const confirmed: RestAdSnapshot[] = [];   // Binance confirmed off
  const maybeOff: RestAdSnapshot[] = [];    // no clear answer, state unreadable
  const failed: AdOutcome[] = [];
  const unclear: AdOutcome[] = [];
  const pending: RestAdSnapshot[] = [];
  const byAccount = new Map<string | null, RestAdSnapshot[]>();
  for (const s of intended) byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
  await Promise.all([...byAccount.entries()].map(([acct, list]) => inBatches(list, PER_ACCOUNT_PARALLEL, async (s) => {
    const r = await switchOff(deps, acct, s.advNo);
    if (r.ok) confirmed.push(s);
    else if (r.unclear) pending.push(s);
    else failed.push({ advNo: s.advNo, accountId: acct, wasPrivate: s.advStatus === AD_STATUS.PRIVATE, reason: r.reason });
  })));
  // AM-FIX-5: "no clear answer" ads are re-read after a short wait before deciding.
  if (pending.length) {
    await sleepOf(deps)(UNCLEAR_RECHECK_MS);
    await Promise.all(pending.map(async (s) => {
      const live = await safeGet(deps, s.accountId, s.advNo);
      const o = { advNo: s.advNo, accountId: s.accountId, wasPrivate: s.advStatus === AD_STATUS.PRIVATE };
      if (live === AD_STATUS.OFFLINE) { confirmed.push(s); unclear.push({ ...o, reason: MSG_UNCLEAR_OFF }); }
      else if (live === null) { maybeOff.push(s); unclear.push({ ...o, reason: MSG_UNCLEAR_UNKNOWN }); }
      else failed.push({ ...o, reason: MSG_UNCLEAR_STILL_ON });
    }));
  }

  const order = new Map(intended.map((s, i) => [s.advNo, i]));
  // A rest starts only when at least one ad is confirmed off on Binance.
  const off: RestAdSnapshot[] = confirmed.length ? [...confirmed, ...maybeOff] : [];
  off.sort((a, b) => order.get(a.advNo)! - order.get(b.advNo)!);
  if (!confirmed.length) {
    for (const s of maybeOff) {
      const i = unclear.findIndex((u) => u.advNo === s.advNo);
      if (i >= 0) unclear[i] = { ...unclear[i], reason: "no clear answer and its current state could not be read — check it in the Binance app" };
    }
  }
  for (const l of [failed, unclear]) l.sort((a, b) => order.get(a.advNo)! - order.get(b.advNo)!);
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
      unclear,
      unreadable,
      started,
      ...(confirmed.length ? {} : { message: MSG_NOTHING_OFF }),
      ...(stillActive ? {} : { ended_during_start: true, restoredAfterEnd, lostAfterEnd }),
    },
  });

  return {
    timerId: timer.id, started, switchedOff: started ? off : [], failed, unclear, unreadable,
    ...(confirmed.length ? {} : { message: MSG_NOTHING_OFF }),
    ...(stillActive ? {} : { endedDuringStart: true, restoredAfterEnd, lostAfterEnd }),
  };
}

type Snap = RestAdSnapshot & { accountSource: string };
type EndArgs = { timerId?: string | null } & EndedBy;

async function buildSnaps(deps: RestDeps, timer: RestTimerRow): Promise<Snap[]> {
  // New rows carry {advNo, advStatus, accountId}; very old rows only advNos.
  const raw: any[] = Array.isArray(timer.deactivated_ad_statuses) && timer.deactivated_ad_statuses.length
    ? timer.deactivated_ad_statuses
    : (timer.deactivated_ad_nos || []).map((advNo) => ({ advNo, advStatus: AD_STATUS.ONLINE }));
  const snaps: Snap[] = [];
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
  return snaps;
}

export interface HandChangeRow { adv_no: string | null; metadata: Record<string, unknown> | null; action_type: string; user_id: string | null }

/**
 * AM-SEC-3b: ads changed by hand during a rest. A row counts only when it was
 * written by the server (no user id — browsers can only insert rows as
 * themselves) or by someone in `allowedUserIds` (Ads Toggle / Manage, Super
 * Admin, Terminal admin). A forged row from anyone else is ignored, so it can
 * no longer keep ads off after a rest.
 */
export function handChangedFrom(rows: HandChangeRow[], advNos: string[], allowedUserIds: Set<string>): Set<string> {
  const out = new Set<string>();
  const want = new Set(advNos);
  for (const row of rows) {
    if (row.user_id && !allowedUserIds.has(row.user_id)) continue;
    if (row.adv_no && want.has(row.adv_no)) out.add(row.adv_no);
    const list = (row.metadata as { advNos?: unknown } | null)?.advNos;
    if (Array.isArray(list)) for (const a of list) if (want.has(String(a))) out.add(String(a));
  }
  return out;
}

async function handCheck(deps: RestDeps, snaps: Snap[], sinceIso: string, tries: number) {
  let err = "";
  for (let i = 0; i < tries; i++) {
    try { return { set: await deps.store.handChangedAdvNos(snaps.map((s) => s.advNo), sinceIso), err: "" }; }
    catch (e) { err = (e as Error).message; }
  }
  return { set: null as Set<string> | null, err: err || "lookup failed" };
}

const retryLater = (err: string) => ({
  claimed: false as const, retryLater: true,
  reason: `Could not check whether ads were changed by hand during the rest (${err}). The rest is still on — the next automatic run or Resume ads will try again.`,
});

async function restoreAndFinish(deps: RestDeps, timer: RestTimerRow, snaps: Snap[], changed: Set<string>, args: EndArgs, recovered: boolean) {
  const restored: AdOutcome[] = [];
  const skipped: AdOutcome[] = [];
  const failed: AdOutcome[] = [];
  // AM-FIX-5: never switch on an ad that belongs to a rest running now.
  let running: Set<string>;
  try {
    const other = await deps.store.getActiveTimer();
    running = new Set(other && other.id !== timer.id ? (other.deactivated_ad_nos || []).map(String) : []);
  } catch (e) {
    return { claimed: false as const, retryLater: true, reason: `Could not check for a running rest (${(e as Error).message}); the next run will try again.` };
  }
  const renew = () => deps.store.renewEndLease(timer.id).catch(() => {});
  const byAccount = new Map<string | null, Snap[]>();
  for (const s of snaps) byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
  await Promise.all([...byAccount.entries()].map(([acct, list]) => inBatches(list, PER_ACCOUNT_PARALLEL, async (s) => {
    const wasPrivate = s.advStatus === AD_STATUS.PRIVATE;
    if (changed.has(s.advNo)) {
      skipped.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: "changed by hand during the rest" });
      return;
    }
    if (running.has(s.advNo)) {
      skipped.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: "part of the rest running now" });
      return;
    }
    await renew();
    const current = await safeGet(deps, acct, s.advNo);
    if (current !== null && current !== AD_STATUS.OFFLINE) {
      skipped.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: recovered ? "already back on" : "already back on (not offline any more)" });
      return;
    }
    const r = await restoreOne(deps, acct, s.advNo, wasPrivate);
    await renew();
    if (r.ok) restored.push({ advNo: s.advNo, accountId: acct, wasPrivate });
    else failed.push({ advNo: s.advNo, accountId: acct, wasPrivate, reason: r.reason || "refused by Binance" });
  })));
  const order = new Map(snaps.map((s, i) => [s.advNo, i]));
  for (const l of [restored, skipped, failed]) l.sort((x, y) => order.get(x.advNo)! - order.get(y.advNo)!);

  // AM-FIX-5: who ended the rest is the one recorded at the claim, kept on recovery.
  const by: EndedBy = timer.ended_by_mode === "manual" || timer.ended_by_mode === "automatic"
    ? { mode: timer.ended_by_mode, userId: timer.ended_by_user_id ?? null, userName: timer.ended_by_name || (timer.ended_by_mode === "automatic" ? "automatic" : "Operations Associate") }
    : { mode: args.mode, userId: args.userId, userName: args.userName };
  const metadata = {
    timer_id: timer.id,
    mode: by.mode,
    ended_by: by.mode === "automatic" ? "automatic" : by.userName,
    started_by: timer.started_by,
    started_at: timer.started_at,
    ...(recovered ? { recovered: true, finished_by: "the automatic recovery" } : {}),
    restored,
    skipped,
    failed,
    account_fallbacks: snaps.filter((s) => s.accountSource !== "snapshot").map((s) => ({ advNo: s.advNo, source: s.accountSource })),
  };
  // Only the first finisher writes the end record (overlapping runs write it once).
  if (await deps.store.finishEnd(timer.id)) {
    await deps.store.insertLog({
      action_type: "ad.rest_ended",
      user_id: by.mode === "automatic" ? null : by.userId,
      user_name: by.mode === "automatic" ? "automatic" : by.userName,
      metadata,
    });
  }
  return { claimed: true as const, ...metadata };
}

export async function endAdRest(deps: RestDeps, args: EndArgs) {
  const now = (deps.now ?? (() => new Date()))();
  const active = await deps.store.getActiveTimer();
  if (!active || (args.timerId && active.id !== args.timerId)) {
    // AM-FIX-4: an end that stopped part-way is finished by the next run.
    if (args.timerId) {
      const t = await deps.store.getTimer(args.timerId);
      if (t && !t.is_active && t.ended_at && !t.end_completed_at) {
        const pre = await buildSnaps(deps, t);
        const hc = await handCheck(deps, pre, t.started_at, 2);
        if (!hc.set) return retryLater(hc.err);
        const leased = await deps.store.claimUnfinishedEnd(t.id, new Date(now.getTime() - END_LEASE_MS).toISOString());
        if (!leased) return { claimed: false as const, reason: "This rest is already being ended." };
        return await restoreAndFinish(deps, leased, pre, hc.set, args, true);
      }
    }
    return { claimed: false as const, reason: "This rest was already ended." };
  }
  if (isStarting(active, now.getTime())) {
    return { claimed: false as const, starting: true, reason: MSG_STILL_STARTING };
  }
  // The automatic end only fires once the hour is over (expiry never reverts).
  if (args.mode === "automatic" && timerEnd(active) > now.getTime()) {
    return { claimed: false as const, reason: "The rest has not finished yet." };
  }
  // AM-FIX-4: hand-change check BEFORE claiming; if it can't be done the rest stays on.
  const preSnaps = await buildSnaps(deps, active);
  const pre = await handCheck(deps, preSnaps, active.started_at, 2);
  if (!pre.set) return retryLater(pre.err);

  const timer = await deps.store.claimTimer(active.id, new Date(now.getTime() - START_STALE_MS).toISOString(),
    { mode: args.mode, userId: args.mode === "automatic" ? null : args.userId, userName: args.mode === "automatic" ? "automatic" : args.userName });
  if (!timer) {
    const again = await deps.store.getActiveTimer();
    if (again && again.id === active.id && isStarting(again, now.getTime())) {
      return { claimed: false as const, starting: true, reason: MSG_STILL_STARTING };
    }
    return { claimed: false as const, reason: "This rest was already ended." };
  }
  // Fresh re-check after the claim (best effort; the pre-claim result stands if it fails).
  const snaps = await buildSnaps(deps, timer);
  const post = await handCheck(deps, snaps, timer.started_at, 1);
  const changed = new Set([...pre.set, ...(post.set ?? [])]);
  return await restoreAndFinish(deps, timer, snaps, changed, args, false);
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
        ...(keepActive ? {} : { is_active: false, ended_at: nowIso, end_completed_at: nowIso }),
      }).eq("id", id).eq("is_active", true).select("id");
      if (error) throw new Error(error.message);
      if ((data ?? []).length > 0) return true;
      // Already ended: still record what went off, for the audit trail.
      await admin.from("ad_rest_timer").update({ start_completed_at: nowIso }).eq("id", id);
      return false;
    },
    async claimTimer(id, staleBeforeIso, by) {
      // Single UPDATE … WHERE is_active AND (start finished OR stale) RETURNING:
      // the row lock makes a concurrent caller (or a running start) serialize.
      const nowIso = new Date().toISOString();
      const { data, error } = await admin.from("ad_rest_timer")
        .update({ is_active: false, ended_at: nowIso, end_lease_at: nowIso,
          ended_by_mode: by.mode, ended_by_user_id: by.userId, ended_by_name: by.userName })
        .eq("id", id).eq("is_active", true)
        .or(`start_completed_at.not.is.null,started_at.lt.${staleBeforeIso}`)
        .select("*");
      if (error) throw new Error(error.message);
      return (data ?? [])[0] ?? null;
    },
    async hasUnfinishedEnd(sinceIso) {
      const { data, error } = await admin.from("ad_rest_timer").select("id")
        .eq("is_active", false).is("end_completed_at", null).not("ended_at", "is", null)
        .gt("ended_at", sinceIso).limit(1);
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async renewEndLease(id) {
      const { error } = await admin.from("ad_rest_timer").update({ end_lease_at: new Date().toISOString() })
        .eq("id", id).is("end_completed_at", null);
      if (error) throw new Error(error.message);
    },
    async getTimer(id) {
      const { data, error } = await admin.from("ad_rest_timer").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async claimUnfinishedEnd(id, leaseStaleBeforeIso) {
      const { data, error } = await admin.from("ad_rest_timer")
        .update({ end_lease_at: new Date().toISOString() })
        .eq("id", id).eq("is_active", false).is("end_completed_at", null)
        .or(`end_lease_at.is.null,end_lease_at.lt.${leaseStaleBeforeIso}`)
        .select("*");
      if (error) throw new Error(error.message);
      return (data ?? [])[0] ?? null;
    },
    async finishEnd(id) {
      const { data, error } = await admin.from("ad_rest_timer")
        .update({ end_completed_at: new Date().toISOString() })
        .eq("id", id).is("end_completed_at", null).select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async handChangedAdvNos(advNos, sinceIso) {
      if (!advNos.length) return new Set<string>();
      // Status rows, plus Edit-dialog saves only when they changed the status —
      // filtered in the query so price-only edits never crowd out a status change.
      const [st, ed] = await Promise.all([
        admin.from("ad_action_logs").select("adv_no, metadata, action_type, user_id")
          .in("action_type", ["ad.status_changed", "ad.bulk_status_changed"])
          .gt("created_at", sinceIso).limit(5000),
        admin.from("ad_action_logs").select("adv_no, metadata, action_type, user_id")
          .eq("action_type", "ad.updated").eq("metadata->>statusChanged", "true")
          .in("adv_no", advNos).gt("created_at", sinceIso).limit(5000),
      ]);
      if (st.error) throw new Error(st.error.message);
      if (ed.error) throw new Error(ed.error.message);
      const rows = [...(st.data ?? []), ...(ed.data ?? [])] as HandChangeRow[];
      // AM-SEC-3b: only honour rows from people who can switch ads (or the server).
      const ids = [...new Set(rows.map((r) => r.user_id).filter((u): u is string => !!u))];
      let allowed = new Set<string>();
      if (ids.length) {
        const { data, error } = await admin.rpc("users_with_ads_toggle", { p_user_ids: ids });
        if (error) throw new Error(error.message);
        allowed = new Set(((data ?? []) as unknown[]).map(String));
      }
      return handChangedFrom(rows, advNos, allowed);
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
