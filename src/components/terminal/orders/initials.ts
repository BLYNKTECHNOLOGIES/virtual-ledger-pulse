/**
 * Up to two avatar initials from a name or nickname
 * ("RAHUL VERMA" → "RV", "rahul_trades" → "RT"). Takes whole characters, so a
 * name that starts with an emoji keeps the emoji instead of half of it.
 */
export function initialsOf(name?: string | null): string {
  const parts = String(name ?? '').trim().split(/[\s._-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toUpperCase();
}
