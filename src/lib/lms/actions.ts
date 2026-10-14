import { supabase } from "@/integrations/supabase/client";
import { lmsDb, lmsRemoveFile, lmsThrow, lmsUpload, safeFileName } from "./db";
import { isHttpUrl, normaliseUrl } from "./format";
import type {
  LmsAsset, LmsAssetKind, LmsAssetLanguage, LmsCertification, LmsCertStatus, LmsItemType, LmsLanguage, LmsModule, LmsPlan, LmsPlanItem,
  LmsPlanKraStatus, LmsPlanOutcome, LmsPlanType, LmsSettings, LmsTestKind,
} from "./types";

/**
 * Every LMS write goes through here. All writes are plain table writes that the
 * lms_* RLS policies allow only for LMS managers; nothing outside the lms_*
 * tables and the lms-content bucket is touched.
 */

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

const nowIso = () => new Date().toISOString();

async function insertChunked(table: string, rows: Record<string, unknown>[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    await lmsThrow(lmsDb.from(table).insert(rows.slice(i, i + size)));
  }
}

/* ───────────────────────── plans ───────────────────────── */

export interface NewPlanItem {
  day_no: number;
  item_type: LmsItemType;
  module_id: string | null;
  module_version: string | null;
  title: string;
  test_kind: LmsTestKind | null;
}

export interface NewPlanInput {
  employee_id: string;
  seat_id: string | null;
  plan_type: LmsPlanType;
  title: string;
  language: LmsLanguage;
  start_date: string;
  module_days: number;
  total_days: number;
  trainer_employee_id: string | null;
  supervisor_employee_id: string | null;
  notes: string | null;
  start: boolean;
  kra_codes: string[];
  items: NewPlanItem[];
}

/** Creates a plan with its KRAs and day-by-day items; removes the plan again if any part fails. */
export async function createPlan(input: NewPlanInput): Promise<string> {
  const me = await uid();
  const plan = await lmsThrow<{ id: string }>(
    lmsDb
      .from("lms_plans")
      .insert({
        employee_id: input.employee_id,
        seat_id: input.seat_id,
        plan_type: input.plan_type,
        title: input.title.trim() || "Training plan",
        language: input.language,
        start_date: input.start_date,
        module_days: input.module_days,
        total_days: input.total_days,
        extension_days: 0,
        trainer_employee_id: input.trainer_employee_id,
        supervisor_employee_id: input.supervisor_employee_id,
        notes: input.notes?.trim() || null,
        status: input.start ? "active" : "draft",
        started_at: input.start ? nowIso() : null,
        created_by: me,
      })
      .select("id")
      .single(),
  );
  try {
    const codes = Array.from(new Set(input.kra_codes));
    if (codes.length) await insertChunked("lms_plan_kras", codes.map((kra_code) => ({ plan_id: plan.id, kra_code })));
    const perDay = new Map<number, number>();
    const rows = input.items.map((it) => {
      const n = (perDay.get(it.day_no) ?? 0) + 1;
      perDay.set(it.day_no, n);
      return {
        plan_id: plan.id,
        day_no: it.day_no,
        sort_order: n * 10,
        item_type: it.item_type,
        module_id: it.module_id,
        module_version: it.module_version,
        title: it.title,
        test_kind: it.test_kind,
        test_attempt: it.item_type === "test" ? 1 : null,
        recorded_by: me,
      };
    });
    if (rows.length) await insertChunked("lms_plan_items", rows);
  } catch (e) {
    await lmsDb.from("lms_plans").delete().eq("id", plan.id);
    throw e;
  }
  return plan.id;
}

export async function updatePlan(id: string, patch: Partial<LmsPlan>): Promise<void> {
  await lmsThrow(lmsDb.from("lms_plans").update(patch).eq("id", id));
}

export async function startPlan(plan: LmsPlan): Promise<void> {
  await updatePlan(plan.id, { status: "active", started_at: plan.started_at ?? nowIso() });
}

export async function reopenPlan(plan: LmsPlan): Promise<void> {
  await updatePlan(plan.id, { status: "active", outcome: null, closed_at: null });
}

export async function deletePlan(id: string): Promise<void> {
  await lmsThrow(lmsDb.from("lms_plans").delete().eq("id", id));
}

