// Shared "Recent" history for the ERP + Terminal command palettes.
// Stored under a single key so recents follow the user across both shells.

export interface PaletteRecent {
  label: string;
  path: string;
}

const KEY = "blynk.cmdk.recent";
const MAX = 5;

export function getRecents(): PaletteRecent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is PaletteRecent =>
          !!x && typeof x.label === "string" && typeof x.path === "string",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecent(item: PaletteRecent): void {
  try {
    if (!item?.label || !item?.path) return;
    const existing = getRecents().filter((r) => r.path !== item.path);
    const next = [item, ...existing].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore quota / serialization errors — recents are best-effort
  }
}
