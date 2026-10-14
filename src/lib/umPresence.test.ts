import { describe, expect, it } from "vitest";
import { ERP_HEARTBEAT_MS, ERP_ONLINE_WINDOW_MS, TERMINAL_ONLINE_WINDOW_MS, hasReconciliationPermission, historyIstBounds } from "./umPresence";

describe("UM-2C rules", () => {
  it("ERP heartbeats every 30 seconds and expires at two minutes", () => {
    expect(ERP_HEARTBEAT_MS).toBe(30_000);
    expect(ERP_ONLINE_WINDOW_MS).toBe(120_000);
    expect(TERMINAL_ONLINE_WINDOW_MS).toBe(90_000);
  });
  it.each(["shift_reconciliation_create", "shift_reconciliation_approve", "reconciliation_view"])("grants reconciliation with %s", permission => {
    expect(hasReconciliationPermission([permission])).toBe(true);
  });
  it("does not grant via legacy functions or role names", () => {
    expect(hasReconciliationPermission(["erp_reconciliation", "Admin", "Super Admin"])).toBe(false);
  });
  it("filters the complete IST date with an exclusive next-day boundary", () => {
    expect(historyIstBounds("2026-10-14", "2026-10-14")).toEqual({ start: "2026-10-13T18:30:00.000Z", end: "2026-10-14T18:30:00.000Z" });
  });
});