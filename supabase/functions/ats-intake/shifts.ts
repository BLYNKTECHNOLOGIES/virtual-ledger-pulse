/** Website's selected shift names → clean list, or null when absent/invalid/empty (store nothing). */
export function parsePreferredShifts(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const s = v.trim().slice(0, 60);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= 10) break;
  }
  return out.length ? out : null;
}

