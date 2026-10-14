import type {
  LmsAssetKind, LmsAssetLanguage, LmsCertStatus, LmsItemType, LmsLanguage, LmsModuleStatus, LmsModuleType,
  LmsPlanKraStatus, LmsPlanStatus, LmsPlanType, LmsPlatform,
} from "./types";

export const LMS_BUCKET = "lms-content";

/** KRA catalogue department order (the catalogue's own numbering). */
export const LMS_DEPARTMENTS: { code: string; name: string }[] = [
  { code: "EXE", name: "Board & Executive Management" },
  { code: "OPS", name: "Operations" },
  { code: "CMP", name: "Compliance" },
  { code: "CRM", name: "Client Relationship" },
  { code: "FIN", name: "Finance & Accounts" },
  { code: "HRA", name: "Human Resources & Administration" },
  { code: "QCD", name: "Quality Control" },
  { code: "TEC", name: "Technology & ERP" },
  { code: "RSK", name: "Risk & Internal Audit" },
  { code: "SBD", name: "Strategy & Business Development" },
];
export const departmentName = (code: string | null | undefined) =>
  LMS_DEPARTMENTS.find((d) => d.code === code)?.name ?? code ?? "Company-wide";

export const MODULE_TYPE_LABEL: Record<LmsModuleType, string> = {
  company: "Company orientation",
  department: "Department orientation",
  subdepartment: "Sub-department orientation",
  platform: "Platform",
  shared: "Shared module",
  companywide: "Company-wide module",
  kra: "KRA module",
};

/** Teaching order of module kinds inside a plan. */
export const MODULE_TYPE_RANK: Record<LmsModuleType, number> = {
  company: 0, department: 1, subdepartment: 2, platform: 3, shared: 4, kra: 4, companywide: 5,
};

export const MODULE_STATUS_LABEL: Record<LmsModuleStatus, string> = {
  not_started: "Not started",
  drafting: "Drafting",
  in_review: "In review",
  approved: "Approved",
  retired: "Retired",
};
export const MODULE_STATUS_VARIANT: Record<LmsModuleStatus, "muted" | "info" | "warning" | "success" | "outline"> = {
  not_started: "muted", drafting: "info", in_review: "warning", approved: "success", retired: "outline",
};

/** Production steps tracked on every module (stored in lms_modules.production). */
export const PRODUCTION_STEPS: { key: string; label: string }[] = [
  { key: "sop", label: "SOP drafted" },
  { key: "walkthrough", label: "Walkthrough with best performer" },
  { key: "master_text", label: "Master text final" },
  { key: "assets_en", label: "English files ready" },
  { key: "assets_hinglish", label: "Hinglish files ready" },
  { key: "checklist", label: "Practical checklist ready" },
  { key: "quiz_questions", label: "Quiz questions added (Quiz module)" },
];

export const ASSET_KIND_LABEL: Record<LmsAssetKind, string> = {
  video: "Video",
  slides: "Slides",
  booklet: "Booklet",
  job_aid: "Desk checklist",
  screen_recording: "Screen recording",
  trainer_guide: "Trainer guide",
  image: "Image",
  other: "Other file",
};

export const LANGUAGE_LABEL: Record<LmsAssetLanguage, string> = {
  en: "English",
  hinglish: "Hinglish",
  both: "English & Hinglish",
};
export const PLAN_LANGUAGES: LmsLanguage[] = ["en", "hinglish"];

export const PLAN_TYPE_LABEL: Record<LmsPlanType, string> = {
  induction: "New joiner induction",
  reskilling: "Re-skilling (new KRAs)",
  refresher: "Refresher",
};

export const PLAN_STATUS_LABEL: Record<LmsPlanStatus, string> = {
  draft: "Draft",
  active: "In training",
  completed: "Completed",
  failed: "Not cleared",
  cancelled: "Cancelled",
};
export const PLAN_STATUS_VARIANT: Record<LmsPlanStatus, "muted" | "info" | "success" | "destructive-soft" | "outline"> = {
  draft: "muted", active: "info", completed: "success", failed: "destructive-soft", cancelled: "outline",
};

export const PLAN_KRA_STATUS_LABEL: Record<LmsPlanKraStatus, string> = {
  in_training: "In training",
  certified: "Certified",
  not_cleared: "Not cleared",
};

export const CERT_STATUS_LABEL: Record<LmsCertStatus, string> = {
  certified: "Certified",
  refresher_due: "Refresher due",
  revoked: "Revoked",
};

export const ITEM_TYPE_LABEL: Record<LmsItemType, string> = {
  module: "Module",
  test: "Test",
  practice: "Practice",
  live: "Supervised live work",
  note: "Note",
};

export const PLATFORM_MODULE_CODE: Record<LmsPlatform, string> = {
  Binance: "OPS-CO-PL1",
  KuCoin: "OPS-CO-PL2",
  Bitget: "OPS-CO-PL3",
};

/** Above this many module minutes a training day is flagged as overloaded. */
export const DAY_MINUTES_WARN = 360;

export const LMS_VIEWS = ["dashboard", "plans", "new-plan", "library", "present", "seats", "kras", "matrix", "settings"] as const;
export type LmsView = (typeof LMS_VIEWS)[number];
