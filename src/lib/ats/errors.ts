/** Maps database / network errors to short user-facing messages for ATS toasts. */
export function atsErrorMessage(error: unknown, inUseMessage?: string): string {
  const e = (error ?? {}) as { code?: string; message?: string; hint?: string };
  const msg = String(e.message ?? (typeof error === "string" ? error : "") ?? "");
  if (msg.includes("ATS_SYSTEM_STAGE_LOCKED")) return "Built-in stages can be renamed but not deleted.";
  if (e.code === "23503") return inUseMessage ?? "This record is still in use.";
  if (e.code === "23505") return "That name is already in use.";
  if (e.code === "23514") return "One of the values is out of range.";
  if (e.code === "42501" || /row-level security/i.test(msg)) return "You don't have access to do this.";
  const line = msg.split("\n")[0].trim();
  return line || "Something went wrong.";
}
