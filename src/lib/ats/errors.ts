/** Maps database / network errors to short user-facing messages for ATS toasts. */
const CODE_MESSAGES: [string, string][] = [
  ["ATS_SYSTEM_STAGE_LOCKED", "Built-in stages can be renamed but not deleted."],
  ["ATS_AMBIGUOUS_DUPLICATE", "This email belongs to one candidate and this phone number to another. Open both records before adding."],
  ["ATS_NAME_REQUIRED", "Enter the candidate's name."],
  ["ATS_JOB_NOT_FOUND", "That job no longer exists."],
  ["ATS_CANDIDATE_NOT_FOUND", "This record no longer exists."],
  ["ATS_APPLICATION_NOT_FOUND", "This record no longer exists."],
  ["ATS_APPLICATION_CLOSED", "Reopen this application before moving it."],
  ["ATS_REASON_REQUIRED", "Choose a reason."],
  ["ATS_REASON_MISMATCH", "That reason doesn't fit this action."],
  ["ATS_STAGE_NOT_FOUND", "That stage is no longer active."],
  ["ATS_ADMIN_ONLY", "Only HR admins can generate the connection key."],
];

export function atsErrorMessage(error: unknown, inUseMessage?: string): string {
  const e = (error ?? {}) as { code?: string; message?: string; hint?: string; details?: string };
  const msg = String(e.message ?? (typeof error === "string" ? error : "") ?? "");
  const all = `${msg} ${e.details ?? ""} ${e.hint ?? ""}`;
  for (const [code, text] of CODE_MESSAGES) if (all.includes(code)) return text;
  if (e.code === "23505") {
    if (all.includes("ats_candidates_email_uq")) return "Another candidate already uses this email";
    if (all.includes("ats_candidates_phone_uq")) return "Another candidate already uses this phone number";
    if (all.includes("ats_applications_candidate_job_uq")) return "This candidate already has an application for that job.";
    return "That name is already in use.";
  }
  if (e.code === "23503") return inUseMessage ?? "This record is still in use.";
  if (e.code === "23514") return "One of the values is out of range.";
  if (e.code === "42501" || /row-level security/i.test(msg)) return "You don't have access to do this.";
  if (/timed out|failed to fetch|network/i.test(msg)) return "Connection problem. Please try again.";
  return "Something went wrong. Please try again.";
}
