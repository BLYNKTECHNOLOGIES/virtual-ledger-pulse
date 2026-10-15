import { describe, expect, it } from "vitest";
import { toDashboardOrders } from "./dashboardOrders";
import { dbRowToOrder } from "@/hooks/useBinanceOrderSync";
import { computeOrderStats } from "@/hooks/useBinanceOrders";
import { isActiveAppealOrder } from "@/lib/orderStatusMapper";

describe("F2 · complaint flags and active appeals", () => {
  it("(a) a cached flagged row keeps both fields in the dashboard's orders", () => {
    const row = { order_number: "1", trade_type: "BUY", order_status: "TRADING", create_time: 1, has_active_complaint: true, complaint_status: "2" };
    const [o] = toDashboardOrders([dbRowToOrder(row)]);
    expect(o.hasActiveComplaint).toBe(true);
    expect(o.complaintStatus).toBe("2");
  });

  const t = Date.now() - 3600000;
  const cases: [string, any, number][] = [
    ["TRADING + flag", { orderStatus: "TRADING", hasActiveComplaint: true }, 1],
    ["BUYER_PAYED + flag", { orderStatus: "BUYER_PAYED", hasActiveComplaint: true }, 1],
    ["APPEAL, no flag", { orderStatus: "APPEAL" }, 1],
    ["COMPLETED + flag", { orderStatus: "COMPLETED", hasActiveComplaint: true }, 0],
    ["CANCELLED + flag + '2'", { orderStatus: "CANCELLED", hasActiveComplaint: true, complaintStatus: "2" }, 0],
    ["CANCELLED_BY_SYSTEM + flag", { orderStatus: "CANCELLED_BY_SYSTEM", hasActiveComplaint: true }, 0],
    ["TRADING, no flag", { orderStatus: "TRADING" }, 0],
  ];
  for (const [name, o, n] of cases) {
    const order = { orderNumber: name, advNo: "", tradeType: "BUY", asset: "USDT", fiatUnit: "INR", amount: "1", totalPrice: "1", unitPrice: "1", commission: "0", counterPartNickName: "", createTime: t, ...o };
    it(`(b) computeOrderStats appeals — ${name} → ${n}`, () => { expect(computeOrderStats([order]).appeals).toBe(n); });
    it(`(c) alert rule agrees — ${name}`, () => { expect(isActiveAppealOrder(order)).toBe(n === 1); });
  }
});
