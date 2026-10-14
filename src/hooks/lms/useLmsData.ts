import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { lmsDb, lmsFetchAll, lmsThrow } from "@/lib/lms/db";
import type {
  LmsAsset, LmsCertification, LmsChecklistItem, LmsEmployee, LmsKra, LmsModule, LmsModuleKra, LmsPlan, LmsPlanItem,
  LmsPlanKra, LmsSeat, LmsSeatKra, LmsSettings,
} from "@/lib/lms/types";

/** Query keys — every LMS cache entry starts with "lms" so one invalidation refreshes the module. */
export const lmsKeys = {
  all: ["lms"] as const,
  settings: ["lms", "settings"] as const,
  kras: ["lms", "kras"] as const,
  modules: ["lms", "modules"] as const,
  moduleKras: ["lms", "module-kras"] as const,
  assetsIndex: ["lms", "assets-index"] as const,
  checklistIndex: ["lms", "checklist-index"] as const,
  module: (id: string) => ["lms", "module", id] as const,
  seats: ["lms", "seats"] as const,
  plans: ["lms", "plans"] as const,
  planItemsIndex: ["lms", "plan-items-index"] as const,
  plan: (id: string) => ["lms", "plan", id] as const,
  planKrasAll: ["lms", "plan-kras-all"] as const,
  certs: ["lms", "certs"] as const,
  directory: ["lms", "directory"] as const,
  positions: ["lms", "positions"] as const,
};

export function useLmsAccess() {
  const { hasAnyPermission, isLoading } = usePermissions();
  const { isAdmin } = useAuth();
  const canManage = isAdmin || hasAnyPermission(["hrms_lms_manage"]);
  const canView = canManage || hasAnyPermission(["hrms_lms_view"]);
  return { canView, canManage, isLoading };
}

export function useLmsInvalidate() {
  const qc = useQueryClient();
  return useCallback((key: readonly unknown[] = lmsKeys.all) => qc.invalidateQueries({ queryKey: key }), [qc]);
}

export function useLmsSettings() {
  return useQuery({
    queryKey: lmsKeys.settings,
    queryFn: async () => (await lmsThrow<LmsSettings | null>(lmsDb.from("lms_settings").select("*").eq("id", true).maybeSingle())),
    staleTime: 60_000,
  });
}

export function useLmsKras() {
  return useQuery({
    queryKey: lmsKeys.kras,
    queryFn: () => lmsFetchAll<LmsKra>(() => lmsDb.from("lms_kras").select("*").order("sort_order").order("code")),
    staleTime: 5 * 60_000,
  });
}

const MODULE_LIST_COLUMNS =
  "id,code,title,module_type,department_code,subdepartment_code,platform,summary,duration_minutes,sort_order,status,production,version,version_notes,version_published_at,quiz_tag,owner_name,is_active,updated_at";

export function useLmsModules() {
  return useQuery({
    queryKey: lmsKeys.modules,
    queryFn: () =>
      lmsFetchAll<LmsModule>(() => lmsDb.from("lms_modules").select(MODULE_LIST_COLUMNS).order("sort_order").order("code")),
    staleTime: 60_000,
  });
}

export function useLmsModuleKras() {
  return useQuery({
    queryKey: lmsKeys.moduleKras,
    queryFn: () => lmsFetchAll<LmsModuleKra>(() => lmsDb.from("lms_module_kras").select("module_id,kra_code").order("module_id").order("kra_code")),
    staleTime: 5 * 60_000,
  });
}

/** Light index of every file (module id + kind + language) for counts in lists. */
export function useLmsAssetsIndex() {
  return useQuery({
    queryKey: lmsKeys.assetsIndex,
    queryFn: () =>
      lmsFetchAll<Pick<LmsAsset, "id" | "module_id" | "kind" | "language">>(() =>
        lmsDb.from("lms_module_assets").select("id,module_id,kind,language").order("id"),
      ),
    staleTime: 60_000,
  });
}

/** Module ids that have a practical checklist (so a sign-off is expected). */
export function useLmsChecklistIndex() {
  return useQuery({
    queryKey: lmsKeys.checklistIndex,
    queryFn: async () => {
      const rows = await lmsFetchAll<{ id: string; module_id: string }>(() => lmsDb.from("lms_module_checklist").select("id,module_id").order("id"));
      return new Set(rows.map((r) => r.module_id));
    },
    staleTime: 60_000,
  });
}

export function useLmsModule(id: string | null | undefined) {
  return useQuery({
    queryKey: lmsKeys.module(id ?? "none"),
    enabled: Boolean(id),
    queryFn: async () => {
      const [module, assets, checklist, kras] = await Promise.all([
        lmsThrow<LmsModule>(lmsDb.from("lms_modules").select("*").eq("id", id).single()),
        lmsThrow<LmsAsset[]>(lmsDb.from("lms_module_assets").select("*").eq("module_id", id).order("sort_order").order("created_at")),
        lmsThrow<LmsChecklistItem[]>(lmsDb.from("lms_module_checklist").select("*").eq("module_id", id).order("sort_order").order("created_at")),
        lmsThrow<LmsModuleKra[]>(lmsDb.from("lms_module_kras").select("module_id,kra_code").eq("module_id", id)),
      ]);
      return { module, assets: assets ?? [], checklist: checklist ?? [], kraCodes: (kras ?? []).map((k) => k.kra_code) };
    },
  });
}

