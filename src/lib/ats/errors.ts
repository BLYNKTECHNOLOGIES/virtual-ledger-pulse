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
  ["ATS_FORBIDDEN", "You don't have access to do this."],
  ["ATS_TEMPLATE_NOT_FOUND", "That template no longer exists."],
  ["ATS_SYSTEM_TEMPLATE_LOCKED", "Built-in templates can be edited or turned off, but not deleted."],
  ["ATS_CANDIDATE_REQUIRED", "Open a candidate first."],
  ["ATS_INTERVIEWER_NOT_FOUND", "One of the interviewers is no longer an active employee. Remove them and try again."],
  ["ATS_INTERVIEW_NOT_FOUND", "This interview no longer exists."],
  ["ATS_INTERVIEW_CLOSED", "This interview is no longer scheduled. Refresh to see the latest."],
  ["ATS_INTERVIEW_TIME", "Pick a time within the next year, or within the last 30 days to record a past interview."],
  ["ATS_INTERVIEW_INVALID", "Check the interview details."],
  ["ATS_IMPORT_NOT_FOUND", "This import no longer exists."],
  ["ATS_IMPORT_CLOSED", "This import has already finished or been undone."],
  ["ATS_UNDO_ADMIN_ONLY", "Only HR admins can undo an import."],
  ["ATS_IMPORT_TOO_OLD", "Imports can only be undone within 7 days."],
  ["ATS_IMPORT_INVALID", "Something in the file couldn't be read. Check it and try again."],
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

const IV_INVALID: Record<string, string> = {
  location: "Add the interview address, or set the office address in ATS → Settings → Interviews.",
  meeting_url: "Add a meeting link that starts with https://",
  duration: "Pick a length between 10 minutes and 8 hours.",
  panel: "Choose up to 8 interviewers.",
  starts_at: "Pick a date and time.",
};

/** Messages for interview actions (schedule, change, cancel, status, feedback). */
export function interviewErrorMessage(error: unknown): string {
  const e = (error ?? {}) as { message?: string; hint?: string; details?: string };
  const all = `${e.message ?? (typeof error === "string" ? error : "")} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (all.includes("ATS_APPLICATION_CLOSED")) return "Reopen this application before scheduling an interview.";
  if (all.includes("ATS_INTERVIEW_INVALID")) {
    const m = IV_INVALID[String(e.details ?? "").trim()];
    if (m) return m;
  }
  return atsErrorMessage(error);
}
