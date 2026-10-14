// Pure rate-limit policy for the public /test edge functions (no Deno/network imports, so vitest can test it).
// Office PCs share one internet connection, so the per-person limit is keyed by a device id that the
// /test page keeps in localStorage. The IP keeps a much higher ceiling against scripted abuse.

export type LimitRule = { key: string; limit: number; windowMinutes: number };
export type LimitRow = { window_start: string; count: number } | null;
export type LimitKind = "validate" | "register" | "resume";

const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/;
export const validDeviceId = (v: string | null | undefined): string | null =>
  v && DEVICE_RE.test(v) ? v : null;

const PER_DEVICE: Record<LimitKind, [number, number]> = {
  validate: [5, 15], // 5 tries / 15 min per browser (success clears it)
  register: [10, 60],
  resume: [5, 15],
};
const PER_IP: Record<LimitKind, [number, number]> = {
  validate: [400, 15],
  register: [300, 60],
  resume: [200, 15],
};

/** Rules checked in order: device first, then the shared-connection ceiling. */
export function limitRules(kind: LimitKind, ipHash: string, deviceHash: string | null): LimitRule[] {
  const [il, iw] = PER_IP[kind];
  if (!deviceHash) {
    // old client without a device id: keep the original per-IP behaviour
    const [dl, dw] = PER_DEVICE[kind];
    return [{ key: `${kind}:${ipHash}`, limit: dl, windowMinutes: dw }];
  }
  const [dl, dw] = PER_DEVICE[kind];
  return [
    { key: `${kind}:dev:${deviceHash}`, limit: dl, windowMinutes: dw },
    { key: `${kind}:ip:${ipHash}`, limit: il, windowMinutes: iw },
  ];
}

/** One fixed-window step: is this request allowed, and what should the row become. */
export function stepLimit(row: LimitRow, now: Date, limit: number, windowMinutes: number):
  { allowed: boolean; next: { window_start: string; count: number } | null } {
  if (!row || now.getTime() - new Date(row.window_start).getTime() > windowMinutes * 60_000) {
    return { allowed: true, next: { window_start: now.toISOString(), count: 1 } };
  }
  if (row.count >= limit) return { allowed: false, next: null };
  return { allowed: true, next: { window_start: row.window_start, count: row.count + 1 } };
}