const OUTCOME_STATUS: Record<LmsPlanOutcome, LmsPlan["status"]> = {
  certified: "completed",
  partially_certified: "completed",
  exit_recommended: "failed",
  withdrawn: "cancelled",
};

/** Closes a plan. KRAs still in training are marked not cleared. */
export async function closePlan(plan: LmsPlan, outcome: LmsPlanOutcome, note: string | null): Promise<void> {
  const me = await uid();
  await lmsThrow(
    lmsDb
      .from("lms_plan_kras")
      .update({ status: "not_cleared", decided_at: nowIso(), decided_by: me })
      .eq("plan_id", plan.id)
      .eq("status", "in_training"),
  );
  const notes = note?.trim() ? [plan.notes?.trim(), `Closed: ${note.trim()}`].filter(Boolean).join("\n") : plan.notes;
  await updatePlan(plan.id, { status: OUTCOME_STATUS[outcome], outcome, closed_at: nowIso(), notes });
}

/** Plan limits the database enforces; checked first so the message is clear. */
export function shiftProblem(plan: Pick<LmsPlan, "module_days" | "total_days" | "extension_days">, mode: "extend" | "shift", days: number, fromDay = 1): string | null {
  if (!(days >= 1 && days <= 60)) return "Pick between 1 and 60 days.";
  if (plan.total_days + days > 240) return "A plan can't be longer than 240 days.";
  if (mode === "extend") {
    if (plan.module_days + days > 180) return "Module days can't go past 180.";
    if ((plan.extension_days ?? 0) + days > 120) return "A plan can't be extended by more than 120 days in all.";
  } else {
    if (!(fromDay >= 1 && fromDay <= plan.total_days)) return `Pick a day between 1 and ${plan.total_days}.`;
    if (fromDay <= plan.module_days && plan.module_days + days > 180) return "Module days can't go past 180.";
  }
  return null;
}

/**
 * Pushes every item from a day onwards back by some days (trainee absent,
 * holiday, weekly off). One database transaction: all of it happens or none.
 */
export async function shiftPlanDays(plan: LmsPlan, fromDay: number, by: number): Promise<void> {
  const problem = shiftProblem(plan, "shift", by, fromDay);
  if (problem) throw new Error(problem);
  await lmsThrow(lmsDb.rpc("lms_shift_plan", { _plan_id: plan.id, _mode: "shift", _days: by, _from_day: fromDay, _retest: false }));
}

/**
 * Longer training after a failed test: adds days right after the module days
 * (live days move back), fills them with revision, and optionally ends them
 * with a retest. One database transaction.
 */
export async function extendPlan(plan: LmsPlan, days: number, addRetest: boolean): Promise<void> {
  const problem = shiftProblem(plan, "extend", days);
  if (problem) throw new Error(problem);
  await lmsThrow(lmsDb.rpc("lms_shift_plan", { _plan_id: plan.id, _mode: "extend", _days: days, _from_day: null, _retest: addRetest }));
}

/* ───────────────────────── plan items ───────────────────────── */

export async function updateItem(id: string, patch: Partial<LmsPlanItem>): Promise<void> {
  const me = await uid();
  await lmsThrow(lmsDb.from("lms_plan_items").update({ ...patch, recorded_by: me }).eq("id", id));
}

export async function setItemDone(item: Pick<LmsPlanItem, "id">, done: boolean, extra: Partial<LmsPlanItem> = {}): Promise<void> {
  await updateItem(item.id, { status: done ? "done" : "pending", completed_at: done ? nowIso() : null, ...extra });
}

export async function skipItem(item: Pick<LmsPlanItem, "id">, remarks: string | null): Promise<void> {
  await updateItem(item.id, { status: "skipped", completed_at: null, remarks });
}

export interface TestResultInput {
  score_pct: number;
  critical_ok: boolean;
  quiz_reference: string | null;
  remarks: string | null;
}

export async function recordTest(item: Pick<LmsPlanItem, "id">, r: TestResultInput, passMark: number): Promise<boolean> {
  const passed = r.score_pct >= passMark && r.critical_ok;
  await updateItem(item.id, {
    score_pct: r.score_pct,
    critical_ok: r.critical_ok,
    test_passed: passed,
    quiz_reference: r.quiz_reference?.trim() || null,
    remarks: r.remarks?.trim() || null,
    status: "done",
    completed_at: nowIso(),
  });
  return passed;
}

