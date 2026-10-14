export const ERP_HEARTBEAT_MS = 30_000;
export const ERP_ONLINE_WINDOW_MS = 120_000;
export const TERMINAL_ONLINE_WINDOW_MS = 90_000;
export const RECONCILIATION_PERMISSIONS = ["shift_reconciliation_create", "shift_reconciliation_approve", "reconciliation_view"];

export function hasReconciliationPermission(held: string[]) {
  return RECONCILIATION_PERMISSIONS.some(p => held.includes(p));
}

export function historyIstBounds(from: string, through: string) {
  const start = from ? new Date(`${from}T00:00:00+05:30`).toISOString() : undefined;
  const end = through ? new Date(new Date(`${through}T00:00:00+05:30`).getTime() + 86_400_000).toISOString() : undefined;
  return { start, end };
}