export function useLmsSeats() {
  return useQuery({
    queryKey: lmsKeys.seats,
    queryFn: async () => {
      const [seats, links] = await Promise.all([
        lmsThrow<LmsSeat[]>(lmsDb.from("lms_seats").select("*").order("name")),
        lmsFetchAll<LmsSeatKra>(() => lmsDb.from("lms_seat_kras").select("seat_id,kra_code").order("seat_id").order("kra_code")),
      ]);
      const bySeat = new Map<string, string[]>();
      for (const l of links) bySeat.set(l.seat_id, [...(bySeat.get(l.seat_id) ?? []), l.kra_code]);
      return (seats ?? []).map((s) => ({ ...s, kra_codes: bySeat.get(s.id) ?? [] }));
    },
    staleTime: 60_000,
  });
}

export function useLmsPlans() {
  return useQuery({
    queryKey: lmsKeys.plans,
    queryFn: () => lmsFetchAll<LmsPlan>(() => lmsDb.from("lms_plans").select("*").order("created_at", { ascending: false }).order("id")),
    staleTime: 30_000,
  });
}

/** Compact view of every plan item, for progress bars and the dashboard. */
export type PlanItemIndexRow = Pick<
  LmsPlanItem,
  "id" | "plan_id" | "day_no" | "item_type" | "status" | "title" | "test_kind" | "test_attempt" | "test_passed" | "score_pct" | "module_id" | "signoff_result"
>;
export function useLmsPlanItemsIndex() {
  return useQuery({
    queryKey: lmsKeys.planItemsIndex,
    queryFn: () =>
      lmsFetchAll<PlanItemIndexRow>(() =>
        lmsDb
          .from("lms_plan_items")
          .select("id,plan_id,day_no,item_type,status,title,test_kind,test_attempt,test_passed,score_pct,module_id,signoff_result")
          .order("plan_id")
          .order("day_no")
          .order("sort_order")
          .order("id"),
      ),
    staleTime: 30_000,
  });
}

export function useLmsPlan(id: string | null | undefined) {
  return useQuery({
    queryKey: lmsKeys.plan(id ?? "none"),
    enabled: Boolean(id),
    queryFn: async () => {
      const [plan, kras, items] = await Promise.all([
        lmsThrow<LmsPlan>(lmsDb.from("lms_plans").select("*").eq("id", id).single()),
        lmsThrow<LmsPlanKra[]>(lmsDb.from("lms_plan_kras").select("*").eq("plan_id", id)),
        lmsThrow<LmsPlanItem[]>(lmsDb.from("lms_plan_items").select("*").eq("plan_id", id).order("day_no").order("sort_order").order("created_at")),
      ]);
      return { plan, kras: kras ?? [], items: items ?? [] };
    },
  });
}

/** Every plan's KRA status (for the training matrix). */
export function useLmsPlanKrasAll() {
  return useQuery({
    queryKey: lmsKeys.planKrasAll,
    queryFn: () =>
      lmsFetchAll<Pick<LmsPlanKra, "plan_id" | "kra_code" | "status">>(() =>
        lmsDb.from("lms_plan_kras").select("plan_id,kra_code,status").order("plan_id").order("kra_code"),
      ),
    staleTime: 30_000,
  });
}

export function useLmsCertifications() {
  return useQuery({
    queryKey: lmsKeys.certs,
    queryFn: () => lmsFetchAll<LmsCertification>(() => lmsDb.from("lms_certifications").select("*").order("employee_id").order("kra_code")),
    staleTime: 60_000,
  });
}

export function useLmsEmployees() {
  return useQuery({
    queryKey: lmsKeys.directory,
    queryFn: async () => (await lmsThrow<LmsEmployee[]>(lmsDb.rpc("lms_employee_directory"))) ?? [],
    staleTime: 5 * 60_000,
  });
}

export function useLmsPositions() {
  return useQuery({
    queryKey: lmsKeys.positions,
    queryFn: async () =>
      (await lmsThrow<{ id: string; title: string; is_active: boolean }[]>(
        lmsDb.from("positions").select("id,title,is_active").eq("is_active", true).order("title"),
      )) ?? [],
    staleTime: 10 * 60_000,
  });
}

/** Lookup maps used by most screens. */
export function indexBy<T, K extends keyof T>(rows: T[] | undefined, key: K): Map<T[K], T> {
  return new Map((rows ?? []).map((r) => [r[key], r]));
}