export async function clearTest(item: Pick<LmsPlanItem, "id">): Promise<void> {
  await updateItem(item.id, { score_pct: null, critical_ok: null, test_passed: null, status: "pending", completed_at: null });
}

export interface SignoffInput {
  result: "passed" | "failed";
  checklist: Record<string, "pass" | "fail">;
  by_employee_id: string | null;
  demo_done: boolean;
  remarks: string | null;
}

/** Practical sign-off by the trainer or a department senior; a pass also marks the module taught. */
export async function signoffItem(item: Pick<LmsPlanItem, "id" | "status" | "completed_at">, s: SignoffInput): Promise<void> {
  const patch: Partial<LmsPlanItem> = {
    signoff_result: s.result,
    checklist: s.checklist,
    signoff_by_employee_id: s.by_employee_id,
    signoff_at: nowIso(),
    demo_done: s.demo_done,
    remarks: s.remarks?.trim() || null,
  };
  if (s.result === "passed" && item.status !== "done") Object.assign(patch, { status: "done", completed_at: item.completed_at ?? nowIso() });
  await updateItem(item.id, patch);
}

export async function clearSignoff(item: Pick<LmsPlanItem, "id">): Promise<void> {
  await updateItem(item.id, { signoff_result: null, signoff_by_employee_id: null, signoff_at: null, checklist: {} });
}

export interface LiveDayInput {
  live_orders: number | null;
  live_errors: number | null;
  live_critical_error: boolean;
  remarks: string | null;
}

export async function logLiveDay(item: Pick<LmsPlanItem, "id">, l: LiveDayInput): Promise<void> {
  await updateItem(item.id, {
    live_orders: l.live_orders,
    live_errors: l.live_errors,
    live_critical_error: l.live_critical_error,
    remarks: l.remarks?.trim() || null,
    status: "done",
    completed_at: nowIso(),
  });
}

export async function addPlanItem(
  plan: LmsPlan,
  dayItems: Pick<LmsPlanItem, "sort_order">[],
  item: NewPlanItem & { test_attempt?: number | null },
): Promise<void> {
  const me = await uid();
  if (item.day_no < 1 || item.day_no > 240) throw new Error("Pick a day between 1 and 240.");
  const sort = dayItems.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0) + 10;
  await lmsThrow(
    lmsDb.from("lms_plan_items").insert({
      plan_id: plan.id,
      day_no: item.day_no,
      sort_order: sort,
      item_type: item.item_type,
      module_id: item.module_id,
      module_version: item.module_version,
      title: item.title.trim() || "Item",
      test_kind: item.item_type === "test" ? item.test_kind ?? "retest" : null,
      test_attempt: item.item_type === "test" ? item.test_attempt ?? 1 : null,
      recorded_by: me,
    }),
  );
  if (item.day_no > plan.total_days) await updatePlan(plan.id, { total_days: item.day_no });
}

export async function moveItem(item: Pick<LmsPlanItem, "id">, plan: LmsPlan, dayNo: number, dayItems: Pick<LmsPlanItem, "sort_order">[]): Promise<void> {
  if (dayNo < 1 || dayNo > 240) throw new Error("Pick a day between 1 and 240.");
  const sort = dayItems.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0) + 10;
  await updateItem(item.id, { day_no: dayNo, sort_order: sort });
  if (dayNo > plan.total_days) await updatePlan(plan.id, { total_days: dayNo });
}

export async function deleteItem(id: string): Promise<void> {
  await lmsThrow(lmsDb.from("lms_plan_items").delete().eq("id", id));
}

/* ───────────────────────── KRAs and certification ───────────────────────── */

export async function addPlanKras(planId: string, codes: string[]): Promise<void> {
  if (!codes.length) return;
  await lmsThrow(
    lmsDb.from("lms_plan_kras").upsert(codes.map((kra_code) => ({ plan_id: planId, kra_code })), {
      onConflict: "plan_id,kra_code",
      ignoreDuplicates: true,
    }),
  );
}

