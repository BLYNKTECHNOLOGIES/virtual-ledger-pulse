/** Which character positions differ between the two sides of a match pair (for the reviewer only). */
export function pairDifference(left: string, right: string): { start: number; endL: number; endR: number } | null {
  if (left === right) return null;
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let endL = left.length, endR = right.length;
  while (endL > start && endR > start && left[endL - 1] === right[endR - 1]) { endL--; endR--; }
  return { start, endL, endR };
}

/** Shortcut keys apply only outside text fields and without Ctrl/Cmd/Alt. */
export function isReviewShortcut(e: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "target">): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const t = e.target as HTMLElement | null;
  if (!t) return true;
  const tag = (t.tagName ?? "").toLowerCase();
  return !(t.isContentEditable || ["input", "textarea", "select"].includes(tag) || t.getAttribute?.("role") === "combobox" || t.closest?.("[role=listbox]"));
}

