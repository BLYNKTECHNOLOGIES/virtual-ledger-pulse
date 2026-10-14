/**
 * LMS row shapes (HRMS → LMS). They mirror the lms_* tables; the LMS reads them
 * through lmsDb so it does not depend on when the generated types file refreshes.
 */

export type LmsModuleType = "company" | "department" | "subdepartment" | "platform" | "shared" | "companywide" | "kra";
export type LmsModuleStatus = "not_started" | "drafting" | "in_review" | "approved" | "retired";
export type LmsLanguage = "en" | "hinglish";
export type LmsAssetLanguage = LmsLanguage | "both";
export type LmsAssetKind = "video" | "slides" | "booklet" | "job_aid" | "screen_recording" | "trainer_guide" | "image" | "other";
export type LmsPlanType = "induction" | "reskilling" | "refresher";
export type LmsPlanStatus = "draft" | "active" | "completed" | "failed" | "cancelled";
export type LmsPlanOutcome = "certified" | "partially_certified" | "exit_recommended" | "withdrawn";
export type LmsItemType = "module" | "test" | "practice" | "live" | "note";
export type LmsItemStatus = "pending" | "done" | "skipped";
export type LmsTestKind = "mid" | "final" | "retest";
export type LmsPlanKraStatus = "in_training" | "certified" | "not_cleared";
export type LmsCertStatus = "certified" | "refresher_due" | "revoked";
export type LmsPlatform = "Binance" | "KuCoin" | "Bitget";

export interface LmsSettings {
  id: boolean;
  programme_days: number;
  module_days: number;
  test_days: number[];
  pass_mark: number;
  extension_days: number;
  max_attempts: number;
  default_language: LmsLanguage;
  catalogue_version: string | null;
  catalogue_imported_at: string | null;
  updated_at: string;
}

export interface LmsKra {
  code: string;
  name: string;
  department_code: string;
  department_name: string;
  subdepartment_code: string;
  subdepartment_name: string;
  layer_code: string;
  layer_name: string;
  platform: LmsPlatform | null;
  catalogue_status: "live" | "partial" | "notlive" | "planned" | "future";
  description: string | null;
  description_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface LmsModule {
  id: string;
  code: string;
  title: string;
  module_type: LmsModuleType;
  department_code: string | null;
  subdepartment_code: string | null;
  platform: LmsPlatform | null;
  summary: string | null;
  content_md: string | null;
  trainer_notes: string | null;
  duration_minutes: number;
  sort_order: number;
  status: LmsModuleStatus;
  production: Record<string, boolean>;
  version: string;
  version_notes: string | null;
  version_published_at: string | null;
  quiz_tag: string | null;
  owner_name: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface LmsModuleKra {
  module_id: string;
  kra_code: string;
}

export interface LmsAsset {
  id: string;
  module_id: string;
  kind: LmsAssetKind;
  language: LmsAssetLanguage;
  title: string;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  version: string | null;
  sort_order: number;
  created_at: string;
}

export interface LmsChecklistItem {
  id: string;
  module_id: string;
  item: string;
  is_critical: boolean;
  sort_order: number;
}

export interface LmsSeat {
  id: string;
  name: string;
  department_code: string | null;
  position_id: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LmsSeatKra {
  seat_id: string;
  kra_code: string;
}

export interface LmsPlan {
  id: string;
  employee_id: string;
  seat_id: string | null;
  plan_type: LmsPlanType;
  title: string;
  language: LmsLanguage;
  start_date: string;
  module_days: number;
  total_days: number;
  extension_days: number;
  trainer_employee_id: string | null;
  supervisor_employee_id: string | null;
  status: LmsPlanStatus;
  outcome: LmsPlanOutcome | null;
  notes: string | null;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LmsPlanKra {
  plan_id: string;
  kra_code: string;
  status: LmsPlanKraStatus;
  decided_at: string | null;
  remarks: string | null;
}

export interface LmsPlanItem {
  id: string;
  plan_id: string;
  day_no: number;
  sort_order: number;
  item_type: LmsItemType;
  module_id: string | null;
  module_version: string | null;
  title: string;
  status: LmsItemStatus;
  completed_at: string | null;
  demo_done: boolean;
  signoff_result: "passed" | "failed" | null;
  signoff_by_employee_id: string | null;
  signoff_at: string | null;
  checklist: Record<string, "pass" | "fail">;
  test_kind: LmsTestKind | null;
  test_attempt: number | null;
  score_pct: number | null;
  critical_ok: boolean | null;
  test_passed: boolean | null;
  quiz_reference: string | null;
  live_orders: number | null;
  live_errors: number | null;
  live_critical_error: boolean | null;
  remarks: string | null;
  updated_at: string;
}

export interface LmsCertification {
  id: string;
  employee_id: string;
  kra_code: string;
  plan_id: string | null;
  status: LmsCertStatus;
  certified_at: string;
  module_versions: Record<string, string>;
  remarks: string | null;
  certified_by?: string | null;
  /** The certification this one replaced (re-certification or refresher), kept for undo and the record. */
  previous?: Record<string, unknown> | null;
  updated_at: string;
}

export interface LmsEmployee {
  id: string;
  full_name: string;
  badge_id: string | null;
  is_active: boolean;
  department_name: string | null;
  position_title: string | null;
  joining_date: string | null;
  training_completion_date: string | null;
}