export async function removePlanKra(planId: string, code: string): Promise<void> {
  await lmsThrow(lmsDb.from("lms_plan_kras").delete().eq("plan_id", planId).eq("kra_code", code));
}

export async function setPlanKraStatus(planId: string, codes: string[], status: LmsPlanKraStatus, remarks: string | null): Promise<void> {
  if (!codes.length) return;
  const me = await uid();
  await lmsThrow(
    lmsDb
      .from("lms_plan_kras")
      .update({ status, decided_at: status === "in_training" ? null : nowIso(), decided_by: status === "in_training" ? null : me, remarks: remarks?.trim() || null })
      .eq("plan_id", planId)
      .in("kra_code", codes),
  );
}

/** What a certification looked like before it was replaced (kept for undo and for the record). */
function snapshot(c: LmsCertification) {
  return {
    plan_id: c.plan_id, status: c.status, certified_at: c.certified_at, certified_by: c.certified_by ?? null,
    module_versions: c.module_versions ?? {}, remarks: c.remarks ?? null,
  };
}

/**
 * Certifies an employee for KRAs. There is one record per employee and KRA: a new
 * certification replaces the old one and keeps it in "previous", so undo can put it back.
 */
export async function certifyKras(
  plan: Pick<LmsPlan, "id" | "employee_id">,
  codes: string[],
  opts: { certifiedAt: string; remarks: string | null; versionsByKra: Record<string, Record<string, string>> },
): Promise<void> {
  if (!codes.length) return;
  const me = await uid();
  // Read the rows about to be replaced from the database (not a screen cache), so their history is kept.
  const existing: LmsCertification[] = [];
  for (let i = 0; i < codes.length; i += 200) {
    const rows = await lmsThrow<LmsCertification[]>(
      lmsDb.from("lms_certifications").select("*").eq("employee_id", plan.employee_id).in("kra_code", codes.slice(i, i + 200)),
    );
    existing.push(...(rows ?? []));
  }
  const current = new Map(existing.map((c) => [c.kra_code, c]));
  await lmsThrow(
    lmsDb.from("lms_certifications").upsert(
      codes.map((kra_code) => {
        const prev = current.get(kra_code);
        return {
          employee_id: plan.employee_id,
          kra_code,
          plan_id: plan.id,
          status: "certified",
          certified_at: opts.certifiedAt,
          certified_by: me,
          module_versions: opts.versionsByKra[kra_code] ?? {},
          remarks: opts.remarks?.trim() || null,
          // Re-certifying inside the same plan keeps the older history; otherwise remember what is replaced.
          previous: prev ? (prev.plan_id === plan.id ? prev.previous ?? null : snapshot(prev)) : null,
        };
      }),
      { onConflict: "employee_id,kra_code" },
    ),
  );
  await setPlanKraStatus(plan.id, codes, "certified", opts.remarks);
}

/**
 * Takes back a certification given in this plan and puts the KRA back in training.
 * If it had replaced an earlier certification, that one is restored instead of deleted.
 */
export async function undoCertification(plan: Pick<LmsPlan, "id" | "employee_id">, code: string): Promise<void> {
  const row = await lmsThrow<LmsCertification | null>(
    lmsDb.from("lms_certifications").select("*").eq("employee_id", plan.employee_id).eq("kra_code", code).eq("plan_id", plan.id).maybeSingle(),
  );
  if (!row) {
    const other = await lmsThrow<{ id: string } | null>(
      lmsDb.from("lms_certifications").select("id").eq("employee_id", plan.employee_id).eq("kra_code", code).maybeSingle(),
    );
    // The certificate was renewed or re-certified elsewhere since; undoing here would contradict it.
    if (other) throw new Error("This certificate has been renewed or replaced since, so it can't be undone from this plan. Change it in the Training Matrix.");
  }
  if (row) {
    const prev = row.previous && typeof row.previous === "object" ? (row.previous as Partial<LmsCertification>) : null;
    if (prev) {
      let planId = prev.plan_id ?? null;
      if (planId) {
        const exists = await lmsThrow<{ id: string } | null>(lmsDb.from("lms_plans").select("id").eq("id", planId).maybeSingle());
        if (!exists) planId = null;
      }
      await lmsThrow(
        lmsDb
          .from("lms_certifications")
          .update({
            plan_id: planId,
            status: prev.status ?? "certified",
            certified_at: prev.certified_at ?? row.certified_at,
            certified_by: prev.certified_by ?? null,
            module_versions: prev.module_versions ?? {},
            remarks: prev.remarks ?? null,
            previous: null,
          })
          .eq("id", row.id),
      );
    } else {
      await lmsThrow(lmsDb.from("lms_certifications").delete().eq("id", row.id));
    }
  }
  await setPlanKraStatus(plan.id, [code], "in_training", null);
}

export async function setCertificationStatus(id: string, status: LmsCertStatus, remarks?: string | null): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (remarks !== undefined) patch.remarks = remarks?.trim() || null;
  await lmsThrow(lmsDb.from("lms_certifications").update(patch).eq("id", id));
}

/** Refresher done: the certificate is renewed today against the modules' current versions. */
export async function renewCertification(cert: LmsCertification, moduleVersions: Record<string, string>): Promise<void> {
  const me = await uid();
  await lmsThrow(
    lmsDb
      .from("lms_certifications")
      // A renewal isn't a plan's certificate any more, so the old plan can't "undo" it.
      .update({ status: "certified", certified_at: nowIso(), certified_by: me, module_versions: moduleVersions, plan_id: null, previous: snapshot(cert) })
      .eq("id", cert.id),
  );
}

/* ───────────────────────── modules ───────────────────────── */

export async function updateModule(id: string, patch: Partial<LmsModule>): Promise<void> {
  const me = await uid();
  await lmsThrow(lmsDb.from("lms_modules").update({ ...patch, updated_by: me }).eq("id", id));
}

/**
 * Publishes a new module version. When asked, certifications for the KRAs the
 * module teaches are flagged "refresher due" so those people get a refresher.
 * Returns how many certifications were flagged.
 */
export async function publishModuleVersion(
  module: Pick<LmsModule, "id">,
  version: string,
  notes: string | null,
  refresherKraCodes: string[],
): Promise<number> {
  await updateModule(module.id, { version: version.trim(), version_notes: notes?.trim() || null, version_published_at: nowIso() });
  if (!refresherKraCodes.length) return 0;
  let flagged = 0;
  for (let i = 0; i < refresherKraCodes.length; i += 200) {
    const rows = await lmsThrow<{ id: string }[]>(
      lmsDb
        .from("lms_certifications")
        .update({ status: "refresher_due" })
        .eq("status", "certified")
        .in("kra_code", refresherKraCodes.slice(i, i + 200))
        .select("id"),
    );
    flagged += rows?.length ?? 0;
  }
  return flagged;
}

export interface AssetMeta {
  kind: LmsAssetKind;
  language: LmsAssetLanguage;
  title: string;
  version: string | null;
}

export async function addAssetFile(
  module: Pick<LmsModule, "id" | "code">,
  file: File,
  meta: AssetMeta,
  sortOrder: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const me = await uid();
  const path = `${safeFileName(module.code)}/${Date.now().toString(36)}-${safeFileName(file.name)}`;
  let stored: string;
  try {
    stored = await lmsUpload(path, file, onProgress);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/maximum allowed size|too large|413/i.test(msg)) {
      throw new Error("Storage refused this file as too large. Add it as a link instead (YouTube unlisted, Google Drive, HeyGen or Gamma share link).");
    }
    throw e;
  }
  try {
    await lmsThrow(
      lmsDb.from("lms_module_assets").insert({
        module_id: module.id,
        kind: meta.kind,
        language: meta.language,
        title: meta.title.trim() || file.name,
        storage_path: stored,
        mime_type: file.type || null,
        size_bytes: file.size,
        version: meta.version?.trim() || null,
        sort_order: sortOrder,
        created_by: me,
      }),
    );
  } catch (e) {
    await lmsRemoveFile(stored).catch(() => undefined);
    throw e;
  }
}

export async function addAssetLink(module: Pick<LmsModule, "id">, url: string, meta: AssetMeta, sortOrder: number): Promise<void> {
  if (!isHttpUrl(url)) throw new Error("Enter a full web address starting with https://");
  const me = await uid();
  await lmsThrow(
    lmsDb.from("lms_module_assets").insert({
      module_id: module.id,
      kind: meta.kind,
      language: meta.language,
      title: meta.title.trim() || url,
      external_url: normaliseUrl(url),
      version: meta.version?.trim() || null,
      sort_order: sortOrder,
      created_by: me,
    }),
  );
}

export async function updateAsset(id: string, patch: Partial<LmsAsset>): Promise<void> {
  const row = { ...patch };
  if (row.external_url !== undefined && row.external_url !== null) {
    if (!isHttpUrl(row.external_url)) throw new Error("Enter a full web address starting with https://");
    row.external_url = normaliseUrl(row.external_url);
  }
  await lmsThrow(lmsDb.from("lms_module_assets").update(row).eq("id", id));
}

export async function deleteAsset(asset: Pick<LmsAsset, "id" | "storage_path">): Promise<void> {
  await lmsThrow(lmsDb.from("lms_module_assets").delete().eq("id", asset.id));
  if (asset.storage_path) await lmsRemoveFile(asset.storage_path).catch(() => undefined);
}

export async function addChecklistItem(moduleId: string, item: string, isCritical: boolean, sortOrder: number): Promise<void> {
  await lmsThrow(lmsDb.from("lms_module_checklist").insert({ module_id: moduleId, item: item.trim(), is_critical: isCritical, sort_order: sortOrder }));
}

export async function updateChecklistItem(id: string, patch: { item?: string; is_critical?: boolean; sort_order?: number }): Promise<void> {
  await lmsThrow(lmsDb.from("lms_module_checklist").update(patch).eq("id", id));
}

export async function deleteChecklistItem(id: string): Promise<void> {
  await lmsThrow(lmsDb.from("lms_module_checklist").delete().eq("id", id));
}

/* ───────────────────────── seats ───────────────────────── */

export interface SeatInput {
  id?: string;
  name: string;
  department_code: string | null;
  position_id: string | null;
  description: string | null;
  is_active: boolean;
  kra_codes: string[];
  /** The seat's KRAs before this edit (to remove the ones taken out). */
  previous_codes?: string[];
}

export async function saveSeat(s: SeatInput): Promise<string> {
  const me = await uid();
  const row = {
    name: s.name.trim(),
    department_code: s.department_code,
    position_id: s.position_id,
    description: s.description?.trim() || null,
    is_active: s.is_active,
  };
  let id = s.id;
  if (id) {
    await lmsThrow(lmsDb.from("lms_seats").update(row).eq("id", id));
  } else {
    const created = await lmsThrow<{ id: string }>(lmsDb.from("lms_seats").insert({ ...row, created_by: me }).select("id").single());
    id = created.id;
  }
  // Add the new links first, then drop the removed ones, so a failure never leaves the seat empty.
  const codes = Array.from(new Set(s.kra_codes));
  for (let i = 0; i < codes.length; i += 500) {
    await lmsThrow(
      lmsDb.from("lms_seat_kras").upsert(codes.slice(i, i + 500).map((kra_code) => ({ seat_id: id, kra_code })), {
        onConflict: "seat_id,kra_code",
        ignoreDuplicates: true,
      }),
    );
  }
  const keep = new Set(codes);
  const removed = (s.previous_codes ?? []).filter((c) => !keep.has(c));
  for (let i = 0; i < removed.length; i += 200) {
    await lmsThrow(lmsDb.from("lms_seat_kras").delete().eq("seat_id", id).in("kra_code", removed.slice(i, i + 200)));
  }
  return id as string;
}

export async function deleteSeat(id: string): Promise<void> {
  await lmsThrow(lmsDb.from("lms_seats").delete().eq("id", id));
}

/* ───────────────────────── settings and catalogue ───────────────────────── */

export async function saveSettings(patch: Partial<LmsSettings>): Promise<void> {
  const me = await uid();
  await lmsThrow(lmsDb.from("lms_settings").update({ ...patch, updated_by: me }).eq("id", true));
}

export interface ImportResult {
  kras: number;
  modules: number;
  links: number;
  kras_deactivated: number;
  modules_deactivated: number;
}

export async function importCatalogue(payload: unknown): Promise<ImportResult> {
  return await lmsThrow<ImportResult>(lmsDb.rpc("lms_import_catalogue", { _payload: payload }));
}
